import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeAuthService } from '../youtube/youtube-auth.service';

@Injectable()
export class UploadConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly youtubeAuth: YoutubeAuthService,
  ) {}

  async listPlaylists(id: string) {
    const config = await this.prisma.uploadConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException('upload destination not found');
    return this.youtubeAuth.listPlaylists(id);
  }

  findAll() {
    return this.prisma.uploadConfig.findMany({
      select: {
        id: true,
        label: true,
        youtubeChannelId: true,
        youtubeChannelTitle: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string) {
    const config = await this.prisma.uploadConfig.findUnique({
      where: { id },
      include: { _count: { select: { monitoredChannels: true } } },
    });
    if (!config) {
      throw new NotFoundException('upload destination not found');
    }
    if (config._count.monitoredChannels > 0) {
      throw new BadRequestException(
        `"${config.label}" is still used as the upload destination for ${config._count.monitoredChannels} monitored channel(s). Remove or reassign those channels first.`,
      );
    }
    await this.prisma.uploadConfig.delete({ where: { id } });
    return { ok: true };
  }
}
