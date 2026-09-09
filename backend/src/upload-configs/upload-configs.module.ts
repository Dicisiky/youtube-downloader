import { Module } from '@nestjs/common';
import { YoutubeModule } from '../youtube/youtube.module';
import { UploadConfigsController } from './upload-configs.controller';
import { UploadConfigsService } from './upload-configs.service';

@Module({
  imports: [YoutubeModule],
  controllers: [UploadConfigsController],
  providers: [UploadConfigsService],
  exports: [UploadConfigsService],
})
export class UploadConfigsModule {}
