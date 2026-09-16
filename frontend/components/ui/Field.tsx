import { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function FieldLabel({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-300">
      {icon}
      {children}
    </label>
  );
}

export const inputClasses =
  'mt-1.5 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-gray-100 placeholder-gray-500 transition-colors focus:border-indigo-500 focus:outline-none disabled:opacity-50';

export const selectClasses =
  'w-full appearance-none rounded-lg border border-white/10 bg-surface px-3 py-2 pr-9 text-sm text-gray-100 transition-colors focus:border-indigo-500 focus:outline-none disabled:opacity-50';

/** Wraps a native <select className={selectClasses}> to add a themed chevron (native select arrows can't be restyled directly). */
export function SelectWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="relative mt-1.5">
      {children}
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
    </div>
  );
}
