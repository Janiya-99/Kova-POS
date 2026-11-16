import * as React from 'react';
import { CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GlowingRadialGauge, SegmentedCapsuleBar } from '@/components/charts/ModernCharts';
import { useCurrency } from '@/hooks/useCurrency';
import { useThemeStore, getThemeDefinition } from '@/store/themeStore';
import { formatDisplayLabel } from '@/lib/formatLabel';
import type { PaymentMixItem } from '../types';

interface PaymentMixCardProps {
  items: PaymentMixItem[];
  periodLabel: string;
}

export function PaymentMixCard({ items, periodLabel }: PaymentMixCardProps) {
  const { formatMoney } = useCurrency();
  const { themeId, customAccent, colorMode } = useThemeStore();
  const theme = getThemeDefinition(themeId);
  const accentHex = customAccent || theme.tokens['--theme-accent'];
  const secondaryHex =
    colorMode === 'dark' ? '#E2DFEE' : theme.tokens['--theme-contrast-card'] || '#222026';

  const palette = [accentHex, '#22C55E', secondaryHex, '#F59E0B', '#A855F7'];

  const [hoveredMethod, setHoveredMethod] = React.useState<string | null>(null);

  const normalizedItems = React.useMemo(
    () =>
      items.map((item, idx) => {
        const amount = Number.parseFloat(item.total_collected || '0') || 0;
        const pct = Math.min(100, Math.max(0, Number.parseFloat(item.share_pct || '0') || 0));
        return {
          ...item,
          displayLabel: formatDisplayLabel(item.payment_method || 'Other') || 'Other',
          amount,
          pct,
          color: palette[idx % palette.length],
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, accentHex, colorMode],
  );

  const totalTx = normalizedItems.reduce((acc, row) => acc + (Number(row.tx_count) || 0), 0);
  const totalCollected = normalizedItems.reduce((acc, row) => acc + row.amount, 0);
  const spotlight =
    normalizedItems.find((r) => r.payment_method === hoveredMethod) || normalizedItems[0];

  const gaugeSegments = normalizedItems.map((r) => ({
    id: r.payment_method,
    label: r.displayLabel,
    value: r.amount > 0 ? r.amount : r.tx_count,
    color: r.color,
  }));

  return (
    <section
      className="zona-card flex h-full flex-col justify-between gap-4 p-5"
      data-testid="payment-mix-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-bold text-ink">Payment Tender Mix</h3>
          <p className="text-[11px] text-ink-muted">{periodLabel} settled methods</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted border border-border-theme/70">
          <CreditCard className="h-4 w-4 text-accent" />
        </span>
      </div>

      {normalizedItems.length === 0 ? (
        <div className="flex flex-1 min-h-[160px] flex-col items-center justify-center rounded-[var(--theme-radius-inner)] bg-surface-muted/70 px-4 py-6 text-center">
          <p className="text-xs font-semibold text-ink">No tender breakdown yet</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            Completed Card, Cash, and Split settlements appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-4">
          {/* Glowing Multi-Arc Gauge + Dominant Method Spotlight */}
          <div className="flex flex-col sm:flex-row items-center gap-4 rounded-[var(--theme-radius-inner)] border border-border-theme/60 bg-surface-muted/45 p-3.5">
            <GlowingRadialGauge
              segments={gaugeSegments}
              centerEyebrow={spotlight ? `${Math.round(spotlight.pct)}%` : 'Settled'}
              centerValue={String(totalTx)}
              activeId={hoveredMethod}
              onHoverId={setHoveredMethod}
              size={128}
              strokeWidth={11}
            />

            <div className="flex-1 min-w-0 w-full space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: spotlight?.color || accentHex }}
                  />
                  {hoveredMethod ? 'Focused Tender' : 'Leading Tender'}
                </span>
                {spotlight && (
                  <Badge variant="positive" className="px-2 py-0.5 text-[10px] tabular-nums">
                    {spotlight.pct.toFixed(0)}% share
                  </Badge>
                )}
              </div>

              <div>
                <p className="truncate text-[15px] font-extrabold text-ink">
                  {spotlight?.displayLabel}
                </p>
                <p className="text-[20px] font-extrabold tracking-tight text-ink tabular-nums leading-tight">
                  {formatMoney(spotlight?.amount ?? totalCollected)}
                </p>
              </div>

              <p className="text-[11px] text-ink-muted tabular-nums">
                {spotlight?.tx_count || 0} tx • Total {formatMoney(totalCollected)}
              </p>
            </div>
          </div>

          {/* Segmented Proportional Bar */}
          <SegmentedCapsuleBar
            segments={normalizedItems.map((r) => ({
              id: r.payment_method,
              label: r.displayLabel,
              pct: r.pct > 0 ? r.pct : 1,
              color: r.color,
            }))}
            activeId={hoveredMethod}
            onHoverId={setHoveredMethod}
            className="h-3"
          />

          {/* Interactive Method Pills */}
          <div className="space-y-2">
            {normalizedItems.map((row) => {
              const isFocused = hoveredMethod === row.payment_method;
              return (
                <div
                  key={row.payment_method}
                  onMouseEnter={() => setHoveredMethod(row.payment_method)}
                  onMouseLeave={() => setHoveredMethod(null)}
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
                        backgroundColor: row.color,
                        boxShadow: isFocused ? `0 0 10px ${row.color}` : undefined,
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink">{row.displayLabel}</p>
                      <p className="text-[10.5px] text-ink-muted tabular-nums">
                        {row.tx_count} {row.tx_count === 1 ? 'transaction' : 'transactions'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
                    <span className="font-extrabold text-ink">{formatMoney(row.amount)}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                      style={{
                        backgroundColor: `${row.color}20`,
                        color: row.color,
                      }}
                    >
                      {Math.round(row.pct)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Flush Bottom Summary Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border-theme/70 pt-3 text-[11px] text-ink-muted tabular-nums">
        <span>
          {totalTx} settled {totalTx === 1 ? 'transaction' : 'transactions'}
        </span>
        <span className="font-semibold text-ink">
          Total {formatMoney(totalCollected)}
        </span>
      </div>
    </section>
  );
}
