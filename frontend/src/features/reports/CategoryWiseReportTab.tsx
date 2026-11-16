import * as React from 'react';
import { Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  GlowingDotMatrixChart,
  GlowingRadialGauge,
  SegmentedCapsuleBar,
} from '@/components/charts/ModernCharts';
import { ScrollReveal } from '@/components/dqnamo/ScrollReveal';
import { formatDisplayLabel } from '@/lib/formatLabel';
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
import {
  getIndustryCategorySegments,
  resolveCategorySegmentDisplay,
  resolveEffectiveIndustryProfile,
} from '@/lib/branchAccess';
import { useAuthStore } from '@/store/authStore';
import { getThemeDefinition, useThemeStore } from '@/store/themeStore';
import { FilterPillGroup, ReportEmptyState, ReportTableShell } from './ReportSurfaceCard';
import { toReportNumber, type CategoryReportRow } from './types';

interface CategoryWiseReportTabProps {
  rows: CategoryReportRow[];
  search: string;
  onResetSearch?: () => void;
}

export function CategoryWiseReportTab({ rows, search, onResetSearch }: CategoryWiseReportTabProps) {
  const { formatMoney } = useCurrency();
  const { context, resolvedSettings, businesses } = useAuthStore();
  const industryProfile = resolveEffectiveIndustryProfile(context, resolvedSettings, businesses);
  const segmentConfig = React.useMemo(
    () => getIndustryCategorySegments(industryProfile),
    [industryProfile]
  );

  const { themeId, customAccent, colorMode } = useThemeStore();
  const theme = getThemeDefinition(themeId);
  const accentHex = customAccent || theme.tokens['--theme-accent'];
  const softHex = theme.tokens['--theme-accent-soft'];
  const contrastHex = colorMode === 'dark' ? '#E2E8F0' : theme.tokens['--theme-contrast-card'];
  const palette = [accentHex, '#22C55E', contrastHex, softHex, '#F59E0B'];

  const [segmentFilter, setSegmentFilter] = React.useState<string>('ALL');
  const [hoveredSegment, setHoveredSegment] = React.useState<string | null>(null);

  const normalizedRows = React.useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        gender_segment: resolveCategorySegmentDisplay(r.gender_segment, r.slug, industryProfile),
      })),
    [rows, industryProfile]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return normalizedRows.filter((r) => {
      if (segmentFilter !== 'ALL' && r.gender_segment !== segmentFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        r.gender_segment.toLowerCase().includes(q)
      );
    });
  }, [normalizedRows, search, segmentFilter]);

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
        key === 'stock_on_hand' ||
        key === 'stock_valuation'
      ) {
        return toReportNumber(r[key]);
      }
      if (key === 'sku_count' || key === 'invoice_count') return r[key];
      return (r as unknown as Record<string, string>)[key] || r.name;
    }
  );

  const pagination = usePagination(sortedItems, 8);

  const chartData = React.useMemo(
    () =>
      [...filtered].map((r, idx) => ({
        name: r.name,
        revenue: toReportNumber(r.net_revenue),
        profit: toReportNumber(r.gross_profit),
        cogs: toReportNumber(r.total_cogs),
        share: toReportNumber(r.revenue_share_pct),
        color: palette[idx % palette.length],
      })),
    [filtered, palette]
  );

  const segmentBreakdown = React.useMemo(() => {
    const acc: Record<string, { revenue: number; profit: number; units: number }> = {};
    for (const opt of segmentConfig.options) {
      acc[opt.value] = { revenue: 0, profit: 0, units: 0 };
    }
    let grand = 0;
    normalizedRows.forEach((r) => {
      const rev = toReportNumber(r.net_revenue);
      const seg = r.gender_segment || segmentConfig.defaultSegment;
      if (!acc[seg]) acc[seg] = { revenue: 0, profit: 0, units: 0 };
      acc[seg].revenue += rev;
      acc[seg].profit += toReportNumber(r.gross_profit);
      acc[seg].units += toReportNumber(r.units_sold);
      grand += rev;
    });
    return Object.entries(acc).map(([seg, stats], idx) => ({
      segment: seg,
      ...stats,
      share: grand > 0 ? ((stats.revenue / grand) * 100).toFixed(1) : '0.0',
      color: palette[idx % palette.length],
    }));
  }, [normalizedRows, segmentConfig, palette]);

  return (
    <div className="space-y-4">
      {/* Symmetrical Visual Analysis Row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <ScrollReveal delayMs={0} className="xl:col-span-7 min-w-0">
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/35 p-4 h-full flex flex-col justify-between gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-[13px] font-bold text-ink">Category Revenue vs Gross Profit</h4>
                <p className="text-[11px] text-ink-muted">Net revenue and FIFO profit spread across catalog categories</p>
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

            {chartData.length > 0 ? (
              <GlowingDotMatrixChart
                data={chartData.map((r) => ({
                  label: r.name,
                  primaryValue: r.revenue,
                  secondaryValue: r.profit,
                  primaryFormatted: formatMoney(r.revenue),
                  secondaryFormatted: formatMoney(r.profit),
                }))}
                rows={7}
                primaryLabel="Revenue"
                secondaryLabel="Profit"
                primaryColor={accentHex}
                secondaryColor="#22C55E"
                heightClass="h-[225px]"
              />
            ) : (
              <div className="flex h-[225px] items-center justify-center text-xs text-ink-muted">
                No categories match this filter.
              </div>
            )}
          </div>
        </ScrollReveal>

        <ScrollReveal delayMs={80} className="xl:col-span-5 min-w-0">
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/35 p-4 h-full flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-[13px] font-bold text-ink flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-accent" />
                  {segmentConfig.segmentLabel} Mix
                </h4>
                <p className="text-[11px] text-ink-muted">
                  Revenue &amp; unit contribution by {segmentConfig.segmentLabel.toLowerCase()}
                </p>
              </div>
            </div>

            {(() => {
              const activeSegment = segmentBreakdown.find((s) => s.segment === hoveredSegment) || null;
              const nonZeroSegs = segmentBreakdown.filter((s) => s.revenue > 0);
              return (
                <>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <GlowingRadialGauge
                      segments={nonZeroSegs.map((s) => ({
                        id: s.segment,
                        label: formatDisplayLabel(s.segment),
                        value: s.revenue,
                        color: s.color,
                      }))}
                      centerEyebrow={activeSegment ? formatDisplayLabel(activeSegment.segment) : 'Segments'}
                      centerValue={
                        activeSegment
                          ? `${activeSegment.share}%`
                          : String(nonZeroSegs.length || segmentBreakdown.length)
                      }
                      activeId={hoveredSegment}
                      onHoverId={setHoveredSegment}
                      size={134}
                      strokeWidth={11}
                    />

                    <div className="w-full space-y-2">
                      {segmentBreakdown.map((seg) => {
                        const isActive = hoveredSegment === seg.segment;
                        return (
                          <div
                            key={seg.segment}
                            onMouseEnter={() => setHoveredSegment(seg.segment)}
                            onMouseLeave={() => setHoveredSegment(null)}
                            className={`rounded-[var(--theme-radius-control)] px-3 py-2 border transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-accent-soft/45 border-accent/40'
                                : 'bg-surface border-border-theme/70 hover:bg-surface-muted/70'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor: seg.color,
                                    boxShadow: isActive ? `0 0 8px ${seg.color}` : undefined,
                                  }}
                                />
                                {formatDisplayLabel(seg.segment)}
                              </span>
                              <span className="font-bold text-ink tabular-nums">{formatMoney(seg.revenue)}</span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between text-[10.5px] text-ink-muted tabular-nums">
                              <span>{seg.units} units • Profit {formatMoney(seg.profit)}</span>
                              <span className="font-semibold text-ink">{seg.share}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <SegmentedCapsuleBar
                    segments={nonZeroSegs.map((s) => ({
                      id: s.segment,
                      label: formatDisplayLabel(s.segment),
                      pct: Number.parseFloat(s.share) || 0,
                      color: s.color,
                    }))}
                    activeId={hoveredSegment}
                    onHoverId={setHoveredSegment}
                  />
                </>
              );
            })()}
          </div>
        </ScrollReveal>
      </div>

      {/* Connected Category-Wise Table Surface */}
      <ReportTableShell
        toolbarLeft={
          <FilterPillGroup
            value={segmentFilter}
            onChange={setSegmentFilter}
            options={[
              { id: 'ALL', label: segmentConfig.allFilterLabel },
              ...segmentConfig.options.map((opt) => ({
                id: opt.value,
                label: opt.label,
              })),
            ]}
          />
        }
        summaryText={`${filtered.length} categor${filtered.length === 1 ? 'y' : 'ies'}`}
        footer={
          <DataTablePagination
            className="mt-0 rounded-none border-0 bg-transparent px-0 py-0"
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel="categories"
            testIdPrefix="reports-categories-pagination"
          />
        }
      >
        {pagination.pagedItems.length > 0 ? (
          <Table containerClassName="rounded-none border-0 shadow-none bg-transparent">
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort}>
                  Category
                </SortableTableHead>
                <SortableTableHead sortKey="gender_segment" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort}>
                  Segment
                </SortableTableHead>
                <SortableTableHead sortKey="sku_count" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  SKUs
                </SortableTableHead>
                <SortableTableHead sortKey="invoice_count" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Orders
                </SortableTableHead>
                <SortableTableHead sortKey="units_sold" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Units
                </SortableTableHead>
                <SortableTableHead sortKey="gross_sales" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Gross Sales
                </SortableTableHead>
                <SortableTableHead sortKey="net_revenue" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Net Revenue
                </SortableTableHead>
                <SortableTableHead sortKey="total_cogs" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  COGS
                </SortableTableHead>
                <SortableTableHead sortKey="gross_profit" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Gross Profit
                </SortableTableHead>
                <SortableTableHead sortKey="margin_pct" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Margin
                </SortableTableHead>
                <SortableTableHead sortKey="revenue_share_pct" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  Share
                </SortableTableHead>
                <SortableTableHead sortKey="stock_valuation" activeSortKey={sortConfig?.key} sortDir={sortConfig?.dir} onSort={requestSort} align="right">
                  FIFO Stock Asset
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pagedItems.map((r) => {
                const profit = toReportNumber(r.gross_profit);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-semibold text-ink">{r.name}</div>
                      <div className="text-[10.5px] text-ink-muted">/{r.slug}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          segmentConfig.options.find((o) => o.value === r.gender_segment)
                            ?.badgeVariant || 'outline'
                        }
                      >
                        {formatDisplayLabel(r.gender_segment)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.sku_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.invoice_count}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{r.units_sold}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink-muted">{formatMoney(r.gross_sales)}</TableCell>
                    <TableCell className="text-right font-bold text-ink tabular-nums">{formatMoney(r.net_revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink-muted">{formatMoney(r.total_cogs)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${profit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                      {formatMoney(r.gross_profit)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{r.margin_pct}%</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge variant="outline">{r.revenue_share_pct}%</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="font-semibold text-ink">{formatMoney(r.stock_valuation)}</div>
                      <div className="text-[10.5px] text-ink-muted">{r.stock_on_hand} units on hand</div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <ReportEmptyState
            icon={<Layers className="h-5 w-5" />}
            title="No categories match your filter"
            description="Reset the merchandising segment or clear search terms to restore all catalog categories."
            actionLabel={segmentFilter !== 'ALL' || search.trim() ? 'Reset Segment Filter' : undefined}
            onAction={() => {
              setSegmentFilter('ALL');
              onResetSearch?.();
            }}
          />
        )}
      </ReportTableShell>
    </div>
  );
}

