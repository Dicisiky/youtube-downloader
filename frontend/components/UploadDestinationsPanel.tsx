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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-200">Upload destinations</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newLabel.trim()) api.startOAuth(newLabel.trim());
          }}
          className="flex gap-2"
        >
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label, e.g. Main Archive"
            className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 placeholder-gray-500"
          />
          <button type="submit" className="rounded-md bg-gray-700 px-3 py-1 text-xs font-medium text-gray-100 hover:bg-gray-600">
            Authorize with Google
          </button>
        </form>
      </div>
      {configError && <p className="mt-2 text-sm text-rose-400">{configError}</p>}
      {loading && <p className="mt-2 text-sm text-gray-400">Loading…</p>}
      <ul className="mt-3 space-y-1 text-sm text-gray-400">
        {!loading && uploadConfigs.length === 0 && <li>No destinations authorized yet.</li>}
        {uploadConfigs.map((cfg) => (
          <li key={cfg.id} className="flex items-center justify-between gap-2">
            <span>
              {cfg.label} — {cfg.youtubeChannelTitle ?? cfg.youtubeChannelId}
            </span>
            <button
              onClick={() => removeUploadConfig(cfg.id, cfg.label)}
              className="rounded-md px-2 py-0.5 text-xs font-medium text-rose-400 hover:bg-gray-800"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
