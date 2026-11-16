import * as React from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Clock,
  Download,
  Landmark,
  Percent,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { ScrollReveal } from '@/components/dqnamo/ScrollReveal';
import {
  GlowingAreaSparkline,
  getTooltipHorizontalPosition,
  type SparklinePoint,
} from '@/components/charts/ModernCharts';
import { confirmAction } from '@/lib/swal';
import { formatMetricNumber } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { getDisplayTradeName, useAuthStore } from '@/store/authStore';
import { useT } from '@/store/i18nStore';
import { getThemeDefinition, useThemeStore } from '@/store/themeStore';
import { toast } from 'sonner';
import type { OverviewResponse } from '../types';

interface KPICardsStackProps {
  overview: OverviewResponse;
}

function formatSignedPct(pct: number): string {
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export function KPICardsStack({ overview }: KPICardsStackProps) {
  const { formatMoney } = useCurrency();
  const { context, publicBranding } = useAuthStore();
  const { t } = useT();
  const { themeId, customAccent } = useThemeStore();
  const theme = getThemeDefinition(themeId);
  const accentHex = customAccent || theme.tokens['--theme-accent'];

  const {
    role_persona: persona,
    capabilities,
    prev_period_label: prevLabel,
    period_label: periodLabel,
    kpi,
    revenue_bars,
    order_sparkline,
    product_sales,
    top_countries,
    recent_activity,
    inventory_summary,
    gl_summary,
  } = overview;

  const [exporting, setExporting] = React.useState(false);
  const [exported, setExported] = React.useState(false);
  const [hoveredSpark, setHoveredSpark] = React.useState<SparklinePoint | null>(null);
  const [hoveredRevBarIdx, setHoveredRevBarIdx] = React.useState<number | null>(null);

  const handleExport = async () => {
    const ok = await confirmAction({
      title: `Export ${periodLabel} Statistics?`,
      text: 'This generates a CSV summary of KPI metrics and top SKU performance for your active workspace.',
      confirmLabel: 'Export CSV',
    });
    if (!ok) return;

    setExporting(true);
    setExported(false);

    const metricRows: string[][] = [
      ['Role Persona', persona],
      ['Period', periodLabel],
      ['Total Orders Amount', String(kpi.total_orders_amount)],
      ['Paid Orders Count', String(kpi.live_paid_orders)],
      ['Average Order Value', String(kpi.average_order_value)],
      ['Held Bills Count', String(kpi.held_bill_count)],
      ['Total Revenue', String(kpi.total_revenue)],
    ];
    if (capabilities.can_view_tax_detail && kpi.total_taxes) {
      metricRows.push(['Taxes Collected', String(kpi.total_taxes)]);
    }
    if (capabilities.can_view_profit && kpi.gross_profit) {
      metricRows.push(['Gross Profit', String(kpi.gross_profit)]);
      metricRows.push(['Gross Margin (%)', String(kpi.gross_margin_pct || '0.00')]);
    }

    const csvRows = [
      ['Metric', 'Value'],
      ...metricRows,
      [],
      ['SKU', 'Product', 'Category', 'Sale Price', 'Stock', 'Sold', 'Revenue'],
      ...product_sales.map((p) => [
        p.sku,
        p.name,
        p.category_name || '',
        String(p.sale_price),
        String(p.total_stock),
        String(p.units_sold),
        String(p.revenue),
      ]),
    ];

    const csv = csvRows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const tradeSlug =
      getDisplayTradeName(context, publicBranding)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'retail';
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tradeSlug}-${overview.period}-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    setTimeout(() => {
      setExporting(false);
      setExported(true);
      toast.success('Statistics CSV exported');
      setTimeout(() => setExported(false), 1800);
    }, 300);
  };

  const maxRevBar = Math.max(...revenue_bars.map((b) => b.value), 1);
  const totalOnHand = inventory_summary
    ? Number(inventory_summary.total_stock_units) || 0
    : product_sales.reduce((sum, item) => sum + (Number(item.total_stock) || 0), 0);
  const lowStockCount = inventory_summary
    ? inventory_summary.low_stock_count
    : product_sales.filter((item) => {
        const thresh = Number(item.reorder_point) > 0 ? Number(item.reorder_point) : 12;
        return (Number(item.total_stock) || 0) <= thresh;
      }).length;
  const topMover =
    product_sales.length > 0
      ? [...product_sales].sort((a, b) => (b.units_sold || 0) - (a.units_sold || 0))[0]
      : null;
  const latestSale = recent_activity?.[0] || null;
  const discountedSkuCount = product_sales.filter(
    (item) => Number(item.discount_percent || 0) > 0
  ).length;

  const customersHeroCard = (
    <article
      className="flex flex-col justify-between rounded-[var(--theme-radius-card)] border border-border-theme bg-contrast p-5 text-contrast-fg shadow-lg"
      data-testid="kpi-customers-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">
            {t.overview.totalCustomers}
          </p>
          <p className="mt-1.5 text-[21px] sm:text-[23px] font-bold leading-none tracking-[-0.02em] tabular-nums">
            {formatMetricNumber(kpi.total_customers)}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-accent">
          <Users className="h-4.5 w-4.5" />
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
          <span className="font-semibold text-accent">{kpi.men_share_pct}% Men</span>
          {100 - kpi.men_share_pct - kpi.women_share_pct > 0 && (
            <span className="font-medium opacity-70">
              {100 - kpi.men_share_pct - kpi.women_share_pct}% Unisex
            </span>
          )}
          <span className="font-semibold opacity-90">{kpi.women_share_pct}% Women</span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-accent" style={{ width: `${kpi.men_share_pct}%` }} />
          <div className="h-full bg-white/75" style={{ width: `${kpi.women_share_pct}%` }} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
        <span className="opacity-65">{prevLabel}</span>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="font-semibold">{formatMetricNumber(kpi.customers_last_period)}</span>
          <span
            className={`rounded-full px-2 py-0.5 font-bold ${
              kpi.customers_growth_pct >= 0
                ? 'bg-[#22C55E]/20 text-[#22C55E]'
                : 'bg-[#EF4444]/20 text-[#FCA5A5]'
            }`}
          >
            {formatSignedPct(kpi.customers_growth_pct)}
          </span>
        </div>
      </div>
    </article>
  );

  const revenueMeshCard = (
    <article
      className="zona-revenue-mesh flex flex-col justify-between rounded-[var(--theme-radius-card)] p-5 text-white shadow-lg"
      data-testid="kpi-revenue-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-white/85 uppercase">
            {persona === 'CASHIER' ? 'Register Sales Revenue' : t.overview.totalRevenue}
          </p>
          <p className="mt-1.5 text-[21px] sm:text-[23px] font-bold leading-none tracking-[-0.02em] tabular-nums">
            {formatMoney(kpi.total_revenue)}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white">
          <TrendingUp className="h-4.5 w-4.5" />
        </span>
      </div>

      <div
        className="relative mt-4 grid items-end gap-2 h-[66px]"
        style={{
          gridTemplateColumns: `repeat(${Math.max(revenue_bars.length, 1)}, minmax(0, 1fr))`,
        }}
        onMouseLeave={() => setHoveredRevBarIdx(null)}
      >
        {hoveredRevBarIdx !== null && revenue_bars[hoveredRevBarIdx] && (
          <div
            data-testid="revenue-bar-tooltip"
            className="pointer-events-none absolute -top-2 z-30 w-max max-w-[190px] -translate-y-full rounded-[12px] border border-white/15 bg-[#222026]/95 px-2.5 py-1.5 text-white shadow-[0_12px_28px_-6px_rgba(34,32,38,0.45)] backdrop-blur-md transition-all duration-150 tabular-nums"
            style={getTooltipHorizontalPosition(
              (hoveredRevBarIdx + 0.5) / Math.max(1, revenue_bars.length)
            )}
          >
            <div className="flex items-center gap-2 text-[10.5px]">
              <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_8px_#ffffff]" />
              <span className="font-bold text-white/85">{revenue_bars[hoveredRevBarIdx].day}</span>
              <span className="font-extrabold text-white">
                {formatMoney(revenue_bars[hoveredRevBarIdx].value)}
              </span>
            </div>
          </div>
        )}

        {revenue_bars.map((b, idx) => {
          const pct = b.value > 0 ? Math.max(22, Math.round((b.value / maxRevBar) * 100)) : 14;
          const isHovered = hoveredRevBarIdx === idx;
          return (
            <button
              key={b.day}
              type="button"
              onMouseEnter={() => setHoveredRevBarIdx(idx)}
              onFocus={() => setHoveredRevBarIdx(idx)}
              onBlur={() => setHoveredRevBarIdx(null)}
              className="flex h-full flex-col items-center justify-end gap-1.5 focus:outline-none cursor-pointer"
              aria-label={`${b.day}: ${formatMoney(b.value)}`}
            >
              <div
                className={`w-full max-w-[26px] rounded-full transition-all duration-150 ${
                  b.active || isHovered ? 'bg-contrast shadow-md scale-105' : 'zona-white-hatch opacity-95'
                }`}
                style={{ height: `${pct}%` }}
              />
              <span
                className={`text-[10px] font-semibold transition-colors ${
                  b.active || isHovered ? 'font-extrabold text-white' : 'text-white/80'
                }`}
              >
                {b.day}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3.5 flex items-center justify-between border-t border-white/20 pt-3 text-xs">
        <span className="text-white/85">{prevLabel}</span>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="font-semibold text-white">{formatMoney(kpi.revenue_last_period)}</span>
          <span className="rounded-full bg-white/25 px-2 py-0.5 font-bold text-white">
            {formatSignedPct(kpi.revenue_growth_pct)}
          </span>
        </div>
      </div>
    </article>
  );

  const ordersSparkCard = (
    <article
      className="flex flex-col justify-between rounded-[var(--theme-radius-card)] border border-border-theme bg-sand p-5 text-ink shadow-[var(--theme-shadow)]"
      data-testid="kpi-orders-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            {hoveredSpark ? `Orders • ${hoveredSpark.label}` : t.overview.totalOrders}
          </p>
          <p className="mt-1.5 text-[21px] sm:text-[23px] font-bold leading-none tracking-[-0.02em] tabular-nums">
            {hoveredSpark
              ? hoveredSpark.formattedValue || formatMoney(hoveredSpark.value)
              : formatMoney(kpi.total_orders_amount)}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface text-accent shadow-xs">
          <ShoppingBag className="h-4.5 w-4.5" />
        </span>
      </div>

      <div className="mt-3 w-full min-w-0">
        <GlowingAreaSparkline
          points={order_sparkline.map((pt) => ({
            label: pt.label,
            value: Number(pt.value || 0),
            formattedValue: formatMoney(pt.value || 0),
            secondaryText: `${pt.orders || 0} orders`,
          }))}
          strokeColor={accentHex}
          height={64}
          onHoverPoint={(pt: SparklinePoint | null) => setHoveredSpark(pt)}
        />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border-theme pt-3 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-ink-muted tabular-nums">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          {kpi.live_paid_orders} {t.overview.livePaid}
        </span>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="font-semibold text-ink">
            {formatMoney(kpi.orders_last_period_amount)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 font-bold ${
              kpi.orders_growth_pct >= 0
                ? 'bg-[#22C55E]/15 text-[#22C55E]'
                : 'bg-[#EF4444]/15 text-[#EF4444]'
            }`}
          >
            {formatSignedPct(kpi.orders_growth_pct)}
          </span>
        </div>
      </div>
    </article>
  );

  const topMoverCard = (
    <article className="zona-card flex flex-col justify-between p-4 md:col-span-1 xl:col-span-1">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
          <Boxes className="h-3.5 w-3.5 text-accent" />
          Stock &amp; Top Mover
        </span>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold text-ink tabular-nums">
          {formatMetricNumber(totalOnHand)} units
        </span>
      </div>

      <div className="mt-3 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 px-3 py-2.5 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {topMover && (
            <img
              src={topMover.image_url || '/products/cardigan.svg'}
              alt={topMover.name}
              className="h-9 w-9 shrink-0 rounded-[8px] bg-surface object-cover p-0.5 border border-border-theme"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-bold text-ink">
              {topMover ? topMover.name : 'No SKU velocity yet'}
            </p>
            <p className="truncate font-mono text-[10.5px] text-ink-muted">
              {topMover ? `${topMover.sku} • ${topMover.units_sold} sold` : 'Syncing catalog...'}
            </p>
          </div>
        </div>
        {topMover && (
          <span className="shrink-0 font-mono text-[12px] font-extrabold text-accent tabular-nums">
            {formatMoney(topMover.sale_price)}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1 font-medium text-ink-muted">
          <Tag className="h-3 w-3 text-accent" />
          {discountedSkuCount} promo SKUs
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-bold tabular-nums ${
            lowStockCount > 0 ? 'bg-[#EF4444]/15 text-[#EF4444]' : 'bg-[#22C55E]/15 text-[#15803D]'
          }`}
        >
          {lowStockCount} low stock
        </span>
      </div>
    </article>
  );

  const exportAction = capabilities.can_export_reports ? (
    <div className="md:col-span-3 xl:col-span-1">
      <DynamicButton
        variant="obsidian"
        loading={exporting}
        success={exported}
        icon={<Download className="h-4 w-4" />}
        onClick={handleExport}
        className="w-full min-h-[48px]"
        data-testid="overview-export-csv-btn"
      >
        {exported ? t.overview.statisticsExported : t.overview.exportStatistics}
      </DynamicButton>
    </div>
  ) : null;

  if (persona === 'INVENTORY') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:flex xl:flex-col xl:gap-4">
        <article
          className="flex flex-col justify-between rounded-[var(--theme-radius-card)] border border-border-theme bg-contrast p-5 text-contrast-fg shadow-lg"
          data-testid="kpi-fifo-valuation-card"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">
                FIFO Stock Valuation
              </p>
              <p className="mt-1.5 text-[21px] sm:text-[23px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                {formatMoney(inventory_summary?.total_fifo_valuation || '0.00')}
              </p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-accent">
              <Boxes className="h-4.5 w-4.5" />
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs tabular-nums">
            <span className="opacity-75">
              {formatMetricNumber(inventory_summary?.active_sku_count || product_sales.length)} Active SKUs
            </span>
            <span className="font-bold text-accent">
              {formatMetricNumber(totalOnHand)} units on hand
            </span>
          </div>
        </article>

        <article className="zona-revenue-mesh flex flex-col justify-between rounded-[var(--theme-radius-card)] p-5 text-white shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-white/85 uppercase">
                Units Dispatched ({periodLabel})
              </p>
              <p className="mt-1.5 text-[22px] font-bold leading-none tabular-nums">
                {formatMetricNumber(kpi.units_sold)} units
              </p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white">
              <TrendingUp className="h-4.5 w-4.5" />
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/20 pt-3 text-xs tabular-nums">
            <span className="text-white/85">Returns / Restocks</span>
            <span className="rounded-full bg-white/25 px-2.5 py-0.5 font-bold text-white">
              {kpi.units_returned} returned
            </span>
          </div>
        </article>

        <div className="grid grid-cols-2 gap-4 md:col-span-2 xl:col-span-1">
          <article className="zona-card flex flex-col justify-between p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
                Low Stock
              </p>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#EF4444]/15 text-[#EF4444]">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-[20px] font-bold text-ink tabular-nums">
              {inventory_summary?.low_stock_count ?? lowStockCount}
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">Below reorder pt</p>
          </article>

          <article className="zona-card flex flex-col justify-between p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
                Open POs
              </p>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Clock className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-[20px] font-bold text-ink tabular-nums">
              {inventory_summary?.open_po_count ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">Draft / Sent / Partial</p>
          </article>
        </div>

        {topMoverCard}
        {exportAction}
      </div>
    );
  }

  if (persona === 'ACCOUNTANT') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:flex xl:flex-col xl:gap-4">
        {revenueMeshCard}

        {capabilities.can_view_profit && (
          <article
            className="flex flex-col justify-between rounded-[var(--theme-radius-card)] border border-border-theme bg-contrast p-5 text-contrast-fg shadow-lg"
            data-testid="kpi-gross-profit-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">
                  Gross Profit &amp; Margin
                </p>
                <p className="mt-1.5 text-[21px] sm:text-[23px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                  {formatMoney(kpi.gross_profit || '0.00')}
                </p>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-accent">
                <Percent className="h-4.5 w-4.5" />
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs tabular-nums">
              <span className="opacity-75">COGS: {formatMoney(kpi.total_cogs || '0.00')}</span>
              <span className="rounded-full bg-[#22C55E]/20 px-2.5 py-0.5 font-bold text-[#22C55E]">
                {kpi.gross_margin_pct || '0.00'}% margin
              </span>
            </div>
          </article>
        )}

        <div className="grid grid-cols-2 gap-4 md:col-span-2 xl:col-span-1">
          <article className="zona-card flex flex-col justify-between p-4" data-testid="kpi-taxes-card">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
                Tax Collected
              </p>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
                <ReceiptText className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-[17px] font-bold text-ink tabular-nums">
              {formatMoney(kpi.total_taxes || '0.00')}
            </p>
            <p className="mt-1 text-[11px] text-ink-muted tabular-nums">
              Discounts: {formatMoney(kpi.total_discounts || '0.00')}
            </p>
          </article>

          <article className="zona-card flex flex-col justify-between p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
                GL Journals
              </p>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#22C55E]/15 text-[#15803D]">
                <Landmark className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-[17px] font-bold text-ink tabular-nums">
              {gl_summary?.period_journal_count ?? 0} entries
            </p>
            <p className="mt-1 truncate text-[11px] text-ink-muted">
              {gl_summary?.open_fiscal_period_count ?? 0} open periods
            </p>
          </article>
        </div>

        {ordersSparkCard}
        {exportAction}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:flex xl:flex-col xl:gap-4">
      {persona !== 'CASHIER' && persona !== 'LIMITED' && (
        <ScrollReveal delayMs={0}>{customersHeroCard}</ScrollReveal>
      )}
      <ScrollReveal delayMs={60}>{revenueMeshCard}</ScrollReveal>
      <ScrollReveal delayMs={120}>{ordersSparkCard}</ScrollReveal>

      {/* Compact 2-Up Micro KPI Row */}
      <div className="grid grid-cols-2 gap-4 md:col-span-2 xl:col-span-1">
        <article className="zona-card flex flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
              Avg Ticket
            </p>
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
              <ReceiptText className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-[17px] sm:text-[18px] font-bold leading-none tracking-[-0.02em] text-ink tabular-nums">
            {formatMoney(kpi.average_order_value)}
          </p>
          <p className="mt-2 text-[11px] font-medium text-ink-muted tabular-nums">
            {formatMetricNumber(kpi.units_sold)} units • {kpi.refund_void_count} void/ref
          </p>
        </article>

        <article className="zona-card flex flex-col justify-between p-4" data-testid="kpi-held-queue-card">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
              Held Queue
            </p>
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F59E0B]/15 text-[#D97706]">
              <Clock className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-[17px] sm:text-[18px] font-bold leading-none tracking-[-0.02em] text-ink tabular-nums">
            {formatMetricNumber(kpi.held_bill_count)}
          </p>
          <p className="mt-2 text-[11px] font-medium text-ink-muted tabular-nums">
            {kpi.held_bill_count > 0 ? formatMoney(kpi.held_bill_total) : 'All bills cleared'}
          </p>
        </article>
      </div>

      {capabilities.can_view_profit && persona !== 'CASHIER' && (
        <div className="grid grid-cols-2 gap-4 md:col-span-2 xl:col-span-1">
          <article className="zona-card flex flex-col justify-between p-4" data-testid="kpi-exec-profit-card">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
                Gross Profit
              </p>
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#22C55E]/15 text-[#15803D]">
                <Percent className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-[16px] font-bold text-ink tabular-nums">
              {formatMoney(kpi.gross_profit || '0.00')}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-[#15803D] tabular-nums">
              {kpi.gross_margin_pct || '0.00'}% margin
            </p>
          </article>

          <article className="zona-card flex flex-col justify-between p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
                Taxes
              </p>
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Landmark className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-[16px] font-bold text-ink tabular-nums">
              {formatMoney(kpi.total_taxes || '0.00')}
            </p>
            <p className="mt-1 text-[11px] text-ink-muted tabular-nums">
              Disc: {formatMoney(kpi.total_discounts || '0.00')}
            </p>
          </article>
        </div>
      )}

      {persona === 'CASHIER' ? (
        <article className="zona-card flex flex-col justify-between p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
              <Users className="h-3.5 w-3.5 text-accent" />
              Customers Served ({periodLabel})
            </span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-bold text-ink tabular-nums">
              {formatMetricNumber(kpi.period_unique_customers)}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Settled revenue: <strong className="text-ink">{formatMoney(kpi.live_paid_revenue)}</strong>
          </p>
        </article>
      ) : (
        <article className="zona-card flex flex-col justify-between p-4 md:col-span-1 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-wide text-ink-muted uppercase">
              <Wallet className="h-3.5 w-3.5 text-accent" />
              Live Settlement &amp; Branches
            </span>
            <span className="font-mono text-[11.5px] font-extrabold text-ink tabular-nums">
              {formatMoney(kpi.live_paid_revenue)}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {(top_countries || []).slice(0, 3).map((region) => (
              <div key={region.country_code} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-ink truncate">{region.country_name}</span>
                  <span className="font-mono font-bold text-ink-muted tabular-nums">
                    {region.percentage}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(region.percentage > 0 ? 6 : 0, Math.min(100, region.percentage))}%`,
                      backgroundColor: region.color || accentHex,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border-theme/70 pt-2.5 text-[11px] text-ink-muted">
            <span className="inline-flex items-center gap-1 font-medium">
              <Activity className="h-3 w-3 text-[#22C55E]" />
              {latestSale ? latestSale.invoice_number : 'Awaiting invoice'}
            </span>
            <span className="font-semibold text-ink tabular-nums">
              {latestSale ? formatMoney(latestSale.grand_total) : formatMoney('0.00')}
            </span>
          </div>
        </article>
      )}

      <ScrollReveal delayMs={260}>{topMoverCard}</ScrollReveal>
      <ScrollReveal delayMs={300}>{exportAction}</ScrollReveal>
    </div>
  );
}
