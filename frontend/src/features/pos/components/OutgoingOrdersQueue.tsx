import * as React from 'react';
import {
  ChefHat,
  Clock,
  PauseCircle,
  RotateCcw,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PerforatedTicket } from '@/components/dqnamo/PerforatedTicket';
import { ScrollFadeList } from '@/components/dqnamo/ScrollFadeList';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import { HoldToConfirm } from '@/components/dqnamo/HoldToConfirm';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { parseJSONField, type CartItemMeta, type HeldBillEntryDTO } from '../types';
import type { POSCapabilities } from './capabilities';

export interface OutgoingOrdersQueueProps {
  heldBills: HeldBillEntryDTO[];
  capabilities: POSCapabilities;
  formatMoney: (value: string | number) => string;
  onRecallBill: (entry: HeldBillEntryDTO) => void;
  onVoidHeldBill: (billId: string) => Promise<void> | void;
  onAdvanceKotStatus?: (entry: HeldBillEntryDTO, nextStatus: 'PREPARING' | 'READY') => Promise<void> | void;
}

const KOT_BADGE_MAP: Record<string, { label: string; className: string }> = {
  QUEUED: { label: 'KOT Queued', className: 'bg-[#FEF3C7] text-[#B45309]' },
  PREPARING: { label: 'Preparing', className: 'bg-accent-soft text-accent-soft-fg' },
  READY: { label: 'Ready to Serve', className: 'bg-[#DCFCE7] text-[#15803D]' },
};

function formatMetaBrief(rawMeta?: CartItemMeta | string | null): string {
  const meta = parseJSONField<CartItemMeta | null>(rawMeta, null);
  if (!meta) return '';
  const parts: string[] = [];
  if (meta.variant) parts.push(meta.variant);
  if (meta.uom_label) parts.push(meta.uom_label);
  if (meta.serial_imei) parts.push(`IMEI ${meta.serial_imei}`);
  if (meta.modifiers?.length) parts.push(meta.modifiers.join(', '));
  return parts.join(' • ');
}

/**
 * Pane 3: Symmetrical queue of PerforatedTicket cards for Held Bills, Kitchen KOTs,
 * Active Service Bays, or Saved Quotations.
 */
export function OutgoingOrdersQueue({
  heldBills,
  capabilities,
  formatMoney,
  onRecallBill,
  onVoidHeldBill,
  onAdvanceKotStatus,
}: OutgoingOrdersQueueProps) {
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | 'PREPARING' | 'READY'>('ALL');

  const filteredBills = React.useMemo(() => {
    if (!capabilities.enableKot || statusFilter === 'ALL') return heldBills;
    return heldBills.filter((b) => {
      const st = (b.bill.kot_status || 'QUEUED').toUpperCase();
      if (statusFilter === 'PREPARING') return st === 'QUEUED' || st === 'PREPARING';
      return st === 'READY';
    });
  }, [heldBills, capabilities.enableKot, statusFilter]);

  const HeaderIcon = capabilities.enableKot
    ? capabilities.layoutMode === 'garage'
      ? Wrench
      : ChefHat
    : PauseCircle;

  return (
    <section
      data-testid="pos-pane-outgoing"
      aria-label={capabilities.preset.outgoingTitle}
      className="flex h-full min-h-0 flex-col rounded-[22px] border border-border-theme/70 bg-white p-4 shadow-xs"
    >
      <div className="shrink-0 space-y-2.5 pb-3.5 border-b border-border-theme/60">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-accent-soft text-accent-soft-fg">
              <HeaderIcon className="h-4 w-4" />
            </span>
            <h2 className="truncate text-[13px] font-extrabold text-[#222026]">
              {capabilities.preset.outgoingTitle}
            </h2>
          </div>
          <Badge variant="outline" className="shrink-0 tabular-nums">
            {heldBills.length}
          </Badge>
        </div>

        {capabilities.enableKot && heldBills.length > 0 && (
          <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-[#F5F6FA] p-1">
            {(
              [
                { id: 'ALL', label: 'All' },
                { id: 'PREPARING', label: 'Active' },
                { id: 'READY', label: 'Ready' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`min-h-[26px] rounded-[7px] text-[10px] font-bold transition-colors cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-[#222026] text-white'
                    : 'text-ink-muted hover:text-[#222026]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <ScrollFadeList
        containerClassName="flex-1 min-h-0 pt-1"
        maxHeightClass="max-h-full"
        className="space-y-3.5 py-2.5 pr-1"
      >
        {filteredBills.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-[16px] border border-dashed border-border-theme bg-[#F5F6FA]/60 px-4 py-8 text-center">
            <Clock className="mb-2 h-5 w-5 text-accent/75" />
            <p className="text-[11.5px] font-semibold text-[#222026]">Queue Empty</p>
            <p className="mt-1 text-[10.5px] text-ink-muted leading-snug">
              {capabilities.preset.outgoingEmptyText}
            </p>
          </div>
        ) : (
          filteredBills.map((entry) => {
            const kotKey = (entry.bill.kot_status || 'NONE').toUpperCase();
            const kotMeta = capabilities.enableKot ? KOT_BADGE_MAP[kotKey] : undefined;
            const channelBadge =
              entry.bill.table_or_bay_label ||
              (entry.bill.order_channel ? formatDisplayLabel(entry.bill.order_channel) : '') ||
              entry.bill.terminal_name ||
              'POS-01';
            const subtitleParts = [
              entry.bill.customer_name || 'Walk-in Guest',
              entry.bill.vehicle_plate ? entry.bill.vehicle_plate : '',
            ].filter(Boolean);

            const nextKot: 'PREPARING' | 'READY' | null =
              capabilities.enableKot && kotKey === 'QUEUED'
                ? 'PREPARING'
                : capabilities.enableKot && kotKey === 'PREPARING'
                  ? 'READY'
                  : null;

            return (
              <PerforatedTicket
                key={entry.bill.id}
                data-testid={`outgoing-ticket-${entry.bill.hold_code}`}
                code={entry.bill.hold_code}
                badge={channelBadge}
                subtitle={subtitleParts.join(' • ')}
                amount={formatMoney(entry.bill.grand_total)}
                footer={
                  <div className="space-y-1.5 w-full">
                    {kotMeta && (
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[9.5px] font-bold ${kotMeta.className}`}
                        >
                          {kotMeta.label}
                        </span>
                        {nextKot && onAdvanceKotStatus && (
                          <button
                            type="button"
                            onClick={() => void onAdvanceKotStatus(entry, nextKot)}
                            className="text-[10px] font-extrabold text-accent hover:underline cursor-pointer"
                          >
                            {nextKot === 'PREPARING' ? 'Start Prep →' : 'Mark Ready ✓'}
                          </button>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                      <TactileButton
                        tone="obsidian"
                        data-testid={`recall-ticket-${entry.bill.hold_code}`}
                        onClick={() => onRecallBill(entry)}
                        className="min-h-[38px] px-2.5 py-1.5 text-[11px]"
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Recall
                      </TactileButton>
                      <HoldToConfirm
                        label="Void"
                        holdingLabel="Hold..."
                        variant="muted"
                        durationMs={1000}
                        icon={<Trash2 className="h-3 w-3" />}
                        onConfirm={() => void onVoidHeldBill(entry.bill.id)}
                        className="min-h-[38px] px-2.5 py-1.5 text-[11px]"
                      />
                    </div>
                  </div>
                }
              >
                <div className="space-y-2">
                  {entry.items.slice(0, 3).map((it) => {
                    const metaBrief = formatMetaBrief(it.item_meta_json);
                    return (
                      <div key={it.id} className="text-[10.5px] leading-tight text-[#222026]">
                        <div className="flex items-baseline justify-between gap-1.5">
                          <span className="truncate font-semibold">
                            {it.qty}× {it.product_name}
                          </span>
                          <span className="shrink-0 font-bold text-ink-muted tabular-nums">
                            {formatMoney(it.unit_price)}
                          </span>
                        </div>
                        {metaBrief && (
                          <p className="truncate text-[9.5px] text-accent">{metaBrief}</p>
                        )}
                      </div>
                    );
                  })}
                  {entry.items.length > 3 && (
                    <p className="text-[9.5px] font-semibold text-ink-muted">
                      +{entry.items.length - 3} more item{entry.items.length - 3 === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
              </PerforatedTicket>
            );
          })
        )}
      </ScrollFadeList>
    </section>
  );
}

