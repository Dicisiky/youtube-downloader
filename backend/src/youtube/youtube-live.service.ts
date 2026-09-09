import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { google } from 'googleapis';

const execFileAsync = promisify(execFile);

export interface LiveBroadcastInfo {
  videoId: string;
  title: string;
}

export interface ResolvedChannel {
  channelId: string;
  title: string;
  thumbnail?: string;
}

/**
 * Read-only lookups against the public YouTube Data API using a server API
 * key. No OAuth is needed here — we're only ever reading public metadata
 * about the channels being *monitored* (the destination/upload side is a
 * separate OAuth-authenticated concern in YoutubeAuthService).
 */
@Injectable()
export class YoutubeLiveService {
  private readonly logger = new Logger(YoutubeLiveService.name);
  private readonly youtube;

  constructor(private readonly config: ConfigService) {
    this.youtube = google.youtube({
      version: 'v3',
      auth: this.config.get<string>('youtubeApiKey'),
    });
  }

  /** Accepts a /channel/UC.., /@handle, or /c/name URL and resolves the canonical channelId. */
  async resolveChannelFromUrl(url: string): Promise<ResolvedChannel> {
    const trimmed = url.trim().replace(/\/$/, '');

    const channelIdMatch = trimmed.match(/\/channel\/(UC[\w-]{10,})/);
    if (channelIdMatch) {
      return this.getChannelById(channelIdMatch[1]);
    }

    const handleMatch = trimmed.match(/\/@([\w.-]+)/);
    const handle = handleMatch ? handleMatch[1] : trimmed.replace(/^@/, '');
    const res = await this.youtube.channels.list({
      part: ['snippet'],
      forHandle: handle,
    });
    const channel = res.data.items?.[0];
    if (!channel?.id) {
      throw new Error(`Could not resolve a YouTube channel from "${url}"`);
    }
    return {
      channelId: channel.id,
      title: channel.snippet?.title ?? handle,
      thumbnail: channel.snippet?.thumbnails?.default?.url ?? undefined,
    };
  }

  async getChannelById(channelId: string): Promise<ResolvedChannel> {
    const res = await this.youtube.channels.list({ part: ['snippet'], id: [channelId] });
    const channel = res.data.items?.[0];
    if (!channel?.id) {
      throw new Error(`Unknown channelId "${channelId}"`);
    }
    return {
      channelId: channel.id,
      title: channel.snippet?.title ?? channelId,
      thumbnail: channel.snippet?.thumbnails?.default?.url ?? undefined,
    };
  }

  /**
   * Returns the active live broadcast for a channel, or null if it isn't live
   * right now. Deliberately does NOT use the Data API's search.list -- that
   * endpoint costs 100 quota units per call against a default 10,000/day
   * project quota, so polling even a couple of channels once a minute
   * exhausts the daily quota in under an hour (confirmed the hard way).
   *
   * Also deliberately does NOT hand-scrape the channel page's HTML/JSON --
   * that was tried first, but YouTube serves meaningfully different page
   * variants per request (A/B-tested rendering, locale differences), so any
   * regex against its internal structure is unreliable in practice (it
   * intermittently matched unrelated "hover preview" thumbnails elsewhere on
   * the page instead of the actual live video, or found nothing at all).
   *
   * Delegating to `yt-dlp --simulate` against the channel's /live URL avoids
   * both problems: it costs zero API quota (same as scraping), but reuses
   * yt-dlp's own actively-maintained YouTube extractor -- the same one doing
   * the actual recording -- instead of reinventing that page-parsing logic.
   * yt-dlp reports a clean, unambiguous "channel is not currently live"
   * error when there's no active stream, rather than an ambiguous empty match.
   */
  async getActiveLiveBroadcast(channelId: string): Promise<LiveBroadcastInfo | null> {
    const binary = this.config.get<string>('ytdlp.binaryPath')!;
    const cookiesFile = this.config.get<string>('ytdlp.cookiesFile');
    try {
      const { stdout } = await execFileAsync(
        binary,
        [
          '--simulate',
          '--no-warnings',
          '--print',
          'is_live=%(is_live)s',
          '--print',
          'id=%(id)s',
          '--print',
          'title=%(title)s',
          ...(cookiesFile ? ['--cookies', cookiesFile] : []),
          `https://www.youtube.com/channel/${channelId}/live`,
        ],
        { timeout: 20_000 },
      );

      const fields: Record<string, string> = {};
      for (const line of stdout.trim().split(/\r?\n/)) {
        const idx = line.indexOf('=');
        if (idx === -1) continue;
        fields[line.slice(0, idx)] = line.slice(idx + 1);
      }

      if (fields.is_live !== 'True' || !fields.id) return null;
      return { videoId: fields.id, title: fields.title || 'Untitled livestream' };
    } catch (err) {
      const message = `${(err as any)?.stderr ?? ''} ${(err as Error).message ?? ''}`;
      // Both mean "nothing to record right now", not a real failure: a
      // channel with no broadcast at all ("not currently live"), and one
      // whose /live URL currently points at a scheduled premiere that hasn't
      // started airing yet ("will begin in N minutes"/"Premieres in N minutes").
      if (/not currently live/i.test(message) || /(?:will begin|premieres) in/i.test(message)) return null;
      this.logger.error(`live-status check failed for ${channelId}`, err as Error);
      throw err;
    }
  }

  /** Cheap poll to know whether a specific broadcast we're already recording is still live. */
  async isBroadcastStillLive(videoId: string): Promise<boolean> {
    const res = await this.youtube.videos.list({ part: ['snippet'], id: [videoId] });
    return res.data.items?.[0]?.snippet?.liveBroadcastContent === 'live';
  }
}
