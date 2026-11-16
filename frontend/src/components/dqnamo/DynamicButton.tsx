import * as React from 'react';
import { Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DynamicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  success?: boolean;
  icon?: React.ReactNode;
  variant?: 'obsidian' | 'lavender';
}

/**
 * dqnamo.com/kitchen inspired smoothly transitioning pill CTA button.
 */
export function DynamicButton({
  loading = false,
  success = false,
  icon,
  variant = 'obsidian',
  className,
  children,
  disabled,
  ...props
}: DynamicButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'group relative inline-flex min-h-[42px] items-center justify-center gap-2 overflow-hidden rounded-[var(--theme-radius-control)] px-4 py-2 text-[12.5px] font-semibold transition-colors duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer tabular-nums',
        variant === 'obsidian'
          ? 'bg-contrast text-contrast-fg shadow-md hover:opacity-90'
          : 'bg-accent text-accent-fg shadow-md hover:opacity-90',
        success && 'bg-[#22C55E] text-white hover:bg-[#22C55E]',
        className
      )}
      {...props}
    >
      <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : success ? (
          <Check className="h-4 w-4" />
        ) : (
          icon
        )}
      </span>
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}
