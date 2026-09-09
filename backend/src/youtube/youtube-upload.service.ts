import { Injectable, Logger } from '@nestjs/common';
import { createReadStream, statSync } from 'fs';
import { google } from 'googleapis';
import { Visibility } from '../common/enums';
import { YoutubeAuthService } from './youtube-auth.service';

export interface UploadParams {
  uploadConfigId: string;
  filePath: string;
  title: string;
  description: string;
  visibility: Visibility;
  /** Destination-channel playlist to also add the finished upload to, if any. */
  playlistId?: string | null;
}

const VISIBILITY_MAP: Record<Visibility, 'public' | 'unlisted' | 'private'> = {
  [Visibility.PUBLIC]: 'public',
  [Visibility.UNLISTED]: 'unlisted',
  [Visibility.PRIVATE]: 'private',
};

@Injectable()
export class YoutubeUploadService {
  private readonly logger = new Logger(YoutubeUploadService.name);

  constructor(private readonly auth: YoutubeAuthService) {}

  /**
   * Streams the recorded file to YouTube's resumable upload endpoint.
   * googleapis handles chunking/resume transparently via the media stream.
   */
  async upload(params: UploadParams): Promise<string> {
    const client = await this.auth.getAuthorizedClient(params.uploadConfigId);
    const youtube = google.youtube({ version: 'v3', auth: client });

    const fileSize = statSync(params.filePath).size;
    this.logger.log(`uploading ${params.filePath} (${(fileSize / 1e6).toFixed(1)} MB)`);

    const res = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        notifySubscribers: false,
        requestBody: {
          snippet: {
            title: params.title.slice(0, 100),
            description: params.description.slice(0, 5000),
          },
          status: {
            privacyStatus: VISIBILITY_MAP[params.visibility],
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: createReadStream(params.filePath),
        },
      },
      {
        // googleapis fires this on nearly every chunk -- for a multi-GB file
        // that's thousands of calls, which was flooding the log with a DEBUG
        // line per chunk. Only log when we've crossed another 5% boundary.
        onUploadProgress: (() => {
          let lastLoggedTenth = -1;
          return (evt: { bytesRead: number }) => {
            const pct = (evt.bytesRead / fileSize) * 100;
            const tenth = Math.floor(pct / 5);
            if (tenth !== lastLoggedTenth) {
              lastLoggedTenth = tenth;
              this.logger.debug(`upload progress: ${pct.toFixed(0)}%`);
            }
          };
        })(),
      },
    );

    const videoId = res.data.id;
    if (!videoId) {
      throw new Error('YouTube upload succeeded but returned no video id');
    }

    if (params.playlistId) {
      // Best-effort: the video is already uploaded and live at this point, so
      // a playlist-add failure (e.g. the playlist was since deleted) shouldn't
      // fail the whole job -- just log it and move on.
      try {
        await youtube.playlistItems.insert({
          part: ['snippet'],
          requestBody: {
            snippet: { playlistId: params.playlistId, resourceId: { kind: 'youtube#video', videoId } },
          },
        });
      } catch (err) {
        this.logger.error(`uploaded ${videoId} but failed to add it to playlist ${params.playlistId}`, err as Error);
      }
    }

    return videoId;
  }
}
