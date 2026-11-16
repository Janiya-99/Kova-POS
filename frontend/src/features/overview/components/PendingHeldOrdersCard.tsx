import { Clock3, PauseCircle, Store } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollFadeList } from '@/components/dqnamo/ScrollFadeList';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { useCurrency } from '@/hooks/useCurrency';
import type { HeldOrderItem } from '../types';

interface PendingHeldOrdersCardProps {
  heldOrders: HeldOrderItem[];
  onOpenPOS: () => void;
  canUsePOS?: boolean;
}

function getInitials(name: string): string {
  const parts = (name || 'WG').trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return (parts[0] || 'WG').slice(0, 2).toUpperCase();
}

function formatHeldElapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function PendingHeldOrdersCard({
  heldOrders,
  onOpenPOS,
  canUsePOS = false,
}: PendingHeldOrdersCardProps) {
  const { formatMoney } = useCurrency();

  return (
    <section
      className="zona-card flex h-full flex-col justify-between p-6"
      data-testid="pending-held-orders-card"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-bold tracking-[-0.01em] text-ink">
            Pending &amp; Held Orders
          </h3>
          <p className="text-[11px] text-ink-muted">
            Suspended POS tickets &amp; open register tabs
          </p>
        </div>
        <Badge variant={heldOrders.length > 0 ? 'lavender' : 'outline'}>
          {heldOrders.length} pending
        </Badge>
      </div>

      {heldOrders.length === 0 ? (
        <div className="my-4 flex flex-1 flex-col items-center justify-center rounded-[var(--theme-radius-inner)] bg-surface-muted/70 p-6 text-center">
          <PauseCircle className="mb-2 h-6 w-6 text-ink-muted opacity-60" />
          <p className="text-xs font-semibold text-ink">All branch bills cleared</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            No suspended or pending tickets waiting at checkout.
          </p>
        </div>
      ) : (
        <ScrollFadeList maxHeightClass="max-h-[255px]" className="space-y-2.5 pr-1">
          {heldOrders.map((bill) => {
            const thumbs =
              bill.item_images && bill.item_images.length > 0
                ? bill.item_images
                : ['/products/cardigan.svg'];
            const tagLabel =
              bill.table_or_bay_label ||
              bill.vehicle_plate ||
              (bill.order_channel && bill.order_channel !== 'POS' ? bill.order_channel : '') ||
              bill.terminal_name;

            return (
              <div
                key={bill.id}
                className="flex items-center justify-between gap-3 rounded-[var(--theme-radius-inner)] border border-border-theme/70 bg-surface-muted px-3.5 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={bill.customer_avatar || undefined} alt={bill.customer_name} />
                    <AvatarFallback>
                      {getInitials(bill.customer_name || 'Walk-in Guest')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-ink">
                        {bill.customer_name || 'Walk-in Guest'}
                      </p>
                      <Badge variant="outline" className="px-1.5 py-0 text-[9.5px] font-mono">
                        {bill.hold_code}
                      </Badge>
                      {tagLabel && (
                        <Badge variant="lavender" className="px-1.5 py-0 text-[9.5px]">
                          {tagLabel}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                      {bill.preview_product_name
                        ? `${bill.preview_product_name} • `
                        : ''}
                      {bill.item_count} {bill.item_count === 1 ? 'item' : 'items'} •{' '}
                      <span className="inline-flex items-center gap-0.5">
                        <Clock3 className="h-2.5 w-2.5 inline" /> {formatHeldElapsed(bill.held_at)}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="hidden sm:flex -space-x-2">
                    {thumbs.slice(0, 3).map((src, idx) => (
                      <img
                        key={`${bill.id}-thumb-${idx}`}
                        src={src || '/products/cardigan.svg'}
                        alt={bill.preview_product_name || 'Item'}
                        className="h-7 w-7 rounded-full border-2 border-surface bg-surface object-cover"
                      />
                    ))}
                    {bill.item_count > thumbs.length && (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-accent-soft text-[10px] font-bold text-accent-soft-fg">
                        +{bill.item_count - thumbs.length}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-extrabold text-ink tabular-nums">
                      {formatMoney(bill.grand_total)}
                    </p>
                    <p className="text-[10px] text-ink-muted truncate max-w-[92px]">
                      {bill.cashier_name}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </ScrollFadeList>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-theme/70 pt-3">
        <span className="text-[11px] text-ink-muted">
          {heldOrders.length > 0 ? 'Tap POS register to recall any held ticket' : 'Ready for next customer'}
        </span>
        {canUsePOS && (
          <DynamicButton
            variant="lavender"
            icon={<Store className="h-3.5 w-3.5" />}
            onClick={onOpenPOS}
            className="min-h-[34px] px-3 py-1.5 text-xs"
            data-testid="resume-held-pos-btn"
          >
            Resume in POS
          </DynamicButton>
        )}
      </div>
    </section>
  );
}

