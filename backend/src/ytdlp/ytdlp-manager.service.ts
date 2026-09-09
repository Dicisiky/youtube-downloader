import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcessWithoutNullStreams, execFile, spawn } from 'child_process';
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { cleanupCookiesSnapshot, snapshotCookiesFile } from './ytdlp-cookies.util';

const execFileAsync = promisify(execFile);

export type RecordingExitReason = 'stream_ended' | 'manual_stop' | 'failed';

export interface StartRecordingOptions {
  jobId: string;
  videoId: string;
  channelSlug: string;
  onExit: (result: { success: boolean; filePath: string; reason: RecordingExitReason; error?: string }) => void;
  onProgress?: (line: string) => void;
}

interface ActiveRecording {
  process: ChildProcessWithoutNullStreams;
  filePath: string;
  restartCount: number;
  manualStop: boolean;
}

const MAX_AUTO_RESTARTS = 5;

/**
 * Owns every live yt-dlp child process. One instance per active RecordingJob.
 * yt-dlp is spawned against the live watch URL directly (not --live-from-start),
 * so it starts capturing from the moment the process launches -- this is what
 * gives us "record from the exact minute it was added" for streams that are
 * already live when a channel gets whitelisted: the caller just needs to spawn
 * this immediately after detecting the live broadcast, with no extra delay.
 */
@Injectable()
export class YtdlpManagerService {
  private readonly logger = new Logger(YtdlpManagerService.name);
  private readonly active = new Map<string, ActiveRecording>();
  // Tracks how many "segments" a job has recorded so far -- see
  // continueSegment() below for why a single livestream can span more than one.
  private readonly segmentIndex = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  /** Naming pattern (<slug>__<videoId>.segN.<ext>) is also relied on by the orchestrator's finalize/concat step. */
  private outputPathFor(channelSlug: string, videoId: string, segment: number): string {
    const dir = this.config.get<string>('ytdlp.recordingsDir')!;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const safeSlug = channelSlug.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
    // %(ext)s lets yt-dlp pick the correct container; we resolve the final
    // path by globbing after the process exits.
    return join(dir, `${safeSlug}__${videoId}.seg${segment}.%(ext)s`);
  }

  isRecording(jobId: string): boolean {
    return this.active.has(jobId);
  }

  start(opts: StartRecordingOptions): void {
    this.segmentIndex.set(opts.jobId, 0);
    this.spawnProcess(opts, 0, 0);
  }

  /**
   * Called by the orchestrator when yt-dlp exited with code 0 (looks like
   * "stream ended") but a live-check confirms the same broadcast is still
   * actually live -- a known yt-dlp/HLS-live quirk where a playlist hiccup
   * makes it think the stream is over prematurely. Rather than finalizing and
   * uploading a truncated clip (which is what caused the same broadcast to
   * get uploaded multiple times as separate videos), we record the
   * continuation as a new segment of the SAME job; the orchestrator
   * concatenates every segment into one file only once the stream has
   * genuinely ended.
   */
  continueSegment(opts: StartRecordingOptions): void {
    const next = (this.segmentIndex.get(opts.jobId) ?? 0) + 1;
    this.segmentIndex.set(opts.jobId, next);
    this.logger.log(`[${opts.jobId}] stream still live after a clean exit -- recording segment ${next}`);
    this.spawnProcess(opts, 0, next);
  }

  private spawnProcess(opts: StartRecordingOptions, restartCount: number, segment: number): void {
    const { jobId, videoId, channelSlug } = opts;
    const binary = this.config.get<string>('ytdlp.binaryPath')!;
    const ffmpeg = this.config.get<string>('ytdlp.ffmpegPath')!;
    // Each recording process gets its own snapshot of the cookies file rather
    // than the shared configured path -- see ytdlp-cookies.util.ts for why
    // sharing one file across concurrent yt-dlp invocations corrupts the
    // session (this is what broke every channel's live-check after two
    // recordings ran at once and both mutated the same cookies.txt).
    const cookiesSnapshot = snapshotCookiesFile(this.config.get<string>('ytdlp.cookiesFile'));
    const outputTemplate = this.outputPathFor(channelSlug, videoId, segment);
    const liveUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const args = [
      liveUrl,
      '-o',
      outputTemplate,
      '--no-part',
      '--no-playlist',
      '--retries',
      'infinite',
      '--fragment-retries',
      'infinite',
      '--retry-sleep',
      '5',
      '--hls-use-mpegts',
      '--ffmpeg-location',
      ffmpeg,
      '--newline',
      '--no-colors',
      '--print',
      'after_move:filepath',
      ...(cookiesSnapshot ? ['--cookies', cookiesSnapshot] : []),
    ];

    this.logger.log(`[${jobId}] spawning yt-dlp for videoId=${videoId} (attempt ${restartCount + 1})`);
    // detached:true on POSIX makes this process the leader of a new process
    // group (pgid === pid) -- see stop() below for why that matters. Windows
    // has no equivalent concept here, so this only applies off win32.
    const child = spawn(binary, args, { windowsHide: true, detached: process.platform !== 'win32' });

    let resolvedFilePath = '';
    let lastErrorLine = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        opts.onProgress?.(line);
        // Absolute paths only show up via the --print after_move:filepath hook.
        if (!line.includes('[') && existsSync(line)) {
          resolvedFilePath = line.trim();
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      lastErrorLine = text.trim().split(/\r?\n/).pop() ?? lastErrorLine;
      opts.onProgress?.(text.trim());
    });

    child.on('error', (err) => {
      this.logger.error(`[${jobId}] failed to spawn yt-dlp`, err);
      this.active.delete(jobId);
      cleanupCookiesSnapshot(cookiesSnapshot);
      opts.onExit({ success: false, filePath: resolvedFilePath, reason: 'failed', error: err.message });
    });

    child.on('close', (code) => {
      cleanupCookiesSnapshot(cookiesSnapshot);
      const manualStop = this.active.get(jobId)?.manualStop ?? false;
      this.active.delete(jobId);

      if (manualStop) {
        // Operator-requested stop, checked before the exit-code branch below
        // since a forced kill can coincidentally also produce code 0.
        // --hls-use-mpegts keeps the partial file a valid container, so we
        // hand off whatever was captured so far to the upload pipeline.
        // resolvedFilePath is almost always '' here -- the --print
        // after_move:filepath hook only fires once yt-dlp finishes and moves
        // the file to its final name, which never happens on a forced kill.
        // Falling back to outputTemplate (still carrying the literal
        // "%(ext)s") lets the orchestrator's directory scan find the actual
        // partial file by its "<slug>__<videoId>" prefix instead of bailing
        // out on an empty hint.
        this.logger.log(`[${jobId}] recording stopped manually; finalizing captured segment(s)`);
        opts.onExit({ success: true, filePath: resolvedFilePath || outputTemplate, reason: 'manual_stop' });
        return;
      }

      if (code === 0) {
        // Looks like the stream ended, but yt-dlp sometimes exits 0 on a
        // live HLS playlist hiccup even though the broadcast is still airing
        // -- the orchestrator double-checks this before actually finalizing,
        // via reason: 'stream_ended', and calls continueSegment() instead of
        // uploading if the same broadcast is still live.
        this.logger.log(`[${jobId}] yt-dlp exited cleanly (segment ${segment} ended)`);
        opts.onExit({ success: true, filePath: resolvedFilePath || outputTemplate, reason: 'stream_ended' });
        return;
      }

      // Non-zero exit: could be a network drop mid-stream. yt-dlp already
      // retries fragments internally; a full-process restart is our fallback
      // for cases where the whole connection died (e.g. Wi-Fi drop).
      if (restartCount < MAX_AUTO_RESTARTS) {
        this.logger.warn(
          `[${jobId}] yt-dlp exited with code ${code} (${lastErrorLine}); restarting (${restartCount + 1}/${MAX_AUTO_RESTARTS})`,
        );
        setTimeout(() => this.spawnProcess(opts, restartCount + 1, segment), 5000);
        return;
      }

      this.logger.error(`[${jobId}] giving up after ${MAX_AUTO_RESTARTS} restarts: ${lastErrorLine}`);
      opts.onExit({ success: false, filePath: resolvedFilePath, reason: 'failed', error: lastErrorLine || `exit code ${code}` });
    });

    this.active.set(jobId, { process: child, filePath: outputTemplate, restartCount, manualStop: false });
  }

  /**
   * Forced stop -- either an operator clicking "Stop recording" for a specific
   * job, a channel being paused/removed mid-recording, or app shutdown.
   * Marking manualStop first tells the 'close' handler above to skip the
   * auto-restart logic and instead hand the partial file straight to the
   * upload pipeline, which is what makes "stop early and upload what I have"
   * possible instead of only ever finalizing when the stream itself ends.
   *
   * We kill the WHOLE process tree, not just child.kill('SIGTERM') on the
   * direct child. For a live HLS download, yt-dlp typically hands the actual
   * download off to ffmpeg as ITS child -- ffmpeg is the one holding the
   * output file and the inherited stdout/stderr pipes. Killing only the
   * direct Node child (yt-dlp) leaves that ffmpeg grandchild running, so the
   * pipes never close and Node's 'close' event never fires -- the stop
   * silently does nothing. Killing the whole tree ensures ffmpeg dies too,
   * closing the pipes and letting 'close' fire so the recording can actually
   * finalize. --hls-use-mpegts keeps the resulting file a valid, playable/
   * uploadable container even though this is a hard kill.
   *
   * Windows has no process-group concept here, so `taskkill /T` (which walks
   * the tree by parent PID) is the only way to get this on win32. On
   * POSIX/Linux, spawning with detached:true made yt-dlp the leader of its
   * own process group (pgid === pid), and ffmpeg inherits that same group --
   * signaling the NEGATIVE pid delivers the signal to every process in the
   * group at once, which is the POSIX equivalent of taskkill's /T.
   */
  stop(jobId: string): void {
    const rec = this.active.get(jobId);
    if (!rec) return;
    rec.manualStop = true;
    const pid = rec.process.pid;
    this.logger.log(`[${jobId}] stopping yt-dlp (manual), pid=${pid}`);
    if (!pid) return;

    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(pid), '/t', '/f'], (err) => {
        if (err) this.logger.warn(`[${jobId}] taskkill reported an error (process may have already exited): ${err.message}`);
      });
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (err) {
        this.logger.warn(`[${jobId}] SIGKILL to process group failed (process may have already exited): ${(err as Error).message}`);
      }
    }
  }

  stopAll(): void {
    for (const jobId of this.active.keys()) this.stop(jobId);
  }

  /** Call once a job has truly finished (finalized or failed for good) to drop its segment counter. */
  clearSegments(jobId: string): void {
    this.segmentIndex.delete(jobId);
  }

  /**
   * Resolves every recorded file for this videoId (there's normally just one
   * segment, but see continueSegment() above for why there can be more) and,
   * if there's more than one, concatenates them into a single final file via
   * ffmpeg's concat demuxer before handing off to upload -- this is what
   * prevents one livestream from becoming multiple separately-uploaded videos.
   * Returns the final path to upload, or null if nothing could be found.
   */
  async finalizeSegments(channelSlug: string, videoId: string): Promise<string | null> {
    const dir = this.config.get<string>('ytdlp.recordingsDir')!;
    const safeSlug = channelSlug.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
    const prefix = `${safeSlug}__${videoId}.seg`;

    const files = await readdir(dir).catch(() => [] as string[]);
    const segments = files
      .filter((f) => f.startsWith(prefix))
      .map((f) => {
        const match = f.match(/\.seg(\d+)\./);
        return { file: f, index: match ? parseInt(match[1], 10) : 0 };
      })
      .sort((a, b) => a.index - b.index)
      .map((s) => join(dir, s.file));

    if (segments.length === 0) return null;
    if (segments.length === 1) return segments[0];

    this.logger.log(`[${videoId}] merging ${segments.length} recorded segments into one file`);
    const ffmpeg = this.config.get<string>('ytdlp.ffmpegPath')!;
    const concatListPath = join(dir, `${safeSlug}__${videoId}.concat.txt`);
    const mergedPath = join(dir, `${safeSlug}__${videoId}.mp4`);
    // ffmpeg's concat demuxer requires each path escaped as a single-quoted
    // literal on its own "file '...'" line.
    writeFileSync(concatListPath, segments.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));

    try {
      await execFileAsync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', mergedPath]);
      if (!existsSync(mergedPath) || statSync(mergedPath).size === 0) {
        throw new Error('ffmpeg concat produced an empty or missing file');
      }
      for (const seg of segments) {
        try {
          unlinkSync(seg);
        } catch {
          /* best-effort cleanup, not fatal if a segment file can't be removed */
        }
      }
      return mergedPath;
    } finally {
      try {
        unlinkSync(concatListPath);
      } catch {
        /* ignore */
      }
    }
  }
}
