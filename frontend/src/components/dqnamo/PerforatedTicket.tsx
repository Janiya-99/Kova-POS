import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PerforatedTicketProps {
  code: string;
  subtitle: string;
  amount: string;
  badge?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * dqnamo.com/kitchen physical ticket silhouette with semi-circular side notches
 * and dashed tear line for Suspended / Held POS bills.
 */
export function PerforatedTicket({
  code,
  subtitle,
  amount,
  badge,
  children,
  footer,
  className,
}: PerforatedTicketProps) {
  return (
    <div
      className={cn(
        'relative rounded-[var(--theme-radius-card)] border border-border-theme bg-surface text-ink shadow-[var(--theme-shadow)] overflow-visible',
        className
      )}
    >
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between gap-2.5">
          <span className="text-[12.5px] font-extrabold text-ink tabular-nums whitespace-nowrap">
            {code}
          </span>
          <span className="text-[13px] font-extrabold text-ink tabular-nums whitespace-nowrap shrink-0">
            {amount}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {badge && (
            <span className="inline-flex shrink-0 whitespace-nowrap rounded-[var(--theme-radius-badge)] bg-accent-soft px-2.5 py-0.5 text-[10px] font-semibold text-accent-soft-fg">
              {badge}
            </span>
          )}
          <p className="truncate text-[11px] text-ink-muted">{subtitle}</p>
        </div>
        {children && <div className="mt-3 space-y-1.5 text-xs text-ink-muted">{children}</div>}
      </div>

      {/* Perforated Dashed Divider + Side Notches */}
      <div className="relative flex items-center px-3">
        <span className="-ml-5 h-4 w-4 rounded-full border border-border-theme bg-canvas" />
        <div className="w-full border-t-2 border-dashed border-border-theme" />
        <span className="-mr-5 h-4 w-4 rounded-full border border-border-theme bg-canvas" />
      </div>

      {footer && <div className="flex flex-wrap items-center justify-between gap-2.5 p-4 pt-3">{footer}</div>}
    </div>
  );
}
