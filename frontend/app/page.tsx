'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import { useLiveStatus } from '../lib/useLiveStatus';
import { useCurrentUser } from '../lib/useCurrentUser';
import type { AppUser, MonitoredChannel, RecordingJob, UploadConfig } from '../lib/types';
import { ChannelCard } from '../components/ChannelCard';
import { AddChannelModal } from '../components/AddChannelModal';
import { EditChannelModal } from '../components/EditChannelModal';
import { LoginScreen } from '../components/LoginScreen';
import { PendingApprovalScreen } from '../components/PendingApprovalScreen';
import { LegalLinks } from '../components/LegalLinks';

/**
 * Root gate: every core feature below lives behind this check. The backend's
 * AuthGuard/RolesGuard is the real enforcement (this page calling the API
 * without an approved admin session just gets 401/403s), but showing the
 * right screen here is what makes "Your request has been sent to the admin
 * for approval." an actual user-facing experience instead of a page full of
 * failed requests.
 */
export default function AuthGate() {
  const { loading, user } = useCurrentUser();

  if (loading) return null;
  if (!user) return <LoginScreen />;
  if (user.status !== 'APPROVED') return <PendingApprovalScreen user={user} />;
  return <Dashboard user={user} />;
}

function Dashboard({ user }: { user: AppUser }) {
  const isAdmin = user.role === 'ADMIN';
  const [seedChannels, setSeedChannels] = useState<MonitoredChannel[]>([]);
  const [seedJobs, setSeedJobs] = useState<RecordingJob[]>([]);
  const [uploadConfigs, setUploadConfigs] = useState<UploadConfig[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<MonitoredChannel | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // /upload-configs is ADMIN-only on the backend -- a USER account would
    // just get a 403 for it, and doesn't need it anyway (only admins add
    // channels, which is the only place a destination needs picking).
    const [channels, jobs, configs] = await Promise.all([
      api.listChannels(),
      api.listJobs(),
      isAdmin ? api.listUploadConfigs() : Promise.resolve<UploadConfig[]>([]),
    ]);
    setSeedChannels(channels);
    setSeedJobs(jobs);
    setUploadConfigs(configs);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const live = useLiveStatus({ channels: seedChannels, jobs: seedJobs });
  const channels = Object.values(live.channels).sort((a, b) => a.channelTitle?.localeCompare(b.channelTitle ?? '') ?? 0);
  const jobsByChannel = Object.values(live.jobs).reduce<Record<string, RecordingJob>>((acc, job) => {
    if (['RECORDING', 'PROCESSING', 'UPLOADING'].includes(job.status)) {
      acc[job.monitoredChannelId] = job;
    }
    return acc;
  }, {});

  // Computed from the live `jobs` map (kept fresh by job.updated/job.created
  // events) rather than each channel's `recordingJobs` snapshot, which is
  // only ever populated by the initial REST fetch and never updated by a
  // job finishing later -- using it here would make "Last Unlisted
  // Livestream" go stale until a full page reload.
  const lastCompletedJobByChannel = Object.values(live.jobs).reduce<Record<string, RecordingJob>>((acc, job) => {
    if (job.status !== 'COMPLETED') return acc;
    const current = acc[job.monitoredChannelId];
    if (!current || new Date(job.startedAt) > new Date(current.startedAt)) {
      acc[job.monitoredChannelId] = job;
    }
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Dicisiky's Livestreams Archive</h1>
          <p className="mt-1 text-sm text-gray-400">
            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${live.connected ? 'bg-emerald-500' : 'bg-gray-600'}`} />
            {live.connected ? 'Live updates connected' : 'Reconnecting…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LegalLinks />
          <span className="text-sm text-gray-400">{user.email}</span>
          <button
            onClick={() => api.logout().then(() => window.location.reload())}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-800"
          >
            Sign out
          </button>
          {isAdmin && (
            <>
              <Link
                href="/console"
                className="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
              >
                Console
              </Link>
              <button
                onClick={() => setModalOpen(true)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                + Add channel
              </button>
            </>
          )}
        </div>
      </header>

      <section className="mt-6 space-y-3">
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && channels.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-800 p-8 text-center text-sm text-gray-500">
            No channels monitored yet. {isAdmin ? 'Add one to get started.' : 'Ask an admin to add one.'}
          </p>
        )}
        {channels.map((channel) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            activeJob={jobsByChannel[channel.id]}
            lastCompletedJob={lastCompletedJobByChannel[channel.id]}
            canManage={isAdmin}
            onChanged={refresh}
            onEdit={() => setEditingChannel(channel)}
          />
        ))}
      </section>

      {live.logs.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-200">Activity log</h2>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-800 bg-black/40 p-3 font-mono text-xs text-gray-400">
            {live.logs.slice(-50).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </section>
      )}

      {isAdmin && (
        <>
          <AddChannelModal
            open={modalOpen}
            uploadConfigs={uploadConfigs}
            onClose={() => setModalOpen(false)}
            onCreated={refresh}
          />
          <EditChannelModal
            channel={editingChannel}
            uploadConfigs={uploadConfigs}
            onClose={() => setEditingChannel(null)}
            onSaved={refresh}
          />
        </>
      )}
    </main>
  );
}
