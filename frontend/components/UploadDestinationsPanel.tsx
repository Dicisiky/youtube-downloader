'use client';

import { useEffect, useState } from 'react';
import type { UploadConfig } from '../lib/types';
import { api } from '../lib/api';

/** ADMIN-only: configuring which authorized YouTube channels recordings can be uploaded to. Lives on the Console page. */
export function UploadDestinationsPanel() {
  const [uploadConfigs, setUploadConfigs] = useState<UploadConfig[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const refresh = () => api.listUploadConfigs().then(setUploadConfigs).finally(() => setLoading(false));

  useEffect(() => {
    refresh();
  }, []);

  async function removeUploadConfig(id: string, label: string) {
    if (!confirm(`Remove upload destination "${label}"?`)) return;
    setConfigError(null);
    try {
      await api.removeUploadConfig(id);
      await refresh();
    } catch (err) {
      setConfigError((err as Error).message);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-gray-200">Upload destinations</h2>
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
            className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder-gray-500 sm:flex-none"
          />
          <button type="submit" className="shrink-0 rounded-md bg-gray-700 px-3 py-1 text-xs font-medium text-gray-100 hover:bg-gray-600">
            Authorize with Google
          </button>
        </form>
      </div>
      {configError && <p className="mt-2 text-sm text-rose-400">{configError}</p>}
      {loading && <p className="mt-2 text-sm text-gray-400">Loading…</p>}
      <ul className="mt-3 space-y-1 text-sm text-gray-400">
        {!loading && uploadConfigs.length === 0 && <li>No destinations authorized yet.</li>}
        {uploadConfigs.map((cfg) => (
          <li key={cfg.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="min-w-0 break-words">
              {cfg.label} — {cfg.youtubeChannelTitle ?? cfg.youtubeChannelId}
            </span>
            <button
              onClick={() => removeUploadConfig(cfg.id, cfg.label)}
              className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-rose-400 hover:bg-gray-800"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
