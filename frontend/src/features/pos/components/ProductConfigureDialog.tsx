import * as React from 'react';
import { Barcode, Check, ShieldCheck, Sparkles, UtensilsCrossed } from 'lucide-react';
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
  onConfirmAdd: (product: LocalProduct, meta: CartItemMeta) => void;
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
  const [serialImei, setSerialImei] = React.useState('');
  const [itemNote, setItemNote] = React.useState('');
  const [imeiError, setImeiError] = React.useState('');

  React.useEffect(() => {
    if (!open || !product) return;
    setSelectedVariant(variants.length > 0 ? getVariantLabel(variants[0]) : '');
    setSelectedModifiers([]);
    setSerialImei('');
    setItemNote('');
    setImeiError('');
  }, [open, product, variants]);

  if (!product) return null;

  const needsVariant = capabilities.matrixVariants && variants.length > 0;
  const needsSerial = capabilities.requireSerialImei && Boolean(product.enable_serial_tracking);
  const hasModifiers = modifiers.length > 0 || capabilities.enableKot;

  const toggleModifier = (mod: string) => {
    setSelectedModifiers((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (needsSerial) {
      const cleanImei = serialImei.trim();
      if (cleanImei.length < 6) {
        setImeiError('Enter or scan a valid IMEI / Serial number (minimum 6 characters).');
        return;
      }
    }

    const meta: CartItemMeta = {};
    if (needsVariant && selectedVariant) meta.variant = selectedVariant;
    if (selectedModifiers.length > 0) meta.modifiers = selectedModifiers;
    if (needsSerial && serialImei.trim()) meta.serial_imei = serialImei.trim();
    if (itemNote.trim()) meta.notes = itemNote.trim();

    onConfirmAdd(product, meta);
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
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="pos-serial-imei-input"
                  className="text-[11px] font-bold uppercase tracking-wider text-ink-muted"
                >
                  Mandatory IMEI / Serial Number *
                </label>
                {product.warranty_terms && (
                  <Badge variant="lavender" className="text-[10px]">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    {product.warranty_terms}
                  </Badge>
                )}
              </div>
              <Input
                id="pos-serial-imei-input"
                data-testid="pos-imei-input"
                autoFocus
                value={serialImei}
                onChange={(e) => {
                  setSerialImei(e.target.value);
                  if (imeiError) setImeiError('');
                }}
                placeholder="Scan or type 15-digit IMEI / device serial..."
                className="h-11 rounded-[12px] font-mono text-[13px]"
              />
              {imeiError && (
                <p data-testid="pos-imei-error" className="text-[11px] font-semibold text-[#EF4444]">
                  {imeiError}
                </p>
              )}
            </div>
          )}

          {(hasModifiers || capabilities.enableKot) && (
            <div className="space-y-1.5">
              <label
                htmlFor="pos-item-note-input"
                className="text-[11px] font-bold uppercase tracking-wider text-ink-muted"
              >
                Preparation / Ticket Note
              </label>
              <Input
                id="pos-item-note-input"
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
                placeholder="e.g., No ice, less spicy, gift wrapped..."
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

