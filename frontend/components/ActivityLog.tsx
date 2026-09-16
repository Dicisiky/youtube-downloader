'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Terminal } from 'lucide-react';
import type { LogEntry } from '../lib/useLiveStatus';

const LEVEL_CLASSES: Record<LogEntry['level'], string> = {
  info: 'text-gray-400',
  warn: 'text-amber-400',
  error: 'text-rose-400',
};

export function ActivityLog({ logs }: { logs: LogEntry[] }) {
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, open]);

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-surface/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Terminal className="h-4 w-4 text-gray-500" />
          Activity log
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-gray-500">{logs.length}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          ref={scrollRef}
          className="max-h-48 overflow-y-auto border-t border-white/5 bg-black/30 px-4 py-3 font-mono text-xs animate-fade-in"
        >
          {logs.length === 0 ? (
            <p className="text-gray-600">Nothing logged yet.</p>
          ) : (
            logs.slice(-50).map((entry, i) => (
              <div key={i} className={LEVEL_CLASSES[entry.level]}>
                {entry.message}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
