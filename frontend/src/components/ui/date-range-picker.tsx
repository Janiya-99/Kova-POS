import * as React from 'react';
import type { DateRange } from 'react-day-picker';
import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  isValid,
  parse,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns';
import { ArrowRight, CalendarDays, Check, ChevronDown, RotateCcw } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function formatLocalYMD(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function parseLocalYMD(ymd: string | undefined | null): Date | undefined {
  if (!ymd) return undefined;
  const trimmed = ymd.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = parse(trimmed, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : undefined;
  }
  const fallback = new Date(ymd);
  return isValid(fallback) ? fallback : undefined;
}

export interface DateRangePreset {
  id: string;
  label: string;
  getRange: () => { from: Date; to: Date };
}

const DEFAULT_PRESETS: DateRangePreset[] = [
  {
    id: 'TODAY',
    label: 'Today',
    getRange: () => {
      const now = new Date();
      return { from: now, to: now };
    },
  },
  {
    id: '7D',
    label: 'Last 7 Days',
    getRange: () => {
      const now = new Date();
      return { from: subDays(now, 7), to: now };
    },
  },
  {
    id: '30D',
    label: 'Last 30 Days',
    getRange: () => {
      const now = new Date();
      return { from: subDays(now, 30), to: now };
    },
  },
  {
    id: '90D',
    label: 'Last 90 Days',
    getRange: () => {
      const now = new Date();
      return { from: subDays(now, 90), to: now };
    },
  },
  {
    id: 'THIS_MONTH',
    label: 'This Month',
    getRange: () => {
      const now = new Date();
      return { from: startOfMonth(now), to: now };
    },
  },
  {
    id: 'LAST_MONTH',
    label: 'Last Month',
    getRange: () => {
      const prev = subMonths(new Date(), 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    },
  },
  {
    id: 'YTD',
    label: 'Year to Date',
    getRange: () => {
      const now = new Date();
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    },
  },
];

function useIsWideCalendar(): boolean {
  const [isWide, setIsWide] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia('(min-width: 640px)').matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = (e: MediaQueryListEvent) => setIsWide(e.matches);
    setIsWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isWide;
}

export interface DateRangePickerProps {
  fromDate: string;
  toDate: string;
  onRangeChange: (next: { from: string; to: string; presetId?: string }) => void;
  presets?: DateRangePreset[];
  align?: 'start' | 'center' | 'end';
  disabledFuture?: boolean;
  className?: string;
}

export function DateRangePicker({
  fromDate,
  toDate,
  onRangeChange,
  presets = DEFAULT_PRESETS,
  align = 'end',
  disabledFuture = true,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const isWide = useIsWideCalendar();

  const committedFrom = React.useMemo(() => parseLocalYMD(fromDate), [fromDate]);
  const committedTo = React.useMemo(() => parseLocalYMD(toDate), [toDate]);

  const [draftRange, setDraftRange] = React.useState<DateRange | undefined>(() => ({
    from: committedFrom,
    to: committedTo,
  }));
  const [displayMonth, setDisplayMonth] = React.useState<Date>(
    () => committedFrom ?? committedTo ?? new Date()
  );

  // Synchronize draft state when opening the popover
  React.useEffect(() => {
    if (open) {
      setDraftRange({ from: committedFrom, to: committedTo });
      setDisplayMonth(committedFrom ?? committedTo ?? new Date());
    }
  }, [open, committedFrom, committedTo]);

  const handleSelect = (next: DateRange | undefined) => {
    setDraftRange(next);
  };

  const handleApply = () => {
    if (!draftRange?.from) return;
    const start = draftRange.from;
    const end = draftRange.to ?? draftRange.from;
    const normalizedFrom = start <= end ? start : end;
    const normalizedTo = start <= end ? end : start;
    onRangeChange({
      from: formatLocalYMD(normalizedFrom),
      to: formatLocalYMD(normalizedTo),
      presetId: 'CUSTOM',
    });
    setOpen(false);
  };

  const handlePresetClick = (preset: DateRangePreset) => {
    const { from, to } = preset.getRange();
    onRangeChange({
      from: formatLocalYMD(from),
      to: formatLocalYMD(to),
      presetId: preset.id,
    });
    setOpen(false);
  };

  const handleResetDraft = () => {
    setDraftRange({ from: committedFrom, to: committedTo });
    setDisplayMonth(committedFrom ?? committedTo ?? new Date());
  };

  const committedDaySpan =
    committedFrom && committedTo
      ? Math.max(1, Math.abs(differenceInCalendarDays(committedTo, committedFrom)) + 1)
      : null;

  const draftEnd = draftRange?.to ?? draftRange?.from;
  const draftDaySpan =
    draftRange?.from && draftEnd
      ? Math.max(1, Math.abs(differenceInCalendarDays(draftEnd, draftRange.from)) + 1)
      : null;

  const formattedTriggerFrom = committedFrom ? format(committedFrom, 'MMM dd, yyyy') : 'Start date';
  const formattedTriggerTo = committedTo ? format(committedTo, 'MMM dd, yyyy') : 'End date';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Select report date range"
          aria-expanded={open}
          className={cn(
            'inline-flex min-h-[36px] w-full md:w-auto items-center justify-between gap-2.5 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface px-3 py-1.5 text-[12px] font-medium text-ink shadow-xs transition hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 cursor-pointer',
            open && 'border-accent ring-2 ring-accent/20',
            className
          )}
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <CalendarDays className="h-3.5 w-3.5 text-accent shrink-0" />
            <span className="tabular-nums truncate">{formattedTriggerFrom}</span>
            <ArrowRight className="h-3 w-3 text-ink-muted shrink-0" />
            <span className="tabular-nums truncate">{formattedTriggerTo}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 shrink-0">
            {committedDaySpan !== null && (
              <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted tabular-nums">
                {committedDaySpan}d
              </span>
            )}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-ink-muted transition-transform duration-150',
                open && 'rotate-180 text-accent'
              )}
            />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={8}
        className="w-auto max-w-[calc(100vw-1.5rem)] p-0 overflow-hidden bg-surface border border-border-theme shadow-xl"
      >
        <div className="flex flex-col sm:flex-row">
          {/* Quick Presets Column (horizontal scroll on mobile, clean sidebar on sm+) */}
          <div className="flex sm:flex-col gap-1 border-b sm:border-b-0 sm:border-r border-border-theme/80 bg-surface-muted/35 p-2.5 overflow-x-auto pos-clean-scroll sm:w-[146px] shrink-0">
            <span className="hidden sm:block px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              Quick Ranges
            </span>
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className="shrink-0 whitespace-nowrap rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1.5 text-left text-[11.5px] font-medium text-ink-muted transition hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Dual / Single Shadcn Calendar Area */}
          <div className="flex flex-col">
            <div className="p-3">
              <Calendar
                mode="range"
                resetOnSelect
                selected={draftRange}
                onSelect={handleSelect}
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                numberOfMonths={isWide ? 2 : 1}
                disabled={disabledFuture ? { after: new Date() } : undefined}
              />
            </div>

            {/* Symmetrical Footer Summary & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-theme/80 bg-surface-muted/25 px-3 py-2.5">
              <div className="text-[11px] text-ink-muted tabular-nums">
                {draftRange?.from ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    <span>{format(draftRange.from, 'MMM dd, yyyy')}</span>
                    <ArrowRight className="h-3 w-3 text-ink-muted" />
                    <span>
                      {draftRange.to
                        ? format(draftRange.to, 'MMM dd, yyyy')
                        : format(draftRange.from, 'MMM dd, yyyy')}
                    </span>
                    {draftDaySpan !== null && (
                      <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                        {draftDaySpan} {draftDaySpan === 1 ? 'day' : 'days'}
                      </span>
                    )}
                  </span>
                ) : (
                  <span>Pick a start and end date</span>
                )}
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetDraft}
                  className="h-7 px-2 text-[11px]"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                  className="h-7 px-2.5 text-[11px]"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!draftRange?.from}
                  onClick={handleApply}
                  className="h-7 px-3 text-[11px]"
                >
                  <Check className="h-3 w-3" />
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
