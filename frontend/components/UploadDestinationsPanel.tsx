'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, Plus, SquarePlay, Trash2 } from 'lucide-react';
import type { UploadConfig } from '../lib/types';
import { api } from '../lib/api';
import { EmptyState } from './ui/EmptyState';
import { Skeleton } from './ui/Skeleton';
import { Button, IconButton } from './ui/Button';
import { useConfirmDialog } from './ui/ConfirmDialog';

/** ADMIN-only: configuring which authorized YouTube channels recordings can be uploaded to. Lives on the Console page. */
export function UploadDestinationsPanel() {
  const [uploadConfigs, setUploadConfigs] = useState<UploadConfig[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const { ask, dialog } = useConfirmDialog();

  const refresh = () => api.listUploadConfigs().then(setUploadConfigs).finally(() => setLoading(false));

  useEffect(() => {
    refresh();
  }, []);

  async function removeUploadConfig(id: string, label: string) {
    const ok = await ask({
      title: 'Remove this upload destination?',
      description: `"${label}" will no longer be available as a destination for new channels.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    setConfigError(null);
    try {
      await api.removeUploadConfig(id);
      await refresh();
    } catch (err) {
      setConfigError((err as Error).message);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-surface-raised/60 p-4 sm:p-5">
      {dialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100">
          <KeyRound className="h-4 w-4 text-gray-500" />
          Upload destinations
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newLabel.trim()) api.startOAuth(newLabel.trim());
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label, e.g. Main Archive"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-surface px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 transition-colors focus:border-indigo-500 focus:outline-none sm:flex-none"
          />
          <Button type="submit" size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />}>
            Authorize with Google
          </Button>
        </form>
      </div>

      {configError && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" /> {configError}
        </p>
      )}

      {loading && (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && uploadConfigs.length === 0 && (
        <div className="mt-3">
          <EmptyState icon={<SquarePlay className="h-6 w-6" />} title="No destinations authorized yet" description="Authorize a YouTube channel above to start uploading recordings to it." />
        </div>
      )}

      {!loading && uploadConfigs.length > 0 && (
        <ul className="mt-3 divide-y divide-white/5">
          {uploadConfigs.map((cfg) => (
            <li key={cfg.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5 text-sm text-gray-300">
                <SquarePlay className="h-4 w-4 shrink-0 text-red-400" />
                <span className="min-w-0 truncate">
                  <span className="font-medium text-gray-100">{cfg.label}</span>{' '}
                  <span className="text-gray-500">— {cfg.youtubeChannelTitle ?? cfg.youtubeChannelId}</span>
                </span>
              </div>
              <IconButton
                icon={<Trash2 className="h-4 w-4" />}
                label={`Remove ${cfg.label}`}
                variant="ghost-danger"
                size="sm"
                onClick={() => removeUploadConfig(cfg.id, cfg.label)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
