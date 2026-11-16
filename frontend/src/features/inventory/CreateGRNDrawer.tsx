import * as React from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  Lock,
  Minus,
  Plus,
  Trash2,
  BookCheck,
  ShieldAlert,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { MagneticDropZone } from '@/components/dqnamo/MagneticDropZone';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import { apiFetch } from '@/lib/api';
import { isMultiBranchRole } from '@/lib/branchAccess';
import { confirmAction } from '@/lib/swal';
import { useAuthStore } from '@/store/authStore';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import type { LocalProduct } from '@/lib/dexie-db';
import { SupplierFormSheet, type SupplierRecord } from '@/features/suppliers/SupplierFormSheet';

interface SupplierOption {
  id: string;
  code: string;
  name: string;
}

interface GRNLineForm {
  product_id: string;
  batch_number: string;
  expiry_date?: Date;
  ordered_qty: number;
  qty_received: number;
  unit_cost: string;
}

export interface EditableGRNDetail {
  grn: {
    id: string;
    grn_number: string;
    supplier_id: string;
    branch_id: string;
    supplier_invoice_no: string;
    attachment_name: string;
    status: string;
  };
  items: Array<{
    product_id: string;
    batch_number: string;
    expiry_date?: string | { Time?: string; Valid?: boolean } | null;
    ordered_qty: string | number;
    qty_received: string | number;
    unit_cost: string | number;
  }>;
}

interface CreateGRNDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierOption[];
  products: LocalProduct[];
  requireGrnApproval: boolean;
  editGrn?: EditableGRNDetail | null;
  onCreated: () => void;
}

function parseOptionalDate(raw: unknown): Date | undefined {
  if (!raw) return undefined;
  const iso =
    typeof raw === 'string'
      ? raw
      : typeof raw === 'object' && (raw as { Valid?: boolean; Time?: string }).Valid
      ? (raw as { Time?: string }).Time
      : '';
  if (!iso || iso.startsWith('0001-01-01')) return undefined;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function CreateGRNDrawer({
  open,
  onOpenChange,
  suppliers,
  products,
  requireGrnApproval,
  editGrn,
  onCreated,
}: CreateGRNDrawerProps) {
  const { context, branches } = useAuthStore();
  const { formatMoney } = useCurrency();
  const isEditing = Boolean(editGrn?.grn?.id);
  const [supplierId, setSupplierId] = React.useState('');
  const [branchId, setBranchId] = React.useState(context?.branch_id || '');
  const [invoiceNo, setInvoiceNo] = React.useState('');
  const [attachmentName, setAttachmentName] = React.useState('');
  const [autoApprove, setAutoApprove] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = React.useState(false);
  const [inlineSuppliers, setInlineSuppliers] = React.useState<SupplierOption[]>([]);

  const mergedSuppliers = React.useMemo(() => {
    const byId = new Map<string, SupplierOption>();
    for (const s of suppliers) byId.set(s.id, s);
    for (const s of inlineSuppliers) {
      if (!byId.has(s.id)) byId.set(s.id, s);
    }
    return Array.from(byId.values());
  }, [suppliers, inlineSuppliers]);

  const [lines, setLines] = React.useState<GRNLineForm[]>([
    {
      product_id: '',
      batch_number: 'BATCH-OCT26',
      ordered_qty: 20,
      qty_received: 20,
      unit_cost: '45.00',
    },
  ]);

  React.useEffect(() => {
    if (!open) return;
    if (editGrn?.grn) {
      setSupplierId(editGrn.grn.supplier_id || suppliers[0]?.id || '');
      setBranchId(editGrn.grn.branch_id || context?.branch_id || '');
      setInvoiceNo(editGrn.grn.supplier_invoice_no || '');
      setAttachmentName(editGrn.grn.attachment_name || '');
      setAutoApprove(false);
      setLines(
        editGrn.items.length > 0
          ? editGrn.items.map((it) => ({
              product_id: it.product_id,
              batch_number: it.batch_number,
              expiry_date: parseOptionalDate(it.expiry_date),
              ordered_qty: Number(it.ordered_qty) || 1,
              qty_received: Number(it.qty_received) || 1,
              unit_cost: Number(it.unit_cost || 0).toFixed(2),
            }))
          : [
              {
                product_id: products[0]?.id || '',
                batch_number: `BATCH-${Date.now().toString().slice(-4)}`,
                ordered_qty: 10,
                qty_received: 10,
                unit_cost: products[0]
                  ? (parseFloat(products[0].sale_price) * 0.48).toFixed(2)
                  : '25.00',
              },
            ]
      );
      return;
    }

    setSupplierId(suppliers[0]?.id || '');
    setBranchId(context?.branch_id || '');
    setInvoiceNo('');
    setAttachmentName('');
    setAutoApprove(!requireGrnApproval);
    setLines([
      {
        product_id: products[0]?.id || '',
        batch_number: `BATCH-${new Date().toISOString().slice(2, 7).replace('-', '')}`,
        ordered_qty: 20,
        qty_received: 20,
        unit_cost: products[0]
          ? (parseFloat(products[0].sale_price) * 0.48).toFixed(2)
          : '45.00',
      },
    ]);
  }, [open, editGrn, suppliers, products, context?.branch_id, requireGrnApproval]);

  const totalCost = React.useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (l.qty_received || 0) * (parseFloat(l.unit_cost || '0') || 0),
        0
      ),
    [lines]
  );

  const hasShortShipment = lines.some((l) => l.qty_received < l.ordered_qty);

  const addLine = () => {
    const prod = products[lines.length % Math.max(products.length, 1)];
    setLines((prev) => [
      ...prev,
      {
        product_id: prod?.id || '',
        batch_number: `BATCH-${Date.now().toString().slice(-4)}`,
        ordered_qty: 10,
        qty_received: 10,
        unit_cost: prod ? (parseFloat(prod.sale_price) * 0.48).toFixed(2) : '25.00',
      },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<GRNLineForm>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const effectiveApprovalRequired = requireGrnApproval || !autoApprove;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !branchId || lines.some((l) => !l.product_id || !l.batch_number.trim())) {
      toast.error('Select supplier, destination branch, and complete every batch line');
      return;
    }

    const ok = await confirmAction({
      title: isEditing
        ? effectiveApprovalRequired
          ? `Save Draft Changes to ${editGrn?.grn.grn_number}?`
          : `Update & Post ${editGrn?.grn.grn_number} to Ledger?`
        : effectiveApprovalRequired
        ? 'Submit GRN for Approval?'
        : 'Commit GRN to Ledger?',
      text: effectiveApprovalRequired
        ? `Saves ${lines.length} FIFO line(s) totaling ${formatMoney(totalCost)} into manager approval queue (no stock posted until approved).`
        : `This will create active FIFO batches and post DR 1200 Inventory / CR 2000 Accounts Payable for ${formatMoney(totalCost)}.`,
      cancelLabel: 'Review Again',
      confirmLabel: effectiveApprovalRequired
        ? isEditing
          ? 'Save Draft Changes'
          : 'Submit for Approval'
        : 'Approve & Post GRN',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const payload = {
        supplier_id: supplierId,
        branch_id: isMultiBranchRole(context?.role_code)
          ? branchId
          : context?.branch_id || branchId,
        supplier_invoice_no: invoiceNo.trim() || `INV-2026-${Date.now().toString().slice(-3)}`,
        attachment_name: attachmentName || 'supplier-packing-slip.pdf',
        items: lines.map((l) => ({
          product_id: l.product_id,
          batch_number: l.batch_number.trim(),
          expiry_date: l.expiry_date ? format(l.expiry_date, 'yyyy-MM-dd') : '',
          ordered_qty: String(l.ordered_qty),
          qty_received: String(l.qty_received),
          unit_cost: l.unit_cost,
        })),
      };

      const res = isEditing
        ? await apiFetch<{ grn_number: string; status: string }>(
            `/api/v1/inventory/grns/${editGrn!.grn.id}`,
            {
              method: 'PUT',
              body: JSON.stringify({
                ...payload,
                approve_now: !effectiveApprovalRequired,
              }),
            }
          )
        : await apiFetch<{ grn_number: string; status: string }>('/api/v1/inventory/grns', {
            method: 'POST',
            body: JSON.stringify({
              ...payload,
              auto_approve: !effectiveApprovalRequired,
            }),
          });
      toast.success(`GRN ${res.grn_number} saved (${res.status})`);
      onCreated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || (isEditing ? 'Failed to update GRN' : 'Failed to create GRN'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[920px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <div className="border-b border-border-theme px-6 py-4 pr-14">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>
                {isEditing
                  ? `Edit Draft GRN — ${editGrn?.grn.grn_number}`
                  : 'Warehouse GRN & FIFO Batch Intake'}
              </DialogTitle>
              <Badge variant={requireGrnApproval ? 'outline' : 'positive'}>
                {requireGrnApproval ? 'Approval Policy Active' : 'Direct Posting Ready'}
              </Badge>
            </div>
            <DialogDescription>
              Log supplier shipments into ordered FIFO layers, track short-deliveries, and stage Accounts Payable posting.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Top Bento Control Strip */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-semibold text-ink">Supplier</label>
                  <button
                    type="button"
                    data-testid="grn-inline-add-supplier"
                    onClick={() => setAddSupplierOpen(true)}
                    className="inline-flex items-center gap-1 rounded-[var(--theme-radius-badge)] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-soft-fg hover:opacity-90 cursor-pointer"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    Add Supplier
                  </button>
                </div>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {mergedSuppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Destination Branch</label>
                {isMultiBranchRole(context?.role_code) ? (
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger data-testid="grn-branch-select">
                      <SelectValue placeholder="Choose branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div
                    className="flex h-9 items-center gap-2 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted/70 px-3 text-xs font-semibold text-ink"
                    data-testid="grn-branch-locked"
                  >
                    <Lock className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="truncate">
                      {branches.find((b) => b.id === (context?.branch_id || branchId))?.name ||
                        'Assigned Branch'}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Supplier Invoice Number</label>
                <Input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="e.g., INV-2026-991"
                  className="tabular-nums"
                />
              </div>
            </div>

            {requireGrnApproval && (
              <div className="flex items-center gap-2.5 rounded-[var(--theme-radius-inner)] border border-amber-500/35 bg-amber-500/10 px-4 py-2.5 text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>
                  Company setting <code>warehouse.grn.require_approval</code> is ON. Submitting saves a Draft GRN for manager approval.
                </span>
              </div>
            )}

            {/* Tabular Bento Grid for FIFO Batches */}
            <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-ink">FIFO Batch Schedule</span>
                  {hasShortShipment && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      Short shipment flagged in amber
                    </span>
                  )}
                </div>

                <TactileButton
                  type="button"
                  tone="soft"
                  onClick={addLine}
                  className="min-h-[34px] px-3 py-1 text-[11px]"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Batch Row
                </TactileButton>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[12px]">
                  <thead>
                    <tr className="border-b border-border-theme text-[11px] font-semibold text-ink-muted">
                      <th className="py-2 pr-2 text-left w-[220px]">Product SKU</th>
                      <th className="py-2 px-2 text-left w-[135px]">Batch Number</th>
                      <th className="py-2 px-2 text-left w-[125px]">Expiry Date</th>
                      <th className="py-2 px-2 text-right w-[105px]">Ordered Qty</th>
                      <th className="py-2 px-2 text-right w-[120px]">Received Qty</th>
                      <th className="py-2 px-2 text-right w-[105px]">Unit Cost</th>
                      <th className="py-2 pl-2 text-right w-[90px]">Line Total</th>
                      <th className="w-[38px]" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-theme/70">
                    {lines.map((line, idx) => {
                      const isShort = line.qty_received < line.ordered_qty;
                      const lineTotal =
                        (line.qty_received || 0) * (parseFloat(line.unit_cost || '0') || 0);

                      return (
                        <tr
                          key={idx}
                          className={`transition-colors ${
                            isShort
                              ? 'bg-amber-500/12'
                              : 'hover:bg-surface/70'
                          }`}
                        >
                          <td className="py-2.5 pr-2">
                            <Select
                              value={line.product_id}
                              onValueChange={(val) => {
                                const prod = products.find((p) => p.id === val);
                                updateLine(idx, {
                                  product_id: val,
                                  unit_cost: prod
                                    ? (parseFloat(prod.sale_price) * 0.48).toFixed(2)
                                    : line.unit_cost,
                                });
                              }}
                            >
                              <SelectTrigger className="h-9 min-h-[36px] text-[11.5px]">
                                <SelectValue placeholder="Select SKU" />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.sku} • {p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>

                          <td className="py-2.5 px-2">
                            <Input
                              value={line.batch_number}
                              onChange={(e) => updateLine(idx, { batch_number: e.target.value })}
                              placeholder="e.g., BATCH-OCT26"
                              className="h-9 min-h-[36px] text-[11.5px] font-mono tabular-nums"
                            />
                          </td>

                          <td className="py-2.5 px-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-9 w-full items-center gap-1.5 rounded-[12px] border border-border-theme bg-surface px-2.5 text-[11px] font-medium text-ink-muted hover:text-ink cursor-pointer tabular-nums"
                                >
                                  <CalendarIcon className="h-3.5 w-3.5 text-accent shrink-0" />
                                  <span className="truncate">
                                    {line.expiry_date
                                      ? format(line.expiry_date, 'yyyy-MM-dd')
                                      : 'Optional'}
                                  </span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-auto p-2">
                                <Calendar
                                  mode="single"
                                  selected={line.expiry_date}
                                  onSelect={(d) => updateLine(idx, { expiry_date: d })}
                                />
                              </PopoverContent>
                            </Popover>
                          </td>

                          <td className="py-2.5 px-2 text-right">
                            <Input
                              type="number"
                              min="1"
                              value={line.ordered_qty}
                              onChange={(e) =>
                                updateLine(idx, {
                                  ordered_qty: Math.max(1, Number(e.target.value) || 1),
                                })
                              }
                              className="h-9 min-h-[36px] text-right text-[11.5px] tabular-nums"
                            />
                          </td>

                          <td className="py-2.5 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                aria-label="Decrease received qty"
                                onClick={() =>
                                  updateLine(idx, {
                                    qty_received: Math.max(1, line.qty_received - 1),
                                  })
                                }
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-theme bg-surface text-ink hover:bg-accent-soft/40 cursor-pointer"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <Input
                                type="number"
                                min="1"
                                value={line.qty_received}
                                onChange={(e) =>
                                  updateLine(idx, {
                                    qty_received: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                className={`h-9 min-h-[36px] w-14 text-right text-[11.5px] font-bold tabular-nums px-1.5 ${
                                  isShort ? 'border-amber-500 text-amber-700 dark:text-amber-300' : ''
                                }`}
                              />
                              <button
                                type="button"
                                aria-label="Increase received qty"
                                onClick={() =>
                                  updateLine(idx, { qty_received: line.qty_received + 1 })
                                }
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-theme bg-surface text-ink hover:bg-accent-soft/40 cursor-pointer"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>

                          <td className="py-2.5 px-2 text-right">
                            <Input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={line.unit_cost}
                              onChange={(e) => updateLine(idx, { unit_cost: e.target.value })}
                              className="h-9 min-h-[36px] text-right text-[11.5px] tabular-nums"
                            />
                          </td>

                          <td className="py-2.5 pl-2 text-right font-bold text-ink tabular-nums">
                            {formatMoney(lineTotal)}
                          </td>

                          <td className="py-2.5 pl-1 text-right">
                            {lines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeLine(idx)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#EF4444] hover:bg-[#EF4444]/10 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Packing Slip Attachment + Posting Mode */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-stretch">
              <MagneticDropZone
                selectedFileName={attachmentName}
                onFileSelected={(name) => setAttachmentName(name)}
                label="Drop Supplier Invoice / Packing Slip PDF"
                helperText="Optional verification document attached to this GRN record"
              />

              <div className="flex flex-col justify-between rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-ink">GL Posting Mode</p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {requireGrnApproval
                        ? 'Locked to Approval Queue per company warehouse policy.'
                        : 'Post directly to FIFO inventory batches & balanced AP journal, or hold as Draft.'}
                    </p>
                  </div>
                  <Switch
                    checked={!effectiveApprovalRequired}
                    disabled={requireGrnApproval}
                    onCheckedChange={(v) => setAutoApprove(v)}
                  />
                </div>

                <div className="mt-4 flex items-baseline justify-between border-t border-border-theme pt-3">
                  <span className="text-[11px] font-semibold text-ink-muted uppercase">
                    Shipment Cost Total
                  </span>
                  <span className="text-[18px] font-bold text-ink tabular-nums">
                    {formatMoney(totalCost)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-theme bg-surface px-6 py-3.5">
            <span className="text-[11px] text-ink-muted">
              {effectiveApprovalRequired
                ? 'Stages Draft GRN in Approval Logs for Manager review.'
                : 'Creates live FIFO layers & posts DR Inventory / CR Accounts Payable.'}
            </span>
            <div className="flex items-center gap-2">
              <TactileButton
                type="button"
                tone="soft"
                onClick={() => onOpenChange(false)}
                className="min-h-[40px] px-4 text-xs"
              >
                Cancel
              </TactileButton>
              <DynamicButton
                type="submit"
                variant="lavender"
                disabled={submitting}
                icon={<BookCheck className="h-3.5 w-3.5" />}
                data-testid="submit-grn-btn"
              >
                {submitting
                  ? 'Saving...'
                  : effectiveApprovalRequired
                  ? isEditing
                    ? 'Save Draft Changes'
                    : 'Submit for Approval'
                  : isEditing
                  ? 'Update & Post GRN'
                  : 'Post GRN & Create Batches'}
              </DynamicButton>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>

    <SupplierFormSheet
      open={addSupplierOpen}
      onOpenChange={setAddSupplierOpen}
      onSaved={(saved: SupplierRecord) => {
        setInlineSuppliers((prev) => [
          { id: saved.id, code: saved.code, name: saved.name },
          ...prev.filter((item) => item.id !== saved.id),
        ]);
        setSupplierId(saved.id);
      }}
    />
  </>
  );
}
