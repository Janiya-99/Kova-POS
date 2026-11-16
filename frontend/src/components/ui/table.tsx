import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  containerClassName?: string;
}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, ...props }, ref) => (
    <div
      className={cn(
        'relative w-full overflow-x-auto pos-clean-scroll rounded-[var(--theme-radius-inner)] border border-border-theme bg-[var(--theme-surface-glass,var(--theme-surface))] backdrop-blur-md shadow-[var(--theme-shadow)]',
        containerClassName
      )}
    >
      <table
        ref={ref}
        className={cn('w-full caption-bottom border-collapse text-[12px]', className)}
        {...props}
      />
    </div>
  )
);
Table.displayName = 'Table';

export interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  sticky?: boolean;
}

export const TableHeader = React.forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ className, sticky = true, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        'bg-surface-muted/95 backdrop-blur-md [&_tr]:border-b [&_tr]:border-border-theme',
        sticky && 'sticky top-0 z-10 shadow-[0_1px_0_0_var(--theme-border)]',
        className
      )}
      {...props}
    />
  )
);
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0 divide-y divide-border-theme/60', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-border-theme/60 even:bg-surface-muted/20 transition-colors hover:bg-accent-soft/25 data-[state=selected]:bg-accent-soft/35',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-10 px-3.5 text-left align-middle text-[10.5px] font-bold uppercase tracking-wider text-ink-muted whitespace-nowrap [&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

export interface SortableTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: string;
  activeSortKey?: string | null;
  sortDir?: SortDirection;
  onSort: (key: string) => void;
  align?: 'left' | 'right' | 'center';
}

export function SortableTableHead({
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  align = 'left',
  className,
  children,
  ...props
}: SortableTableHeadProps) {
  const isActive = activeSortKey === sortKey;
  return (
    <th
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(
        'h-10 px-3.5 align-middle text-[10.5px] font-bold uppercase tracking-wider whitespace-nowrap select-none',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className
      )}
      {...props}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 rounded-[var(--theme-radius-badge)] px-1 py-0.5 -mx-1 transition-colors cursor-pointer hover:bg-accent-soft/45 hover:text-ink',
          isActive ? 'text-accent font-extrabold' : 'text-ink-muted',
          align === 'right' && 'flex-row-reverse'
        )}
      >
        <span>{children}</span>
        {isActive ? (
          sortDir === 'asc' ? (
            <ArrowUp className="h-3 w-3 shrink-0 text-accent" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0 text-accent" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-45" />
        )}
      </button>
    </th>
  );
}

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-3.5 py-2.5 align-middle text-[12px] text-ink [&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
));
TableCell.displayName = 'TableCell';
