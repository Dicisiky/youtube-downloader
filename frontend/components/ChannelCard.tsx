'use client';

import { AlertTriangle, ExternalLink, ListMusic, Pause, Pencil, Play, PlayCircle, Square, Trash2, UploadCloud, Video } from 'lucide-react';
import type { MonitoredChannel, RecordingJob } from '../lib/types';
import { StatusBadge } from './StatusBadge';
import { api } from '../lib/api';
import { IconButton } from './ui/Button';
import { useConfirmDialog } from './ui/ConfirmDialog';

interface Props {
  channel: MonitoredChannel;
  activeJob?: RecordingJob;
  /** Most recent COMPLETED job for this channel, computed by the caller from the live jobs map (see app/page.tsx). */
  lastCompletedJob?: RecordingJob;
  /** ADMIN only: pause/resume, stop recording, edit, and remove are mutations RBAC restricts to admins. USER gets read-only status. */
  canManage: boolean;
  onChanged: () => void;
  onEdit: () => void;
}

export function ChannelCard({ channel, activeJob, lastCompletedJob, canManage, onChanged, onEdit }: Props) {
  const { ask, dialog } = useConfirmDialog();

  async function toggleActive() {
    await api.setChannelActive(channel.id, !channel.isActive);
    onChanged();
  }

  async function remove() {
    const ok = await ask({
      title: 'Remove this channel?',
      description: `${channel.channelTitle ?? channel.channelUrl} will stop being monitored and recorded.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    await api.removeChannel(channel.id);
    onChanged();
  }

  async function stopRecording() {
    const ok = await ask({
      title: 'Stop recording now?',
      description: 'Whatever has been captured so far will be uploaded immediately.',
      confirmLabel: 'Stop & upload',
      variant: 'danger',
    });
    if (!ok) return;
    await api.stopRecording(channel.id);
    onChanged();
  }

  // uploadedVisibility is a snapshot of what visibility THAT specific upload
  // actually used, not the channel's current (possibly since-changed) setting.
  const lastUnlistedUrl =
    lastCompletedJob?.uploadedVisibility === 'UNLISTED' && lastCompletedJob.destinationVideoId
      ? `https://www.youtube.com/watch?v=${lastCompletedJob.destinationVideoId}`
      : null;

  const isRecording = activeJob?.status === 'RECORDING';

  return (
    <div
      className={`group flex flex-col gap-3 rounded-xl border bg-surface-raised/60 p-4 transition-all duration-200 hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between ${
        isRecording ? 'border-red-500/30' : 'border-white/10 hover:border-white/20'
      }`}
    >
      {dialog}
      <div className="flex min-w-0 items-center gap-3">
        {channel.channelThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={channel.channelThumbnail} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-gray-500 ring-1 ring-white/10">
            <Video className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={channel.channelUrl}
              target="_blank"
              rel="noreferrer"
              className="group/link inline-flex items-center gap-1 truncate font-medium text-gray-100 hover:text-indigo-300"
            >
              <span className="truncate">{channel.channelTitle ?? channel.channelUrl}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-gray-600 opacity-0 transition-opacity group-hover/link:opacity-100" />
            </a>
            <StatusBadge status={channel.liveStatus} />
            {/* While a job is in flight, its finer-grained status (RECORDING /
              PROCESSING / UPLOADING) is more informative than the channel's
              own coarser RecordingStatus; otherwise fall back to it. */}
            <StatusBadge status={activeJob?.status ?? channel.recordingStatus} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <UploadCloud className="h-3 w-3" />
              {channel.uploadConfig?.label ?? 'unknown'}
            </span>
            <span className="inline-flex items-center gap-1 capitalize">
              {channel.defaultVisibility === 'PRIVATE' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {channel.defaultVisibility.toLowerCase()}
            </span>
            {channel.playlistTitle && (
              <span className="inline-flex items-center gap-1 truncate">
                <ListMusic className="h-3 w-3 shrink-0" />
                <span className="truncate">{channel.playlistTitle}</span>
              </span>
            )}
          </div>
          {channel.lastError && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-rose-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {channel.lastError}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 sm:shrink-0 sm:justify-end">
        {lastUnlistedUrl ? (
          <a
            href={lastUnlistedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-300 transition-colors hover:bg-white/[0.06]"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Last Unlisted Livestream</span>
            <span className="md:hidden">Last upload</span>
          </a>
        ) : (
          <span
            title="The most recent completed upload for this channel isn't unlisted"
            className="hidden items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 sm:inline-flex"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Last Unlisted Livestream</span>
          </span>
        )}

        {canManage && (
          <div className="flex items-center gap-1">
            {isRecording && (
              <IconButton icon={<Square className="h-4 w-4" />} label="Stop recording & upload now" variant="ghost-danger" onClick={stopRecording} />
            )}
            <IconButton icon={<Pencil className="h-4 w-4" />} label="Edit channel settings" onClick={onEdit} />
            <IconButton
              icon={channel.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              label={channel.isActive ? 'Pause monitoring' : 'Resume monitoring'}
              onClick={toggleActive}
            />
            <IconButton icon={<Trash2 className="h-4 w-4" />} label="Remove channel" variant="ghost-danger" onClick={remove} />
          </div>
        )}
      </div>
    </div>
  );
}
