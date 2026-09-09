import { Module } from '@nestjs/common';
import { YoutubeModule } from '../youtube/youtube.module';
import { RecordingModule } from '../recording/recording.module';
import { MonitorService } from './monitor.service';

@Module({
  imports: [YoutubeModule, RecordingModule],
  providers: [MonitorService],
})
export class MonitorModule {}
