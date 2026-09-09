import type { AdminUserRow, AppUser, MonitoredChannel, Playlist, RecordingJob, UploadConfig, Visibility } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
    credentials: 'include', // session cookie is cross-origin (different port) -- must be sent explicitly
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `Request to ${path} failed with ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listChannels: () => request<MonitoredChannel[]>('/channels'),
  createChannel: (input: {
    channelUrl: string;
    uploadConfigId: string;
    defaultVisibility?: Visibility;
    titleTemplate?: string;
    playlistId?: string;
    playlistTitle?: string;
  }) => request<MonitoredChannel>('/channels', { method: 'POST', body: JSON.stringify(input) }),
  updateChannel: (
    id: string,
    input: {
      uploadConfigId?: string;
      defaultVisibility?: Visibility;
      titleTemplate?: string;
      playlistId?: string;
      playlistTitle?: string;
    },
  ) => request<MonitoredChannel>(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  setChannelActive: (id: string, isActive: boolean) =>
    request<MonitoredChannel>(`/channels/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  stopRecording: (id: string) => request<{ ok: boolean; jobId: string }>(`/channels/${id}/stop-recording`, { method: 'POST' }),
  removeChannel: (id: string) => request<{ ok: boolean }>(`/channels/${id}`, { method: 'DELETE' }),

  listUploadConfigs: () => request<UploadConfig[]>('/upload-configs'),
  listPlaylists: (uploadConfigId: string) => request<Playlist[]>(`/upload-configs/${uploadConfigId}/playlists`),
  removeUploadConfig: (id: string) => request<void>(`/upload-configs/${id}`, { method: 'DELETE' }),
  startOAuth: (label: string) => {
    window.location.href = `${API_URL}/auth/youtube/start?label=${encodeURIComponent(label)}`;
  },

  listJobs: () => request<RecordingJob[]>('/recording-jobs'),

  // --- App login / admin approval ---
  getMe: () => request<{ authenticated: boolean; user?: AppUser }>('/auth/google/me'),
  loginWithGoogle: () => {
    window.location.href = `${API_URL}/auth/google/login`;
  },
  logout: () => request<{ ok: boolean }>('/auth/google/logout', { method: 'POST' }),

  listUsers: () => request<AdminUserRow[]>('/admin/users'),
  /** Maps to the backend's approve/reject endpoints -- there is no delete-user endpoint, by design. */
  setUserActive: (id: string, active: boolean) =>
    request<AdminUserRow>(`/admin/users/${id}/${active ? 'approve' : 'reject'}`, { method: 'POST' }),
};

export { API_URL };
