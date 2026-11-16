import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SortDirection } from '@/components/ui/table';

export interface SortConfig {
  key: string;
  dir: SortDirection;
}

export function useSortableData<T>(
  items: readonly T[],
  initialSort: SortConfig | null = null,
  accessor?: (item: T, key: string) => string | number | boolean | null | undefined
) {
  const [sortConfig, setSortConfig] = React.useState<SortConfig | null>(initialSort);

  const requestSort = React.useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev && prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  }, []);

  const sortedItems = React.useMemo(() => {
    if (!sortConfig) return [...items];
    const { key, dir } = sortConfig;
    const factor = dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const rawA = accessor ? accessor(a, key) : (a as Record<string, unknown>)[key];
      const rawB = accessor ? accessor(b, key) : (b as Record<string, unknown>)[key];

      if (rawA === rawB) return 0;
      if (rawA === null || rawA === undefined || rawA === '') return 1;
      if (rawB === null || rawB === undefined || rawB === '') return -1;

      if (typeof rawA === 'number' && typeof rawB === 'number') {
        return (rawA - rawB) * factor;
      }
      if (typeof rawA === 'boolean' && typeof rawB === 'boolean') {
        return (Number(rawA) - Number(rawB)) * factor;
      }

      const strA = String(rawA).trim();
      const strB = String(rawB).trim();
      const numA = Number(strA);
      const numB = Number(strB);
      if (strA !== '' && strB !== '' && !Number.isNaN(numA) && !Number.isNaN(numB)) {
        return (numA - numB) * factor;
      }

      return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' }) * factor;
    });
  }, [items, sortConfig, accessor]);

  return {
    sortConfig,
    setSortConfig,
    requestSort,
    sortedItems,
  };
}

export function usePagination<T>(items: readonly T[], initialPageSize = 8) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  React.useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pagedItems = React.useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  const updatePageSize = React.useCallback((nextSize: number) => {
    setPageSize(nextSize);
    setPage(1);
  }, []);

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize: updatePageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    pagedItems,
  };
}

interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  className?: string;
  testIdPrefix?: string;
}

export function DataTablePagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 8, 10, 25],
  itemLabel = 'rows',
  className,
  testIdPrefix = 'table-pagination',
}: DataTablePaginationProps) {
  const rowsLabelId = React.useId();
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  const normalizedPageSizeOptions = React.useMemo(
    () => Array.from(new Set([...pageSizeOptions, pageSize])).sort((a, b) => a - b),
    [pageSizeOptions, pageSize]
  );

  const visiblePages = React.useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, idx) => idx + 1);
    }
    const pages = new Set<number>([1, totalPages, page]);
    if (page > 1) pages.add(page - 1);
    if (page < totalPages) pages.add(page + 1);
    return Array.from(pages).sort((a, b) => a - b);
  }, [page, totalPages]);

  return (
    <div
      data-testid={testIdPrefix}
      className={cn(
        'mt-2.5 flex flex-wrap items-center justify-between gap-2.5 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/45 px-3 py-2 text-[11px] text-ink-muted',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Showing <strong className="font-semibold text-ink tabular-nums">{from}–{to}</strong> of{' '}
          <strong className="font-semibold text-ink tabular-nums">{totalItems}</strong> {itemLabel}
        </span>
        {onPageSizeChange && (
          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span id={rowsLabelId} className="select-none">
              Rows:
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger
                aria-label="Rows per page"
                aria-labelledby={rowsLabelId}
                data-testid={`${testIdPrefix}-size`}
                className="h-7 min-h-[28px] w-auto min-w-[60px] gap-1.5 rounded-[var(--theme-radius-control)] border-border-theme bg-surface px-2.5 py-0 text-[11px] font-semibold text-ink tabular-nums shadow-2xs hover:bg-surface-muted/40 focus:ring-1 focus:ring-accent focus:border-accent [&>svg]:h-3.5 [&>svg]:w-3.5"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                className="min-w-[82px] data-[side=top]:-translate-y-1.5"
              >
                {normalizedPageSizeOptions.map((opt) => (
                  <SelectItem
                    key={opt}
                    value={String(opt)}
                    data-testid={`${testIdPrefix}-size-option-${opt}`}
                    className="min-h-[30px] py-1 pl-7 pr-2.5 text-[11px] font-semibold tabular-nums"
                  >
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="First page"
          data-testid={`${testIdPrefix}-first`}
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Previous page"
          data-testid={`${testIdPrefix}-prev`}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <div className="flex items-center gap-1 px-0.5">
          {visiblePages.map((p, idx) => {
            const prevPage = idx > 0 ? visiblePages[idx - 1] : null;
            const showEllipsis = prevPage !== null && p - prevPage > 1;
            const active = p === page;
            return (
              <React.Fragment key={p}>
                {showEllipsis && (
                  <span className="px-1 text-[10.5px] text-ink-muted select-none">...</span>
                )}
                <Button
                  type="button"
                  variant={active ? 'lavender' : 'outline'}
                  size="icon-xs"
                  aria-label={`Page ${p}`}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`${testIdPrefix}-page-${p}`}
                  onClick={() => onPageChange(p)}
                  className={cn('text-[11px] font-bold tabular-nums', !active && 'text-ink-muted')}
                >
                  {p}
                </Button>
              </React.Fragment>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Next page"
          data-testid={`${testIdPrefix}-next`}
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Last page"
          data-testid={`${testIdPrefix}-last`}
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

