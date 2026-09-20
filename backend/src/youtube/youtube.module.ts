import { Module } from '@nestjs/common';
import { YtdlpModule } from '../ytdlp/ytdlp.module';
import { YoutubeAuthService } from './youtube-auth.service';
import { YoutubeLiveService } from './youtube-live.service';
import { YoutubeUploadService } from './youtube-upload.service';
import { YoutubeController } from './youtube.controller';

@Module({
  imports: [YtdlpModule],
  controllers: [YoutubeController],
  providers: [YoutubeAuthService, YoutubeLiveService, YoutubeUploadService],
  exports: [YoutubeAuthService, YoutubeLiveService, YoutubeUploadService],
})
export class YoutubeModule {}
