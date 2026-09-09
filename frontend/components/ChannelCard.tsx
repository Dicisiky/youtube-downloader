import type { MonitoredChannel, RecordingJob } from "../lib/types";
import { StatusBadge } from "./StatusBadge";
import { api } from "../lib/api";

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

export function ChannelCard({
  channel,
  activeJob,
  lastCompletedJob,
  canManage,
  onChanged,
  onEdit,
}: Props) {
  async function toggleActive() {
    await api.setChannelActive(channel.id, !channel.isActive);
    onChanged();
  }

  async function remove() {
    if (
      !confirm(
        `Remove ${channel.channelTitle ?? channel.channelUrl} from monitoring?`,
      )
    )
      return;
    await api.removeChannel(channel.id);
    onChanged();
  }

  async function stopRecording() {
    if (
      !confirm("Stop recording now and upload what has been captured so far?")
    )
      return;
    await api.stopRecording(channel.id);
    onChanged();
  }

  // uploadedVisibility is a snapshot of what visibility THAT specific upload
  // actually used, not the channel's current (possibly since-changed) setting.
  const lastUnlistedUrl =
    lastCompletedJob?.uploadedVisibility === "UNLISTED" &&
    lastCompletedJob.destinationVideoId
      ? `https://www.youtube.com/watch?v=${lastCompletedJob.destinationVideoId}`
      : null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center gap-3">
        {channel.channelThumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.channelThumbnail}
            alt=""
            className="h-10 w-10 rounded-full"
          />
        )}
        <div>
          <div className="flex flex-row items-end gap-2">
            <a
              href={channel.channelUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-gray-100 hover:underline"
            >
              <div className="flex flex-row items-center gap-4">
                {channel.channelTitle ?? channel.channelUrl}
                {/* Independent by design: LiveStatus reflects YouTube's actual state
            (set only from live-checks), RecordingStatus reflects this app's
            action -- a paused channel that's still airing shows LIVE here
            alongside PAUSED below, at the same time. */}
              </div>
            </a>
            <StatusBadge status={channel.liveStatus} />
            {/* While a job is in flight, its finer-grained status (RECORDING /
              PROCESSING / UPLOADING) is more informative than the channel's
              own coarser RecordingStatus; otherwise fall back to it. */}
            <StatusBadge
              status={activeJob?.status ?? channel.recordingStatus}
            />
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
            <span>Uploads to: {channel.uploadConfig?.label ?? "unknown"}</span>
            <span>&middot;</span>
            <span>Visibility: {channel.defaultVisibility.toLowerCase()}</span>
            {channel.playlistTitle && (
              <>
                <span>&middot;</span>
                <span>Playlist: {channel.playlistTitle}</span>
              </>
            )}
          </div>
          {channel.lastError && (
            <p className="mt-1 text-xs text-rose-400">{channel.lastError}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {lastUnlistedUrl ? (
          <a
            href={lastUnlistedUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-gray-800"
          >
            Last Unlisted Livestream
          </a>
        ) : (
          <button
            disabled
            title="The most recent completed upload for this channel isn't unlisted"
            className="cursor-not-allowed rounded-md px-2 py-1.5 text-xs font-medium text-gray-600"
          >
            Last Unlisted Livestream
          </button>
        )}

        {canManage && activeJob?.status === "RECORDING" && (
          <button
            onClick={stopRecording}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-amber-400 hover:bg-gray-800"
          >
            Stop recording
          </button>
        )}
        {canManage && (
          <div className="flex items-center">
            <button
              onClick={onEdit}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800"
            >
              Edit
            </button>
            <button
              onClick={toggleActive}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800"
            >
              {channel.isActive ? "Pause" : "Resume"}
            </button>
            <button
              onClick={remove}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-400 hover:bg-gray-800"
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
