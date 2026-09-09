import { Injectable } from '@nestjs/common';
import { JobStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class RecordingJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  findAll() {
    return this.prisma.recordingJob.findMany({
      include: { monitoredChannel: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  findActiveForChannel(monitoredChannelId: string) {
    return this.prisma.recordingJob.findFirst({
      where: {
        monitoredChannelId,
        status: { in: [JobStatus.MONITORING, JobStatus.RECORDING, JobStatus.PROCESSING, JobStatus.UPLOADING] },
      },
    });
  }

  async create(monitoredChannelId: string, sourceVideoId: string, sourceTitle: string) {
    const job = await this.prisma.recordingJob.create({
      data: { monitoredChannelId, sourceVideoId, sourceTitle, status: JobStatus.RECORDING },
      include: { monitoredChannel: true },
    });
    this.events.broadcast({ type: 'job.created', payload: job });
    return job;
  }

  async updateStatus(id: string, status: JobStatus, extra: Record<string, unknown> = {}) {
    const job = await this.prisma.recordingJob.update({
      where: { id },
      data: { status, ...extra },
      include: { monitoredChannel: true },
    });
    this.events.broadcast({ type: 'job.updated', payload: job });
    return job;
  }
}
