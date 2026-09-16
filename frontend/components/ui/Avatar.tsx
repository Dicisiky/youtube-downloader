function initials(source: string): string {
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const SIZE_CLASSES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-14 w-14 text-base',
} as const;

interface Props {
  name?: string | null;
  email: string;
  picture?: string | null;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function Avatar({ name, email, picture, size = 'md', className = '' }: Props) {
  const dim = SIZE_CLASSES[size];
  if (picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt="" className={`shrink-0 rounded-full ring-1 ring-white/10 ${dim} ${className}`} />;
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/40 to-indigo-800/40 font-semibold text-indigo-200 ring-1 ring-white/10 ${dim} ${className}`}
    >
      {initials(name?.trim() || email)}
    </div>
  );
}
