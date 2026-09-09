import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { YoutubeAuthService } from './youtube-auth.service';

/**
 * Browser-facing OAuth2 flow for authorizing a new upload-destination channel.
 * Frontend flow: GET /auth/youtube/start?label=My%20Channel -> redirect to Google
 * -> Google redirects back to /auth/youtube/callback -> we persist an
 * UploadConfig row and bounce the admin back to the Console page.
 * Restricted to ADMIN, same as the rest of "Upload Destinations" configuration.
 */
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('auth/youtube')
export class YoutubeController {
  constructor(
    private readonly youtubeAuth: YoutubeAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('start')
  start(@Query('label') label: string, @Res() res: Response) {
    if (!label) {
      throw new BadRequestException('label query param is required, e.g. ?label=Archive Channel');
    }
    const state = Buffer.from(JSON.stringify({ label })).toString('base64url');
    const url = this.youtubeAuth.getConsentUrl(state);
    res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const frontendUrl = this.config.get<string>('corsOrigin');
    if (error) {
      return res.redirect(`${frontendUrl}/console?oauth_error=${encodeURIComponent(error)}`);
    }
    try {
      const { label } = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      const uploadConfig = await this.youtubeAuth.handleOAuthCallback(code, label);
      res.redirect(`${frontendUrl}/console?oauth_success=${uploadConfig.id}`);
    } catch (err) {
      res.redirect(`${frontendUrl}/console?oauth_error=${encodeURIComponent((err as Error).message)}`);
    }
  }
}
