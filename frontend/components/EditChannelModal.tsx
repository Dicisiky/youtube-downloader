'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, Eye, ListMusic, Settings2, UploadCloud } from 'lucide-react';
import type { MonitoredChannel, Playlist, UploadConfig, Visibility } from '../lib/types';
import { api } from '../lib/api';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { FieldLabel, selectClasses, SelectWrapper } from './ui/Field';

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
    <Modal
      open={!!channel}
      onClose={onClose}
      icon={<Settings2 className="h-5 w-5" />}
      title={channel ? `Edit ${channel.channelTitle ?? channel.channelUrl}` : 'Edit channel'}
      description="Changes apply to future uploads -- an upload already in progress keeps its original settings."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel icon={<UploadCloud className="h-3.5 w-3.5 text-gray-500" />}>Upload destination</FieldLabel>
          <SelectWrapper>
            <select required value={uploadConfigId} onChange={(e) => setUploadConfigId(e.target.value)} className={selectClasses}>
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
