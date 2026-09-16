'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Eye, Link2, ListMusic, UploadCloud, Video } from 'lucide-react';
import type { Playlist, UploadConfig, Visibility } from '../lib/types';
import { api } from '../lib/api';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { FieldLabel, inputClasses, selectClasses, SelectWrapper } from './ui/Field';

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
    <Modal
      open={open}
      onClose={onClose}
      icon={<Video className="h-5 w-5" />}
      title="Add channel to monitor"
      description="If the channel is already live, recording starts immediately after you save."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel icon={<Link2 className="h-3.5 w-3.5 text-gray-500" />}>YouTube channel URL</FieldLabel>
          <input
            required
            autoFocus
            type="url"
            placeholder="https://www.youtube.com/@channelname"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            className={inputClasses}
          />
        </div>

        <div>
          <FieldLabel icon={<UploadCloud className="h-3.5 w-3.5 text-gray-500" />}>Upload destination</FieldLabel>
          <SelectWrapper>
            <select required value={uploadConfigId} onChange={(e) => setUploadConfigId(e.target.value)} className={selectClasses}>
              {uploadConfigs.length === 0 && <option value="">No authorized channels yet</option>}
              {uploadConfigs.map((cfg) => (
                <option key={cfg.id} value={cfg.id}>
                  {cfg.label} {cfg.youtubeChannelTitle ? `(${cfg.youtubeChannelTitle})` : ''}
                </option>
              ))}
            </select>
          </SelectWrapper>
        </div>

        <div>
          <FieldLabel icon={<ListMusic className="h-3.5 w-3.5 text-gray-500" />}>Playlist (optional)</FieldLabel>
          <SelectWrapper>
            <select
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
              disabled={!uploadConfigId || loadingPlaylists}
              className={selectClasses}
            >
              <option value="">No playlist</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </SelectWrapper>
          {loadingPlaylists && <p className="mt-1.5 text-xs text-gray-500">Loading playlists…</p>}
          {playlistsError && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-400">
              <AlertCircle className="h-3 w-3" /> Couldn&apos;t load playlists: {playlistsError}
            </p>
          )}
          <p className="mt-1.5 text-xs text-gray-500">Finished uploads are also added to this playlist on the destination channel.</p>
        </div>

        <div>
          <FieldLabel icon={<Eye className="h-3.5 w-3.5 text-gray-500" />}>Default visibility</FieldLabel>
          <SelectWrapper>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} className={selectClasses}>
              <option value="PUBLIC">Public</option>
              <option value="UNLISTED">Unlisted</option>
              <option value="PRIVATE">Private</option>
            </select>
          </SelectWrapper>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
