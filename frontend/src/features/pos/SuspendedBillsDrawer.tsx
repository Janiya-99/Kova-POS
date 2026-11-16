import { RotateCcw, Trash2, Ticket } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PerforatedTicket } from '@/components/dqnamo/PerforatedTicket';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import { HoldToConfirm } from '@/components/dqnamo/HoldToConfirm';
import { useCurrency } from '@/hooks/useCurrency';
import type { HeldBillEntryDTO } from './types';

interface SuspendedBillsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heldBills: HeldBillEntryDTO[];
  onRecall: (entry: HeldBillEntryDTO) => void;
  onVoidHeldBill: (billId: string) => void;
}

export function SuspendedBillsDrawer({
  open,
  onOpenChange,
  heldBills,
  onRecall,
  onVoidHeldBill,
}: SuspendedBillsDrawerProps) {
  const { formatMoney } = useCurrency();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <div className="mb-1 inline-flex items-center gap-2 text-xs font-bold text-accent">
            <Ticket className="h-4 w-4" />
            <span>Suspended Tickets ({heldBills.length})</span>
          </div>
          <SheetTitle>Held POS Bills</SheetTitle>
          <SheetDescription>
            Recall any parked bill back to the active register without losing FIFO inventory integrity.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 pb-6">
          {heldBills.length === 0 ? (
            <div className="rounded-[var(--theme-radius-inner)] bg-surface-muted p-6 text-center text-sm text-ink-muted">
              No suspended bills currently queued for this business.
            </div>
          ) : (
            heldBills.map((entry) => (
              <PerforatedTicket
                key={entry.bill.id}
                code={entry.bill.hold_code}
                badge={entry.bill.terminal_name || 'POS-01'}
                subtitle={`${entry.bill.customer_name || 'Walk-in Guest'} • ${new Date(
                  entry.bill.held_at
                ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                amount={formatMoney(entry.bill.grand_total)}
                footer={
                  <>
                    <HoldToConfirm
                      label="Hold to Void"
                      holdingLabel="Voiding..."
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onConfirm={() => onVoidHeldBill(entry.bill.id)}
                      className="px-3.5 text-xs"
                    />
                    <TactileButton
                      tone="obsidian"
                      onClick={() => {
                        onRecall(entry);
                        onOpenChange(false);
                      }}
                      className="text-xs"
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Recall to Cart
                    </TactileButton>
                  </>
                }
              >
                {entry.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-ink">
                      {Number(item.qty)}x {item.product_name}
                    </span>
                    <span className="shrink-0 font-semibold text-ink-muted tabular-nums">
                      {formatMoney(Number(item.qty) * Number(item.unit_price))}
                    </span>
                  </div>
                ))}
                {entry.bill.notes && (
                  <p className="mt-1 rounded-[10px] bg-surface-muted px-2.5 py-1.5 text-[11px] italic text-ink-muted">
                    Note: {entry.bill.notes}
                  </p>
                )}
              </PerforatedTicket>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
