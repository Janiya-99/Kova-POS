import * as React from 'react';
import { TrendingUp } from 'lucide-react';
import { GlowingDotMatrixChart, type DotMatrixDatum } from '@/components/charts/ModernCharts';
import { useCurrency } from '@/hooks/useCurrency';
import { resolveEffectiveIndustryProfile } from '@/lib/branchAccess';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore, getThemeDefinition } from '@/store/themeStore';
import type { OverviewPeriod, OverviewRolePersona, SalesAnalyticsPoint } from '../types';

interface SalesAnalyticsCardProps {
  data: SalesAnalyticsPoint[];
  period: OverviewPeriod;
  periodLabel: string;
  persona: OverviewRolePersona;
  canViewProfit?: boolean;
  canViewTaxDetail?: boolean;
}

type ChartViewMode = 'revenue' | 'units' | 'financial';

export function SalesAnalyticsCard({
  data,
  periodLabel,
  persona,
  canViewProfit = false,
  canViewTaxDetail = false,
}: SalesAnalyticsCardProps) {
  const { formatMoney } = useCurrency();
  const { context, resolvedSettings, businesses } = useAuthStore();
  const industryProfile = resolveEffectiveIndustryProfile(context, resolvedSettings, businesses);
  const { themeId, customAccent, colorMode } = useThemeStore();
  const theme = getThemeDefinition(themeId);
  const accentHex = customAccent || theme.tokens['--theme-accent'];
  const secondaryHex = '#22C55E';

  const defaultMode: ChartViewMode =
    persona === 'INVENTORY' ? 'units' : persona === 'ACCOUNTANT' && canViewProfit ? 'financial' : 'revenue';

  const [mode, setMode] = React.useState<ChartViewMode>(defaultMode);

  React.useEffect(() => {
    setMode(
      persona === 'INVENTORY'
        ? 'units'
        : persona === 'ACCOUNTANT' && canViewProfit
          ? 'financial'
          : 'revenue',
    );
  }, [persona, canViewProfit]);

  const subtitle =
    mode === 'revenue'
      ? `Net sales velocity (${periodLabel})`
      : mode === 'units'
        ? `Units sold across merchandising segments (${periodLabel})`
        : `Revenue vs COGS & Tax outflow (${periodLabel})`;

  const matrixData: DotMatrixDatum[] = React.useMemo(() => {
    return data.map((point) => {
      if (mode === 'revenue') {
        return {
          label: point.label,
          primaryValue: Number(point.revenue || 0),
          secondaryValue: Number(point.orders || 0) * 10,
          primaryFormatted: formatMoney(point.revenue || 0),
          secondaryFormatted: String(point.orders || 0),
        };
      }
      if (mode === 'units') {
        const unitsTotal = Number(point.sold || 0) || Number(point.women || 0) + Number(point.men || 0);
        return {
          label: point.label,
          primaryValue: unitsTotal,
          secondaryValue: industryProfile === 'retail' ? Number(point.women || 0) : Number(point.orders || 0),
          tertiaryValue: Number(point.returned || 0),
          primaryFormatted: `${unitsTotal} pcs`,
          secondaryFormatted:
            industryProfile === 'retail'
              ? `W:${point.women || 0} M:${point.men || 0}`
              : `${point.orders || 0} orders`,
          tertiaryFormatted: `${point.returned || 0} ret`,
        };
      }
      const rev = Number(point.revenue || 0);
      const cogs = Number(point.cogs || 0);
      const taxes = Number(point.taxes || 0);
      return {
        label: point.label,
        primaryValue: rev,
        secondaryValue: Math.max(0, rev - cogs),
        tertiaryValue: taxes,
        primaryFormatted: formatMoney(rev),
        secondaryFormatted: formatMoney(Math.max(0, rev - cogs)),
        tertiaryFormatted: formatMoney(taxes),
      };
    });
  }, [data, mode, formatMoney, industryProfile]);

  const summary = React.useMemo(() => {
    const totalRev = data.reduce((s, d) => s + Number(d.revenue || 0), 0);
    const totalOrders = data.reduce((s, d) => s + Number(d.orders || 0), 0);
    const totalUnits = data.reduce((s, d) => s + (Number(d.sold || 0) || Number(d.women || 0) + Number(d.men || 0)), 0);
    const totalCogs = data.reduce((s, d) => s + Number(d.cogs || 0), 0);
    const totalTax = data.reduce((s, d) => s + Number(d.taxes || 0), 0);

    if (mode === 'units') {
      const returned = data.reduce((s, d) => s + Number(d.returned || 0), 0);
      const netRate = totalUnits > 0 ? Math.min(100, Math.round(((totalUnits - returned) / totalUnits) * 100)) : 100;
      return {
        leftLabel: 'Sold Volume',
        leftValue: `${totalUnits} pcs`,
        rightLabel: 'Net Fulfilled',
        rightValue: `${netRate}% (${totalOrders} orders)`,
        progressPct: netRate,
        barColor: secondaryHex,
      };
    }

    if (mode === 'financial') {
      const grossProfit = Math.max(0, totalRev - totalCogs);
      const marginPct = totalRev > 0 ? Math.min(100, Math.round((grossProfit / totalRev) * 100)) : 0;
      return {
        leftLabel: 'Gross Margin',
        leftValue: formatMoney(grossProfit),
        rightLabel: canViewTaxDetail ? 'COGS + Tax' : 'COGS',
        rightValue: formatMoney(canViewTaxDetail ? totalCogs + totalTax : totalCogs),
        progressPct: marginPct,
        barColor: secondaryHex,
      };
    }

    const peakBucket = Math.max(0, ...data.map((d) => Number(d.revenue || 0)));
    const avgBucket = data.length > 0 ? totalRev / data.length : 0;
    const fillPct = peakBucket > 0 ? Math.min(100, Math.max(12, Math.round((avgBucket / peakBucket) * 100))) : 0;

    return {
      leftLabel: 'Period Revenue',
      leftValue: formatMoney(totalRev),
      rightLabel: `Peak • ${totalOrders} orders`,
      rightValue: formatMoney(peakBucket),
      progressPct: fillPct,
      barColor: colorMode === 'dark' ? '#22C55E' : '#22C55E',
    };
  }, [data, mode, formatMoney, canViewTaxDetail, colorMode]);

  return (
    <section
      className="zona-card flex h-full flex-col justify-between gap-4 p-5 sm:p-6"
      data-testid="sales-analytics-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted border border-border-theme/70">
            <TrendingUp className="h-4 w-4 text-accent" />
          </span>
          <div>
            <h2 className="text-[16px] font-bold tracking-tight text-ink">Sales Analytics</h2>
            <p className="text-[11px] text-ink-muted">{subtitle}</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-1 text-[11px]">
          <button
            type="button"
            onClick={() => setMode('revenue')}
            className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
              mode === 'revenue'
                ? 'bg-contrast text-contrast-fg shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Revenue
          </button>
          <button
            type="button"
            onClick={() => setMode('units')}
            className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
              mode === 'units'
                ? 'bg-contrast text-contrast-fg shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Units
          </button>
          {(canViewProfit || canViewTaxDetail) && (
            <button
              type="button"
              onClick={() => setMode('financial')}
              className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                mode === 'financial'
                  ? 'bg-contrast text-contrast-fg shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Margin &amp; COGS
            </button>
          )}
        </div>
      </div>

      {/* Modern Glowing Dot-Matrix Visualization (Statistic Card Style) */}
      <GlowingDotMatrixChart
        data={matrixData}
        rows={7}
        primaryLabel={mode === 'revenue' ? 'Revenue' : mode === 'units' ? 'Sold' : 'Revenue'}
        secondaryLabel={mode === 'revenue' ? 'Orders' : mode === 'units' ? (industryProfile === 'retail' ? 'Mix' : 'Orders') : 'Profit'}
        tertiaryLabel={mode === 'financial' && canViewTaxDetail ? 'Tax' : undefined}
        primaryColor={accentHex}
        secondaryColor={secondaryHex}
        heightClass="h-[225px]"
      />

      {/* Footer Split Telemetry + Smooth Neon Capsule Progress */}
      <div className="space-y-2 border-t border-border-theme/70 pt-3">
        <div className="flex items-end justify-between gap-3 tabular-nums">
          <div>
            <p className="text-[10.5px] font-medium text-ink-muted">{summary.leftLabel}</p>
            <p className="text-[16px] font-extrabold text-ink leading-tight">{summary.leftValue}</p>
          </div>
          <div className="text-right">
            <p className="text-[10.5px] font-medium text-ink-muted">{summary.rightLabel}</p>
            <p className="text-[16px] font-extrabold text-ink leading-tight">{summary.rightValue}</p>
          </div>
        </div>

        <div className="h-3 w-full overflow-hidden rounded-full bg-surface-muted p-0.5">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.max(8, summary.progressPct)}%`,
              backgroundColor: summary.barColor,
              boxShadow: `0 0 12px ${summary.barColor}70`,
            }}
          />
        </div>
      </div>
    </section>
  );
}
