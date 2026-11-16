import * as React from 'react';
import { Crown, Repeat, UserCheck, Users, Wallet } from 'lucide-react';
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
import { toReportNumber, type CustomerReportRow } from './types';

interface CustomerWiseReportTabProps {
  rows: CustomerReportRow[];
  search: string;
  onResetSearch?: () => void;
}

type CustomerFilterMode = 'ALL' | 'BUYERS' | 'HIGH_VALUE' | 'REPEAT' | 'DORMANT' | 'CREDIT';

export function CustomerWiseReportTab({ rows, search, onResetSearch }: CustomerWiseReportTabProps) {
  const { formatMoney } = useCurrency();
  const { themeId, customAccent } = useThemeStore();
  const theme = getThemeDefinition(themeId);
  const accentHex = customAccent || theme.tokens['--theme-accent'];

  const [filterMode, setFilterMode] = React.useState<CustomerFilterMode>('ALL');

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterMode === 'BUYERS' && r.paid_orders <= 0) return false;
      if (filterMode === 'HIGH_VALUE' && r.customer_segment !== 'High Value') return false;
      if (filterMode === 'REPEAT' && r.paid_orders < 2) return false;
      if (filterMode === 'DORMANT' && r.paid_orders > 0) return false;
      if (filterMode === 'CREDIT' && !r.credit_enabled) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        r.tier.toLowerCase().includes(q) ||
        r.customer_segment.toLowerCase().includes(q)
      );
    });
  }, [rows, search, filterMode]);

  const { sortedItems, sortConfig, requestSort } = useSortableData(
    filtered,
    { key: 'total_spent', dir: 'desc' },
    (r, key) => {
      if (
        key === 'items_bought' ||
        key === 'discount_total' ||
        key === 'tax_total' ||
        key === 'total_spent' ||
        key === 'avg_order_value' ||
        key === 'spend_share_pct'
      ) {
        return toReportNumber(r[key]);
      }
      if (key === 'paid_orders' || key === 'loyalty_points') return r[key];
      return (r as unknown as Record<string, string>)[key] || r.name;
    }
  );

  const pagination = usePagination(sortedItems, 10);

  const summary = React.useMemo(() => {
    const registered = rows.filter((r) => !r.is_walk_in);
    const activeBuyers = rows.filter((r) => r.paid_orders > 0).length;
    const totalSpend = rows.reduce((s, r) => s + toReportNumber(r.total_spent), 0);
    const walkInSpend = rows
      .filter((r) => r.is_walk_in)
      .reduce((s, r) => s + toReportNumber(r.total_spent), 0);
    const walkInPct = totalSpend > 0 ? ((walkInSpend / totalSpend) * 100).toFixed(1) : '0.0';
    const avgCustomerSpend = activeBuyers > 0 ? totalSpend / activeBuyers : 0;
    return {
      registeredCount: registered.length,
      activeBuyers,
      walkInPct,
      avgCustomerSpend,
    };
  }, [rows]);

  const topChart = React.useMemo(
    () =>
      [...filtered]
        .filter((r) => toReportNumber(r.total_spent) > 0)
        .slice(0, 6)
        .map((r) => ({
          name: r.is_walk_in ? 'Walk-in' : r.name.split(' ')[0] || r.name,
          fullName: r.name,
          spent: toReportNumber(r.total_spent),
          profit: toReportNumber(r.gross_profit),
          orders: r.paid_orders,
        })),
    [filtered]
  );

  return (
    <div className="space-y-4">
      {/* Mini KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">Registered Accounts</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-bold text-ink tabular-nums">{summary.registeredCount}</span>
            <Users className="h-3.5 w-3.5 text-accent" />
          </div>
        </div>
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">Active Buying Entities</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-bold text-ink tabular-nums">{summary.activeBuyers}</span>
            <UserCheck className="h-3.5 w-3.5 text-[#22C55E]" />
          </div>
        </div>
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">Walk-in Revenue Share</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-bold text-ink tabular-nums">{summary.walkInPct}%</span>
            <Wallet className="h-3.5 w-3.5 text-ink-muted" />
          </div>
        </div>
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">Avg Spend per Buyer</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-bold text-ink tabular-nums">
              {formatMoney(summary.avgCustomerSpend)}
            </span>
            <Crown className="h-3.5 w-3.5 text-accent" />
          </div>
        </div>
      </div>

      {/* Top Customer Spend Glowing Dot-Matrix */}
      {topChart.length > 0 && (
        <ScrollReveal delayMs={40}>
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/35 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-[13px] font-bold text-ink">Top Customer Contribution (Spend vs Gross Profit)</h4>
                <p className="text-[11px] text-ink-muted">Includes registered loyalty accounts and walk-in checkout cohort</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentHex }} />
                  Total Spend
                </span>
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
                  Profit Contributed
                </span>
              </div>
            </div>
            <GlowingDotMatrixChart
              data={topChart.map((row) => ({
                label: row.name,
                primaryValue: row.spent,
                secondaryValue: row.profit,
                primaryFormatted: formatMoney(row.spent),
                secondaryFormatted: `${formatMoney(row.profit)} (${row.orders} ord)`,
              }))}
              rows={7}
              primaryLabel="Spend"
              secondaryLabel="Profit"
              primaryColor={accentHex}
              secondaryColor="#22C55E"
              heightClass="h-[210px]"
            />
          </div>
        </ScrollReveal>
      )}

      {/* Connected Customer-Wise Table Surface */}
      <ReportTableShell
        toolbarLeft={
          <FilterPillGroup
            value={filterMode}
            onChange={setFilterMode}
            options={[
              { id: 'ALL', label: 'All Customers' },
              { id: 'BUYERS', label: 'Active Buyers' },
              { id: 'HIGH_VALUE', label: 'High Value' },
              { id: 'REPEAT', label: 'Repeat Buyers (2+)' },
              { id: 'DORMANT', label: 'Zero Spend' },
              { id: 'CREDIT', label: 'Credit Enabled' },
            ]}
          />
        }
        summaryText={`${filtered.length} record${filtered.length === 1 ? '' : 's'}`}
        footer={
          <DataTablePagination
            className="mt-0 rounded-none border-0 bg-transparent px-0 py-0"
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel="customers"
            testIdPrefix="reports-customers-pagination"
          />
        }
      >
        {pagination.pagedItems.length > 0 ? (
          <Table containerClassName="rounded-none border-0 shadow-none bg-transparent">
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort}>
                  Customer
                </SortableTableHead>
                <SortableTableHead sortKey="customer_segment" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort}>
                  Segment &amp; Tier
                </SortableTableHead>
                <SortableTableHead sortKey="loyalty_points" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Loyalty Pts
                </SortableTableHead>
                <SortableTableHead sortKey="paid_orders" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Orders
                </SortableTableHead>
                <SortableTableHead sortKey="items_bought" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Items
                </SortableTableHead>
                <SortableTableHead sortKey="avg_order_value" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Avg Order (AOV)
                </SortableTableHead>
                <SortableTableHead sortKey="discount_total" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Discounts
                </SortableTableHead>
                <SortableTableHead sortKey="tax_total" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Tax
                </SortableTableHead>
                <SortableTableHead sortKey="total_spent" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Total Spend
                </SortableTableHead>
                <SortableTableHead sortKey="spend_share_pct" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Share
                </SortableTableHead>
                <SortableTableHead sortKey="last_purchase_at" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort}>
                  Last Activity
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pagedItems.map((c) => (
                <TableRow key={`${c.id}-${c.name}`}>
                  <TableCell>
                    <div className="flex items-center gap-2.5 min-w-[175px]">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft/60 text-xs font-bold text-accent-soft-fg">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{c.name}</div>
                        <div className="truncate text-[10.5px] text-ink-muted">
                          {c.phone || c.email || (c.is_walk_in ? 'POS Counter Traffic' : 'No contact on file')}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge
                        variant={
                          c.customer_segment === 'High Value'
                            ? 'lavender'
                            : c.customer_segment === 'Repeat'
                            ? 'positive'
                            : 'outline'
                        }
                      >
                        {c.customer_segment === 'High Value' && <Crown className="mr-1 h-3 w-3" />}
                        {c.customer_segment === 'Repeat' && <Repeat className="mr-1 h-3 w-3" />}
                        {c.customer_segment}
                      </Badge>
                      <Badge variant="outline">{c.tier}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {c.is_walk_in ? '—' : c.loyalty_points.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {c.paid_orders}
                    {c.refund_void_count > 0 && (
                      <span className="ml-1 text-[10px] text-[#EF4444]">({c.refund_void_count} void/ret)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.items_bought}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(c.avg_order_value)}</TableCell>
                  <TableCell className="text-right tabular-nums text-ink-muted">{formatMoney(c.discount_total)}</TableCell>
                  <TableCell className="text-right tabular-nums text-ink-muted">{formatMoney(c.tax_total)}</TableCell>
                  <TableCell className="text-right font-bold text-ink tabular-nums">{formatMoney(c.total_spent)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge variant="outline">{c.spend_share_pct}%</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-ink-muted tabular-nums whitespace-nowrap">
                    {c.last_purchase_at ? c.last_purchase_at.slice(0, 10) : 'No orders'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <ReportEmptyState
            icon={<Users className="h-5 w-5" />}
            title="No customer accounts match this filter"
            description="Switch buyer segment pills or clear your search query to inspect loyalty and walk-in cohorts."
            actionLabel={filterMode !== 'ALL' || search.trim() ? 'Reset Customer Filters' : undefined}
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

