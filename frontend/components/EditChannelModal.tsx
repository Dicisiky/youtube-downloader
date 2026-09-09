'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { MonitoredChannel, Playlist, UploadConfig, Visibility } from '../lib/types';
import { api } from '../lib/api';

interface Props {
  channel: MonitoredChannel | null;
  uploadConfigs: UploadConfig[];
  onClose: () => void;
  onSaved: () => void;
}

/** Edits destination/playlist/visibility for an existing channel. channelUrl/channelId are not editable here -- see UpdateChannelDto for why. */
export function EditChannelModal({ channel, uploadConfigs, onClose, onSaved }: Props) {
  const [uploadConfigId, setUploadConfigId] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('UNLISTED');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistId, setPlaylistId] = useState('');
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed every field from the channel being edited whenever the modal is
  // (re)opened for one -- channel identity (via id) is the signal, not a
  // one-time mount, since the same modal instance gets reused across rows.
  // Both refs reset when the modal closes (channel -> null) so reopening --
  // for the same channel after Cancel, or for a different one right after --
  // always starts from a clean slate instead of stale state from last time.
  const seededForId = useRef<string | null>(null);
  const lastFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!channel) {
      seededForId.current = null;
      lastFetchedFor.current = null;
      return;
    }
    if (seededForId.current === channel.id) return;
    seededForId.current = channel.id;
    setUploadConfigId(channel.uploadConfigId);
    setVisibility(channel.defaultVisibility);
    setPlaylistId(channel.playlistId ?? '');
    setError(null);
  }, [channel]);

  // Playlists live on the destination channel. Skip clearing the selection on
  // the very first load for this channel (its existing playlistId came from
  // its CURRENT destination) -- only reset it if the admin then picks a
  // different destination afterward.
  useEffect(() => {
    if (!uploadConfigId) {
      setPlaylists([]);
      return;
    }
    const isDestinationChange = lastFetchedFor.current !== null && lastFetchedFor.current !== uploadConfigId;
    lastFetchedFor.current = uploadConfigId;

    let cancelled = false;
    setLoadingPlaylists(true);
    setPlaylistsError(null);
    if (isDestinationChange) setPlaylistId('');
    api
      .listPlaylists(uploadConfigId)
      .then((res) => {
        if (!cancelled) setPlaylists(res);
      })
      .catch((err) => {
        if (!cancelled) setPlaylistsError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadingPlaylists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uploadConfigId]);

  if (!channel) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!channel) return;
    setSubmitting(true);
    setError(null);
    try {
      const playlist = playlists.find((p) => p.id === playlistId);
      await api.updateChannel(channel.id, {
        uploadConfigId,
        defaultVisibility: visibility,
        playlistId: playlist?.id ?? '',
        playlistTitle: playlist?.title ?? '',
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-100">Edit {channel.channelTitle ?? channel.channelUrl}</h2>
        <p className="mt-1 text-sm text-gray-400">Changes apply to future uploads -- an upload already in progress keeps its original settings.</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">Upload destination</label>
            <select
              required
              value={uploadConfigId}
              onChange={(e) => setUploadConfigId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
            >
              {uploadConfigs.map((cfg) => (
                <option key={cfg.id} value={cfg.id}>
                  {cfg.label} {cfg.youtubeChannelTitle ? `(${cfg.youtubeChannelTitle})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300">Playlist (optional)</label>
            <select
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
              disabled={!uploadConfigId || loadingPlaylists}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            >
              <option value="">No playlist</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            {loadingPlaylists && <p className="mt-1 text-xs text-gray-500">Loading playlists…</p>}
            {playlistsError && (
              <p className="mt-1 text-xs text-amber-400">Couldn&apos;t load playlists: {playlistsError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300">Default visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
            >
              <option value="PUBLIC">Public</option>
              <option value="UNLISTED">Unlisted</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
