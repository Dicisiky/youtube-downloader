import { Module } from '@nestjs/common';
import { YoutubeModule } from '../youtube/youtube.module';
import { RecordingModule } from '../recording/recording.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  imports: [YoutubeModule, RecordingModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
