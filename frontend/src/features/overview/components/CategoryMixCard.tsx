import * as React from 'react';
import { Tags } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SegmentedCapsuleBar } from '@/components/charts/ModernCharts';
import { useCurrency } from '@/hooks/useCurrency';
import { useThemeStore, getThemeDefinition } from '@/store/themeStore';
import { formatDisplayLabel } from '@/lib/formatLabel';
import type { CategoryMixItem } from '../types';

interface CategoryMixCardProps {
  items: CategoryMixItem[];
  periodLabel: string;
  hideRevenue?: boolean;
}

export function CategoryMixCard({
  items,
  periodLabel,
  hideRevenue = false,
}: CategoryMixCardProps) {
  const { formatMoney } = useCurrency();
  const { themeId, customAccent, colorMode } = useThemeStore();
  const theme = getThemeDefinition(themeId);
  const accentHex = customAccent || theme.tokens['--theme-accent'];
  const secondaryHex =
    colorMode === 'dark' ? '#E2DFEE' : theme.tokens['--theme-contrast-card'] || '#222026';

  const palette = [accentHex, '#22C55E', secondaryHex, '#F59E0B', '#A855F7'];
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const totalUnits = items.reduce((acc, item) => acc + (Number(item.units_sold) || 0), 0);
  const maxUnits = Math.max(...items.map((item) => Number(item.units_sold) || 0), 1);

  return (
    <section
      className="zona-card flex h-full flex-col justify-between gap-4 p-5"
      data-testid="category-mix-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-bold text-ink">Category Velocity</h3>
          <p className="text-[11px] text-ink-muted">{periodLabel} units &amp; mix</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted border border-border-theme/70">
          <Tags className="h-4 w-4 text-accent" />
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 min-h-[160px] flex-col items-center justify-center rounded-[var(--theme-radius-inner)] bg-surface-muted/70 px-4 py-6 text-center">
          <p className="text-xs font-semibold text-ink">No category movement recorded</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            Sold unit distribution by product category appears automatically.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-3.5">
          {/* Proportional Overview Capsule */}
          <div className="space-y-2 rounded-[var(--theme-radius-inner)] border border-border-theme/55 bg-surface-muted/45 p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-ink-muted">Category Share Split</span>
              <span className="font-extrabold text-ink tabular-nums">{totalUnits} units</span>
            </div>
            <SegmentedCapsuleBar
              segments={items.slice(0, 5).map((item, idx) => ({
                id: item.id,
                label: item.category_name,
                pct: totalUnits > 0 ? ((Number(item.units_sold) || 0) / totalUnits) * 100 : 20,
                color: palette[idx % palette.length],
              }))}
              activeId={hoveredId}
              onHoverId={setHoveredId}
              className="h-3"
            />
          </div>

          <div className="space-y-2.5">
            {items.slice(0, 5).map((item, idx) => {
              const color = palette[idx % palette.length];
              const pct = Math.min(100, Math.round(((Number(item.units_sold) || 0) / maxUnits) * 100));
              const sharePct = totalUnits > 0 ? Math.round(((Number(item.units_sold) || 0) / totalUnits) * 100) : 0;
              const isFocused = hoveredId === item.id;

              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`rounded-[var(--theme-radius-inner)] border px-3.5 py-2.5 transition-all cursor-default ${
                    isFocused
                      ? 'border-accent/55 bg-accent-soft/20'
                      : 'border-border-theme/55 bg-surface-muted/65'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: color,
                          boxShadow: isFocused ? `0 0 8px ${color}` : undefined,
                        }}
                      />
                      <span className="truncate font-bold text-ink">{item.category_name}</span>
                      <Badge variant="outline" className="text-[9.5px] px-1.5 py-0">
                        {formatDisplayLabel(item.gender_segment)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 tabular-nums">
                      <span className="font-bold text-ink">{item.units_sold} pcs</span>
                      {!hideRevenue && (
                        <span className="text-[11px] font-medium text-ink-muted">
                          {formatMoney(item.revenue)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(pct, 6)}%`,
                        backgroundColor: color,
                        boxShadow: isFocused ? `0 0 10px ${color}` : undefined,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-end text-[9.5px] font-semibold text-ink-muted tabular-nums">
                    {sharePct}% of volume
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border-theme/70 pt-3 text-[11px] text-ink-muted tabular-nums">
        <span>{items.length} active categories</span>
        <span className="font-bold text-ink">{totalUnits} units sold</span>
      </div>
    </section>
  );
}
