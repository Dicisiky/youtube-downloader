export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type UserRole = 'ADMIN' | 'USER';

export interface AppUser {
  id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  status: UserStatus;
  role: UserRole;
}

export interface AdminUserRow extends AppUser {
  createdAt: string;
  approvedAt?: string | null;
}

// Deliberately independent: LiveStatus is purely "what YouTube is doing"
// (set only from live-checks), RecordingStatus is purely "what this app is
// doing" (recording/paused/idle/error). A paused channel that's still airing
// shows LiveStatus=LIVE and RecordingStatus=PAUSED at the same time.
export type LiveStatus = 'OFFLINE' | 'LIVE';
export type RecordingStatus = 'IDLE' | 'RECORDING' | 'PAUSED' | 'ERROR';
export type JobStatus = 'MONITORING' | 'RECORDING' | 'PROCESSING' | 'UPLOADING' | 'COMPLETED' | 'FAILED';
export type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

export interface UploadConfig {
  id: string;
  label: string;
  youtubeChannelId: string;
  youtubeChannelTitle?: string | null;
  createdAt: string;
}

export interface Playlist {
  id: string;
  title: string;
}

export interface RecordingJob {
  id: string;
  monitoredChannelId: string;
  sourceVideoId: string;
  sourceTitle?: string | null;
  status: JobStatus;
  destinationVideoId?: string | null;
  // Snapshot of the channel's visibility setting at the moment THIS job
  // uploaded -- not the channel's current (possibly since-changed) setting.
  uploadedVisibility?: Visibility | null;
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

export interface MonitoredChannel {
  id: string;
  channelUrl: string;
  channelId: string;
  channelTitle?: string | null;
  channelThumbnail?: string | null;
  isActive: boolean;
  liveStatus: LiveStatus;
  recordingStatus: RecordingStatus;
  currentVideoId?: string | null;
  lastError?: string | null;
  lastPolledAt?: string | null;
  uploadConfigId: string;
  uploadConfig?: Pick<UploadConfig, 'id' | 'label'>;
  playlistId?: string | null;
  playlistTitle?: string | null;
  defaultVisibility: Visibility;
  titleTemplate: string;
  recordingJobs?: RecordingJob[];
  createdAt: string;
}

export type ServerEvent =
  | { type: 'channel.updated'; payload: MonitoredChannel }
  | { type: 'job.created'; payload: RecordingJob }
  | { type: 'job.updated'; payload: RecordingJob }
  | { type: 'log'; payload: { message: string; level: 'info' | 'warn' | 'error' } };
