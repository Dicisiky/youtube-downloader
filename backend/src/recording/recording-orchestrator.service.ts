import { Injectable, Logger } from "@nestjs/common";
import { unlink } from "fs/promises";
import { JobStatus, LiveStatus, RecordingStatus } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";
import { EventsGateway } from "../events/events.gateway";
import { RecordingJobsService } from "../recording-jobs/recording-jobs.service";
import {
  YtdlpManagerService,
  StartRecordingOptions,
  RecordingExitReason,
} from "../ytdlp/ytdlp-manager.service";
import { CookieIdentityPoolService } from "../ytdlp/cookie-identity-pool.service";
import { YoutubeUploadService } from "../youtube/youtube-upload.service";
import { YoutubeLiveService } from "../youtube/youtube-live.service";
import type { MonitoredChannel } from "@prisma/client";

// How many times a job may be resumed as a new segment while the live-check
// stays inconclusive (every identity in the pool failing, or yt-dlp itself
// exhausted), before giving up for good even if the broadcast is still
// reported live. This only ever throttles the "genuinely can't tell" case --
// a *confirmed* still-live or confirmed-offline answer always bypasses it,
// so raising it has no effect on an ordinary clean stream end.
//
// Was 5 until the 2026-09-28 incident: a sustained YouTube-side rate-limit
// storm lasted 90+ minutes, and every single one of the many "can't tell"
// results that day eventually resolved to "still live" once the throttling
// eased -- never once to a genuinely dead stream. 5 was far too little
// patience for how long real-world throttling can persist, and each
// exhaustion meant an early upload + a second (or third) video for the same
// stream instead of one continuous recording. Raised generously; a job that
// is truly, permanently unreachable still finalizes eventually, just later.
export const MAX_CONTINUATIONS_AFTER_EXHAUSTED_RETRIES = 30;

/**
 * The single place that owns a recording job's full lifecycle:
 * RECORDING -> PROCESSING -> UPLOADING -> COMPLETED/FAILED.
 * Both the mid-stream (channel added while already live) path in
 * ChannelsService and the scheduled poll path in MonitorService call
 * startRecording() the same way, so there's exactly one code path for
 * "we know a channel is live right now, go capture it."
 *
 * LiveStatus and RecordingStatus are deliberately independent here: this
 * service only ever sets LiveStatus when it has fresh, direct evidence (a
 * live-check that just ran), and only ever sets RecordingStatus based on
 * what THIS app's pipeline is doing. It never infers one from the other --
 * e.g. finishing a recording doesn't imply the stream ended, so it doesn't
 * touch LiveStatus at all unless a live-check result says otherwise.
 */
@Injectable()
export class RecordingOrchestratorService {
  private readonly logger = new Logger(RecordingOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ytdlp: YtdlpManagerService,
    private readonly identityPool: CookieIdentityPoolService,
    private readonly upload: YoutubeUploadService,
    private readonly youtubeLive: YoutubeLiveService,
    private readonly jobs: RecordingJobsService,
    private readonly events: EventsGateway,
  ) {}

  async startRecording(
    channel: MonitoredChannel,
    videoId: string,
    title: string,
  ) {
    const job = await this.jobs.create(channel.id, videoId, title);

    // We're only ever called with a videoId that a live-check JUST confirmed
    // (see ChannelsService.create and MonitorService.pollChannel), so LIVE
    // here is fresh evidence, not an inference from "we started recording".
    await this.updateChannelState(channel.id, {
      liveStatus: LiveStatus.LIVE,
      recordingStatus: RecordingStatus.RECORDING,
      currentVideoId: videoId,
      lastError: null,
    });

    const channelSlug = channel.channelTitle ?? channel.channelId;
    const recordingOptions: StartRecordingOptions = {
      jobId: job.id,
      videoId,
      channelSlug,
      onProgress: (line) => {
        this.events.broadcast({
          type: "log",
          payload: { message: `[${channelSlug}] ${line}`, level: "info" },
        });
      },
      onExit: (result) => {
        this.handleRecordingExit(
          channel,
          job.id,
          result,
          recordingOptions,
        ).catch((err) =>
          this.logger.error(
            `post-recording pipeline failed for job ${job.id}`,
            err,
          ),
        );
      },
    };
    this.ytdlp.start(recordingOptions);

    return job;
  }

  /** Operator-requested early stop: finalizes and uploads whatever was captured so far. */
  stopRecording(jobId: string): void {
    this.ytdlp.stop(jobId);
  }

  private async handleRecordingExit(
    channel: MonitoredChannel,
    jobId: string,
    result: {
      success: boolean;
      filePath: string;
      reason: RecordingExitReason;
      error?: string;
    },
    recordingOptions: StartRecordingOptions,
  ) {
    // The channel/job may have been deleted (Cascade) while yt-dlp was still
    // shutting down after a forced stop -- nothing left to update in that case.
    const stillExists = await this.prisma.recordingJob.findUnique({
      where: { id: jobId },
    });
    if (!stillExists) {
      this.logger.log(
        `job ${jobId} no longer exists (channel likely removed); dropping its exit result`,
      );
      this.ytdlp.clearSegments(jobId);
      return;
    }

    if (!result.success) {
      // yt-dlp gave up after exhausting its own in-place restarts (e.g.
      // YouTube's own transient "We're experiencing technical difficulties"
      // on the live-serving side, which can outlast that budget). Exiting
      // the JOB here -- rather than just the process -- used to mean the next
      // poll tick would see the same still-live broadcast and start a brand
      // new job for it, uploading the same continuous stream as many separate
      // short videos. Re-checking live status first and continuing as a new
      // segment (same mechanism as the stream_ended false-alarm case below)
      // closes that gap. Capped via retryCount so a genuinely broken pipeline
      // (not a transient YouTube hiccup) still surfaces as FAILED eventually
      // instead of retrying forever.
      if (stillExists.retryCount < MAX_CONTINUATIONS_AFTER_EXHAUSTED_RETRIES) {
        const stillLive = await this.checkStillLive(
          channel.channelId,
          recordingOptions.videoId,
          jobId,
        );
        // An inconclusive check (null) is treated the same as "still live":
        // the re-check itself failing is exactly the scenario this exists to
        // survive, not a reason to fall back to the old truncate-and-upload
        // behavior.
        if (stillLive !== false) {
          this.logger.warn(
            `[${jobId}] yt-dlp exhausted its local retries (${result.error}) and live status is ${stillLive === null ? "unknown" : "still live"} -- continuing as a new segment instead of failing the job`,
          );
          await this.jobs.incrementRetryCount(jobId);
          this.ytdlp.continueSegment(recordingOptions);
          return;
        }
      }

      // Out of continuations. Whatever got captured before yt-dlp gave up is
      // still sitting on disk as segment files -- salvage those the same way
      // a genuine stream-end would, instead of abandoning them there unwatched
      // (which is what previously left a stray .seg0.* file needing a manual
      // cleanup on the VPS). finalizeRecording already fails the job itself,
      // with RecordingStatus=ERROR, if there's truly nothing on disk to find.
      this.logger.warn(
        `[${jobId}] giving up after repeated failures (${result.error}) -- salvaging whatever was captured`,
      );
      await this.finalizeRecording(channel, jobId, recordingOptions, false);
      return;
    }

    // Confirmed-offline knowledge, when we have it, flows into finalizeRecording
    // so LiveStatus reflects reality without ever being *inferred* from the
    // recording pipeline's own state.
    let confirmedOffline = false;

    if (result.reason === "stream_ended") {
      // yt-dlp exiting 0 isn't reliable proof the broadcast actually ended --
      // a live HLS playlist hiccup can trigger the same clean exit. Re-check
      // before finalizing: if the SAME broadcast is still live, this was a
      // false alarm, so record the continuation as a new segment of this job
      // instead of uploading a truncated clip (which is what previously
      // caused one livestream to get uploaded as several separate videos).
      const stillLive = await this.checkStillLive(
        channel.channelId,
        recordingOptions.videoId,
        jobId,
      );
      if (stillLive === true) {
        // Confirmed still airing -- uncapped, same as ever: a long stream can
        // have any number of these false-alarm clean exits.
        this.ytdlp.continueSegment(recordingOptions);
        return;
      }
      if (
        stillLive === null &&
        stillExists.retryCount < MAX_CONTINUATIONS_AFTER_EXHAUSTED_RETRIES
      ) {
        // Couldn't get a confirmed answer at all -- leaning toward "assume
        // still live" here is what this whole re-check exists for; assuming
        // the opposite is exactly what used to truncate a healthy stream into
        // a separate upload. Capped so a channel that's genuinely offline
        // (and erroring on every re-check) still finalizes eventually.
        this.logger.warn(
          `[${jobId}] live re-check inconclusive after a clean exit -- continuing as a new segment rather than risking a truncated upload`,
        );
        await this.jobs.incrementRetryCount(jobId);
        this.ytdlp.continueSegment(recordingOptions);
        return;
      }
      // Either confirmed offline/different broadcast, or the inconclusive
      // budget above is exhausted -- finalize with whatever was captured.
      // Only a *confirmed* negative answer justifies marking LiveStatus
      // OFFLINE; running out of patience on an unknown does not.
      if (stillLive === null) {
        this.logger.error(
          `[${jobId}] live re-check stayed inconclusive across ${stillExists.retryCount} continuations and every identity in the pool -- finalizing with whatever was captured; this WILL fragment the recording if the stream is actually still live`,
        );
      }
      confirmedOffline = stillLive === false;
    }
    // A manual_stop leaves confirmedOffline=false -- the operator chose to
    // stop capturing early, which says nothing about whether the stream is
    // still airing, so LiveStatus is left for the next poll tick to settle.

    await this.finalizeRecording(
      channel,
      jobId,
      recordingOptions,
      confirmedOffline,
    );
  }

  private async finalizeRecording(
    channel: MonitoredChannel,
    jobId: string,
    recordingOptions: StartRecordingOptions,
    confirmedOffline: boolean,
  ) {
    await this.jobs.updateStatus(jobId, JobStatus.PROCESSING, {
      recordingEndedAt: new Date(),
    });

    let finalPath: string | null;
    try {
      finalPath = await this.ytdlp.finalizeSegments(
        recordingOptions.channelSlug,
        recordingOptions.videoId,
      );
    } catch (err) {
      // Confirmed the hard way (2026-09-28): an unhandled throw here used to
      // fall through to startRecording()'s generic top-level logger and stop
      // right there -- the job stayed at PROCESSING and the channel stayed at
      // RECORDING forever, since MonitorService skips polling any channel
      // with an "active" job. That silently stopped monitoring the channel
      // for every future stream, not just this one. Handling it the same way
      // as every other terminal case below -- FAILED status, channel state
      // reset, identity released -- keeps this a one-job failure instead.
      // Segment files are deliberately left on disk (not cleaned up here) so
      // a real merge crash can still be recovered by hand.
      this.logger.error(
        `[${jobId}] merging recorded segments failed -- marking FAILED instead of leaving the channel stuck`,
        err as Error,
      );
      await this.jobs.updateStatus(jobId, JobStatus.FAILED, {
        errorMessage: `segment merge failed: ${(err as Error).message}`,
      });
      await this.updateChannelState(channel.id, {
        recordingStatus: RecordingStatus.ERROR,
        currentVideoId: null,
        lastError: "segment merge failed",
        ...(confirmedOffline ? { liveStatus: LiveStatus.OFFLINE } : {}),
      });
      this.ytdlp.clearSegments(jobId);
      return;
    }
    if (!finalPath) {
      await this.jobs.updateStatus(jobId, JobStatus.FAILED, {
        errorMessage:
          "Recording finished but the output file could not be located on disk",
      });
      await this.updateChannelState(channel.id, {
        recordingStatus: RecordingStatus.ERROR,
        currentVideoId: null,
        lastError: "output file missing",
        ...(confirmedOffline ? { liveStatus: LiveStatus.OFFLINE } : {}),
      });
      this.ytdlp.clearSegments(jobId);
      return;
    }

    const job = await this.jobs.updateStatus(jobId, JobStatus.UPLOADING, {
      filePath: finalPath,
      uploadStartedAt: new Date(),
      // Snapshot now, not read later from the channel -- the channel's
      // defaultVisibility can change after this upload, and the "Last
      // Unlisted Livestream" button needs to know what THIS job actually used.
      uploadedVisibility: channel.defaultVisibility,
    });

    try {
      const destinationVideoId = await this.upload.upload({
        uploadConfigId: channel.uploadConfigId,
        filePath: finalPath,
        title: job.sourceTitle ?? "",
        description: `Recorded automatically from ${channel.channelUrl}\nOriginal title: ${job.sourceTitle ?? ""}`,
        visibility: channel.defaultVisibility,
        playlistId: channel.playlistId,
      });

      await this.jobs.updateStatus(jobId, JobStatus.COMPLETED, {
        destinationVideoId,
        completedAt: new Date(),
      });

      // Upload confirmed on YouTube -- the local copy has served its purpose.
      // Only reached on success: a failed upload keeps its file on disk so it
      // can be retried/recovered rather than losing the only copy.
      try {
        await unlink(finalPath);
      } catch (err) {
        this.logger.warn(
          `could not delete local recording ${finalPath} after upload: ${(err as Error).message}`,
        );
      }
    } catch (err) {
      this.logger.error(`upload failed for job ${jobId}`, err as Error);
      await this.jobs.updateStatus(jobId, JobStatus.FAILED, {
        errorMessage: (err as Error).message,
      });
    } finally {
      // RecordingStatus goes back to IDLE -- unless the channel was paused
      // WHILE this recording was wrapping up, in which case it should land
      // on PAUSED instead. Read isActive fresh rather than trusting the
      // `channel` object captured back when this job started.
      const fresh = await this.prisma.monitoredChannel.findUnique({
        where: { id: channel.id },
        select: { isActive: true },
      });
      if (fresh) {
        await this.updateChannelState(channel.id, {
          recordingStatus: fresh.isActive
            ? RecordingStatus.IDLE
            : RecordingStatus.PAUSED,
          currentVideoId: null,
          ...(confirmedOffline ? { liveStatus: LiveStatus.OFFLINE } : {}),
        });
      }
      this.ytdlp.clearSegments(jobId);
    }
  }

  /**
   * Tri-state liveness re-check: true (confirmed same broadcast), false
   * (confirmed ended or a different broadcast now), or null (every identity
   * in the pool failed to answer). Centralized here because both call sites
   * above need to treat null the same way -- as grounds to keep going, not
   * as a green light to finalize.
   *
   * Tries the job's OWN cookie identity first (already assigned when its
   * recording started, so this is the common, no-extra-load case), but falls
   * back through every OTHER identity in the pool before giving up. A
   * read-only liveness check doesn't need to match the job's download
   * identity, unlike the recording itself -- and this is exactly the gap
   * that let the 2026-09-25 incident happen: two of three identities got
   * bot-blocked under sustained load, and every job pinned to one of them
   * kept re-checking against nothing but that same blocked identity,
   * exhausting its continuation budget and fragmenting into a new upload
   * every 20-40 minutes for hours, even though the third identity was
   * healthy the whole time and could have answered immediately.
   */
  private async checkStillLive(
    channelId: string,
    videoId: string,
    jobId: string,
  ): Promise<boolean | null> {
    const ownIdentity = this.identityPool.getForJob(jobId);
    const fallbacks = this.identityPool
      .listIdentities()
      .filter((id) => id !== ownIdentity);
    const candidates = [ownIdentity, ...fallbacks];

    for (const identity of candidates) {
      try {
        const live = await this.youtubeLive.getActiveLiveBroadcast(
          channelId,
          identity,
        );
        return !!live && live.videoId === videoId;
      } catch (err) {
        this.logger.warn(
          `live re-check for ${channelId} errored on identity "${identity ?? "(none)"}": ${(err as Error).message}`,
        );
      }
    }
    this.logger.warn(
      `live re-check for ${channelId} failed on every identity in the pool (tried ${candidates.length}) -- treating as unknown`,
    );
    return null;
  }

  private async updateChannelState(
    channelId: string,
    data: {
      liveStatus?: LiveStatus;
      recordingStatus?: RecordingStatus;
      currentVideoId?: string | null;
      lastError?: string | null;
    },
  ) {
    const channel = await this.prisma.monitoredChannel
      .update({
        where: { id: channelId },
        data: { ...data, lastPolledAt: new Date() },
      })
      .catch(() => null); // channel may have been deleted concurrently (e.g. removed mid-recording)
    if (!channel) return null;
    this.events.broadcast({ type: "channel.updated", payload: channel });
    return channel;
  }
}
