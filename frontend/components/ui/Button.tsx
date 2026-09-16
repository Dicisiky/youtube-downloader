import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ghost-danger';
export type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-600 text-white shadow-glow hover:bg-indigo-500 active:bg-indigo-600 disabled:bg-indigo-600/50 disabled:shadow-none',
  secondary:
    'bg-white/[0.06] text-gray-100 ring-1 ring-inset ring-white/10 hover:bg-white/[0.1] active:bg-white/[0.08]',
  ghost: 'text-gray-300 hover:bg-white/[0.06] hover:text-gray-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 disabled:bg-rose-600/50',
  'ghost-danger': 'text-rose-400 hover:bg-rose-500/10 hover:text-rose-300',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'gap-1.5 rounded-lg px-2.5 py-1.5 text-xs',
  md: 'gap-2 rounded-lg px-4 py-2 text-sm',
};

/** Same look as <Button>, for non-button elements (e.g. next/link `<Link>`) that need to read as one. */
export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className = '') {
  return `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`;
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, disabled, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-all duration-150 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}: Omit<Props, 'icon' | 'children'> & { icon: React.ReactNode; label: string }) {
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  return (
    <button
      title={label}
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${dim} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
}
