import { AlertTriangle, Boxes, CheckCircle2 } from 'lucide-react';
import type { AppRoute } from '@/components/layout/FloatingSidebar';
import { Badge } from '@/components/ui/badge';
import { ScrollFadeList } from '@/components/dqnamo/ScrollFadeList';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import type { LowStockAlertItem } from '../types';

interface LowStockAlertsCardProps {
  alerts: LowStockAlertItem[];
  onNavigate?: (route: AppRoute) => void;
  canViewInventory?: boolean;
}

export function LowStockAlertsCard({
  alerts,
  onNavigate,
  canViewInventory = false,
}: LowStockAlertsCardProps) {
  return (
    <section
      className="zona-card flex h-full flex-col justify-between p-6"
      data-testid="low-stock-alerts-card"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-bold tracking-[-0.01em] text-ink">
            Reorder &amp; Low Stock Watch
          </h3>
          <p className="text-[11px] text-ink-muted">
            SKUs at or below branch reorder thresholds
          </p>
        </div>
        <Badge variant={alerts.length > 0 ? 'negative' : 'positive'}>
          {alerts.length} alerts
        </Badge>
      </div>

      {alerts.length === 0 ? (
        <div className="my-4 flex flex-1 flex-col items-center justify-center rounded-[var(--theme-radius-inner)] bg-surface-muted/70 p-6 text-center">
          <CheckCircle2 className="mb-2 h-6 w-6 text-[#22C55E]" />
          <p className="text-xs font-semibold text-ink">All active SKUs healthy</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            On-hand FIFO layers exceed reorder thresholds across locations.
          </p>
        </div>
      ) : (
        <ScrollFadeList maxHeightClass="max-h-[255px]" className="space-y-2.5 pr-1">
          {alerts.map((item) => {
            const onHand = Number(item.total_stock) || 0;
            const target = Math.max(Number(item.reorder_point) || 1, 1);
            const pct = Math.min(100, Math.round((onHand / target) * 100));

            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-[var(--theme-radius-inner)] border border-border-theme/70 bg-surface-muted px-3.5 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <img
                    src={item.image_url || '/products/cardigan.svg'}
                    alt={item.name}
                    className="h-10 w-10 shrink-0 rounded-[10px] border border-border-theme bg-surface object-cover p-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-ink">{item.name}</p>
                      {item.open_po_count > 0 && (
                        <Badge variant="lavender" className="px-1.5 py-0 text-[9.5px]">
                          {item.open_po_count} PO
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10.5px] text-ink-muted truncate font-mono">
                      {item.sku} • {item.category_name}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                      <div
                        className={`h-full rounded-full ${
                          onHand <= 0 ? 'bg-[#EF4444]' : 'bg-[#F59E0B]'
                        }`}
                        style={{ width: `${Math.max(8, pct)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 tabular-nums">
                  <p className="inline-flex items-center gap-1 text-xs font-extrabold text-[#EF4444]">
                    <AlertTriangle className="h-3 w-3" />
                    {onHand}
                  </p>
                  <p className="text-[10px] text-ink-muted">min {item.reorder_point}</p>
                </div>
              </div>
            );
          })}
        </ScrollFadeList>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-theme/70 pt-3">
        <span className="text-[11px] text-ink-muted">
          Auto-drafted PO suggestions sync with FIFO intake
        </span>
        {canViewInventory && onNavigate && (
          <DynamicButton
            variant="obsidian"
            icon={<Boxes className="h-3.5 w-3.5" />}
            onClick={() => onNavigate('/inventory')}
            className="min-h-[34px] px-3 py-1.5 text-xs"
            data-testid="open-inventory-alerts-btn"
          >
            Open GRN
          </DynamicButton>
        )}
      </div>
    </section>
  );
}

