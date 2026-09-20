import { Module } from '@nestjs/common';
import { YtdlpManagerService } from './ytdlp-manager.service';
import { CookieIdentityPoolService } from './cookie-identity-pool.service';

@Module({
  providers: [YtdlpManagerService, CookieIdentityPoolService],
  exports: [YtdlpManagerService, CookieIdentityPoolService],
})
export class YtdlpModule {}
