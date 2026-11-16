import * as React from 'react';
import { AlertTriangle, CheckCircle2, Package, TrendingUp, XCircle } from 'lucide-react';
import { GlowingDotMatrixChart } from '@/components/charts/ModernCharts';
import { ScrollReveal } from '@/components/dqnamo/ScrollReveal';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  SortableTableHead,
} from '@/components/ui/table';
import {
  DataTablePagination,
  usePagination,
  useSortableData,
} from '@/components/ui/data-table-pagination';
import { useCurrency } from '@/hooks/useCurrency';
import { getThemeDefinition, useThemeStore } from '@/store/themeStore';
import { FilterPillGroup, ReportEmptyState, ReportTableShell } from './ReportSurfaceCard';
import { toReportNumber, type ProductReportRow } from './types';

interface ProductWiseReportTabProps {
  rows: ProductReportRow[];
  search: string;
  onResetSearch?: () => void;
}

type ProductFilterMode = 'ALL' | 'SOLD' | 'NO_SALES' | 'LOW_STOCK' | 'HIGH_MARGIN';

export function ProductWiseReportTab({ rows, search, onResetSearch }: ProductWiseReportTabProps) {
  const { formatMoney } = useCurrency();
  const { themeId, customAccent } = useThemeStore();
  const theme = getThemeDefinition(themeId);
  const accentHex = customAccent || theme.tokens['--theme-accent'];

  const [filterMode, setFilterMode] = React.useState<ProductFilterMode>('ALL');

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const units = toReportNumber(r.units_sold);
      const margin = toReportNumber(r.margin_pct);
      if (filterMode === 'SOLD' && units <= 0) return false;
      if (filterMode === 'NO_SALES' && units > 0) return false;
      if (filterMode === 'LOW_STOCK' && r.stock_status === 'HEALTHY') return false;
      if (filterMode === 'HIGH_MARGIN' && (units <= 0 || margin < 40)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.category_name.toLowerCase().includes(q)
      );
    });
  }, [rows, search, filterMode]);

  const { sortedItems, sortConfig, requestSort } = useSortableData(
    filtered,
    { key: 'net_revenue', dir: 'desc' },
    (r, key) => {
      if (
        key === 'units_sold' ||
        key === 'gross_sales' ||
        key === 'discount_amount' ||
        key === 'tax_amount' ||
        key === 'net_revenue' ||
        key === 'total_cogs' ||
        key === 'gross_profit' ||
        key === 'margin_pct' ||
        key === 'revenue_share_pct' ||
        key === 'stock_on_hand'
      ) {
        return toReportNumber(r[key]);
      }
      if (key === 'invoice_count') return r.invoice_count;
      return (r as unknown as Record<string, string>)[key] || r.name;
    }
  );

  const pagination = usePagination(sortedItems, 10);

  const summary = React.useMemo(() => {
    let totalUnits = 0;
    let totalRev = 0;
    let totalProfit = 0;
    let soldSkus = 0;
    rows.forEach((r) => {
      const u = toReportNumber(r.units_sold);
      if (u > 0) soldSkus++;
      totalUnits += u;
      totalRev += toReportNumber(r.net_revenue);
      totalProfit += toReportNumber(r.gross_profit);
    });
    const blendedMargin = totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(1) : '0.0';
    return { totalUnits, totalRev, totalProfit, soldSkus, blendedMargin };
  }, [rows]);

  const topChartData = React.useMemo(
    () =>
      [...filtered]
        .sort((a, b) => toReportNumber(b.net_revenue) - toReportNumber(a.net_revenue))
        .slice(0, 8)
        .map((r) => ({
          sku: r.sku,
          name: r.name.length > 16 ? `${r.name.slice(0, 14)}…` : r.name,
          fullName: r.name,
          revenue: toReportNumber(r.net_revenue),
          profit: toReportNumber(r.gross_profit),
          units: toReportNumber(r.units_sold),
        })),
    [filtered]
  );

  return (
    <div className="space-y-4">
      {/* Mini Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">Catalog Coverage</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-bold text-ink tabular-nums">
              {summary.soldSkus} / {rows.length}
            </span>
            <span className="text-[10.5px] font-semibold text-accent">SKUs sold</span>
          </div>
        </div>
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">Total Units Moved</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-bold text-ink tabular-nums">
              {summary.totalUnits.toLocaleString()}
            </span>
            <Package className="h-3.5 w-3.5 text-ink-muted" />
          </div>
        </div>
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">Product Sales Revenue</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-bold text-ink tabular-nums">
              {formatMoney(summary.totalRev)}
            </span>
            <TrendingUp className="h-3.5 w-3.5 text-accent" />
          </div>
        </div>
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">Product Gross Profit</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-bold text-ink tabular-nums">
              {formatMoney(summary.totalProfit)}
            </span>
            <span className="text-[10.5px] font-semibold text-[#22C55E] tabular-nums">
              {summary.blendedMargin}% margin
            </span>
          </div>
        </div>
      </div>

      {/* Discrete Product Comparison Glowing Dot-Matrix */}
      {topChartData.length > 0 && (
        <ScrollReveal delayMs={40}>
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/35 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-[13px] font-bold text-ink">Top Products — Net Revenue vs Gross Profit</h4>
                <p className="text-[11px] text-ink-muted">Top 8 matching SKUs ordered by net revenue contribution</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentHex }} />
                  Net Revenue
                </span>
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
                  Gross Profit
                </span>
              </div>
            </div>
            <GlowingDotMatrixChart
              data={topChartData.map((item) => ({
                label: item.name,
                primaryValue: item.revenue,
                secondaryValue: item.profit,
                primaryFormatted: formatMoney(item.revenue),
                secondaryFormatted: `${formatMoney(item.profit)} (${item.units}u)`,
              }))}
              rows={7}
              primaryLabel="Revenue"
              secondaryLabel="Profit"
              primaryColor={accentHex}
              secondaryColor="#22C55E"
              heightClass="h-[220px]"
            />
          </div>
        </ScrollReveal>
      )}

      {/* Connected Product-Wise Table Surface */}
      <ReportTableShell
        toolbarLeft={
          <FilterPillGroup
            value={filterMode}
            onChange={setFilterMode}
            options={[
              { id: 'ALL', label: 'All Products' },
              { id: 'SOLD', label: 'Active Sellers' },
              { id: 'NO_SALES', label: 'Slow / Zero Sales' },
              { id: 'LOW_STOCK', label: 'Low / Out of Stock' },
              { id: 'HIGH_MARGIN', label: 'High Margin (>=40%)' },
            ]}
          />
        }
        summaryText={`${filtered.length} product${filtered.length === 1 ? '' : 's'}`}
        footer={
          <DataTablePagination
            className="mt-0 rounded-none border-0 bg-transparent px-0 py-0"
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel="products"
            testIdPrefix="reports-products-pagination"
          />
        }
      >
        {pagination.pagedItems.length > 0 ? (
          <Table containerClassName="rounded-none border-0 shadow-none bg-transparent">
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort}>
                  Product &amp; SKU
                </SortableTableHead>
                <SortableTableHead sortKey="category_name" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort}>
                  Category
                </SortableTableHead>
                <SortableTableHead sortKey="units_sold" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Units
                </SortableTableHead>
                <SortableTableHead sortKey="invoice_count" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Orders
                </SortableTableHead>
                <SortableTableHead sortKey="gross_sales" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Gross Sales
                </SortableTableHead>
                <SortableTableHead sortKey="discount_amount" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Discounts
                </SortableTableHead>
                <SortableTableHead sortKey="tax_amount" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Tax
                </SortableTableHead>
                <SortableTableHead sortKey="net_revenue" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Net Revenue
                </SortableTableHead>
                <SortableTableHead sortKey="total_cogs" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  COGS
                </SortableTableHead>
                <SortableTableHead sortKey="gross_profit" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Profit
                </SortableTableHead>
                <SortableTableHead sortKey="margin_pct" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Margin
                </SortableTableHead>
                <SortableTableHead sortKey="stock_on_hand" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Stock Health
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pagedItems.map((r) => {
                const profit = toReportNumber(r.gross_profit);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="min-w-[170px]">
                        <div className="font-semibold text-ink">{r.name}</div>
                        <div className="text-[11px] text-ink-muted tabular-nums">
                          {r.sku} • {r.revenue_share_pct}% share
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.category_name}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {r.units_sold} <span className="text-[10.5px] font-normal text-ink-muted">{r.unit_of_measure}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.invoice_count}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink-muted">{formatMoney(r.gross_sales)}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink-muted">{formatMoney(r.discount_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink-muted">{formatMoney(r.tax_amount)}</TableCell>
                    <TableCell className="text-right font-bold text-ink tabular-nums">{formatMoney(r.net_revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink-muted">{formatMoney(r.total_cogs)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${profit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                      {formatMoney(r.gross_profit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {r.margin_pct}%
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          r.stock_status === 'HEALTHY'
                            ? 'positive'
                            : 'negative'
                        }
                      >
                        {r.stock_status === 'OUT_OF_STOCK' ? (
                          <XCircle className="mr-1 h-3 w-3" />
                        ) : r.stock_status === 'LOW_STOCK' ? (
                          <AlertTriangle className="mr-1 h-3 w-3" />
                        ) : (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        )}
                        {r.stock_on_hand} {r.unit_of_measure}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <ReportEmptyState
            icon={<Package className="h-5 w-5" />}
            title="No matching product records"
            description="Adjust your product search query, segment filter, or selected reporting window to view SKU performance."
            actionLabel={filterMode !== 'ALL' || search.trim() ? 'Reset Product Filters' : undefined}
            onAction={() => {
              setFilterMode('ALL');
              onResetSearch?.();
            }}
          />
        )}
      </ReportTableShell>
    </div>
  );
}

