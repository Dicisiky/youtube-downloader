'use client';

import { useEffect, useRef, useState } from 'react';
import type { MonitoredChannel, RecordingJob, ServerEvent } from './types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000/ws';
const RECONNECT_DELAY_MS = 3000;

export interface LiveState {
  channels: Record<string, MonitoredChannel>;
  jobs: Record<string, RecordingJob>;
  logs: string[];
  connected: boolean;
}

/**
 * Single long-lived WebSocket connection that mirrors backend state pushed
 * by EventsGateway. Consumers apply the initial REST fetch first, then this
 * hook patches individual channels/jobs in place as events arrive, so the
 * dashboard reflects MONITORING -> RECORDING -> ... -> COMPLETED without polling.
 */
export function useLiveStatus(seed: { channels: MonitoredChannel[]; jobs: RecordingJob[] }) {
  const [state, setState] = useState<LiveState>({
    channels: Object.fromEntries(seed.channels.map((c) => [c.id, c])),
    jobs: Object.fromEntries(seed.jobs.map((j) => [j.id, j])),
    logs: [],
    connected: false,
  });
  const socketRef = useRef<WebSocket | null>(null);

  // seed.channels/seed.jobs get a new array identity every time the page's
  // refresh() resolves (initial load, or after any mutation). useState's
  // initializer above only runs once, on the hook's first render -- without
  // this effect, anything already in the backend before the page mounted
  // would never make it into `state`, and a browser refresh would appear to
  // "lose" every previously-added channel.
  useEffect(() => {
    setState((s) => ({
      ...s,
      channels: Object.fromEntries(seed.channels.map((c) => [c.id, c])),
      jobs: Object.fromEntries(seed.jobs.map((j) => [j.id, j])),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed.channels, seed.jobs]);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;

      ws.onopen = () => setState((s) => ({ ...s, connected: true }));
      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        if (!cancelled) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (evt) => {
        const event: ServerEvent = JSON.parse(evt.data);
        setState((s) => {
          switch (event.type) {
            case 'channel.updated': {
              // The backend broadcasts this from a bare prisma.update() with
              // no relation include, so the payload only ever carries scalar
              // columns -- never `uploadConfig` or `recordingJobs`. Merging
              // onto the existing entry (rather than replacing it outright)
              // keeps those relation fields intact across every status ping
              // instead of wiping them the moment a channel's state changes.
              const existing = s.channels[event.payload.id];
              return { ...s, channels: { ...s.channels, [event.payload.id]: { ...existing, ...event.payload } } };
            }
            case 'job.created':
            case 'job.updated':
              return { ...s, jobs: { ...s.jobs, [event.payload.id]: event.payload } };
            case 'log':
              return { ...s, logs: [...s.logs.slice(-199), event.payload.message] };
            default:
              return s;
          }
        });
      };
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  return state;
}
