import * as React from 'react';
import { ReceiptText, RotateCcw, Ban, ArrowUpRight, Loader2, ShoppingBag } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollFadeList } from '@/components/dqnamo/ScrollFadeList';
import { HoldToConfirm } from '@/components/dqnamo/HoldToConfirm';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SupervisorPinModal } from '@/features/auth/SupervisorPinModal';
import { apiFetch, ApiError } from '@/lib/api';
import { useCurrency } from '@/hooks/useCurrency';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { useT } from '@/store/i18nStore';
import { toast } from 'sonner';
import type { RecentActivityItem } from '../types';

interface JournalLineItem {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  debit: string | number;
  credit: string | number;
  memo: string;
}

interface LastActivityCardProps {
  activities: RecentActivityItem[];
  onRefresh: () => void;
  canViewGL?: boolean;
  periodLabel?: string;
}

function getInitials(name: string): string {
  const parts = (name || 'WG').trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return (parts[0] || 'WG').slice(0, 2).toUpperCase();
}

export function LastActivityCard({
  activities,
  onRefresh,
  canViewGL = true,
  periodLabel = 'Selected period',
}: LastActivityCardProps) {
  const { formatMoney } = useCurrency();
  const { t } = useT();
  const [selectedActivity, setSelectedActivity] = React.useState<RecentActivityItem | null>(null);
  const [journalLines, setJournalLines] = React.useState<JournalLineItem[]>([]);
  const [loadingLines, setLoadingLines] = React.useState(false);

  const [pinModalOpen, setPinModalOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<'void' | 'refund'>('void');

  const openActivityDetail = async (item: RecentActivityItem) => {
    setSelectedActivity(item);
    setJournalLines([]);
    if (!canViewGL) {
      setLoadingLines(false);
      return;
    }

    setLoadingLines(true);
    try {
      const res = await apiFetch<{ lines: JournalLineItem[] }>(
        `/api/v1/accounting/sources/${item.id}/journals`
      );
      setJournalLines(res.lines || []);
    } catch (err: any) {
      toast.error(err.message || 'Unable to load journal lines');
    } finally {
      setLoadingLines(false);
    }
  };

  const executeInvoiceMutation = async (
    kind: 'void' | 'refund',
    overrideToken?: string,
    reason = 'Manager Authorized Action'
  ) => {
    if (!selectedActivity) return;
    try {
      await apiFetch(`/api/v1/pos/invoices/${selectedActivity.id}/${kind}`, {
        method: 'POST',
        overrideToken,
        body: JSON.stringify({ reason }),
      });
      toast.success(
        kind === 'void'
          ? `Invoice ${selectedActivity.invoice_number} voided & stock restored`
          : `Invoice ${selectedActivity.invoice_number} refunded with reversing GL`
      );
      setSelectedActivity(null);
      onRefresh();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403 && err.data?.can_override_pin) {
        setPendingAction(kind);
        setPinModalOpen(true);
        return;
      }
      toast.error(err.message || `Failed to ${kind} invoice`);
    }
  };

  const statusBadgeVariant = (status: string) => {
    if (status === 'PAID') return 'positive' as const;
    if (status === 'VOID' || status === 'REFUNDED') return 'negative' as const;
    return 'lavender' as const;
  };

  return (
    <>
      <section
        className="zona-card flex h-full flex-col justify-between p-6"
        data-testid="last-activity-card"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-bold tracking-[-0.01em] text-ink">
              {t.overview.lastActivity}
            </h3>
            <p className="text-[11px] text-ink-muted">
              {canViewGL
                ? `Click any order in ${periodLabel.toLowerCase()} to inspect GL`
                : `Recent sales & receipts (${periodLabel.toLowerCase()})`}
            </p>
          </div>
          <Badge variant="outline">{activities.length} orders</Badge>
        </div>

        {activities.length === 0 ? (
          <div className="my-4 flex flex-1 flex-col items-center justify-center rounded-[var(--theme-radius-inner)] bg-surface-muted/70 p-6 text-center">
            <ShoppingBag className="mb-2 h-6 w-6 text-ink-muted opacity-60" />
            <p className="text-xs font-semibold text-ink">
              No completed orders in {periodLabel.toLowerCase()}
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">
              Checkouts processed on POS will appear here in real time.
            </p>
          </div>
        ) : (
          <ScrollFadeList maxHeightClass="max-h-[260px]" className="space-y-2.5 pr-1">
            {activities.map((item) => {
              const thumbs =
                item.item_images && item.item_images.length > 0
                  ? item.item_images
                  : [item.preview_image_url || '/products/cardigan.svg'];

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openActivityDetail(item)}
                  className="flex w-full items-center justify-between gap-3 rounded-[var(--theme-radius-inner)] bg-surface-muted px-3.5 py-2.5 text-left hover:bg-accent-soft/40 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={item.customer_avatar || undefined} alt={item.customer_name} />
                      <AvatarFallback>
                        {getInitials(item.customer_name || 'Walk-in Guest')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {item.customer_name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-muted tabular-nums">
                        <span className="font-mono">{item.invoice_number}</span>
                        <Badge
                          variant={statusBadgeVariant(item.status)}
                          className="px-1.5 py-0 text-[9px] leading-4"
                        >
                          {formatDisplayLabel(item.status)}
                        </Badge>
                        {item.payment_method && (
                          <span className="hidden md:inline font-medium">{formatDisplayLabel(item.payment_method)}</span>
                        )}
                        <span className="hidden sm:inline">{item.total_items} items</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden sm:flex -space-x-2">
                      {thumbs.slice(0, 2).map((src, i) => (
                        <img
                          key={`${item.id}-img-${i}`}
                          src={src || '/products/cardigan.svg'}
                          alt={item.preview_product_name || 'Item'}
                          className="h-7 w-7 rounded-full border-2 border-surface bg-surface object-cover"
                        />
                      ))}
                      {item.total_items > 2 && (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-accent-soft text-[10px] font-bold text-accent-soft-fg">
                          +{item.total_items - 2}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-ink tabular-nums">
                        {formatMoney(item.grand_total)}
                      </p>
                      <p className="text-[10px] text-ink-muted truncate max-w-[96px]">
                        {item.cashier_name}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-ink-muted" />
                  </div>
                </button>
              );
            })}
          </ScrollFadeList>
        )}
      </section>

      <Sheet open={!!selectedActivity} onOpenChange={(o) => !o && setSelectedActivity(null)}>
        <SheetContent side="right" className="overflow-y-auto">
          {selectedActivity && (
            <>
              <SheetHeader>
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant={statusBadgeVariant(selectedActivity.status)}>
                    {formatDisplayLabel(selectedActivity.status)}
                  </Badge>
                  <Badge variant="outline">{formatDisplayLabel(selectedActivity.invoice_type)}</Badge>
                  {selectedActivity.payment_method && (
                    <Badge variant="lavender">{formatDisplayLabel(selectedActivity.payment_method)}</Badge>
                  )}
                </div>
                <SheetTitle>{selectedActivity.invoice_number}</SheetTitle>
                <SheetDescription>
                  Customer: {selectedActivity.customer_name} • Cashier:{' '}
                  {selectedActivity.cashier_name} • Total{' '}
                  <strong className="text-ink tabular-nums">
                    {formatMoney(selectedActivity.grand_total)}
                  </strong>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                    Order Summary
                  </p>
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {(selectedActivity.item_images?.length
                        ? selectedActivity.item_images
                        : [selectedActivity.preview_image_url || '/products/cardigan.svg']
                      )
                        .slice(0, 3)
                        .map((imgSrc, idx) => (
                          <img
                            key={`detail-img-${idx}`}
                            src={imgSrc || '/products/cardigan.svg'}
                            alt={selectedActivity.preview_product_name || 'Product'}
                            className="h-10 w-10 rounded-[10px] border border-border-theme bg-surface object-cover p-1"
                          />
                        ))}
                      <div className="text-xs">
                        <p className="font-semibold text-ink">
                          {selectedActivity.preview_product_name || 'POS Line Items'}
                        </p>
                        <p className="text-[11px] text-ink-muted">
                          {selectedActivity.branch_name} • {selectedActivity.total_items} items
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {canViewGL && (
                  <>
                    <div className="flex items-center gap-2 text-sm font-bold text-ink">
                      <ReceiptText className="h-4 w-4 text-accent" />
                      <span>Posted Double-Entry Journal Lines</span>
                    </div>

                    {loadingLines ? (
                      <div className="flex items-center justify-center py-8 text-sm text-ink-muted">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-accent" />
                        Loading General Ledger...
                      </div>
                    ) : journalLines.length === 0 ? (
                      <p className="rounded-[var(--theme-radius-inner)] bg-surface-muted p-4 text-xs text-ink-muted">
                        No balanced GL lines found for this source transaction.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {journalLines.map((line) => (
                          <div
                            key={line.id}
                            className="flex items-center justify-between rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted px-3.5 py-2.5 text-xs"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-bold text-ink">
                                {line.account_code} • {line.account_name}
                              </p>
                              <p className="truncate text-[11px] text-ink-muted">{line.memo}</p>
                            </div>
                            <div className="text-right tabular-nums shrink-0">
                              {Number(line.debit) > 0 && (
                                <span className="font-bold text-[#22C55E]">
                                  DR {formatMoney(line.debit)}
                                </span>
                              )}
                              {Number(line.credit) > 0 && (
                                <span className="font-bold text-accent">
                                  CR {formatMoney(line.credit)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {selectedActivity.status === 'PAID' && (
                  <div className="mt-6 space-y-2.5 border-t border-border-theme pt-5">
                    <p className="text-xs font-semibold text-ink-muted">
                      Destructive POS Controls (Hold to execute — triggers Manager PIN if RBAC restricted)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <HoldToConfirm
                        label="Hold to Void"
                        holdingLabel="Voiding..."
                        icon={<Ban className="h-4 w-4" />}
                        onConfirm={() => executeInvoiceMutation('void')}
                      />
                      <HoldToConfirm
                        label="Hold to Refund"
                        holdingLabel="Refunding..."
                        icon={<RotateCcw className="h-4 w-4" />}
                        onConfirm={() => executeInvoiceMutation('refund')}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <SupervisorPinModal
        open={pinModalOpen}
        onOpenChange={setPinModalOpen}
        action={pendingAction === 'void' ? 'pos:void_bill' : 'pos:refund'}
        actionLabel={selectedActivity?.invoice_number || 'Invoice'}
        onVerified={(overrideToken, reason) =>
          executeInvoiceMutation(pendingAction, overrideToken, reason)
        }
      />
    </>
  );
}
