import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  Loader2,
  Pause,
  Radio,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import type { LiveStatus, RecordingStatus, JobStatus } from '../lib/types';

const CONFIG: Record<string, { classes: string; icon: React.ReactNode; pulse?: boolean }> = {
  OFFLINE: { classes: 'bg-white/5 text-gray-400 ring-white/10', icon: <Circle className="h-3 w-3" /> },
  LIVE: { classes: 'bg-red-500/15 text-red-300 ring-red-500/30', icon: <Radio className="h-3 w-3" />, pulse: true },
  IDLE: { classes: 'bg-white/5 text-gray-400 ring-white/10', icon: <Clock className="h-3 w-3" /> },
  PAUSED: { classes: 'bg-amber-500/15 text-amber-300 ring-amber-500/30', icon: <Pause className="h-3 w-3" /> },
  ERROR: { classes: 'bg-rose-500/15 text-rose-300 ring-rose-500/30', icon: <AlertTriangle className="h-3 w-3" /> },
  MONITORING: { classes: 'bg-white/5 text-gray-400 ring-white/10', icon: <Eye className="h-3 w-3" /> },
  RECORDING: { classes: 'bg-red-500/15 text-red-300 ring-red-500/30', icon: <Circle className="h-3 w-3 fill-current" />, pulse: true },
  PROCESSING: { classes: 'bg-blue-500/15 text-blue-300 ring-blue-500/30', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  UPLOADING: { classes: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30', icon: <UploadCloud className="h-3 w-3" /> },
  COMPLETED: { classes: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
  FAILED: { classes: 'bg-rose-500/15 text-rose-300 ring-rose-500/30', icon: <XCircle className="h-3 w-3" /> },
};

export function StatusBadge({ status }: { status: LiveStatus | RecordingStatus | JobStatus | string }) {
  const config = CONFIG[status] ?? { classes: 'bg-white/5 text-gray-400 ring-white/10', icon: <Circle className="h-3 w-3" /> };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${config.classes}`}>
      <span className="relative flex items-center justify-center">
        {config.pulse && <span className="absolute h-3 w-3 animate-pulse-ring rounded-full bg-current" />}
        {config.icon}
      </span>
      {status}
    </span>
  );
}
