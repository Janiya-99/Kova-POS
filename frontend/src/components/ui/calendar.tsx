import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-1.5 select-none', className)}
      classNames={{
        months: 'relative flex flex-col sm:flex-row gap-5',
        month: 'space-y-2.5',
        month_caption: 'flex justify-center h-8 relative items-center text-[13px] font-bold text-ink px-8',
        caption_label: 'text-[13px] font-bold text-ink tracking-tight',
        nav: 'flex items-center justify-between absolute inset-x-0 top-0 h-8 z-10 pointer-events-none',
        button_previous:
          'pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-theme/70 bg-surface hover:bg-accent-soft/50 text-ink transition cursor-pointer disabled:opacity-35 disabled:pointer-events-none',
        button_next:
          'pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-theme/70 bg-surface hover:bg-accent-soft/50 text-ink transition cursor-pointer disabled:opacity-35 disabled:pointer-events-none',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-[11px] font-semibold text-ink-muted text-center py-1',
        week: 'flex w-full mt-1',
        day: 'h-9 w-9 text-center text-xs p-0 relative',
        day_button:
          'inline-flex h-9 w-9 items-center justify-center rounded-full font-medium text-ink hover:bg-accent-soft/55 transition cursor-pointer tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        selected:
          '[&>button]:bg-accent [&>button]:text-accent-fg [&>button]:font-bold [&>button]:hover:bg-accent [&>button]:shadow-xs',
        range_start:
          'rounded-l-full bg-accent-soft/45 [&>button]:bg-accent [&>button]:text-accent-fg [&>button]:font-bold [&>button]:rounded-full',
        range_end:
          'rounded-r-full bg-accent-soft/45 [&>button]:bg-accent [&>button]:text-accent-fg [&>button]:font-bold [&>button]:rounded-full',
        range_middle:
          'rounded-none bg-accent-soft/45 [&>button]:!bg-transparent [&>button]:!text-ink [&>button]:!font-medium [&>button]:!shadow-none [&>button]:rounded-none [&>button]:hover:!bg-accent-soft/75',
        today:
          '[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-accent [&>button]:font-semibold',
        outside: 'opacity-40',
        disabled: 'opacity-35 pointer-events-none',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
