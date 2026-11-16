import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface FilterPillOption<T extends string = string> {
  id: T;
  label: string;
}

interface FilterPillGroupProps<T extends string> {
  options: readonly FilterPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  tone?: 'accent' | 'contrast';
  className?: string;
}

/**
 * Shared accessible filter pill bar used inside connected report table headers.
 */
export function FilterPillGroup<T extends string>({
  options,
  value,
  onChange,
  tone = 'accent',
  className,
}: FilterPillGroupProps<T>) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex flex-wrap items-center gap-1 rounded-[var(--theme-radius-control)] border border-border-theme/70 bg-surface p-0.5',
        className
      )}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              'min-h-[30px] rounded-[calc(var(--theme-radius-control)-3px)] px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap',
              active
                ? tone === 'contrast'
                  ? 'bg-ink text-surface shadow-xs'
                  : 'bg-accent text-accent-fg shadow-xs'
                : 'text-ink-muted hover:text-ink hover:bg-surface-muted/60'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface ReportEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
}

/**
 * Centered modern empty-state card with visual focal badge and recovery action.
 */
export function ReportEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
}: ReportEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-theme/80 bg-accent-soft/55 text-accent shadow-xs">
        {icon}
      </div>
      <h5 className="mt-3.5 text-sm font-bold text-ink">{title}</h5>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-muted">{description}</p>
      {(actionLabel || secondaryLabel) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <Button type="button" variant="lavender" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondaryAction && (
            <Button type="button" variant="outline" size="sm" onClick={onSecondaryAction}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface ReportTableShellProps {
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  summaryText?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Unified single-border panel linking filter controls, full-bleed data table,
 * empty states, and flush pagination footer without nested box clutter.
 */
export function ReportTableShell({
  toolbarLeft,
  toolbarRight,
  summaryText,
  footer,
  children,
  className,
}: ReportTableShellProps) {
  const hasToolbar = Boolean(toolbarLeft || toolbarRight || summaryText);

  return (
    <div
      className={cn(
        'rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden min-w-0',
        className
      )}
    >
      {hasToolbar && (
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 border-b border-border-theme/70 bg-surface-muted/35 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">{toolbarLeft}</div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {toolbarRight}
            {summaryText && (
              <span className="rounded-full border border-border-theme/70 bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted tabular-nums">
                {summaryText}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="min-w-0">{children}</div>

      {footer && (
        <div className="border-t border-border-theme/70 bg-surface-muted/25 px-4 py-2.5">
          {footer}
        </div>
      )}
    </div>
  );
}

