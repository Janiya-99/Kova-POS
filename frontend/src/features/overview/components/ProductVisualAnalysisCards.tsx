import * as React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Flame,
  Layers,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { AppRoute } from '@/components/layout/FloatingSidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/dqnamo/ScrollReveal';
import { useCurrency } from '@/hooks/useCurrency';
import type { OverviewResponse } from '../types';

interface ProductVisualAnalysisCardsProps {
  overview: OverviewResponse;
  onNavigate?: (route: AppRoute) => void;
  showSecondaryDigest?: boolean;
}

/**
 * Full-bleed edge-to-edge product imagery with structured analytical telemetry
 * filling the Overview right-column Bento stack symmetrically with zero white frames.
 */
export function ProductVisualAnalysisCards({
  overview,
  onNavigate,
  showSecondaryDigest = true,
}: ProductVisualAnalysisCardsProps) {
  const { formatMoney } = useCurrency();
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const rankedProducts = React.useMemo(() => {
    return [...(overview.product_sales || [])]
      .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
      .slice(0, 3);
  }, [overview.product_sales]);

  React.useEffect(() => {
    if (selectedIndex >= rankedProducts.length) {
      setSelectedIndex(0);
    }
  }, [rankedProducts.length, selectedIndex]);

  const activeProduct = rankedProducts[selectedIndex] || null;
  const totalPeriodUnits = Math.max(1, Number(overview.kpi?.units_sold || 0));
  const totalPeriodRevenue = Math.max(1, Number(overview.kpi?.total_revenue || 0));

  const digestTiles = React.useMemo(() => {
    const lowAlerts = (overview.low_stock_alerts || []).slice(0, 2).map((alert) => ({
      id: alert.id,
      sku: alert.sku,
      name: alert.name,
      categoryName: alert.category_name || 'Inventory',
      imageUrl: alert.image_url || '/products/tote.svg',
      badgeText: `${alert.total_stock} left`,
      isUrgent: true,
      metricLine: `Reorder below ${alert.reorder_point} • Open PO: ${alert.open_po_count}`,
      insightText: `Min batch +${alert.reorder_qty} units advised to sustain demand`,
    }));
    if (lowAlerts.length >= 2) {
      return lowAlerts;
    }

    const fallbackItems = (overview.product_sales || [])
      .filter((p) => !lowAlerts.some((a) => a.id === p.id))
      .slice(0, 2 - lowAlerts.length)
      .map((p) => {
        const threshold = Number(p.reorder_point) > 0 ? Number(p.reorder_point) : 12;
        const low = Number(p.total_stock) <= threshold;
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          categoryName: p.category_name || 'Merchandise',
          imageUrl: p.image_url || '/products/jacket.svg',
          badgeText: `${p.total_stock} left`,
          isUrgent: low,
          metricLine: `${p.units_sold} sold • ${formatMoney(p.revenue)}`,
          insightText: low
            ? `Approaching ${threshold} unit buffer • Monitor velocity`
            : `Stock runway solid against ${overview.period_label.toLowerCase()} pace`,
        };
      });

    return [...lowAlerts, ...fallbackItems];
  }, [overview.low_stock_alerts, overview.product_sales, overview.period_label, formatMoney]);

  const topCategory = React.useMemo(() => {
    const sorted = [...(overview.category_mix || [])].sort(
      (a, b) => Number(b.revenue || 0) - Number(a.revenue || 0)
    );
    return sorted[0] || null;
  }, [overview.category_mix]);

  const caps = overview.capabilities;
  const primaryActionRoute: AppRoute = caps.can_view_catalog
    ? '/products'
    : caps.can_view_pos
    ? '/pos'
    : '/reports';
  const secondaryActionRoute: AppRoute = caps.can_view_inventory
    ? '/inventory'
    : caps.can_view_pos
    ? '/pos'
    : '/products';

  return (
    <div className="flex flex-col gap-4" data-testid="product-visual-analysis-stack">
      {/* CARD 1: Full-Bleed Merchandise Performance Spotlight & Analytical Commentary */}
      {activeProduct && (
        <ScrollReveal delayMs={70}>
          <section
            data-testid="overview-visual-analysis-card"
            className="zona-card h-full flex flex-col justify-between p-4 sm:p-5 space-y-3.5"
          >
            {/* Card Header + Interactive Rank Switcher */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#16A34A]" />
                  <h3 className="truncate text-[13.5px] font-bold text-ink">
                    Merchandise Spotlight
                  </h3>
                </div>
                <p className="truncate text-[10.5px] text-ink-muted">
                  Full-bleed visual velocity &amp; stock analysis • {overview.period_label}
                </p>
              </div>

              {rankedProducts.length > 1 && (
                <div className="inline-flex items-center rounded-full border border-border-theme bg-surface-muted p-0.5 shrink-0">
                  {rankedProducts.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedIndex(idx)}
                      data-testid={`spotlight-rank-btn-${idx}`}
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold transition cursor-pointer ${
                        selectedIndex === idx
                          ? 'bg-sidebar text-white shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      #{idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Full-Bleed Edge-to-Edge Product Artwork (Zero White Padding Box) */}
            <div className="group relative h-48 w-full overflow-hidden rounded-[var(--theme-radius-inner)] bg-sidebar">
              <img
                src={activeProduct.image_url || '/products/cardigan.svg'}
                alt={activeProduct.name}
                data-testid="spotlight-hero-image"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#16151A]/95 via-[#16151A]/40 to-transparent" />

              {/* Top Overlay Telemetry Pills */}
              <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                    <Flame className="h-3 w-3 text-[#22C55E]" />
                    #{selectedIndex + 1} Top Seller
                  </span>
                  {Number(activeProduct.discount_percent || 0) > 0 && (
                    <span className="rounded-full bg-[#16A34A] px-2 py-0.5 font-mono text-[10px] font-bold text-white shadow-sm">
                      -{Number(activeProduct.discount_percent)}% Promo
                    </span>
                  )}
                </div>

                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold backdrop-blur-md ${
                    Number(activeProduct.total_stock) <=
                    (Number(activeProduct.reorder_point) > 0
                      ? Number(activeProduct.reorder_point)
                      : 12)
                      ? 'bg-[#EF4444]/90 text-white'
                      : 'bg-black/70 text-white'
                  }`}
                >
                  {activeProduct.total_stock} left
                </span>
              </div>

              {/* Bottom Full-Bleed Overlay Headline & Pricing */}
              <div className="absolute inset-x-3.5 bottom-3 flex items-end justify-between gap-3 text-white">
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-bold uppercase tracking-wider text-white/75">
                    {activeProduct.category_name || 'Catalog'} • {activeProduct.sku}
                  </p>
                  <h4 className="mt-0.5 truncate text-[15px] font-extrabold tracking-tight text-white">
                    {activeProduct.name}
                  </h4>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="text-[14px] font-extrabold leading-none text-[#22C55E]">
                    {formatMoney(activeProduct.sale_price)}
                  </p>
                  {Number(activeProduct.discount_percent || 0) > 0 && (
                    <p className="mt-0.5 text-[10px] line-through text-white/60">
                      {formatMoney(activeProduct.base_price)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Structured Quantitative Breakdown Grid */}
            {(() => {
              const revValue = Number(activeProduct.revenue || 0);
              const unitsValue = Number(activeProduct.units_sold || 0);
              const stockValue = Number(activeProduct.total_stock || 0);
              const threshold =
                Number(activeProduct.reorder_point) > 0
                  ? Number(activeProduct.reorder_point)
                  : 12;
              const revSharePct = Math.min(
                100,
                Math.round((revValue / totalPeriodRevenue) * 1000) / 10
              );
              const unitSharePct = Math.min(
                100,
                Math.round((unitsValue / totalPeriodUnits) * 1000) / 10
              );
              const coverMultiple =
                unitsValue > 0 ? (stockValue / unitsValue).toFixed(1) : '∞';
              const isHealthyStock = stockValue > threshold;
              const barPct = Math.max(12, Math.min(100, revSharePct * 2.2));

              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-[var(--theme-radius-control)] border border-border-theme/70 bg-surface-muted/60 px-2.5 py-2 tabular-nums">
                      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">
                        Units Sold
                      </p>
                      <p className="mt-0.5 font-mono text-[13px] font-extrabold text-ink">
                        {unitsValue}
                      </p>
                      <p className="text-[9.5px] font-semibold text-[#16A34A]">
                        {unitSharePct}% vol share
                      </p>
                    </div>

                    <div className="rounded-[var(--theme-radius-control)] border border-border-theme/70 bg-surface-muted/60 px-2.5 py-2 tabular-nums">
                      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">
                        Net Sales
                      </p>
                      <p className="mt-0.5 font-mono text-[13px] font-extrabold text-ink truncate">
                        {formatMoney(activeProduct.revenue)}
                      </p>
                      <p className="text-[9.5px] font-semibold text-[#16A34A]">
                        {revSharePct}% rev share
                      </p>
                    </div>

                    <div className="rounded-[var(--theme-radius-control)] border border-border-theme/70 bg-surface-muted/60 px-2.5 py-2 tabular-nums">
                      <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">
                        {caps.can_view_profit && activeProduct.fifo_valuation
                          ? 'FIFO Layer'
                          : 'Stock Cover'}
                      </p>
                      <p className="mt-0.5 font-mono text-[13px] font-extrabold text-ink truncate">
                        {caps.can_view_profit && activeProduct.fifo_valuation
                          ? formatMoney(activeProduct.fifo_valuation)
                          : `${coverMultiple}x`}
                      </p>
                      <p className="text-[9.5px] text-ink-muted">
                        {caps.can_view_profit && activeProduct.fifo_valuation
                          ? `${coverMultiple}x runway`
                          : `Min ${threshold} units`}
                      </p>
                    </div>
                  </div>

                  {/* Analytical Text Insights & Revenue Absorption Progress */}
                  <div className="rounded-[var(--theme-radius-control)] border border-border-theme/70 bg-surface-muted/45 p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="inline-flex items-center gap-1 font-bold text-ink">
                        <TrendingUp className="h-3.5 w-3.5 text-[#16A34A]" />
                        Performance Analysis
                      </span>
                      <span className="font-mono font-bold text-[#16A34A] tabular-nums">
                        {revSharePct}% of total revenue
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-border-theme/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#16A34A] to-[#22C55E] transition-all duration-500"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>

                    <p className="text-[11px] leading-relaxed text-ink-muted">
                      Driving <strong className="text-ink">{revSharePct}%</strong> of{' '}
                      {overview.period_label.toLowerCase()} revenue across{' '}
                      <strong className="text-ink">{unitsValue}</strong> units.{' '}
                      {isHealthyStock
                        ? `Stock buffer sits ${stockValue - threshold} units above reorder level (${coverMultiple}x cycle coverage).`
                        : `Inventory is near or below the ${threshold}-unit reorder threshold — prioritize replenishment.`}
                    </p>
                  </div>
                </>
              );
            })()}

            {onNavigate && (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <Badge variant="outline" className="text-[10px]">
                  <Layers className="mr-1 h-3 w-3 text-accent" />
                  {activeProduct.category_name || 'Catalog'}
                </Badge>
                <Button
                  type="button"
                  size="xs"
                  variant="lavender"
                  onClick={() => onNavigate(primaryActionRoute)}
                >
                  {caps.can_view_catalog ? 'Open Catalog' : 'Open POS'}
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </section>
        </ScrollReveal>
      )}

      {/* CARD 2: Secondary Full-Bleed Visual Restock & Demand Digest */}
      {showSecondaryDigest && digestTiles.length > 0 && (
        <ScrollReveal delayMs={110}>
          <section
            data-testid="overview-demand-visual-card"
            className="zona-card h-full flex flex-col justify-between p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Boxes className="h-3.5 w-3.5 text-accent" />
                  <h3 className="truncate text-[13px] font-bold text-ink">
                    Demand &amp; Replenishment Watch
                  </h3>
                </div>
                <p className="truncate text-[10.5px] text-ink-muted">
                  Live SKU stock depth paired with category velocity
                </p>
              </div>
              {topCategory && (
                <Badge variant="positive" className="shrink-0 text-[9.5px]">
                  Top: {topCategory.category_name}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {digestTiles.map((tile) => (
                <article
                  key={tile.id}
                  className="group flex flex-col justify-between overflow-hidden rounded-[var(--theme-radius-inner)] border border-border-theme/80 bg-surface-muted/55"
                >
                  {/* Full-Bleed Card Header Image (No White Padding) */}
                  <div className="relative h-24 w-full overflow-hidden bg-sidebar">
                    <img
                      src={tile.imageUrl}
                      alt={tile.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#16151A]/90 via-black/30 to-transparent" />
                    <span
                      className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold ${
                        tile.isUrgent
                          ? 'bg-[#EF4444] text-white'
                          : 'bg-black/70 text-white backdrop-blur-sm'
                      }`}
                    >
                      {tile.isUrgent && <AlertTriangle className="h-2.5 w-2.5" />}
                      {tile.badgeText}
                    </span>
                    <div className="absolute inset-x-2.5 bottom-2 text-white">
                      <p className="truncate text-[9px] font-bold uppercase tracking-wider text-white/75">
                        {tile.categoryName}
                      </p>
                      <p className="truncate text-[12px] font-bold leading-tight text-white">
                        {tile.name}
                      </p>
                    </div>
                  </div>

                  {/* Analytical Text Footer */}
                  <div className="p-2.5 space-y-1">
                    <p className="truncate font-mono text-[10px] font-bold text-ink tabular-nums">
                      {tile.metricLine}
                    </p>
                    <p className="text-[10px] leading-snug text-ink-muted line-clamp-2">
                      {tile.insightText}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            {onNavigate && (
              <div className="flex items-center justify-between gap-2 border-t border-border-theme/60 pt-2.5 text-[10.5px] text-ink-muted">
                <span>
                  {overview.inventory_summary
                    ? `${overview.inventory_summary.active_sku_count} active SKUs • ${overview.inventory_summary.low_stock_count} low alerts`
                    : `${overview.product_sales?.length || 0} tracked catalog SKUs`}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate(secondaryActionRoute)}
                  className="inline-flex items-center gap-1 font-bold text-accent hover:underline cursor-pointer"
                >
                  {caps.can_view_inventory ? (
                    <>
                      <Boxes className="h-3 w-3" />
                      Stock Matrix
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="h-3 w-3" />
                      POS Checkout
                    </>
                  )}
                </button>
              </div>
            )}
          </section>
        </ScrollReveal>
      )}
    </div>
  );
}

