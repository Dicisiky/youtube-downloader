import type { LiveStatus, RecordingStatus, JobStatus } from '../lib/types';

const STYLES: Record<string, string> = {
  OFFLINE: 'bg-gray-700 text-gray-200',
  LIVE: 'bg-red-600 text-white',
  IDLE: 'bg-gray-700 text-gray-200',
  PAUSED: 'bg-amber-700 text-amber-100',
  ERROR: 'bg-rose-800 text-rose-100',
  MONITORING: 'bg-gray-700 text-gray-200',
  RECORDING: 'bg-red-600 text-white',
  PROCESSING: 'bg-blue-700 text-blue-100',
  UPLOADING: 'bg-indigo-700 text-indigo-100',
  COMPLETED: 'bg-emerald-700 text-emerald-100',
  FAILED: 'bg-rose-800 text-rose-100',
};

export function StatusBadge({ status }: { status: LiveStatus | RecordingStatus | JobStatus | string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] ?? 'bg-gray-700 text-gray-200'}`}>
      {(status === 'LIVE' || status === 'RECORDING') && (
        <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      )}
      {status}
    </span>
  );
}
