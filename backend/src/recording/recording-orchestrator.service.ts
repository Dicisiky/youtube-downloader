import { Injectable, Logger } from '@nestjs/common';
import { JobStatus, LiveStatus, RecordingStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { RecordingJobsService } from '../recording-jobs/recording-jobs.service';
import { YtdlpManagerService, StartRecordingOptions, RecordingExitReason } from '../ytdlp/ytdlp-manager.service';
import { YoutubeUploadService } from '../youtube/youtube-upload.service';
import { YoutubeLiveService } from '../youtube/youtube-live.service';
import type { MonitoredChannel } from '@prisma/client';

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
    private readonly upload: YoutubeUploadService,
    private readonly youtubeLive: YoutubeLiveService,
    private readonly jobs: RecordingJobsService,
    private readonly events: EventsGateway,
  ) {}

  async startRecording(channel: MonitoredChannel, videoId: string, title: string) {
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
        this.events.broadcast({ type: 'log', payload: { message: `[${channelSlug}] ${line}`, level: 'info' } });
      },
      onExit: (result) => {
        this.handleRecordingExit(channel, job.id, result, recordingOptions).catch((err) =>
          this.logger.error(`post-recording pipeline failed for job ${job.id}`, err),
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
    result: { success: boolean; filePath: string; reason: RecordingExitReason; error?: string },
    recordingOptions: StartRecordingOptions,
  ) {
    // The channel/job may have been deleted (Cascade) while yt-dlp was still
    // shutting down after a forced stop -- nothing left to update in that case.
    const stillExists = await this.prisma.recordingJob.findUnique({ where: { id: jobId } });
    if (!stillExists) {
      this.logger.log(`job ${jobId} no longer exists (channel likely removed); dropping its exit result`);
      this.ytdlp.clearSegments(jobId);
      return;
    }

    if (!result.success) {
      await this.jobs.updateStatus(jobId, JobStatus.FAILED, { errorMessage: result.error });
      // RecordingStatus=ERROR reflects OUR pipeline failing -- it says nothing
      // about whether the broadcast itself is still live, so LiveStatus is
      // deliberately left untouched; the next poll tick will correct it.
      await this.updateChannelState(channel.id, {
        recordingStatus: RecordingStatus.ERROR,
        currentVideoId: null,
        lastError: result.error ?? null,
      });
      this.ytdlp.clearSegments(jobId);
      return;
    }

    // Confirmed-offline knowledge, when we have it, flows into finalizeRecording
    // so LiveStatus reflects reality without ever being *inferred* from the
    // recording pipeline's own state.
    let confirmedOffline = false;

    if (result.reason === 'stream_ended') {
      // yt-dlp exiting 0 isn't reliable proof the broadcast actually ended --
      // a live HLS playlist hiccup can trigger the same clean exit. Re-check
      // before finalizing: if the SAME broadcast is still live, this was a
      // false alarm, so record the continuation as a new segment of this job
      // instead of uploading a truncated clip (which is what previously
      // caused one livestream to get uploaded as several separate videos).
      try {
        const stillLive = await this.youtubeLive.getActiveLiveBroadcast(channel.channelId);
        if (stillLive && stillLive.videoId === recordingOptions.videoId) {
          this.ytdlp.continueSegment(recordingOptions);
          return;
        }
        confirmedOffline = true;
      } catch (err) {
        this.logger.warn(
          `live re-check failed for ${channel.channelId}, finalizing as ended anyway: ${(err as Error).message}`,
        );
      }
    }
    // A manual_stop leaves confirmedOffline=false -- the operator chose to
    // stop capturing early, which says nothing about whether the stream is
    // still airing, so LiveStatus is left for the next poll tick to settle.

    await this.finalizeRecording(channel, jobId, recordingOptions, confirmedOffline);
  }

  private async finalizeRecording(
    channel: MonitoredChannel,
    jobId: string,
    recordingOptions: StartRecordingOptions,
    confirmedOffline: boolean,
  ) {
    await this.jobs.updateStatus(jobId, JobStatus.PROCESSING, { recordingEndedAt: new Date() });

    const finalPath = await this.ytdlp.finalizeSegments(recordingOptions.channelSlug, recordingOptions.videoId);
    if (!finalPath) {
      await this.jobs.updateStatus(jobId, JobStatus.FAILED, {
        errorMessage: 'Recording finished but the output file could not be located on disk',
      });
      await this.updateChannelState(channel.id, {
        recordingStatus: RecordingStatus.ERROR,
        currentVideoId: null,
        lastError: 'output file missing',
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
        title: this.renderTemplate(channel.titleTemplate, channel.channelTitle ?? '', job.sourceTitle ?? ''),
        description: `Recorded automatically from ${channel.channelUrl}\nOriginal title: ${job.sourceTitle ?? ''}`,
        visibility: channel.defaultVisibility,
        playlistId: channel.playlistId,
      });

      await this.jobs.updateStatus(jobId, JobStatus.COMPLETED, {
        destinationVideoId,
        completedAt: new Date(),
      });
    } catch (err) {
      this.logger.error(`upload failed for job ${jobId}`, err as Error);
      await this.jobs.updateStatus(jobId, JobStatus.FAILED, { errorMessage: (err as Error).message });
    } finally {
      // RecordingStatus goes back to IDLE -- unless the channel was paused
      // WHILE this recording was wrapping up, in which case it should land
      // on PAUSED instead. Read isActive fresh rather than trusting the
      // `channel` object captured back when this job started.
      const fresh = await this.prisma.monitoredChannel.findUnique({ where: { id: channel.id }, select: { isActive: true } });
      if (fresh) {
        await this.updateChannelState(channel.id, {
          recordingStatus: fresh.isActive ? RecordingStatus.IDLE : RecordingStatus.PAUSED,
          currentVideoId: null,
          ...(confirmedOffline ? { liveStatus: LiveStatus.OFFLINE } : {}),
        });
      }
      this.ytdlp.clearSegments(jobId);
    }
  }

  private renderTemplate(template: string, channelTitle: string, originalTitle: string): string {
    return template
      .replace('{channelTitle}', channelTitle)
      .replace('{originalTitle}', originalTitle)
      .replace('{date}', new Date().toISOString().slice(0, 10));
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
      .update({ where: { id: channelId }, data: { ...data, lastPolledAt: new Date() } })
      .catch(() => null); // channel may have been deleted concurrently (e.g. removed mid-recording)
    if (!channel) return null;
    this.events.broadcast({ type: 'channel.updated', payload: channel });
    return channel;
  }
}
