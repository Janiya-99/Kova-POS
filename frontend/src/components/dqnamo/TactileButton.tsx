import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TactileButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'light' | 'obsidian' | 'lavender' | 'soft';
}

/**
 * dqnamo.com/kitchen inspired compressible 3D tactile hardware button
 * with a physical lower lip and >= 48px ergonomic touch target (Fitts's Law).
 */
export function TactileButton({
  tone = 'light',
  className,
  children,
  ...props
}: TactileButtonProps) {
  const toneClasses: Record<NonNullable<TactileButtonProps['tone']>, string> = {
    light:
      'bg-surface text-ink border border-border-theme shadow-[0_4px_0_var(--theme-border)] active:shadow-[0_1px_0_var(--theme-border)] hover:bg-surface-muted',
    obsidian:
      'bg-contrast text-contrast-fg border border-contrast/80 shadow-[0_4px_0_rgba(0,0,0,0.45)] active:shadow-[0_1px_0_rgba(0,0,0,0.45)] hover:opacity-95',
    lavender:
      'bg-accent text-accent-fg border border-accent/80 shadow-[0_4px_0_rgba(0,0,0,0.28)] active:shadow-[0_1px_0_rgba(0,0,0,0.28)] hover:opacity-95',
    soft:
      'bg-accent-soft text-accent-soft-fg border border-border-theme shadow-[0_4px_0_var(--theme-border)] active:shadow-[0_1px_0_var(--theme-border)] hover:opacity-90',
  };

  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-[42px] min-w-[42px] select-none items-center justify-center rounded-[var(--theme-radius-control)] px-3.5 py-2 text-xs font-bold tabular-nums transition-transform duration-75 active:translate-y-[2px] disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
