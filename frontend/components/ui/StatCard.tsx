import { ReactNode } from 'react';

const TONE_CLASSES = {
  default: 'bg-white/5 text-gray-300',
  indigo: 'bg-indigo-500/15 text-indigo-400',
  red: 'bg-red-500/15 text-red-400',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-400',
} as const;

interface Props {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONE_CLASSES;
}

export function StatCard({ icon, label, value, tone = 'default' }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface-raised/60 p-4 transition-colors duration-150 hover:bg-surface-hover">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs text-gray-500">{label}</p>
        <p className="text-lg font-semibold leading-tight text-gray-100">{value}</p>
      </div>
    </div>
  );
}
