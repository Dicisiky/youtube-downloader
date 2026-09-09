import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { ChannelsModule } from './channels/channels.module';
import { UploadConfigsModule } from './upload-configs/upload-configs.module';
import { RecordingJobsModule } from './recording-jobs/recording-jobs.module';
import { YoutubeModule } from './youtube/youtube.module';
import { YtdlpModule } from './ytdlp/ytdlp.module';
import { RecordingModule } from './recording/recording.module';
import { MonitorModule } from './monitor/monitor.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    EventsModule,
    AuthModule,
    AdminModule,
    YoutubeModule,
    YtdlpModule,
    RecordingModule,
    ChannelsModule,
    UploadConfigsModule,
    RecordingJobsModule,
    MonitorModule,
  ],
  providers: [
    // Global: every route is locked by default and opts OUT via @Public(),
    // rather than each feature module remembering to opt in.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
