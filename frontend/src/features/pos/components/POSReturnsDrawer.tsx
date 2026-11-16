import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ReceiptText,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { SupervisorPinModal } from '@/features/auth/SupervisorPinModal';
import { apiFetch, ApiError } from '@/lib/api';
import {
  getIndustryReturnAndWastagePresets,
  resolveEffectiveIndustryProfile,
} from '@/lib/branchAccess';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { useAuthStore } from '@/store/authStore';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';

interface ReturnableInvoiceItemDTO {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  image_url: string;
  unit_of_measure: string;
  enable_serial_tracking: boolean;
  allow_fractional_qty: boolean;
  qty: string | number;
  returned_qty: string | number;
  returnable_qty: string | number;
  unit_price: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  line_total: string | number;
  serial_imei?: string;
}

interface ReturnableInvoiceDTO {
  id: string;
  invoice_number: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  cashier_name: string;
  terminal_name: string;
  payment_method: string;
  grand_total: string | number;
  refunded_total: string | number;
  returnable_qty_total: string | number;
  created_at: string;
  items: ReturnableInvoiceItemDTO[];
}

export interface POSReturnsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReturnProcessed: () => void;
}

type ReturnDisposition = 'RESTOCK_SELLABLE' | 'QUARANTINE_DAMAGED' | 'WRITE_OFF_SCRAP';

export function POSReturnsDrawer({
  open,
  onOpenChange,
  onReturnProcessed,
}: POSReturnsDrawerProps) {
  const { context, resolvedSettings, businesses } = useAuthStore();
  const { formatMoney } = useCurrency();
  const industryProfile = resolveEffectiveIndustryProfile(context, resolvedSettings, businesses);
  const presets = React.useMemo(
    () => getIndustryReturnAndWastagePresets(industryProfile),
    [industryProfile]
  );

  const [search, setSearch] = React.useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string>('');
  const [lineQtys, setLineQtys] = React.useState<Record<string, number>>({});
  const [lineDispositions, setLineDispositions] = React.useState<
    Record<string, ReturnDisposition>
  >({});
  const [lineSerials, setLineSerials] = React.useState<Record<string, string>>({});
  const [reasonCategory, setReasonCategory] = React.useState<string>(
    presets.customerReturnReasons[0] || 'Customer Return'
  );
  const [refundMethod, setRefundMethod] = React.useState<'CASH' | 'CARD' | 'MOBILE_WALLET'>('CASH');
  const [notes, setNotes] = React.useState('');
  const [reasonError, setReasonError] = React.useState('');
  const [qtyError, setQtyError] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const [pinModalOpen, setPinModalOpen] = React.useState(false);
  const [pendingPayload, setPendingPayload] = React.useState<Record<string, unknown> | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pos-return-invoices', context?.business_id, context?.branch_id, search],
    queryFn: () =>
      apiFetch<{ invoices: ReturnableInvoiceDTO[] }>(
        `/api/v1/pos/invoices${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`
      ),
    enabled: open && Boolean(context?.business_id),
  });

  const invoices = data?.invoices || [];

  React.useEffect(() => {
    if (!open) return;
    setReasonCategory(presets.customerReturnReasons[0] || 'Customer Return');
    setReasonError('');
    setQtyError('');
  }, [open, presets]);

  React.useEffect(() => {
    if (invoices.length > 0 && !invoices.some((i) => i.id === selectedInvoiceId)) {
      const firstReturnable =
        invoices.find((i) => Number(i.returnable_qty_total || 0) > 0 && i.status !== 'VOID') ||
        invoices[0];
      if (firstReturnable) {
        setSelectedInvoiceId(firstReturnable.id);
      }
    }
  }, [invoices, selectedInvoiceId]);

  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId) || null;

  React.useEffect(() => {
    if (!selectedInvoice) return;
    const initQty: Record<string, number> = {};
    const initDisp: Record<string, ReturnDisposition> = {};
    const initSerial: Record<string, string> = {};
    for (const it of selectedInvoice.items) {
      initQty[it.id] = 0;
      initDisp[it.id] = 'RESTOCK_SELLABLE';
      initSerial[it.id] = it.serial_imei || '';
    }
    setLineQtys(initQty);
    setLineDispositions(initDisp);
    setLineSerials(initSerial);
    setRefundMethod(
      selectedInvoice.payment_method === 'CARD'
        ? 'CARD'
        : selectedInvoice.payment_method === 'MOBILE_WALLET'
        ? 'MOBILE_WALLET'
        : 'CASH'
    );
    setQtyError('');
  }, [selectedInvoice?.id]);

  const estimatedRefundTotal = React.useMemo(() => {
    if (!selectedInvoice) return 0;
    return selectedInvoice.items.reduce((sum, it) => {
      const q = lineQtys[it.id] || 0;
      const origQ = Number(it.qty) || 1;
      if (q <= 0) return sum;
      return sum + (Number(it.line_total) * q) / origQ;
    }, 0);
  }, [selectedInvoice, lineQtys]);

  const selectedLineCount = React.useMemo(
    () => Object.values(lineQtys).filter((q) => q > 0).length,
    [lineQtys]
  );

  const selectAllReturnable = () => {
    if (!selectedInvoice) return;
    const next: Record<string, number> = {};
    for (const it of selectedInvoice.items) {
      next[it.id] = Number(it.returnable_qty || 0);
    }
    setLineQtys(next);
    setQtyError('');
  };

  const applyConditionToAll = (disp: ReturnDisposition) => {
    if (!selectedInvoice) return;
    const next: Record<string, ReturnDisposition> = {};
    for (const it of selectedInvoice.items) {
      next[it.id] = disp;
    }
    setLineDispositions(next);
  };

  const executeReturn = async (payload: Record<string, unknown>, overrideToken?: string) => {
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        credit_note_number: string;
        refund_total: string | number;
        journal_entry: string;
      }>('/api/v1/pos/returns', {
        method: 'POST',
        overrideToken,
        body: JSON.stringify(payload),
      });
      toast.success(
        `Processed Return ${res.credit_note_number} • Refunded ${formatMoney(res.refund_total)} (${
          res.journal_entry
        })`
      );
      await refetch();
      onReturnProcessed();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.data?.can_override_pin) {
        setPendingPayload(payload);
        setPinModalOpen(true);
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Unable to process POS return');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    const itemsPayload = selectedInvoice.items
      .filter((it) => (lineQtys[it.id] || 0) > 0)
      .map((it) => ({
        invoice_item_id: it.id,
        qty: String(lineQtys[it.id]),
        disposition: lineDispositions[it.id] || 'RESTOCK_SELLABLE',
        reason_category: reasonCategory.trim(),
        serial_imei: (lineSerials[it.id] || '').trim(),
      }));

    if (itemsPayload.length === 0) {
      setQtyError('Select quantity >= 1 for at least one line item');
      toast.error('Select at least one item quantity to return');
      return;
    }
    if (!reasonCategory.trim()) {
      setReasonError('Return reason category is required');
      toast.error('Return reason category is required');
      return;
    }

    setQtyError('');
    setReasonError('');

    const payload = {
      invoice_id: selectedInvoice.id,
      disposition: itemsPayload[0].disposition,
      reason_category: reasonCategory.trim(),
      refund_method: refundMethod,
      notes: notes.trim(),
      items: itemsPayload,
    };

    void executeReturn(payload);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-testid="pos-returns-dialog"
          className="w-[calc(100vw-1.5rem)] max-w-[980px] h-[90vh] flex flex-col p-0 overflow-hidden"
        >
          <div className="border-b border-border-theme px-6 py-4 pr-14">
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="flex items-center gap-2">
                  <RotateCcw className="h-4.5 w-4.5 text-accent" />
                  {presets.posModalTitle}
                </DialogTitle>
                <Badge variant="lavender">{presets.mode.toUpperCase()}</Badge>
              </div>
              <DialogDescription>{presets.posModalDescription}</DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
            {/* Left Rail: Recent Sales Invoice Lookup */}
            <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-border-theme bg-surface-muted/50 p-4 flex flex-col min-h-0 gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Invoice #, customer, phone or IMEI..."
                  className="h-9 pl-9 text-xs"
                  data-testid="pos-return-search-input"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {isLoading ? (
                  <p className="py-6 text-center text-xs text-ink-muted">Loading branch invoices...</p>
                ) : invoices.length === 0 ? (
                  <p className="py-6 text-center text-xs text-ink-muted">
                    No matching sales invoices found.
                  </p>
                ) : (
                  invoices.map((inv) => {
                    const active = inv.id === selectedInvoiceId;
                    const remQty = Number(inv.returnable_qty_total || 0);
                    return (
                      <button
                        key={inv.id}
                        type="button"
                        onClick={() => setSelectedInvoiceId(inv.id)}
                        data-testid={`return-inv-${inv.invoice_number}`}
                        className={`w-full text-left rounded-[14px] border p-3 transition cursor-pointer ${
                          active
                            ? 'border-accent bg-accent-soft/35 shadow-xs'
                            : 'border-border-theme bg-surface hover:border-accent/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-extrabold text-ink">
                            {inv.invoice_number}
                          </span>
                          <Badge
                            variant={
                              inv.status === 'VOID' || remQty <= 0
                                ? 'outline'
                                : Number(inv.refunded_total || 0) > 0
                                ? 'lavender'
                                : 'positive'
                            }
                            className="text-[9.5px]"
                          >
                            {inv.status === 'VOID'
                              ? 'Voided'
                              : remQty <= 0
                              ? 'Fully Returned'
                              : `${remQty} returnable`}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs font-semibold text-ink">
                          {inv.customer_name}
                        </p>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-muted tabular-nums">
                          <span>
                            {new Date(inv.created_at).toLocaleDateString()} •{' '}
                            {formatDisplayLabel(inv.payment_method)}
                          </span>
                          <span className="font-bold text-ink">{formatMoney(inv.grand_total)}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Right Pane: Selected Invoice Line Items, Disposition & Refund Submission */}
            <form
              onSubmit={handleSubmitReturn}
              noValidate
              className="lg:col-span-8 p-5 flex flex-col min-h-0 justify-between gap-4 overflow-y-auto"
            >
              {!selectedInvoice ? (
                <div className="flex flex-1 items-center justify-center text-xs text-ink-muted">
                  Select a paid invoice on the left to begin a return or damage claim.
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {/* Invoice Summary Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/70 px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <ReceiptText className="h-4 w-4 text-accent" />
                          <span className="font-mono text-sm font-extrabold text-ink">
                            {selectedInvoice.invoice_number}
                          </span>
                          <Badge variant="outline">{selectedInvoice.terminal_name}</Badge>
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {selectedInvoice.customer_name} • Cashier: {selectedInvoice.cashier_name}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={selectAllReturnable}
                          data-testid="pos-return-select-all-btn"
                        >
                          Select All Returnable
                        </Button>
                        <Button
                          type="button"
                          variant="info"
                          size="xs"
                          onClick={() => applyConditionToAll('QUARANTINE_DAMAGED')}
                        >
                          Mark All Damaged
                        </Button>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="space-y-2.5">
                      {selectedInvoice.items.map((it) => {
                        const retMax = Number(it.returnable_qty || 0);
                        const curQty = lineQtys[it.id] || 0;
                        const disp = lineDispositions[it.id] || 'RESTOCK_SELLABLE';
                        return (
                          <div
                            key={it.id}
                            data-testid={`return-line-${it.sku}`}
                            className="rounded-[14px] border border-border-theme bg-surface p-3.5 space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold text-ink">
                                  {it.product_name}
                                </p>
                                <p className="text-[11px] text-ink-muted tabular-nums">
                                  {it.sku} • Sold: {Number(it.qty)} • Returned:{' '}
                                  {Number(it.returned_qty)} •{' '}
                                  <strong className="text-ink">
                                    Returnable: {retMax} {it.unit_of_measure}
                                  </strong>{' '}
                                  • Line Total: {formatMoney(it.line_total)}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <label className="text-[11px] font-semibold text-ink-muted">
                                  Return Qty:
                                </label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={retMax}
                                  step={it.allow_fractional_qty ? '0.01' : '1'}
                                  disabled={retMax <= 0}
                                  value={curQty}
                                  onChange={(e) => {
                                    const raw = Number.parseFloat(e.target.value) || 0;
                                    const clamped = Math.max(0, Math.min(retMax, raw));
                                    setLineQtys((prev) => ({ ...prev, [it.id]: clamped }));
                                    if (qtyError) setQtyError('');
                                  }}
                                  className="h-8 w-20 text-right font-bold tabular-nums"
                                  data-testid={`return-qty-${it.sku}`}
                                />
                              </div>
                            </div>

                            {curQty > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-border-theme/70">
                                <div className="space-y-1">
                                  <label className="block text-[10.5px] font-bold uppercase text-ink-muted">
                                    Condition &amp; Inventory Routing
                                  </label>
                                  <Select
                                    value={disp}
                                    onValueChange={(v) =>
                                      setLineDispositions((prev) => ({
                                        ...prev,
                                        [it.id]: v as ReturnDisposition,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="RESTOCK_SELLABLE">
                                        Good Condition → Restock FIFO Sellable
                                      </SelectItem>
                                      <SelectItem value="QUARANTINE_DAMAGED">
                                        Damaged / Faulty → Quarantine (No Restock)
                                      </SelectItem>
                                      <SelectItem value="WRITE_OFF_SCRAP">
                                        Spoiled / Unusable → Wastage Write-Off
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                {(presets.captureSerialLabel || it.enable_serial_tracking) && (
                                  <div className="space-y-1">
                                    <label className="block text-[10.5px] font-bold uppercase text-ink-muted">
                                      Returned {presets.captureSerialLabel || 'Serial / IMEI'}
                                    </label>
                                    <Input
                                      value={lineSerials[it.id] || ''}
                                      onChange={(e) =>
                                        setLineSerials((prev) => ({
                                          ...prev,
                                          [it.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="IMEI / Serial returned..."
                                      className="h-8 font-mono text-xs"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {qtyError && (
                        <p className="text-[11px] font-medium text-red-500">{qtyError}</p>
                      )}
                    </div>

                    {/* Industry Return Reason + Refund Method */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-ink">
                        Industry Return / Defect Reason *
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {presets.customerReturnReasons.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              setReasonCategory(r);
                              if (reasonError) setReasonError('');
                            }}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                              reasonCategory === r
                                ? 'border-accent bg-accent-soft text-accent-soft-fg'
                                : 'border-border-theme bg-surface-muted/70 text-ink-muted hover:text-ink'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <Input
                        value={reasonCategory}
                        onChange={(e) => {
                          setReasonCategory(e.target.value);
                          if (reasonError) setReasonError('');
                        }}
                        placeholder="Select preset reason or type return explanation..."
                        aria-invalid={Boolean(reasonError)}
                        data-testid="pos-return-reason-input"
                      />
                      {reasonError && (
                        <p className="text-[11px] font-medium text-red-500">{reasonError}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-ink">Refund Payout</label>
                        <Select
                          value={refundMethod}
                          onValueChange={(v) =>
                            setRefundMethod(v as 'CASH' | 'CARD' | 'MOBILE_WALLET')
                          }
                        >
                          <SelectTrigger data-testid="pos-return-method-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cash Drawer Payout (CR 1010)</SelectItem>
                            <SelectItem value="CARD">Card Reversal (CR 1020)</SelectItem>
                            <SelectItem value="MOBILE_WALLET">Mobile / QR Refund</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-ink">
                          Ticket / Fault Notes
                        </label>
                        <Input
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Optional technician / cashier remark..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border-theme">
                    <div className="flex items-center gap-4 text-xs tabular-nums">
                      <div>
                        <span className="text-ink-muted">Selected Lines: </span>
                        <strong className="text-ink">{selectedLineCount}</strong>
                      </div>
                      <div>
                        <span className="text-ink-muted">Refund Total: </span>
                        <strong className="text-sm text-[#FB4967]">
                          {formatMoney(estimatedRefundTotal)}
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                      >
                        Cancel
                      </Button>
                      <DynamicButton
                        type="submit"
                        variant="obsidian"
                        loading={submitting}
                        disabled={
                          selectedInvoice.status === 'VOID' ||
                          Number(selectedInvoice.returnable_qty_total || 0) <= 0
                        }
                        data-testid="pos-return-submit-btn"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Process Return &amp; Post GL
                      </DynamicButton>
                    </div>
                  </div>
                </>
              )}
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <SupervisorPinModal
        open={pinModalOpen}
        onOpenChange={setPinModalOpen}
        action="pos:refund"
        actionLabel="Supervisor authorization required to process POS sales return / refund"
        onVerified={(overrideToken) => {
          if (pendingPayload) {
            void executeReturn(pendingPayload, overrideToken);
          }
        }}
      />
    </>
  );
}
