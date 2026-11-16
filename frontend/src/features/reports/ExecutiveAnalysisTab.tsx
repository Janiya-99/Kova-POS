import * as React from 'react';
import {
  ArrowRight,
  BarChart3,
  CreditCard,
  Layers,
  Package,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  GlowingAreaSparkline,
  GlowingRadialGauge,
  SegmentedCapsuleBar,
  type SparklinePoint,
} from '@/components/charts/ModernCharts';
import { ScrollReveal } from '@/components/dqnamo/ScrollReveal';
import { useCurrency } from '@/hooks/useCurrency';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { getThemeDefinition, useThemeStore } from '@/store/themeStore';
import { toReportNumber, type ReportsPayload } from './types';

interface ExecutiveAnalysisTabProps {
  data: ReportsPayload;
  onSelectTab: (tab: string) => void;
}

export function ExecutiveAnalysisTab({ data, onSelectTab }: ExecutiveAnalysisTabProps) {
  const { formatMoney } = useCurrency();
  const { themeId, customAccent, colorMode } = useThemeStore();
  const theme = getThemeDefinition(themeId);
  const accentHex = customAccent || theme.tokens['--theme-accent'];
  const softHex = theme.tokens['--theme-accent-soft'];
  const contrastHex = colorMode === 'dark' ? '#E2E8F0' : theme.tokens['--theme-contrast-card'];
  const palette = [accentHex, '#22C55E', contrastHex, softHex, '#F59E0B'];

  const [trendMetric, setTrendMetric] = React.useState<'revenue' | 'profit'>('revenue');
  const [hoveredSpark, setHoveredSpark] = React.useState<SparklinePoint | null>(null);
  const [hoveredCategory, setHoveredCategory] = React.useState<string | null>(null);

  const dailyChartData = (data?.daily_trend || []).map((d) => ({
    day: (d.day_date || '').slice(5),
    fullDate: d.day_date || '',
    revenue: toReportNumber(d.net_revenue),
    profit: toReportNumber(d.gross_profit),
    orders: d.invoice_count ?? 0,
  }));

  const categoryDonutData = (data?.category_report || [])
    .filter((c) => toReportNumber(c.net_revenue) > 0)
    .slice(0, 5)
    .map((c, idx) => ({
      name: c.name,
      value: toReportNumber(c.net_revenue),
      share: toReportNumber(c.revenue_share_pct),
      color: palette[idx % palette.length],
    }));

  const topProducts = (data?.product_report || []).slice(0, 5);
  const topCustomers = (data?.customer_report || []).slice(0, 5);
  const topPayments = (data?.payment_method_report || []).slice(0, 4);

  const sparkPoints: SparklinePoint[] = dailyChartData.map((d) => ({
    label: d.fullDate || d.day,
    value: trendMetric === 'revenue' ? d.revenue : d.profit,
    formattedValue: formatMoney(trendMetric === 'revenue' ? d.revenue : d.profit),
    secondaryText: `${d.orders} ord • ${
      trendMetric === 'revenue' ? `GP ${formatMoney(d.profit)}` : `Rev ${formatMoney(d.revenue)}`
    }`,
  }));
  const activeSpark = hoveredSpark || (sparkPoints.length > 0 ? sparkPoints[sparkPoints.length - 1] : null);
  const activeCategory = categoryDonutData.find((c) => c.name === hoveredCategory) || null;
  const totalCategoryVal = categoryDonutData.reduce((acc, c) => acc + c.value, 0);

  return (
    <div className="space-y-4">
      {/* Row 1: Symmetrical 12-Col Visual Analysis (Glowing Velocity Sparkline + Radial Category Gauge) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <ScrollReveal delayMs={0} className="xl:col-span-8 min-w-0">
          <div className="zona-card h-full flex flex-col justify-between p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-[14px] font-bold tracking-[-0.01em] text-ink flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-accent" />
                  Daily Revenue &amp; Gross Profit Trend
                </h3>
                <p className="text-[11px] text-ink-muted">
                  Continuous daily sales vs FIFO gross profit trajectory across selected period
                </p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTrendMetric('revenue')}
                  className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                    trendMetric === 'revenue'
                      ? 'bg-contrast text-contrast-fg shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Net Revenue
                </button>
                <button
                  type="button"
                  onClick={() => setTrendMetric('profit')}
                  className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                    trendMetric === 'profit'
                      ? 'bg-contrast text-contrast-fg shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Gross Profit
                </button>
              </div>
            </div>

            {dailyChartData.length > 0 ? (
              <div className="flex flex-1 flex-col justify-between gap-3">
                {/* Live Hover / Latest Day Telemetry Pill */}
                {activeSpark && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--theme-radius-control)] border border-border-theme/70 bg-surface-muted/65 px-3.5 py-2 text-xs tabular-nums">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: trendMetric === 'revenue' ? accentHex : '#22C55E' }}
                      />
                      <span className="font-semibold text-ink">{activeSpark.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-ink">{activeSpark.formattedValue}</span>
                      {activeSpark.secondaryText && (
                        <span className="text-[11px] text-ink-muted">{activeSpark.secondaryText}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-[var(--theme-radius-inner)] border border-border-theme/50 bg-surface-muted/25 px-3 pt-4 pb-2">
                  <GlowingAreaSparkline
                    points={sparkPoints}
                    strokeColor={trendMetric === 'revenue' ? accentHex : '#22C55E'}
                    height={158}
                    onHoverPoint={setHoveredSpark}
                  />
                  <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-ink-muted tabular-nums">
                    <span>{dailyChartData[0]?.day}</span>
                    {dailyChartData.length > 2 && (
                      <span>{dailyChartData[Math.floor(dailyChartData.length / 2)]?.day}</span>
                    )}
                    <span>{dailyChartData[dailyChartData.length - 1]?.day}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-[240px] flex-col items-center justify-center rounded-[var(--theme-radius-inner)] border border-dashed border-border-theme bg-surface-muted/40 text-center">
                <BarChart3 className="h-8 w-8 text-ink-muted/60 mb-2" />
                <p className="text-xs font-semibold text-ink">No paid sales transactions in selected date window</p>
                <p className="text-[11px] text-ink-muted mt-0.5">Expand date range or switch branch filter above.</p>
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-border-theme/60 pt-3 text-xs tabular-nums">
              <div className="rounded-[var(--theme-radius-inner)] bg-surface-muted/65 px-3 py-2">
                <span className="text-[10.5px] text-ink-muted block">Avg Ticket (AOV)</span>
                <span className="font-bold text-ink">{formatMoney(data.sales_summary?.avg_order_value || 0)}</span>
              </div>
              <div className="rounded-[var(--theme-radius-inner)] bg-surface-muted/65 px-3 py-2">
                <span className="text-[10.5px] text-ink-muted block">Total FIFO COGS</span>
                <span className="font-bold text-ink">{formatMoney(data.sales_summary?.total_cogs || 0)}</span>
              </div>
              <div className="rounded-[var(--theme-radius-inner)] bg-surface-muted/65 px-3 py-2">
                <span className="text-[10.5px] text-ink-muted block">Discounts Given</span>
                <span className="font-bold text-ink">{formatMoney(data.sales_summary?.total_discounts || 0)}</span>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Right 4 Columns: Glowing Radial Category Gauge */}
        <ScrollReveal delayMs={80} className="xl:col-span-4 min-w-0">
          <div className="zona-card h-full flex flex-col justify-between p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-[14px] font-bold tracking-[-0.01em] text-ink flex items-center gap-2">
                  <Layers className="h-4 w-4 text-accent" />
                  Category Revenue Mix
                </h3>
                <p className="text-[11px] text-ink-muted">Share of paid period sales by category</p>
              </div>
              <Button variant="ghost" size="xs" onClick={() => onSelectTab('categories')}>
                Details <ArrowRight className="h-3 w-3" />
              </Button>
            </div>

            {categoryDonutData.length > 0 ? (
              <div className="my-3 flex flex-col items-center gap-3.5">
                <GlowingRadialGauge
                  segments={categoryDonutData.map((c) => ({
                    id: c.name,
                    label: c.name,
                    value: c.value,
                    color: c.color,
                  }))}
                  centerEyebrow={activeCategory ? activeCategory.name : 'Categories'}
                  centerValue={
                    activeCategory ? `${activeCategory.share.toFixed(0)}%` : String(categoryDonutData.length)
                  }
                  activeId={hoveredCategory}
                  onHoverId={setHoveredCategory}
                  size={146}
                  strokeWidth={12}
                />

                <SegmentedCapsuleBar
                  segments={categoryDonutData.map((c) => ({
                    id: c.name,
                    label: c.name,
                    pct: totalCategoryVal > 0 ? (c.value / totalCategoryVal) * 100 : c.share,
                    color: c.color,
                  }))}
                  activeId={hoveredCategory}
                  onHoverId={setHoveredCategory}
                />

                <div className="w-full space-y-1.5">
                  {categoryDonutData.map((c) => {
                    const isActive = hoveredCategory === c.name;
                    return (
                      <div
                        key={c.name}
                        onMouseEnter={() => setHoveredCategory(c.name)}
                        onMouseLeave={() => setHoveredCategory(null)}
                        className={`flex items-center justify-between gap-2 rounded-[var(--theme-radius-control)] px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-accent-soft/45 ring-1 ring-accent/35'
                            : 'bg-surface-muted/70 hover:bg-surface-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: c.color,
                              boxShadow: isActive ? `0 0 8px ${c.color}` : undefined,
                            }}
                          />
                          <span className="truncate font-semibold text-ink">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 tabular-nums">
                          <span className="font-medium text-ink-muted">{formatMoney(c.value)}</span>
                          <Badge variant="outline">{c.share.toFixed(1)}%</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center py-10 text-xs text-ink-muted">
                No category revenue recorded in this period.
              </div>
            )}
          </div>
        </ScrollReveal>
      </div>

      {/* Row 2: 3 Symmetrical Executive Drilldown Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Top Products Summary */}
        <ScrollReveal delayMs={40} className="min-w-0">
          <div className="zona-card h-full flex flex-col justify-between p-5 min-w-0">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-accent" />
                <h4 className="text-[13px] font-bold text-ink">Top Products by Revenue</h4>
              </div>
              <Button variant="ghost" size="xs" onClick={() => onSelectTab('products')}>
                Full Report <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2.5">
              {topProducts.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] bg-surface-muted/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] font-bold text-accent tabular-nums">#{idx + 1}</span>
                      <span className="truncate text-xs font-semibold text-ink">{p.name}</span>
                    </div>
                    <p className="text-[10.5px] text-ink-muted tabular-nums">
                      {p.units_sold} {p.unit_of_measure} sold • {p.margin_pct}% margin
                    </p>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-xs font-bold text-ink">{formatMoney(p.net_revenue)}</div>
                    <div className="text-[10px] text-ink-muted">{p.revenue_share_pct}% share</div>
                  </div>
                </div>
              ))}
              {topProducts.length === 0 && (
                <p className="py-6 text-center text-xs text-ink-muted">No product data available.</p>
              )}
            </div>
          </div>
        </div>
        </ScrollReveal>

        {/* Top Customers Summary */}
        <ScrollReveal delayMs={100} className="min-w-0">
        <div className="zona-card h-full flex flex-col justify-between p-5 min-w-0">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" />
                <h4 className="text-[13px] font-bold text-ink">Top Customers by Spend</h4>
              </div>
              <Button variant="ghost" size="xs" onClick={() => onSelectTab('customers')}>
                Full Report <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2.5">
              {topCustomers.map((c, idx) => (
                <div
                  key={`${c.id}-${c.name}`}
                  className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] bg-surface-muted/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] font-bold text-accent tabular-nums">#{idx + 1}</span>
                      <span className="truncate text-xs font-semibold text-ink">{c.name}</span>
                    </div>
                    <p className="text-[10.5px] text-ink-muted tabular-nums">
                      {c.paid_orders} orders • {c.tier} • AOV {formatMoney(c.avg_order_value)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-xs font-bold text-ink">{formatMoney(c.total_spent)}</div>
                    <div className="text-[10px] text-ink-muted">{c.spend_share_pct}% share</div>
                  </div>
                </div>
              ))}
              {topCustomers.length === 0 && (
                <p className="py-6 text-center text-xs text-ink-muted">No customer sales recorded.</p>
              )}
            </div>
          </div>
        </div>
        </ScrollReveal>

        {/* Payment Methods & Channels Mix */}
        <ScrollReveal delayMs={160} className="min-w-0">
        <div className="zona-card h-full flex flex-col justify-between p-5 min-w-0">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-accent" />
                <h4 className="text-[13px] font-bold text-ink">Payment &amp; Channel Mix</h4>
              </div>
              <Button variant="ghost" size="xs" onClick={() => onSelectTab('channels')}>
                Full Report <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2.5">
              {topPayments.map((pm) => {
                const share = toReportNumber(pm.share_pct);
                return (
                  <div
                    key={pm.payment_method}
                    className="rounded-[var(--theme-radius-inner)] bg-surface-muted/60 px-3 py-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-ink">{formatDisplayLabel(pm.payment_method)}</span>
                      <span className="font-bold text-ink tabular-nums">
                        {formatMoney(pm.total_collected)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(4, share))}%`,
                          backgroundColor: accentHex,
                          boxShadow: `0 0 8px ${accentHex}60`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10.5px] text-ink-muted tabular-nums">
                      <span>{pm.tx_count} payments • Avg {formatMoney(pm.avg_ticket)}</span>
                      <span className="font-semibold text-ink">{pm.share_pct}%</span>
                    </div>
                  </div>
                );
              })}
              {topPayments.length === 0 && (
                <p className="py-6 text-center text-xs text-ink-muted">No payment settlements recorded.</p>
              )}
            </div>
          </div>
        </div>
        </ScrollReveal>
      </div>
    </div>
  );
}

