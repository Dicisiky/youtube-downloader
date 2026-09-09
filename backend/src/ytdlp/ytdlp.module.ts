import { Module } from '@nestjs/common';
import { YtdlpManagerService } from './ytdlp-manager.service';

@Module({
  providers: [YtdlpManagerService],
  exports: [YtdlpManagerService],
})
export class YtdlpModule {}
