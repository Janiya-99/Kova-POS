import * as React from 'react';
import { Barcode, Check, Minus, Plus, ShieldCheck, Sparkles, Trash2, UtensilsCrossed } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import type { LocalProduct } from '@/lib/dexie-db';
import { parseJSONField, type CartItemMeta, type ProductVariantOption } from '../types';
import type { POSCapabilities } from './capabilities';

export interface ProductConfigureDialogProps {
  product: LocalProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capabilities: POSCapabilities;
  formatMoney: (value: string | number) => string;
  onConfirmAdd: (product: LocalProduct, meta: CartItemMeta, qty?: number) => void;
}

function getVariantLabel(v: ProductVariantOption): string {
  if (v.label?.trim()) return v.label.trim();
  const parts = [v.color, v.size].filter((s): s is string => Boolean(s?.trim()));
  if (parts.length > 0) return parts.join(' / ');
  return v.sku?.trim() || 'Standard';
}

/**
 * Unified modal for Industry-Specific pre-cart capture:
 * - Retail: Size/Color matrix variants
 * - Restaurant: Custom kitchen modifiers + preparation note
 * - Mobile & Electronics: Mandatory IMEI / Serial capture + Warranty badge
 */
export function ProductConfigureDialog({
  product,
  open,
  onOpenChange,
  capabilities,
  formatMoney,
  onConfirmAdd,
}: ProductConfigureDialogProps) {
  const variants = React.useMemo(
    () => (product ? parseJSONField<ProductVariantOption[]>(product.variants_json, []) : []),
    [product],
  );
  const modifiers = React.useMemo(
    () => (product ? parseJSONField<string[]>(product.modifiers_json, []) : []),
    [product],
  );

  const [selectedVariant, setSelectedVariant] = React.useState<string>('');
  const [selectedModifiers, setSelectedModifiers] = React.useState<string[]>([]);
  const [serialImeis, setSerialImeis] = React.useState<string[]>(['']);
  const [itemNote, setItemNote] = React.useState('');
  const [imeiError, setImeiError] = React.useState('');

  React.useEffect(() => {
    if (!open || !product) return;
    setSelectedVariant(variants.length > 0 ? getVariantLabel(variants[0]) : '');
    setSelectedModifiers([]);
    setSerialImeis(['']);
    setItemNote('');
    setImeiError('');
  }, [open, product, variants]);

  if (!product) return null;

  const needsVariant = capabilities.matrixVariants && variants.length > 0;
  const needsSerial = capabilities.requireSerialImei && Boolean(product.enable_serial_tracking);
  const hasModifiers = modifiers.length > 0 || capabilities.enableKot;
  const maxStock = Math.max(1, Number(product.branch_stock || 99));

  const toggleModifier = (mod: string) => {
    setSelectedModifiers((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  const handleSetDeviceCount = (nextCount: number) => {
    const clamped = Math.min(maxStock, Math.max(1, nextCount));
    setSerialImeis((prev) => {
      if (clamped === prev.length) return prev;
      if (clamped < prev.length) return prev.slice(0, clamped);
      return [...prev, ...Array(clamped - prev.length).fill('')];
    });
    if (imeiError) setImeiError('');
  };

  const handleUpdateImeiAt = (index: number, val: string) => {
    setSerialImeis((prev) => prev.map((item, i) => (i === index ? val : item)));
    if (imeiError) setImeiError('');
  };

  const handleRemoveImeiAt = (index: number) => {
    setSerialImeis((prev) => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)));
    if (imeiError) setImeiError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalQty = 1;
    const meta: CartItemMeta = {};
    if (needsVariant && selectedVariant) meta.variant = selectedVariant;
    if (selectedModifiers.length > 0) meta.modifiers = selectedModifiers;

    if (needsSerial) {
      const cleaned = serialImeis.map((s) => s.trim());
      const missingIdx = cleaned.findIndex((s) => s.length < 6);
      if (missingIdx >= 0) {
        setImeiError(
          cleaned.length > 1
            ? `Device #${missingIdx + 1}: Enter or scan a valid IMEI / Serial number (minimum 6 characters).`
            : 'Enter or scan a valid IMEI / Serial number (minimum 6 characters).'
        );
        return;
      }
      const uniqueSet = new Set(cleaned.map((s) => s.toUpperCase()));
      if (uniqueSet.size !== cleaned.length) {
        setImeiError('Duplicate IMEI / Serial numbers detected. Each device must have a unique IMEI.');
        return;
      }
      meta.serial_imei = cleaned.join(', ');
      finalQty = cleaned.length;
    }

    if (itemNote.trim()) meta.notes = itemNote.trim();

    onConfirmAdd(product, meta, finalQty);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] rounded-[22px] bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px] font-extrabold text-[#222026]">
            {needsSerial ? (
              <Barcode className="h-4.5 w-4.5 text-accent" />
            ) : hasModifiers ? (
              <UtensilsCrossed className="h-4.5 w-4.5 text-accent" />
            ) : (
              <Sparkles className="h-4.5 w-4.5 text-accent" />
            )}
            <span className="truncate">{product.name}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between text-[11.5px]">
            <span>SKU: {product.sku}</span>
            <span className="font-bold text-[#222026] tabular-nums">
              {formatMoney(product.sale_price)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {needsVariant && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Select Size / Color Variant
              </p>
              <div className="grid grid-cols-2 gap-2">
                {variants.map((v) => {
                  const label = getVariantLabel(v);
                  const active = selectedVariant === label;
                  return (
                    <button
                      key={`${label}-${v.sku || ''}`}
                      type="button"
                      data-testid={`variant-option-${label}`}
                      onClick={() => setSelectedVariant(label)}
                      className={`flex min-h-[44px] items-center justify-between gap-2 rounded-[12px] border px-3 py-2 text-left transition-all cursor-pointer ${
                        active
                          ? 'border-[#222026] bg-[#222026] text-white shadow-xs'
                          : 'border-border-theme bg-[#F5F6FA]/70 text-[#222026] hover:border-accent'
                      }`}
                    >
                      <span className="truncate text-[12px] font-bold">{label}</span>
                      {typeof v.stock === 'number' && (
                        <span
                          className={`shrink-0 text-[10px] font-semibold tabular-nums ${
                            active ? 'text-white/75' : 'text-ink-muted'
                          }`}
                        >
                          {v.stock} left
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {modifiers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Modifiers & Add-Ons
              </p>
              <div className="flex flex-wrap gap-1.5">
                {modifiers.map((mod) => {
                  const active = selectedModifiers.includes(mod);
                  return (
                    <button
                      key={mod}
                      type="button"
                      data-testid={`modifier-option-${mod}`}
                      onClick={() => toggleModifier(mod)}
                      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-bold transition-all cursor-pointer ${
                        active
                          ? 'border-[#222026] bg-[#222026] text-white'
                          : 'border-border-theme bg-[#F5F6FA] text-[#222026] hover:border-accent'
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                      <span>{mod}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {needsSerial && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label
                    htmlFor="pos-serial-imei-input"
                    className="text-[11px] font-bold uppercase tracking-wider text-ink-muted"
                  >
                    Mandatory IMEI / Serial Number ({serialImeis.length}{' '}
                    {serialImeis.length === 1 ? 'Device' : 'Devices'}) *
                  </label>
                  <p className="text-[10px] text-ink-muted">
                    Buying multiple units of this model? Increase qty to scan each unit&apos;s unique IMEI.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {product.warranty_terms && (
                    <Badge variant="lavender" className="text-[10px]">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      {product.warranty_terms}
                    </Badge>
                  )}
                  <div className="inline-flex items-center gap-1 rounded-[10px] border border-border-theme bg-[#F5F6FA] p-0.5">
                    <button
                      type="button"
                      aria-label="Decrease device count"
                      onClick={() => handleSetDeviceCount(serialImeis.length - 1)}
                      data-testid="pos-imei-qty-minus"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-white text-[#222026] hover:text-accent cursor-pointer"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span
                      className="px-2 text-xs font-extrabold text-[#222026] tabular-nums"
                      data-testid="pos-imei-qty-count"
                    >
                      {serialImeis.length}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase device count"
                      onClick={() => handleSetDeviceCount(serialImeis.length + 1)}
                      data-testid="pos-imei-qty-plus"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-white text-[#222026] hover:text-accent cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="max-h-[190px] overflow-y-auto space-y-2 pr-0.5">
                {serialImeis.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {serialImeis.length > 1 && (
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#F5F6FA] font-mono text-[10.5px] font-bold text-[#222026]">
                        #{idx + 1}
                      </span>
                    )}
                    <Input
                      id={idx === 0 ? 'pos-serial-imei-input' : `pos-serial-imei-input-${idx}`}
                      data-testid={idx === 0 ? 'pos-imei-input' : `pos-imei-input-${idx}`}
                      autoFocus={idx === serialImeis.length - 1}
                      value={val}
                      onChange={(e) => handleUpdateImeiAt(idx, e.target.value)}
                      placeholder={
                        serialImeis.length > 1
                          ? `Device #${idx + 1}: Scan or type 15-digit IMEI / serial...`
                          : 'Scan or type 15-digit IMEI / device serial...'
                      }
                      className="h-10 flex-1 rounded-[12px] font-mono text-[12.5px]"
                    />
                    {serialImeis.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveImeiAt(idx)}
                        aria-label={`Remove device #${idx + 1}`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-border-theme text-ink-muted hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleSetDeviceCount(serialImeis.length + 1)}
                  data-testid="pos-add-another-imei-btn"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  Add another unit of {product.name}
                </button>
                <span className="text-[10.5px] font-semibold text-ink-muted tabular-nums">
                  Total: {formatMoney(Number(product.sale_price || 0) * serialImeis.length)}
                </span>
              </div>

              {imeiError && (
                <p data-testid="pos-imei-error" className="text-[11px] font-semibold text-[#EF4444]">
                  {imeiError}
                </p>
              )}
            </div>
          )}

          {(hasModifiers || capabilities.enableKot || needsSerial) && (
            <div className="space-y-1.5">
              <label
                htmlFor="pos-item-note-input"
                className="text-[11px] font-bold uppercase tracking-wider text-ink-muted"
              >
                {needsSerial ? 'Warranty / Device Condition Note' : 'Preparation / Ticket Note'}
              </label>
              <Input
                id="pos-item-note-input"
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
                placeholder={
                  needsSerial
                    ? 'e.g., Sealed box, TRCSL verified, customer trade-in ref...'
                    : 'e.g., No ice, less spicy, gift wrapped...'
                }
                className="h-10 rounded-[12px] text-[12px]"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-theme/70">
            <TactileButton tone="light" onClick={() => onOpenChange(false)}>
              Cancel
            </TactileButton>
            <DynamicButton
              type="submit"
              data-testid="pos-confirm-configure-add"
              variant="obsidian"
              className="min-w-[140px]"
            >
              Add to Cart
            </DynamicButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

