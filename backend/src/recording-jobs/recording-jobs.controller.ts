import { Controller, Get } from '@nestjs/common';
import { RecordingJobsService } from './recording-jobs.service';

@Controller('recording-jobs')
export class RecordingJobsController {
  constructor(private readonly jobs: RecordingJobsService) {}

  @Get()
  findAll() {
    return this.jobs.findAll();
  }
}
