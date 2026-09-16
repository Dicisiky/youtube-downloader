import { Skeleton } from './ui/Skeleton';

export function ChannelCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-surface-raised/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      <Skeleton className="h-8 w-full sm:w-40" />
    </div>
  );
}
