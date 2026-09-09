import { Module } from '@nestjs/common';
import { YtdlpModule } from '../ytdlp/ytdlp.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { RecordingJobsModule } from '../recording-jobs/recording-jobs.module';
import { RecordingOrchestratorService } from './recording-orchestrator.service';

@Module({
  imports: [YtdlpModule, YoutubeModule, RecordingJobsModule],
  providers: [RecordingOrchestratorService],
  exports: [RecordingOrchestratorService],
})
export class RecordingModule {}
