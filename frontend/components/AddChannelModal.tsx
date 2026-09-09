'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Playlist, UploadConfig, Visibility } from '../lib/types';
import { api } from '../lib/api';

interface Props {
  open: boolean;
  uploadConfigs: UploadConfig[];
  onClose: () => void;
  onCreated: () => void;
}

export function AddChannelModal({ open, uploadConfigs, onClose, onCreated }: Props) {
  const [channelUrl, setChannelUrl] = useState('');
  const [uploadConfigId, setUploadConfigId] = useState(uploadConfigs[0]?.id ?? '');
  const [visibility, setVisibility] = useState<Visibility>('UNLISTED');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistId, setPlaylistId] = useState('');
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // uploadConfigs loads asynchronously in the parent and often arrives after
  // this component's first render, so the useState initializer above misses
  // it. Re-sync the selection whenever the list changes (or once it's no
  // longer empty) instead of only picking a default at mount time.
  useEffect(() => {
    if (uploadConfigs.length === 0) return;
    if (!uploadConfigs.some((cfg) => cfg.id === uploadConfigId)) {
      setUploadConfigId(uploadConfigs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadConfigs]);

  // Playlists live on the destination channel, so they have to be refetched
  // (and the previous selection dropped) every time the destination changes.
  useEffect(() => {
    if (!uploadConfigId) {
      setPlaylists([]);
      setPlaylistId('');
      return;
    }
    let cancelled = false;
    setLoadingPlaylists(true);
    setPlaylistsError(null);
    setPlaylistId('');
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

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!uploadConfigId) {
      setError('Authorize at least one upload destination first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const playlist = playlists.find((p) => p.id === playlistId);
      await api.createChannel({
        channelUrl,
        uploadConfigId,
        defaultVisibility: visibility,
        playlistId: playlist?.id,
        playlistTitle: playlist?.title,
      });
      setChannelUrl('');
      onCreated();
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
        <h2 className="text-lg font-semibold text-gray-100">Add channel to monitor</h2>
        <p className="mt-1 text-sm text-gray-400">
          If the channel is already live, recording starts immediately after you save.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">YouTube channel URL</label>
            <input
              required
              type="url"
              placeholder="https://www.youtube.com/@channelname"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300">Upload destination</label>
            <select
              required
              value={uploadConfigId}
              onChange={(e) => setUploadConfigId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
            >
              {uploadConfigs.length === 0 && <option value="">No authorized channels yet</option>}
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
            <p className="mt-1 text-xs text-gray-500">Finished uploads are also added to this playlist on the destination channel.</p>
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
