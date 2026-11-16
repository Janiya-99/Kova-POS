import * as React from 'react';
import {
  AlertTriangle,
  Flame,
  PackageX,
  RotateCcw,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { apiFetch } from '@/lib/api';
import {
  getIndustryReturnAndWastagePresets,
  resolveEffectiveIndustryProfile,
} from '@/lib/branchAccess';
import type { LocalProduct } from '@/lib/dexie-db';
import { useAuthStore } from '@/store/authStore';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';

export interface BatchOptionDTO {
  id: string;
  product_id?: string;
  sku: string;
  product_name: string;
  batch_number: string;
  received_at: string;
  expiry_date?: string | null;
  unit_cost: string | number;
  remaining_qty: string | number;
}

export interface StockAdjustmentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: LocalProduct[];
  batches: BatchOptionDTO[];
  suppliers: Array<{ id: string; code: string; name: string }>;
  defaultType?: 'DAMAGE' | 'WASTAGE' | 'EXPIRY_WRITEOFF' | 'SUPPLIER_RETURN';
  onSaved: () => void;
}

export function StockAdjustmentDrawer({
  open,
  onOpenChange,
  products,
  batches,
  suppliers,
  defaultType,
  onSaved,
}: StockAdjustmentDrawerProps) {
  const { context, resolvedSettings, businesses } = useAuthStore();
  const { formatMoney } = useCurrency();
  const industryProfile = resolveEffectiveIndustryProfile(context, resolvedSettings, businesses);
  const presets = React.useMemo(
    () => getIndustryReturnAndWastagePresets(industryProfile),
    [industryProfile]
  );

  const initialType =
    defaultType || (presets.highlightWastageFirst ? 'WASTAGE' : 'DAMAGE');

  const [adjustmentType, setAdjustmentType] = React.useState<
    'DAMAGE' | 'WASTAGE' | 'EXPIRY_WRITEOFF' | 'SUPPLIER_RETURN'
  >(initialType);
  const [disposition, setDisposition] = React.useState<
    'WRITE_OFF_SCRAP' | 'QUARANTINE_DAMAGED' | 'RETURN_TO_SUPPLIER'
  >(presets.defaultDispositionByType[initialType]);
  const [productId, setProductId] = React.useState('');
  const [batchId, setBatchId] = React.useState('AUTO_FIFO');
  const [supplierId, setSupplierId] = React.useState('');
  const [reasonCategory, setReasonCategory] = React.useState('');
  const [serialImei, setSerialImei] = React.useState('');
  const [rmaReference, setRmaReference] = React.useState('');
  const [qty, setQty] = React.useState('1');
  const [notes, setNotes] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const [errors, setErrors] = React.useState<{
    product?: string;
    qty?: string;
    reason?: string;
  }>({});

  const availableProducts = React.useMemo(
    () => products.filter((p) => Number(p.branch_stock || 0) > 0),
    [products]
  );

  const reasonOptionsForType = React.useMemo(() => {
    switch (adjustmentType) {
      case 'WASTAGE':
        return presets.wastageReasons;
      case 'EXPIRY_WRITEOFF':
        return presets.expiryReasons;
      case 'SUPPLIER_RETURN':
        return presets.supplierReturnReasons;
      default:
        return presets.damageReasons;
    }
  }, [adjustmentType, presets]);

  React.useEffect(() => {
    if (!open) return;
    const t = defaultType || (presets.highlightWastageFirst ? 'WASTAGE' : 'DAMAGE');
    setAdjustmentType(t);
    setDisposition(presets.defaultDispositionByType[t]);
    const firstProd = availableProducts[0]?.id || products[0]?.id || '';
    setProductId(firstProd);
    setBatchId('AUTO_FIFO');
    setSupplierId(suppliers[0]?.id || '');
    const list =
      t === 'WASTAGE'
        ? presets.wastageReasons
        : t === 'EXPIRY_WRITEOFF'
        ? presets.expiryReasons
        : t === 'SUPPLIER_RETURN'
        ? presets.supplierReturnReasons
        : presets.damageReasons;
    setReasonCategory(list[0] || '');
    setSerialImei('');
    setRmaReference('');
    setQty('1');
    setNotes('');
    setErrors({});
  }, [open, defaultType, presets, availableProducts, products, suppliers]);

  const handleTypeChange = (
    nextType: 'DAMAGE' | 'WASTAGE' | 'EXPIRY_WRITEOFF' | 'SUPPLIER_RETURN'
  ) => {
    setAdjustmentType(nextType);
    setDisposition(presets.defaultDispositionByType[nextType]);
    const list =
      nextType === 'WASTAGE'
        ? presets.wastageReasons
        : nextType === 'EXPIRY_WRITEOFF'
        ? presets.expiryReasons
        : nextType === 'SUPPLIER_RETURN'
        ? presets.supplierReturnReasons
        : presets.damageReasons;
    setReasonCategory(list[0] || '');
  };

  const selectedProduct = products.find((p) => p.id === productId);
  const productBatches = React.useMemo(() => {
    if (!selectedProduct) return [];
    return batches.filter(
      (b) =>
        (b.product_id === selectedProduct.id || b.sku === selectedProduct.sku) &&
        Number(b.remaining_qty || 0) > 0
    );
  }, [batches, selectedProduct]);

  const selectedBatch = productBatches.find((b) => b.id === batchId);
  const maxAvailableQty = selectedBatch
    ? Number(selectedBatch.remaining_qty || 0)
    : Number(selectedProduct?.branch_stock || 0);

  const estimatedUnitCost = selectedBatch
    ? Number(selectedBatch.unit_cost || 0)
    : Number(selectedProduct?.base_price || 0);
  const parsedQty = Number.parseFloat(qty) || 0;
  const estimatedTotalCost = Math.max(0, parsedQty * estimatedUnitCost);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!productId) {
      nextErrors.product = 'Please select a catalog product';
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      nextErrors.qty = 'Adjustment quantity must be greater than 0';
    } else if (parsedQty > maxAvailableQty) {
      nextErrors.qty = `Exceeds available branch FIFO stock (${maxAvailableQty} ${
        selectedProduct?.unit_of_measure || 'PCS'
      })`;
    }
    if (!reasonCategory.trim()) {
      nextErrors.reason = 'Reason category is required';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error(Object.values(nextErrors)[0]);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const res = await apiFetch<{ adjustment_number: string; journal_entry?: string }>(
        '/api/v1/inventory/adjustments',
        {
          method: 'POST',
          body: JSON.stringify({
            branch_id: context?.branch_id,
            product_id: productId,
            batch_id: batchId !== 'AUTO_FIFO' ? batchId : undefined,
            supplier_id:
              (adjustmentType === 'SUPPLIER_RETURN' ||
                disposition === 'RETURN_TO_SUPPLIER') &&
              supplierId
                ? supplierId
                : undefined,
            adjustment_type: adjustmentType,
            disposition,
            reason_category: reasonCategory.trim(),
            serial_imei: serialImei.trim(),
            rma_reference: rmaReference.trim(),
            qty: String(parsedQty),
            notes: notes.trim(),
          }),
        }
      );
      toast.success(
        `Recorded ${res.adjustment_number}${
          res.journal_entry ? ` • Posted GL ${res.journal_entry}` : ''
        }`
      );
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record stock adjustment');
    } finally {
      setSubmitting(false);
    }
  };

  const typeButtons: Array<{
    id: 'DAMAGE' | 'WASTAGE' | 'EXPIRY_WRITEOFF' | 'SUPPLIER_RETURN';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = presets.highlightWastageFirst
    ? [
        { id: 'WASTAGE', label: 'Wastage / Spoilage', icon: Flame },
        { id: 'DAMAGE', label: 'Damaged Stock', icon: AlertTriangle },
        { id: 'EXPIRY_WRITEOFF', label: 'Expiry Write-Off', icon: PackageX },
        { id: 'SUPPLIER_RETURN', label: 'Supplier RTV', icon: Truck },
      ]
    : [
        { id: 'DAMAGE', label: 'Damaged Stock', icon: AlertTriangle },
        { id: 'WASTAGE', label: 'Wastage / E-Waste', icon: Flame },
        { id: 'SUPPLIER_RETURN', label: 'Supplier RMA', icon: Truck },
        { id: 'EXPIRY_WRITEOFF', label: 'Expiry Write-Off', icon: PackageX },
      ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="stock-adjustment-dialog"
        className="w-[calc(100vw-2rem)] max-w-[660px] max-h-[90vh] flex flex-col p-0 overflow-hidden"
      >
        <div className="border-b border-border-theme px-6 py-4 pr-14">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{presets.inventoryActionLabel}</DialogTitle>
              <Badge variant="lavender">{presets.mode.toUpperCase()}</Badge>
            </div>
            <DialogDescription>
              Atomically depletes active FIFO batches and posts balanced Double-Entry GL (
              {disposition === 'RETURN_TO_SUPPLIER' ? 'DR 2000 AP' : 'DR 5100 Shrinkage'} / CR
              1200 Inventory Asset).
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Adjustment Classification */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ink">Classification *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {typeButtons.map((btn) => {
                const Icon = btn.icon;
                const active = adjustmentType === btn.id;
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => handleTypeChange(btn.id)}
                    data-testid={`adj-type-${btn.id.toLowerCase()}`}
                    className={`flex items-center justify-center gap-1.5 rounded-[var(--theme-radius-control)] border px-2.5 py-2 text-[11.5px] font-bold transition cursor-pointer ${
                      active
                        ? 'border-accent bg-accent text-accent-fg shadow-xs'
                        : 'border-border-theme bg-surface-muted/70 text-ink hover:border-accent/50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{btn.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product & FIFO Batch Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-ink">Product SKU *</label>
              <Select
                value={productId}
                onValueChange={(v) => {
                  setProductId(v);
                  setBatchId('AUTO_FIFO');
                  if (errors.product) setErrors((prev) => ({ ...prev, product: undefined }));
                }}
              >
                <SelectTrigger data-testid="adj-product-select">
                  <SelectValue placeholder="Choose stocked product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => {
                    const stk = Number(p.branch_stock || 0);
                    return (
                      <SelectItem key={p.id} value={p.id} disabled={stk <= 0}>
                        {p.name} ({p.sku}) — {stk} left
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {errors.product && (
                <p className="text-[11px] font-medium text-red-500">{errors.product}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-ink">FIFO Batch Layer</label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger data-testid="adj-batch-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO_FIFO">
                    Auto-Deplete FIFO ({maxAvailableQty} available)
                  </SelectItem>
                  {productBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batch_number} • {Number(b.remaining_qty)} @ {formatMoney(b.unit_cost)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Industry-Specific Reason Presets + Input */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-ink">
              Industry Reason Classification *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {reasonOptionsForType.map((presetReason) => (
                <button
                  key={presetReason}
                  type="button"
                  onClick={() => {
                    setReasonCategory(presetReason);
                    if (errors.reason) setErrors((prev) => ({ ...prev, reason: undefined }));
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                    reasonCategory === presetReason
                      ? 'border-accent bg-accent-soft text-accent-soft-fg'
                      : 'border-border-theme bg-surface-muted/70 text-ink-muted hover:text-ink'
                  }`}
                >
                  {presetReason}
                </button>
              ))}
            </div>
            <Input
              value={reasonCategory}
              onChange={(e) => {
                setReasonCategory(e.target.value);
                if (errors.reason) setErrors((prev) => ({ ...prev, reason: undefined }));
              }}
              placeholder="Select preset above or type custom damage/wastage reason..."
              aria-invalid={Boolean(errors.reason)}
              data-testid="adj-reason-input"
            />
            {errors.reason && (
              <p className="text-[11px] font-medium text-red-500">{errors.reason}</p>
            )}
          </div>

          {/* Quantity, Disposition & Serial/IMEI */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-ink">
                Quantity ({selectedProduct?.unit_of_measure || 'PCS'}) *
              </label>
              <Input
                type="number"
                min={presets.allowFractional ? '0.01' : '1'}
                step={presets.allowFractional ? '0.01' : '1'}
                max={maxAvailableQty > 0 ? maxAvailableQty : undefined}
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  if (errors.qty) setErrors((prev) => ({ ...prev, qty: undefined }));
                }}
                aria-invalid={Boolean(errors.qty)}
                data-testid="adj-qty-input"
              />
              {errors.qty ? (
                <p className="text-[11px] font-medium text-red-500">{errors.qty}</p>
              ) : (
                <p className="text-[10.5px] text-ink-muted">Max available: {maxAvailableQty}</p>
              )}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="block text-xs font-bold text-ink">Disposition Action *</label>
              <Select
                value={disposition}
                onValueChange={(v) =>
                  setDisposition(
                    v as 'WRITE_OFF_SCRAP' | 'QUARANTINE_DAMAGED' | 'RETURN_TO_SUPPLIER'
                  )
                }
              >
                <SelectTrigger data-testid="adj-disposition-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WRITE_OFF_SCRAP">
                    Immediate Write-Off / Scrap Loss (DR 5100)
                  </SelectItem>
                  <SelectItem value="QUARANTINE_DAMAGED">
                    Hold in Damage Quarantine Queue (Inspect / RMA Later)
                  </SelectItem>
                  <SelectItem value="RETURN_TO_SUPPLIER">
                    Return to Supplier for RMA Credit (DR 2000 AP)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Conditional Supplier / RMA or Serial / IMEI Row */}
          {(presets.captureSerialLabel ||
            adjustmentType === 'SUPPLIER_RETURN' ||
            disposition === 'RETURN_TO_SUPPLIER') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {presets.captureSerialLabel && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-ink">
                    {presets.captureSerialLabel}
                  </label>
                  <Input
                    value={serialImei}
                    onChange={(e) => setSerialImei(e.target.value)}
                    placeholder="e.g., 358492104829104"
                    className="font-mono text-xs"
                    data-testid="adj-serial-input"
                  />
                </div>
              )}

              {(adjustmentType === 'SUPPLIER_RETURN' ||
                disposition === 'RETURN_TO_SUPPLIER') && (
                <>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-ink">Vendor / Supplier</label>
                    <Select value={supplierId} onValueChange={setSupplierId}>
                      <SelectTrigger data-testid="adj-supplier-select">
                        <SelectValue placeholder="Choose supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-ink">RMA / Credit Ref #</label>
                    <Input
                      value={rmaReference}
                      onChange={(e) => setRmaReference(e.target.value)}
                      placeholder="e.g., RMA-OPPO-2026-019"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-bold text-ink">Inspection &amp; Audit Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document condition, supervisor check, or batch incident..."
              data-testid="adj-notes-input"
            />
          </div>

          {/* Live Financial / GL Impact Preview */}
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/75 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
                {disposition === 'QUARANTINE_DAMAGED' ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
              </span>
              <div>
                <p className="text-[11px] font-bold text-ink">
                  Estimated FIFO Cost Impact: {formatMoney(estimatedTotalCost)}
                </p>
                <p className="text-[10.5px] text-ink-muted">
                  GL:{' '}
                  {disposition === 'RETURN_TO_SUPPLIER' || adjustmentType === 'SUPPLIER_RETURN'
                    ? 'DR 2000 Accounts Payable / CR 1200 Inventory Asset'
                    : 'DR 5100 Shrinkage, Damage & Wastage / CR 1200 Inventory Asset'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-theme">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <DynamicButton
              type="submit"
              variant="obsidian"
              loading={submitting}
              data-testid="adj-submit-btn"
            >
              Commit Stock &amp; GL Entry
            </DynamicButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

