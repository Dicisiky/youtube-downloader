import { Module } from '@nestjs/common';
import { RecordingJobsController } from './recording-jobs.controller';
import { RecordingJobsService } from './recording-jobs.service';

@Module({
  controllers: [RecordingJobsController],
  providers: [RecordingJobsService],
  exports: [RecordingJobsService],
})
export class RecordingJobsModule {}
