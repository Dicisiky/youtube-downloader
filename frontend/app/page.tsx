'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clapperboard,
  Film,
  Loader2,
  Plus,
  Radio,
  Search,
  Video,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLiveStatus } from '../lib/useLiveStatus';
import { useCurrentUser } from '../lib/useCurrentUser';
import type { AppUser, MonitoredChannel, RecordingJob, UploadConfig } from '../lib/types';
import { ChannelCard } from '../components/ChannelCard';
import { ChannelCardSkeleton } from '../components/ChannelCardSkeleton';
import { AddChannelModal } from '../components/AddChannelModal';
import { EditChannelModal } from '../components/EditChannelModal';
import { PendingApprovalScreen } from '../components/PendingApprovalScreen';
import { ActivityLog } from '../components/ActivityLog';
import { ScrollStory } from '../components/landing/ScrollStory';
import { Topbar } from '../components/layout/Topbar';
import { Button } from '../components/ui/Button';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState } from '../components/ui/EmptyState';

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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
            <Clapperboard className="h-5 w-5" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </main>
    );
  }
  if (!user) return <ScrollStory />;
  if (user.status !== 'APPROVED') return <PendingApprovalScreen user={user} />;
  return <Dashboard user={user} />;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'recording', label: 'Recording' },
  { key: 'paused', label: 'Paused' },
  { key: 'errors', label: 'Errors' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

function Dashboard({ user }: { user: AppUser }) {
  const isAdmin = user.role === 'ADMIN';
  const [seedChannels, setSeedChannels] = useState<MonitoredChannel[]>([]);
  const [seedJobs, setSeedJobs] = useState<RecordingJob[]>([]);
  const [uploadConfigs, setUploadConfigs] = useState<UploadConfig[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<MonitoredChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

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

  const stats = useMemo(() => {
    const liveNow = channels.filter((c) => c.liveStatus === 'LIVE').length;
    const recordingNow = Object.values(jobsByChannel).filter((j) => j.status === 'RECORDING').length;
    const completed = Object.values(live.jobs).filter((j) => j.status === 'COMPLETED').length;
    return { total: channels.length, liveNow, recordingNow, completed };
  }, [channels, jobsByChannel, live.jobs]);

  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((channel) => {
      const matchesSearch = !q || (channel.channelTitle ?? channel.channelUrl).toLowerCase().includes(q);
      if (!matchesSearch) return false;
      const jobStatus = jobsByChannel[channel.id]?.status;
      switch (filter) {
        case 'live':
          return channel.liveStatus === 'LIVE';
        case 'recording':
          return jobStatus === 'RECORDING' || channel.recordingStatus === 'RECORDING';
        case 'paused':
          return !channel.isActive || channel.recordingStatus === 'PAUSED';
        case 'errors':
          return channel.recordingStatus === 'ERROR' || !!channel.lastError;
        default:
          return true;
      }
    });
  }, [channels, search, filter, jobsByChannel]);

  return (
    <div className="min-h-screen bg-canvas">
      <Topbar
        user={user}
        page="dashboard"
        status={
          <span
            className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset sm:inline-flex ${
              live.connected
                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25'
                : 'bg-amber-500/10 text-amber-300 ring-amber-500/25'
            }`}
          >
            {live.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3 animate-pulse" />}
            {live.connected ? 'Live' : 'Reconnecting…'}
          </span>
        }
        actions={
          isAdmin && (
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModalOpen(true)}>
              Add channel
            </Button>
          )
        }
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Video className="h-5 w-5" />} label="Channels monitored" value={stats.total} tone="indigo" />
          <StatCard icon={<Radio className="h-5 w-5" />} label="Live right now" value={stats.liveNow} tone="red" />
          <StatCard icon={<Film className="h-5 w-5" />} label="Recording" value={stats.recordingNow} tone="amber" />
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Uploaded" value={stats.completed} tone="emerald" />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search channels…"
              className="w-full rounded-lg border border-white/10 bg-surface-raised py-2 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 transition-colors focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  filter === f.key
                    ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/30'
                    : 'text-gray-400 ring-1 ring-inset ring-white/10 hover:bg-white/[0.05] hover:text-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-4 space-y-3">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => <ChannelCardSkeleton key={i} />)}

          {!loading && channels.length === 0 && (
            <EmptyState
              icon={<Video className="h-6 w-6" />}
              title="No channels monitored yet"
              description={isAdmin ? 'Add a YouTube channel to start recording its livestreams automatically.' : 'Ask an admin to add one.'}
              action={
                isAdmin && (
                  <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
                    Add your first channel
                  </Button>
                )
              }
            />
          )}

          {!loading && channels.length > 0 && filteredChannels.length === 0 && (
            <EmptyState icon={<Search className="h-6 w-6" />} title="No channels match" description="Try a different search term or filter." />
          )}

          {filteredChannels.map((channel, i) => (
            <div key={channel.id} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationFillMode: 'backwards' }}>
              <ChannelCard
                channel={channel}
                activeJob={jobsByChannel[channel.id]}
                lastCompletedJob={lastCompletedJobByChannel[channel.id]}
                canManage={isAdmin}
                onChanged={refresh}
                onEdit={() => setEditingChannel(channel)}
              />
            </div>
          ))}
        </section>

        {live.logs.length > 0 && <ActivityLog logs={live.logs} />}
      </main>

      {isAdmin && (
        <>
          <AddChannelModal open={modalOpen} uploadConfigs={uploadConfigs} onClose={() => setModalOpen(false)} onCreated={refresh} />
          <EditChannelModal channel={editingChannel} uploadConfigs={uploadConfigs} onClose={() => setEditingChannel(null)} onSaved={refresh} />
        </>
      )}
    </div>
  );
}
