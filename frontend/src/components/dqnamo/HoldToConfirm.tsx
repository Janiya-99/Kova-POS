import * as React from 'react';
import { cn } from '@/lib/utils';

export interface HoldToConfirmProps {
  onConfirm: () => void;
  durationMs?: number;
  label: string;
  holdingLabel?: string;
  variant?: 'danger' | 'muted';
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

/**
 * dqnamo.com/kitchen press-and-hold destructive safety guard.
 * Prevents accidental single-click voids, refunds, or fiscal period locks.
 */
export function HoldToConfirm({
  onConfirm,
  durationMs = 950,
  label,
  holdingLabel = 'Keep holding...',
  variant = 'danger',
  icon,
  className,
  disabled = false,
}: HoldToConfirmProps) {
  const [progress, setProgress] = React.useState(0);
  const [holding, setHolding] = React.useState(false);
  const rafRef = React.useRef<number | null>(null);
  const startRef = React.useRef<number>(0);

  const stopHold = React.useCallback(() => {
    setHolding(false);
    setProgress(0);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startHold = React.useCallback(() => {
    if (disabled) return;
    setHolding(true);
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);
      if (pct >= 100) {
        stopHold();
        onConfirm();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, durationMs, onConfirm, stopHold]);

  React.useEffect(() => () => stopHold(), [stopHold]);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={startHold}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      className={cn(
        'relative inline-flex min-h-[40px] select-none items-center justify-center gap-2 overflow-hidden rounded-[var(--theme-radius-control)] border px-4 py-2 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        variant === 'muted'
          ? 'border-border-theme bg-surface-muted text-ink-muted hover:border-[#EF4444]/40 hover:text-[#EF4444]'
          : 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444] hover:bg-[#EF4444]/15',
        className
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-[#EF4444] transition-none"
        style={{ width: `${progress}%`, opacity: variant === 'muted' ? 0.14 : 0.2 }}
      />
      <span className="relative z-10 inline-flex items-center gap-2">
        {icon}
        <span>{holding ? holdingLabel : label}</span>
      </span>
    </button>
  );
}
