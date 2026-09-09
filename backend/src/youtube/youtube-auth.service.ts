import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  // playlistItems.insert (adding a finished upload to a playlist) needs write
  // access that neither of the two scopes above grants -- youtube.upload only
  // covers uploading/managing your own videos, and youtube.readonly is read-only.
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

/**
 * Owns the OAuth2 dance for destination (upload target) channels, and hands
 * back an authenticated googleapis OAuth2Client for a given UploadConfig,
 * transparently refreshing + persisting the access token when it's expired.
 */
@Injectable()
export class YoutubeAuthService {
  private readonly logger = new Logger(YoutubeAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private newOAuthClient() {
    return new google.auth.OAuth2(
      this.config.get<string>('google.clientId'),
      this.config.get<string>('google.clientSecret'),
      this.config.get<string>('google.redirectUri'),
    );
  }

  /** Step 1: URL the frontend redirects the admin to, to authorize a new upload destination. */
  getConsentUrl(state: string): string {
    const client = this.newOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // forces refresh_token on every grant
      scope: SCOPES,
      state,
    });
  }

  /** Step 2: exchange the ?code=... from Google's redirect for tokens, then persist an UploadConfig. */
  async handleOAuthCallback(code: string, label: string) {
    const client = this.newOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error(
        'Google did not return a refresh_token. Revoke prior app access at ' +
          'https://myaccount.google.com/permissions and retry (consent must be re-shown).',
      );
    }
    client.setCredentials(tokens);

    const youtube = google.youtube({ version: 'v3', auth: client });
    const channelRes = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channel = channelRes.data.items?.[0];
    if (!channel?.id) {
      throw new Error('Could not resolve the authorized Google account to a YouTube channel.');
    }

    return this.prisma.uploadConfig.create({
      data: {
        label,
        youtubeChannelId: channel.id,
        youtubeChannelTitle: channel.snippet?.title ?? undefined,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
        scope: tokens.scope,
      },
    });
  }

  /** Every playlist on the destination channel, for the "add to playlist" picker when whitelisting a source channel. */
  async listPlaylists(uploadConfigId: string): Promise<{ id: string; title: string }[]> {
    const client = await this.getAuthorizedClient(uploadConfigId);
    const youtube = google.youtube({ version: 'v3', auth: client });

    const playlists: { id: string; title: string }[] = [];
    let pageToken: string | undefined;
    do {
      const res = await youtube.playlists.list({ part: ['snippet'], mine: true, maxResults: 50, pageToken });
      for (const item of res.data.items ?? []) {
        if (item.id && item.snippet?.title) playlists.push({ id: item.id, title: item.snippet.title });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return playlists;
  }

  /** Returns a ready-to-use, auto-refreshed OAuth2 client for the given upload target. */
  async getAuthorizedClient(uploadConfigId: string) {
    const config = await this.prisma.uploadConfig.findUniqueOrThrow({
      where: { id: uploadConfigId },
    });

    const client = this.newOAuthClient();
    client.setCredentials({
      access_token: config.accessToken,
      refresh_token: config.refreshToken,
      expiry_date: config.tokenExpiresAt.getTime(),
    });

    // googleapis refreshes lazily on-demand; persist whatever it renews so
    // we don't burn the refresh token's rotation budget on every job.
    client.on('tokens', async (tokens) => {
      if (!tokens.access_token) return;
      try {
        await this.prisma.uploadConfig.update({
          where: { id: uploadConfigId },
          data: {
            accessToken: tokens.access_token,
            tokenExpiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
            ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          },
        });
      } catch (err) {
        this.logger.error(`failed to persist refreshed token for ${uploadConfigId}`, err as Error);
      }
    });

    // Force a refresh now if we're already past expiry, so callers always get a live token.
    if (config.tokenExpiresAt.getTime() <= Date.now() + 60_000) {
      await client.getAccessToken();
    }

    return client;
  }
}
