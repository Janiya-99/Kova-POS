import * as React from 'react';
import { Search, PackageCheck, LayoutGrid, List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  SortableTableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DataTablePagination,
  usePagination,
  useSortableData,
} from '@/components/ui/data-table-pagination';
import { useCurrency } from '@/hooks/useCurrency';
import { useT } from '@/store/i18nStore';
import type { ProductSalesItem } from '../types';

interface ProductSalesTableCardProps {
  products: ProductSalesItem[];
  showValuation?: boolean;
  defaultView?: 'table' | 'grid';
  periodLabel?: string;
}

export function ProductSalesTableCard({
  products,
  showValuation = false,
  defaultView = 'table',
  periodLabel = 'Period',
}: ProductSalesTableCardProps) {
  const { formatMoney } = useCurrency();
  const { t } = useT();
  const [query, setQuery] = React.useState('');
  const [stockFilter, setStockFilter] = React.useState<'ALL' | 'LOW'>('ALL');
  const [viewMode, setViewMode] = React.useState<'table' | 'grid'>(defaultView);

  React.useEffect(() => {
    setViewMode(defaultView);
  }, [defaultView]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const reorderThreshold = Number(p.reorder_point) > 0 ? Number(p.reorder_point) : 12;
      if (stockFilter === 'LOW' && Number(p.total_stock) > reorderThreshold) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category_name || '').toLowerCase().includes(q)
      );
    });
  }, [products, query, stockFilter]);

  const { sortedItems, sortConfig, requestSort } = useSortableData(filtered, {
    key: 'units_sold',
    dir: 'desc',
  });

  const pagination = usePagination(sortedItems, viewMode === 'grid' ? 6 : 5);

  return (
    <section className="zona-card p-6" data-testid="product-sales-card">
      <div className="mb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-ink">
            {t.overview.productSales}
          </h2>
          <Badge variant="lavender">{sortedItems.length} SKUs</Badge>
          <span className="text-[11px] text-ink-muted hidden sm:inline">
            • {periodLabel} velocity
          </span>

          <div className="inline-flex rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-0.5 text-[11px]">
            {(['ALL', 'LOW'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStockFilter(f)}
                className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                  stockFilter === f
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {f === 'ALL' ? 'All Stock' : 'Low Stock'}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`inline-flex items-center gap-1 rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
              aria-label="Visual card grid view"
            >
              <LayoutGrid className="h-3 w-3" />
              Gallery
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1 rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
              aria-label="Table view"
            >
              <List className="h-3 w-3" />
              Table
            </button>
          </div>
        </div>

        <div className="relative w-full lg:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter SKU, category or item..."
            className="h-10 min-h-[40px] pl-10"
          />
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div
          className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="overview-product-gallery"
        >
          {pagination.pagedItems.map((p) => {
            const disc = Number(p.discount_percent || 0);
            const reorderThreshold = Number(p.reorder_point) > 0 ? Number(p.reorder_point) : 12;
            const isLow = Number(p.total_stock) <= reorderThreshold;

            return (
              <article
                key={p.id}
                className="group flex flex-col justify-between rounded-[var(--theme-radius-inner)] border border-border-theme/80 bg-surface-muted/65 p-3.5 transition hover:border-accent/50"
              >
                <div className="relative h-36 w-full overflow-hidden rounded-[var(--theme-radius-control)] bg-sidebar/10">
                  <img
                    src={p.image_url || '/products/cardigan.svg'}
                    alt={p.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/45 to-transparent" />
                  {disc > 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-[#16A34A] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm tabular-nums">
                      -{disc}%
                    </span>
                  )}
                  <span
                    className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm backdrop-blur-sm tabular-nums ${
                      isLow
                        ? 'bg-[#EF4444]/90 text-white'
                        : 'bg-black/65 text-white'
                    }`}
                  >
                    {p.total_stock} left
                  </span>
                </div>

                <div className="mt-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted truncate">
                    {p.category_name || 'Catalog'} • {p.sku}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-bold text-ink">{p.name}</p>
                </div>

                <div className="mt-2.5 flex items-end justify-between border-t border-border-theme/60 pt-2.5 tabular-nums">
                  <div>
                    <p className="text-sm font-extrabold text-ink">{formatMoney(p.sale_price)}</p>
                    {disc > 0 && (
                      <p className="text-[10.5px] line-through text-ink-muted">
                        {formatMoney(p.base_price)}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="inline-flex items-center gap-1 text-xs font-bold text-accent">
                      <PackageCheck className="h-3.5 w-3.5" />
                      {p.units_sold} sold
                    </p>
                    <p className="text-[10.5px] font-medium text-ink-muted">
                      {formatMoney(p.revenue)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="name"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                  >
                    Product
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="sale_price"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                  >
                    Price
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="discount_percent"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                  >
                    Promo
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="total_stock"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                    align="right"
                  >
                    In Stock
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="units_sold"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                    align="right"
                  >
                    Sold
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="revenue"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                    align="right"
                  >
                    Revenue
                  </SortableTableHead>
                  {showValuation && (
                    <SortableTableHead
                      sortKey="fifo_valuation"
                      activeSortKey={sortConfig?.key}
                      sortDir={sortConfig?.dir}
                      onSort={requestSort}
                      align="right"
                    >
                      FIFO Cost
                    </SortableTableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pagedItems.map((p) => {
                  const disc = Number(p.discount_percent || 0);
                  const reorderThreshold =
                    Number(p.reorder_point) > 0 ? Number(p.reorder_point) : 12;

                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <img
                            src={p.image_url || '/products/cardigan.svg'}
                            alt={p.name}
                            className="h-11 w-11 rounded-[12px] bg-surface-muted object-cover p-1"
                          />
                          <div>
                            <p className="font-semibold text-ink">{p.name}</p>
                            <p className="text-[11px] font-medium text-ink-muted tabular-nums">
                              {p.sku}
                              {p.category_name ? ` • ${p.category_name}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-bold text-ink tabular-nums">
                        <div>{formatMoney(p.sale_price)}</div>
                        {disc > 0 && (
                          <div className="text-[10.5px] font-normal line-through text-ink-muted">
                            {formatMoney(p.base_price)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {disc > 0 ? (
                          <Badge variant="lavender" className="tabular-nums">
                            {disc}% off
                          </Badge>
                        ) : (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                            p.total_stock <= reorderThreshold
                              ? 'bg-[#EF4444]/15 text-[#EF4444]'
                              : 'bg-surface-muted text-ink'
                          }`}
                        >
                          {p.total_stock}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold text-accent tabular-nums">
                        {p.units_sold}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-ink tabular-nums">
                        {formatMoney(p.revenue)}
                      </TableCell>
                      {showValuation && (
                        <TableCell className="text-right text-xs font-medium text-ink-muted tabular-nums">
                          {p.fifo_valuation ? formatMoney(p.fifo_valuation) : '—'}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-1 gap-3 md:hidden">
            {pagination.pagedItems.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-[var(--theme-radius-inner)] bg-surface-muted p-3.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={p.image_url || '/products/cardigan.svg'}
                    alt={p.name}
                    className="h-12 w-12 shrink-0 rounded-[var(--theme-radius-control)] bg-surface object-cover p-1"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                    <p className="text-xs text-ink-muted tabular-nums">
                      {p.sku} • {p.total_stock} left
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-extrabold text-ink tabular-nums">
                    {formatMoney(p.sale_price)}
                  </p>
                  <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent tabular-nums">
                    <PackageCheck className="h-3 w-3" />
                    {p.units_sold} sold
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <DataTablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
        pageSizeOptions={viewMode === 'grid' ? [6, 9, 12] : [5, 8, 10, 20]}
        itemLabel="products"
        testIdPrefix="overview-products-pagination"
      />
    </section>
  );
}
