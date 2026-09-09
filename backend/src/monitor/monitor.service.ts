import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MonitoredChannel } from '@prisma/client';
import { JobStatus, LiveStatus, RecordingStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { YoutubeLiveService } from '../youtube/youtube-live.service';
import { RecordingOrchestratorService } from '../recording/recording-orchestrator.service';

/**
 * The background poller. On an interval, walks EVERY whitelisted channel --
 * including paused ones -- and asks whether it's live. This is the steady-
 * state path for streams that start *after* a channel was whitelisted; the
 * mid-stream (already live at add-time) path lives in ChannelsService.create
 * and shares the same RecordingOrchestratorService so both converge on
 * identical behavior.
 *
 * Paused channels are still polled deliberately: LiveStatus must keep
 * reflecting reality (a paused channel that's still airing on YouTube has to
 * show LIVE) even though isActive=false blocks this loop from ever starting
 * a recording for it. Only RecordingStatus cares about isActive.
 */
@Injectable()
export class MonitorService implements OnModuleInit {
  private readonly logger = new Logger(MonitorService.name);
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly youtubeLive: YoutubeLiveService,
    private readonly orchestrator: RecordingOrchestratorService,
  ) {}

  onModuleInit() {
    const intervalMs = this.config.get<number>('poll.intervalMs', 60000);
    this.logger.log(`starting poll loop every ${intervalMs}ms`);
    this.timer = setInterval(() => this.pollOnce(), intervalMs);
    // Kick off an immediate first pass instead of waiting a full interval.
    this.pollOnce();
  }

  private async pollOnce() {
    if (this.polling) {
      this.logger.warn('previous poll cycle still running; skipping this tick');
      return;
    }
    this.polling = true;
    try {
      const channels = await this.prisma.monitoredChannel.findMany();
      for (const channel of channels) {
        await this.pollChannel(channel).catch((err) =>
          this.logger.error(`poll failed for ${channel.channelTitle ?? channel.channelId}`, err),
        );
      }
    } finally {
      this.polling = false;
    }
  }

  private async pollChannel(channel: MonitoredChannel) {
    // Already have an in-flight job -- we already know it's live (that's how
    // the job started) and its progress is tracked at the job level, so
    // there's nothing new for a live-check to tell us here.
    const activeJob = await this.prisma.recordingJob.findFirst({
      where: {
        monitoredChannelId: channel.id,
        status: { in: [JobStatus.RECORDING, JobStatus.PROCESSING, JobStatus.UPLOADING] },
      },
    });
    if (activeJob) return;

    try {
      const live = await this.youtubeLive.getActiveLiveBroadcast(channel.channelId);

      if (live && channel.isActive) {
        this.logger.log(`${channel.channelTitle ?? channel.channelId} went live -- starting recording`);
        // startRecording sets LiveStatus=LIVE / RecordingStatus=RECORDING itself.
        await this.orchestrator.startRecording(channel, live.videoId, live.title);
        return;
      }

      // Either not live, or live but paused (isActive=false) -- either way we
      // only touch LiveStatus and clear a stale error; RecordingStatus is
      // left alone here (still IDLE or still PAUSED, whichever it already
      // is -- pause/resume is the only thing that ever changes it directly).
      await this.updateChannelState(channel.id, {
        liveStatus: live ? LiveStatus.LIVE : LiveStatus.OFFLINE,
        lastError: null,
        // A successful poll supersedes a stale ERROR from a previous failed
        // attempt, but must never clobber PAUSED.
        recordingStatus:
          channel.isActive && channel.recordingStatus === RecordingStatus.ERROR ? RecordingStatus.IDLE : undefined,
      });
    } catch (err) {
      await this.updateChannelState(channel.id, {
        // The poll itself failed -- that's a statement about OUR ability to
        // check, not about the broadcast, so LiveStatus is left untouched.
        recordingStatus: channel.isActive ? RecordingStatus.ERROR : undefined,
        lastError: (err as Error).message,
      });
    }
  }

  private async updateChannelState(
    channelId: string,
    data: { liveStatus?: LiveStatus; recordingStatus?: RecordingStatus; lastError?: string | null },
  ) {
    const channel = await this.prisma.monitoredChannel.update({
      where: { id: channelId },
      data: { ...data, lastPolledAt: new Date() },
    });
    this.events.broadcast({ type: 'channel.updated', payload: channel });
    return channel;
  }
}
