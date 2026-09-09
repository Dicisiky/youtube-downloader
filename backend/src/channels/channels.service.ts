import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { YoutubeLiveService } from '../youtube/youtube-live.service';
import { RecordingOrchestratorService } from '../recording/recording-orchestrator.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly youtubeLive: YoutubeLiveService,
    private readonly orchestrator: RecordingOrchestratorService,
  ) {}

  findAll() {
    return this.prisma.monitoredChannel.findMany({
      include: { uploadConfig: { select: { id: true, label: true } }, recordingJobs: { take: 5, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates the whitelist entry and, critically, checks live status *before*
   * returning -- if the channel is already mid-stream, recording starts
   * immediately in the same request instead of waiting for the next cron
   * tick. This is what satisfies "record from the exact minute it was added."
   */
  async create(dto: CreateChannelDto) {
    const resolved = await this.youtubeLive.resolveChannelFromUrl(dto.channelUrl);

    const existing = await this.prisma.monitoredChannel.findUnique({ where: { channelId: resolved.channelId } });
    if (existing) {
      throw new Error(`${resolved.title} is already being monitored`);
    }

    let channel = await this.prisma.monitoredChannel.create({
      data: {
        channelUrl: dto.channelUrl,
        channelId: resolved.channelId,
        channelTitle: resolved.title,
        channelThumbnail: resolved.thumbnail,
        uploadConfigId: dto.uploadConfigId,
        defaultVisibility: dto.defaultVisibility,
        titleTemplate: dto.titleTemplate,
        playlistId: dto.playlistId,
        playlistTitle: dto.playlistTitle,
      },
    });
    this.events.broadcast({ type: 'channel.updated', payload: channel });

    try {
      const live = await this.youtubeLive.getActiveLiveBroadcast(resolved.channelId);
      if (live) {
        this.logger.log(`${resolved.title} is already live (videoId=${live.videoId}) -- starting recording now`);
        await this.orchestrator.startRecording(channel, live.videoId, live.title);
      }
    } catch (err) {
      this.logger.error(`immediate live-check failed for new channel ${resolved.channelId}`, err as Error);
    }

    return channel;
  }

  /**
   * Updates destination/playlist/visibility/title-template for an existing
   * channel. Deliberately does not touch channelUrl/channelId, isActive, or
   * any status field -- those have their own dedicated flows (remove+re-add,
   * pause/resume, the recording pipeline). An in-flight or future recording
   * always reads these fields fresh at upload time, so a mid-recording edit
   * takes effect starting with that job's own upload, not retroactively.
   */
  async update(id: string, dto: UpdateChannelDto) {
    const existing = await this.prisma.monitoredChannel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('channel not found');

    if (dto.uploadConfigId) {
      const destination = await this.prisma.uploadConfig.findUnique({ where: { id: dto.uploadConfigId } });
      if (!destination) throw new NotFoundException('upload destination not found');
    }

    const channel = await this.prisma.monitoredChannel.update({
      where: { id },
      data: {
        uploadConfigId: dto.uploadConfigId,
        defaultVisibility: dto.defaultVisibility,
        titleTemplate: dto.titleTemplate,
        // '' means "clear the playlist" -- see UpdateChannelDto for why this
        // uses empty string instead of null.
        ...(dto.playlistId !== undefined ? { playlistId: dto.playlistId || null } : {}),
        ...(dto.playlistTitle !== undefined ? { playlistTitle: dto.playlistTitle || null } : {}),
      },
      include: { uploadConfig: { select: { id: true, label: true } } },
    });
    this.events.broadcast({ type: 'channel.updated', payload: channel });
    return channel;
  }

  /** Stops whatever recording is currently in flight for this channel and uploads what was captured. */
  async stopRecording(id: string) {
    const activeJob = await this.prisma.recordingJob.findFirst({
      where: { monitoredChannelId: id, status: 'RECORDING' },
    });
    if (!activeJob) {
      throw new NotFoundException('no active recording for this channel');
    }
    this.orchestrator.stopRecording(activeJob.id);
    return { ok: true, jobId: activeJob.id };
  }

  async setActive(id: string, isActive: boolean) {
    if (!isActive) {
      // Stop whatever's in flight first. If a job WAS running, its own
      // finalize step will also land RecordingStatus on PAUSED (it reads
      // isActive fresh at that point) -- setting it here too covers the
      // common case where nothing was actively recording yet.
      await this.stopActiveJobIfAny(id);
      const channel = await this.prisma.monitoredChannel.update({
        where: { id },
        data: { isActive, recordingStatus: 'PAUSED' },
      });
      this.events.broadcast({ type: 'channel.updated', payload: channel });
      return channel;
    }

    let channel = await this.prisma.monitoredChannel.update({
      where: { id },
      data: { isActive, recordingStatus: 'IDLE' },
    });
    this.events.broadcast({ type: 'channel.updated', payload: channel });

    // Mirror create()'s mid-stream pickup: if the channel is still live right
    // now, resuming should start capturing immediately rather than waiting
    // up to a full poll interval.
    try {
      const live = await this.youtubeLive.getActiveLiveBroadcast(channel.channelId);
      if (live) {
        this.logger.log(`${channel.channelTitle ?? channel.channelId} is still live on resume -- starting recording now`);
        await this.orchestrator.startRecording(channel, live.videoId, live.title);
        // Re-fetch so the response reflects the just-applied RECORDING state
        // instead of the pre-live-check snapshot above.
        channel = await this.prisma.monitoredChannel.findUniqueOrThrow({ where: { id } });
      }
    } catch (err) {
      this.logger.error(`live-check on resume failed for ${channel.channelId}`, err as Error);
    }

    return channel;
  }

  async remove(id: string) {
    const channel = await this.prisma.monitoredChannel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException('channel not found');
    // Kill any in-flight yt-dlp process first -- otherwise it keeps running
    // (and auto-restarting on failure) as an orphan with nothing in the UI
    // pointing back to it, since the channel/job rows are about to be gone.
    await this.stopActiveJobIfAny(id);
    await this.prisma.monitoredChannel.delete({ where: { id } });
    return { ok: true };
  }

  private async stopActiveJobIfAny(channelId: string) {
    const activeJob = await this.prisma.recordingJob.findFirst({
      where: { monitoredChannelId: channelId, status: 'RECORDING' },
    });
    if (activeJob) {
      this.logger.log(`stopping in-flight recording ${activeJob.id} for channel ${channelId}`);
      this.orchestrator.stopRecording(activeJob.id);
    }
  }
}
