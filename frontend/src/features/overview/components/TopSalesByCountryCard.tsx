import * as React from 'react';
import { Globe2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GlowingRadialGauge, SegmentedCapsuleBar } from '@/components/charts/ModernCharts';
import { useCurrency } from '@/hooks/useCurrency';
import { useT } from '@/store/i18nStore';
import { useThemeStore, getThemeDefinition } from '@/store/themeStore';
import { formatDisplayLabel } from '@/lib/formatLabel';
import type { CountrySalesPoint } from '../types';

interface TopSalesByCountryCardProps {
  countries: CountrySalesPoint[];
  periodLabel?: string;
}

export function TopSalesByCountryCard({
  countries,
  periodLabel = 'Selected period',
}: TopSalesByCountryCardProps) {
  const { formatMoney, currencyCode } = useCurrency();
  const { t } = useT();
  const { themeId, customAccent, colorMode } = useThemeStore();
  const theme = getThemeDefinition(themeId);
  const accentHex = customAccent || theme.tokens['--theme-accent'];
  const contrastHex =
    colorMode === 'dark' ? '#E2DFEE' : theme.tokens['--theme-contrast-card'] || '#222026';

  const palette = [accentHex, '#22C55E', contrastHex, '#F59E0B', '#A855F7'];
  const [hoveredCode, setHoveredCode] = React.useState<string | null>(null);

  const enriched = React.useMemo(
    () =>
      countries.map((c, idx) => ({
        ...c,
        displayName: c.country_name || formatDisplayLabel(c.country_code),
        cleanCode: formatDisplayLabel(c.country_code),
        numericRevenue: Number.parseFloat(c.revenue || '0') || 0,
        resolvedColor: c.color || palette[idx % palette.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countries, accentHex, colorMode],
  );

  const leadCountry = enriched[0];
  const focusedCountry =
    enriched.find((c) => c.country_code === hoveredCode) || leadCountry;

  const gaugeSegments = enriched.map((c) => ({
    id: c.country_code,
    label: c.displayName,
    value: Math.max(c.percentage, c.numericRevenue > 0 ? 1 : 0),
    color: c.resolvedColor,
  }));

  return (
    <section
      className="zona-card flex h-full flex-col justify-between gap-4 p-5"
      data-testid="top-sales-country-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-bold text-ink">{t.overview.topSalesByCountry}</h3>
          <p className="text-[11px] text-ink-muted">
            {periodLabel} • {currencyCode} share
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted border border-border-theme/70">
          <Globe2 className="h-4 w-4 text-accent" />
        </span>
      </div>

      {enriched.length === 0 ? (
        <div className="flex flex-1 min-h-[160px] flex-col items-center justify-center rounded-[var(--theme-radius-inner)] bg-surface-muted/70 px-4 py-6 text-center">
          <p className="text-xs font-semibold text-ink">No branch distribution yet</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            Branch share breakdowns appear after completed checkouts.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-4">
          {/* Glowing Radial Arc Gauge + Active Branch Spotlight */}
          <div className="flex flex-col sm:flex-row items-center gap-4 rounded-[var(--theme-radius-inner)] border border-border-theme/60 bg-surface-muted/45 p-3.5">
            <GlowingRadialGauge
              segments={gaugeSegments}
              centerEyebrow={hoveredCode ? 'Selected' : 'Top Share'}
              centerValue={`${focusedCountry?.percentage ?? 0}%`}
              activeId={hoveredCode}
              onHoverId={setHoveredCode}
              size={128}
              strokeWidth={11}
            />

            <div className="flex-1 min-w-0 w-full space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                  {hoveredCode ? 'Selected Store' : 'Top Store'}
                </span>
                <Badge variant="lavender" className="text-[10px] px-2 py-0">
                  {focusedCountry?.cleanCode}
                </Badge>
              </div>
              <p className="truncate text-[14.5px] font-extrabold text-ink">
                {focusedCountry?.displayName}
              </p>
              <p className="text-[19px] font-extrabold tracking-tight text-ink tabular-nums">
                {formatMoney(focusedCountry?.revenue ?? 0)}
              </p>
            </div>
          </div>

          <SegmentedCapsuleBar
            segments={enriched.map((c) => ({
              id: c.country_code,
              label: c.displayName,
              pct: Math.max(c.percentage, 1),
              color: c.resolvedColor,
            }))}
            activeId={hoveredCode}
            onHoverId={setHoveredCode}
            className="h-3"
          />

          <div className="space-y-2">
            {enriched.slice(0, 4).map((c) => {
              const isFocused = hoveredCode === c.country_code;
              return (
                <div
                  key={c.country_code}
                  onMouseEnter={() => setHoveredCode(c.country_code)}
                  onMouseLeave={() => setHoveredCode(null)}
                  className={`flex items-center justify-between gap-3 rounded-[var(--theme-radius-inner)] border px-3.5 py-2.5 text-xs transition-all cursor-default ${
                    isFocused
                      ? 'border-accent/55 bg-accent-soft/25 shadow-xs'
                      : 'border-border-theme/55 bg-surface-muted/75 hover:border-border-theme'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor: c.resolvedColor,
                        boxShadow: isFocused ? `0 0 10px ${c.resolvedColor}` : undefined,
                      }}
                    />
                    <span className="truncate font-semibold text-ink">{c.displayName}</span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
                    <span className="font-bold text-ink">{formatMoney(c.revenue)}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                      style={{
                        backgroundColor: `${c.resolvedColor}20`,
                        color: c.resolvedColor,
                      }}
                    >
                      {c.percentage}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border-theme/70 pt-3 text-[11px] text-ink-muted">
        <span>Active branches</span>
        <span className="font-bold text-ink tabular-nums">{enriched.length}</span>
      </div>
    </section>
  );
}
