import * as React from 'react';
import {
  Banknote,
  Car,
  ChefHat,
  CreditCard,
  Delete,
  FileText,
  Minus,
  PauseCircle,
  Plus,
  ShoppingBag,
  Sparkles,
  Split,
  Trash2,
  UserCheck,
  UserPlus,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollFadeList } from '@/components/dqnamo/ScrollFadeList';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { HoldToConfirm } from '@/components/dqnamo/HoldToConfirm';
import { formatTaxLabel } from '@/lib/formatLabel';
import {
  cmpDecimal,
  formatQuantity,
  getProductGrossUnitPrice,
  getProductPromoPercent,
  isPositiveDecimal,
  mulDecimal,
  roundHalfUp2,
  subDecimal,
} from '@/lib/decimal';
import { parseSerialImeiList, type CartItem, type OrderMetaState } from '@/store/posStore';
import {
  parseJSONField,
  type CartItemMeta,
  type OrderChannel,
  type POSCustomer,
  type ProductUOMOption,
} from '../types';
import type { POSCapabilities } from './capabilities';

export interface CartTotalsSummary {
  grossSubtotal: string;
  totalDiscount: string;
  taxBreakdown: Array<{ code: string; name: string; amount: string }>;
  taxTotal: string;
  grandTotal: string;
  changeDue: string;
}

export interface ActiveCartProps {
  activeBranchName: string;
  capabilities: POSCapabilities;
  items: CartItem[];
  selectedCustomerId: string | null;
  selectedCustomerName: string;
  activeCustomer: POSCustomer | null;
  customers: POSCustomer[];
  customerPopoverOpen: boolean;
  onCustomerPopoverOpenChange: (open: boolean) => void;
  onSelectCustomer: (id: string | null, name: string) => void;
  onOpenNewCustomer: () => void;
  orderMeta: OrderMetaState;
  onUpdateOrderMeta: (patch: Partial<OrderMetaState>) => void;
  pendingOutboxCount: number;
  activeHeldBillId: string | null;
  estimatedEarnedPoints: number;
  totals: CartTotalsSummary;
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT';
  onSetPaymentMethod: (method: 'CASH' | 'CARD' | 'SPLIT') => void;
  tenderedAmount: string;
  onSetTenderedAmount: (val: string) => void;
  onAppendNumpad: (key: string) => void;
  onIncrementLine: (lineKey: string, step: number) => void;
  onDecrementLine: (lineKey: string, name: string, currentQty: number, step: number) => void;
  onSetLineQty: (lineKey: string, qty: string) => void;
  onSetLineDiscount: (lineKey: string, pct: number) => void;
  onSetLineMeta: (lineKey: string, patch: Partial<CartItemMeta>) => void;
  maxCashierDiscount: number;
  onSecondaryParkAction: () => void;
  holdingBill: boolean;
  onVoidCartConfirm: () => Promise<void> | void;
  onChargeClick: () => void;
  charging: boolean;
  chargeStage: string | null;
  chargeSuccess: boolean;
  currencySymbol: string;
  formatMoney: (value: string | number) => string;
}

interface CartLineCardProps {
  item: CartItem;
  capabilities: POSCapabilities;
  maxCashierDiscount: number;
  onIncrement: (lineKey: string, step: number) => void;
  onDecrement: (lineKey: string, name: string, currentQty: number, step: number) => void;
  onSetQty: (lineKey: string, qty: string) => void;
  onSetDiscount: (lineKey: string, pct: number) => void;
  onSetMeta: (lineKey: string, patch: Partial<CartItemMeta>) => void;
  formatMoney: (value: string | number) => string;
}

function CartLineCard({
  item,
  capabilities,
  maxCashierDiscount,
  onIncrement,
  onDecrement,
  onSetQty,
  onSetDiscount,
  onSetMeta,
  formatMoney,
}: CartLineCardProps) {
  const uoms = React.useMemo(
    () => parseJSONField<ProductUOMOption[]>(item.product.uom_options_json, []),
    [item.product.uom_options_json],
  );

  const allowFractional =
    capabilities.allowFractionalQty || Boolean(item.product.allow_fractional_qty);
  const step = allowFractional ? 0.5 : 1;

  const uomFactor = item.itemMeta?.uom_factor ? String(item.itemMeta.uom_factor) : '1';
  const catalogPromoPct = getProductPromoPercent(item.product);
  const grossUnitBase = getProductGrossUnitPrice(item.product);
  const effectiveUnitPrice = roundHalfUp2(mulDecimal(grossUnitBase, uomFactor));
  const rawGross = mulDecimal(effectiveUnitPrice, item.qty);
  const netFactor = subDecimal('1', mulDecimal(item.discountPercent || 0, '0.01'));
  const lineTotal = roundHalfUp2(mulDecimal(rawGross, netFactor));
  const discountOptions = React.useMemo(() => {
    const baseOpts = [0, 10, 25];
    if (catalogPromoPct > 0 && !baseOpts.includes(catalogPromoPct)) {
      return [0, catalogPromoPct, 10, 25]
        .filter((v, idx, arr) => arr.indexOf(v) === idx)
        .sort((a, b) => a - b);
    }
    return baseOpts;
  }, [catalogPromoPct]);
  const approvedCap = Math.max(maxCashierDiscount, catalogPromoPct);

  const [qtyDraft, setQtyDraft] = React.useState(String(item.qty));
  React.useEffect(() => {
    setQtyDraft(String(item.qty));
  }, [item.qty]);

  const commitQtyDraft = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || !isPositiveDecimal(trimmed)) {
      setQtyDraft(String(item.qty));
      return;
    }
    if (!allowFractional) {
      const whole = Math.max(1, Math.round(Number.parseFloat(trimmed)));
      onSetQty(item.lineKey, String(whole));
      setQtyDraft(String(whole));
      return;
    }
    onSetQty(item.lineKey, trimmed);
    setQtyDraft(trimmed);
  };

  const isSerializedLine =
    capabilities.requireSerialImei && Boolean(item.product.enable_serial_tracking);
  const requiredImeiCount = isSerializedLine ? Math.max(1, Math.round(item.qty)) : 0;
  const capturedImeis = React.useMemo(
    () => parseSerialImeiList(item.itemMeta?.serial_imei),
    [item.itemMeta?.serial_imei],
  );
  const missingImeiCount = isSerializedLine
    ? Math.max(0, requiredImeiCount - capturedImeis.length)
    : 0;
  const [imeiEditorOpen, setImeiEditorOpen] = React.useState(false);

  const imeiSlots = React.useMemo(() => {
    if (!isSerializedLine) return [];
    return Array.from({ length: requiredImeiCount }, (_, idx) => capturedImeis[idx] || '');
  }, [isSerializedLine, requiredImeiCount, capturedImeis]);

  const handleUpdateLineImeiAt = (slotIdx: number, val: string) => {
    const nextSlots = [...imeiSlots];
    nextSlots[slotIdx] = val;
    const cleaned = nextSlots.map((s) => s.trim()).filter(Boolean);
    onSetMeta(item.lineKey, {
      serial_imei: cleaned.join(', '),
    });
  };

  const badges: string[] = [];
  if (item.itemMeta?.variant) badges.push(item.itemMeta.variant);
  if (capturedImeis.length === 1 && requiredImeiCount === 1) {
    badges.push(`IMEI ${capturedImeis[0]}`);
  } else if (capturedImeis.length > 0) {
    capturedImeis.forEach((im, idx) => badges.push(`IMEI #${idx + 1}: ${im}`));
  }
  if (item.itemMeta?.modifiers?.length) badges.push(item.itemMeta.modifiers.join(', '));
  if (item.itemMeta?.notes) badges.push(item.itemMeta.notes);

  return (
    <div
      data-testid={`cart-line-${item.product.sku}`}
      className="rounded-[15px] border border-border-theme/70 bg-white p-3.5 shadow-2xs transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="truncate text-[12px] font-bold text-[#222026]">{item.product.name}</p>
              {catalogPromoPct > 0 && Math.abs(item.discountPercent - catalogPromoPct) < 0.01 && (
                <span className="shrink-0 rounded-full bg-[#FEF3C7] px-1.5 py-0.5 text-[9px] font-extrabold text-[#B45309] tabular-nums">
                  Auto -{catalogPromoPct}%
                </span>
              )}
            </div>
            <span className="shrink-0 text-[12px] font-extrabold text-[#222026] tabular-nums">
              {formatMoney(lineTotal)}
            </span>
          </div>
          <p className="text-[10.5px] font-medium text-ink-muted tabular-nums">
            {formatMoney(effectiveUnitPrice)} × {formatQuantity(item.qty)}
            {item.itemMeta?.uom_label ? ` (${item.itemMeta.uom_label})` : ''}
            {item.discountPercent > 0 ? ` • -${item.discountPercent}%` : ''}
          </p>
          {(badges.length > 0 || isSerializedLine) && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {badges.map((text) => (
                <span
                  key={text}
                  className="inline-flex max-w-full truncate rounded-full bg-accent-soft/75 px-2 py-0.5 text-[9.5px] font-bold text-accent-soft-fg"
                >
                  {text}
                </span>
              ))}
              {isSerializedLine && (
                <button
                  type="button"
                  onClick={() => setImeiEditorOpen((prev) => !prev)}
                  data-testid={`cart-line-manage-imeis-${item.product.sku}`}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold transition cursor-pointer ${
                    missingImeiCount > 0
                      ? 'bg-[#FEE2E2] text-[#B91C1C]'
                      : 'border border-border-theme bg-[#F5F6FA] text-[#222026] hover:border-accent'
                  }`}
                >
                  <span>
                    {missingImeiCount > 0
                      ? `+ Enter ${missingImeiCount} Missing IMEI${missingImeiCount > 1 ? 's' : ''} (${capturedImeis.length}/${requiredImeiCount})`
                      : `Edit IMEIs (${capturedImeis.length}/${requiredImeiCount})`}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Inline Multi-Device IMEI Editor (auto-expands when qty > captured IMEIs) */}
          {isSerializedLine && (imeiEditorOpen || missingImeiCount > 0) && (
            <div
              className="mt-2 space-y-1.5 rounded-[10px] border border-border-theme bg-[#F5F6FA]/80 p-2"
              data-testid={`cart-line-imei-editor-${item.product.sku}`}
            >
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-[#222026]">
                  Device IMEIs ({capturedImeis.length}/{requiredImeiCount} captured)
                </span>
                {missingImeiCount === 0 && (
                  <button
                    type="button"
                    onClick={() => setImeiEditorOpen(false)}
                    className="font-semibold text-accent hover:underline cursor-pointer"
                  >
                    Done
                  </button>
                )}
              </div>
              {imeiSlots.map((slotVal, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="w-6 shrink-0 font-mono text-[10px] font-bold text-ink-muted">
                    #{idx + 1}
                  </span>
                  <Input
                    value={slotVal}
                    onChange={(e) => handleUpdateLineImeiAt(idx, e.target.value)}
                    placeholder={`Scan/type Device #${idx + 1} IMEI...`}
                    data-testid={`cart-line-imei-input-${item.product.sku}-${idx}`}
                    className="h-7 flex-1 bg-white font-mono text-[11px]"
                  />
                </div>
              ))}
              {missingImeiCount > 0 && (
                <p className="text-[10px] font-semibold text-[#EF4444]">
                  Every unit requires a valid 6+ digit IMEI / Serial number before checkout.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Multi-UOM selector (Hardware / Stationery) */}
      {capabilities.multiUomToggle && uoms.length > 1 && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[10px] font-bold text-ink-muted">UOM:</span>
          <Select
            value={item.itemMeta?.uom_label || uoms[0].label}
            onValueChange={(label) => {
              const chosen = uoms.find((u) => u.label === label);
              if (chosen) {
                onSetMeta(item.lineKey, {
                  uom_label: chosen.label,
                  uom_factor: chosen.factor,
                });
              }
            }}
          >
            <SelectTrigger
              data-testid={`uom-select-${item.product.sku}`}
              className="h-7 flex-1 rounded-[8px] border-border-theme/70 bg-[#F5F6FA] px-2 text-[10.5px] font-bold"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {uoms.map((u) => (
                <SelectItem key={u.label} value={u.label} className="text-[11px]">
                  {u.label} ({u.factor}×)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Quantity Steppers (Click Numeral to Edit Directly) & Discount Chips */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border-theme/45 pt-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={`Decrease ${item.product.name}`}
            onClick={() => onDecrement(item.lineKey, item.product.name, item.qty, step)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-border-theme bg-[#F5F6FA] text-[#222026] hover:border-accent hover:text-accent transition-colors cursor-pointer"
          >
            <Minus className="h-3 w-3" />
          </button>

          <input
            type="text"
            inputMode={allowFractional ? 'decimal' : 'numeric'}
            step={allowFractional ? '0.25' : '1'}
            min={allowFractional ? '0.01' : '1'}
            data-testid={`qty-decimal-input-${item.product.sku}`}
            aria-label={`Quantity for ${item.product.name}`}
            title="Click to type quantity"
            value={qtyDraft}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const raw = e.target.value;
              const cleaned = allowFractional
                ? raw.replace(/[^0-9.]/g, '')
                : raw.replace(/[^0-9]/g, '');
              setQtyDraft(cleaned);
              if (cleaned && isPositiveDecimal(cleaned)) {
                if (allowFractional) {
                  onSetQty(item.lineKey, cleaned);
                } else {
                  const whole = Number.parseInt(cleaned, 10);
                  if (Number.isFinite(whole) && whole >= 1) {
                    onSetQty(item.lineKey, String(whole));
                  }
                }
              }
            }}
            onBlur={() => commitQtyDraft(qtyDraft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitQtyDraft(qtyDraft);
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setQtyDraft(String(item.qty));
                e.currentTarget.blur();
              }
            }}
            className="h-7 w-12 rounded-[8px] border border-border-theme/75 bg-[#F5F6FA] px-1 text-center text-[11.5px] font-extrabold text-[#222026] tabular-nums transition-colors cursor-text hover:border-accent/60 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
          />

          <button
            type="button"
            aria-label={`Increase ${item.product.name}`}
            onClick={() => onIncrement(item.lineKey, step)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-border-theme bg-[#F5F6FA] text-[#222026] hover:border-accent hover:text-accent transition-colors cursor-pointer"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {discountOptions.map((pct) => {
            const isSelected = Math.abs(item.discountPercent - pct) < 0.01;
            const isCatalogPromoChip = catalogPromoPct > 0 && Math.abs(pct - catalogPromoPct) < 0.01;
            return (
              <button
                key={pct}
                type="button"
                onClick={() => onSetDiscount(item.lineKey, pct)}
                className={`rounded-[7px] px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer tabular-nums ${
                  isSelected
                    ? pct > approvedCap
                      ? 'bg-[#222026] text-white'
                      : isCatalogPromoChip
                        ? 'bg-[#D97706] text-white'
                        : 'bg-accent text-accent-fg'
                    : 'bg-[#F5F6FA] text-ink-muted hover:bg-accent-soft/60 hover:text-[#222026]'
                }`}
                title={
                  isCatalogPromoChip
                    ? `Product promotional discount (-${pct}%)`
                    : pct > approvedCap
                      ? `Exceeds ${approvedCap}% cap — requires Supervisor PIN`
                      : `${pct}% discount`
                }
              >
                {pct === 0 ? '0%' : `-${pct}%`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Pane 4: Symmetrical Active Cart & Dynamic Industry Checkout Register.
 */
export function ActiveCart({
  activeBranchName,
  capabilities,
  items,
  selectedCustomerId,
  selectedCustomerName,
  activeCustomer,
  customers,
  customerPopoverOpen,
  onCustomerPopoverOpenChange,
  onSelectCustomer,
  onOpenNewCustomer,
  orderMeta,
  onUpdateOrderMeta,
  pendingOutboxCount,
  activeHeldBillId,
  estimatedEarnedPoints,
  totals,
  paymentMethod,
  onSetPaymentMethod,
  tenderedAmount,
  onSetTenderedAmount,
  onAppendNumpad,
  onIncrementLine,
  onDecrementLine,
  onSetLineQty,
  onSetLineDiscount,
  onSetLineMeta,
  maxCashierDiscount,
  onSecondaryParkAction,
  holdingBill,
  onVoidCartConfirm,
  onChargeClick,
  charging,
  chargeStage,
  chargeSuccess,
  currencySymbol,
  formatMoney,
}: ActiveCartProps) {
  const paymentOptions = [
    { id: 'CARD', label: 'Card', icon: CreditCard },
    { id: 'CASH', label: 'Cash', icon: Banknote },
    { id: 'SPLIT', label: 'Split', icon: Split },
  ] as const;

  const quickCashTargets = React.useMemo(() => {
    const gtFloat = Math.ceil(Number(totals.grandTotal || 0));
    if (!gtFloat || gtFloat <= 0) return ['10.00', '20.00', '50.00'];
    const c10 = Math.ceil(gtFloat / 10) * 10;
    const c50 = Math.ceil(gtFloat / 50) * 50;
    const c100 = Math.ceil(gtFloat / 100) * 100;
    return Array.from(
      new Set([
        c10 > gtFloat ? c10 : c10 + 10,
        c50 > gtFloat ? c50 : c50 + 50,
        c100 > gtFloat ? c100 : c100 + 100,
      ]),
    )
      .slice(0, 3)
      .map((v) => v.toFixed(2));
  }, [totals.grandTotal]);

  const customerSubtitle =
    activeCustomer && !activeCustomer.is_walk_in
      ? `${activeCustomer.phone || 'Member'} • ${activeCustomer.loyalty_points} pts${
          activeCustomer.loyalty_tier ? ` • ${activeCustomer.loyalty_tier}` : ''
        }`
      : `${activeBranchName || 'Main Register'} • ${capabilities.preset.label}`;

  const laborItems = React.useMemo(
    () => items.filter((i) => Boolean(i.product.is_service_labor)),
    [items],
  );
  const partItems = React.useMemo(
    () => items.filter((i) => !i.product.is_service_labor),
    [items],
  );

  // Determine secondary Park CTA label & icon dynamically
  const secondaryActionMeta = capabilities.enableKot && capabilities.layoutMode === 'restaurant'
    ? { label: 'Fire KOT', icon: ChefHat }
    : capabilities.layoutMode === 'hardware'
      ? { label: 'Save Quote', icon: FileText }
      : capabilities.requireVehiclePlate
        ? { label: 'Park Job', icon: Wrench }
        : { label: 'Hold Bill', icon: PauseCircle };
  const SecondaryIcon = secondaryActionMeta.icon;

  const missingRequiredPlate =
    capabilities.requireVehiclePlate && items.length > 0 && !orderMeta.vehiclePlate.trim();

  return (
    <section
      data-testid="pos-pane-cart"
      aria-label="Active Cart and Checkout"
      className="flex h-full min-h-0 flex-col justify-between gap-3 rounded-[22px] border border-border-theme/70 bg-white p-4 shadow-xs"
    >
      {/* 1. Customer Header & Industry Metadata Bar */}
      <div className="shrink-0 space-y-2.5 border-b border-border-theme/60 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-[14.5px] font-extrabold text-[#222026] leading-tight">
                {selectedCustomerId ? selectedCustomerName : 'Walk-in Guest'}
              </h2>
              {activeHeldBillId && (
                <Badge variant="lavender" className="shrink-0 text-[9.5px] px-1.5 py-0">
                  Recalled
                </Badge>
              )}
              {pendingOutboxCount > 0 && (
                <Badge variant="lavender" className="shrink-0 text-[9.5px] px-1.5 py-0">
                  <WifiOff className="mr-1 h-2.5 w-2.5" />
                  {pendingOutboxCount}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-[10.5px] font-medium text-ink-muted">
              {customerSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Popover open={customerPopoverOpen} onOpenChange={onCustomerPopoverOpenChange}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Select Customer"
                  title="Select or switch customer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-theme/80 bg-[#F5F6FA] text-[#222026] hover:border-accent hover:text-accent transition-colors cursor-pointer"
                >
                  <UserCheck className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Search customer phone or name..." />
                  <CommandList>
                    <CommandEmpty>No matching customer.</CommandEmpty>
                    <CommandItem
                      onSelect={() => {
                        onSelectCustomer(null, 'Walk-in Guest');
                        onCustomerPopoverOpenChange(false);
                      }}
                    >
                      <span>Walk-in Guest</span>
                      <span className="text-[11px] text-ink-muted">Default</span>
                    </CommandItem>
                    {customers.map((c) => (
                      <CommandItem
                        key={c.id}
                        onSelect={() => {
                          onSelectCustomer(c.id, c.name);
                          onCustomerPopoverOpenChange(false);
                        }}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{c.name}</p>
                          <p className="text-[11px] text-ink-muted tabular-nums">
                            {c.phone || 'No phone'} • {c.loyalty_points} pts
                            {c.loyalty_tier ? ` • ${c.loyalty_tier}` : ''}
                          </p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
                <div className="border-t border-border-theme p-2">
                  <button
                    type="button"
                    onClick={() => {
                      onCustomerPopoverOpenChange(false);
                      onOpenNewCustomer();
                    }}
                    className="flex min-h-[36px] w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 transition cursor-pointer"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    New Customer
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            <button
              type="button"
              aria-label="New Customer"
              title="Create new customer"
              onClick={onOpenNewCustomer}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-theme/80 bg-[#F5F6FA] text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Restaurant Dining Channel & Table Selector */}
        {capabilities.enableTables && (
          <div data-testid="restaurant-channel-controls" className="space-y-1.5">
            <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-[#F5F6FA] p-1">
              {(
                [
                  { id: 'DINE_IN', label: 'Dine-In' },
                  { id: 'TAKEAWAY', label: 'Takeaway' },
                  { id: 'DELIVERY', label: 'Delivery' },
                ] as const
              ).map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  data-testid={`channel-btn-${ch.id}`}
                  onClick={() => onUpdateOrderMeta({ orderChannel: ch.id })}
                  className={`min-h-[28px] rounded-[7px] text-[10.5px] font-bold transition-colors cursor-pointer ${
                    orderMeta.orderChannel === ch.id
                      ? 'bg-[#222026] text-white'
                      : 'text-ink-muted hover:text-[#222026]'
                  }`}
                >
                  {ch.label}
                </button>
              ))}
            </div>
            {orderMeta.orderChannel === 'DINE_IN' && (
              <div className="flex items-center gap-2">
                <Input
                  data-testid="restaurant-table-input"
                  value={orderMeta.tableOrBayLabel}
                  onChange={(e) => onUpdateOrderMeta({ tableOrBayLabel: e.target.value })}
                  placeholder="Table # (e.g. Table 4)"
                  className="h-8 rounded-[9px] text-[11.5px]"
                />
              </div>
            )}
          </div>
        )}

        {/* Garage Vehicle Plate & Bay Controls */}
        {capabilities.requireVehiclePlate && (
          <div data-testid="garage-vehicle-controls" className="grid grid-cols-2 gap-1.5">
            <div className="relative">
              <Car className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-accent" />
              <Input
                data-testid="garage-vehicle-plate-input"
                value={orderMeta.vehiclePlate}
                onChange={(e) =>
                  onUpdateOrderMeta({ vehiclePlate: e.target.value.toUpperCase() })
                }
                placeholder="Vehicle Plate *"
                className={`h-8 rounded-[9px] pl-8 text-[11px] font-bold uppercase ${
                  missingRequiredPlate ? 'border-[#EF4444]' : ''
                }`}
              />
            </div>
            <Input
              data-testid="garage-bay-input"
              value={orderMeta.tableOrBayLabel}
              onChange={(e) => onUpdateOrderMeta({ tableOrBayLabel: e.target.value })}
              placeholder="Service Bay (e.g. Bay 2)"
              className="h-8 rounded-[9px] text-[11px]"
            />
          </div>
        )}

        {/* Hardware Quote vs Counter Toggle */}
        {capabilities.layoutMode === 'hardware' && (
          <div className="grid grid-cols-2 gap-1 rounded-[10px] bg-[#F5F6FA] p-1">
            {(
              [
                { id: 'COUNTER', label: 'Counter Sale' },
                { id: 'QUOTATION', label: 'ProForma Quote' },
              ] as const
            ).map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => onUpdateOrderMeta({ orderChannel: ch.id as OrderChannel })}
                className={`min-h-[28px] rounded-[7px] text-[10.5px] font-bold transition-colors cursor-pointer ${
                  orderMeta.orderChannel === ch.id
                    ? 'bg-[#222026] text-white'
                    : 'text-ink-muted hover:text-[#222026]'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>
        )}

        {estimatedEarnedPoints > 0 && (
          <div className="flex items-center justify-between rounded-[10px] bg-accent-soft/65 px-2.5 py-1 text-[10.5px] font-semibold text-accent-soft-fg">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-accent" />
              Loyalty Bonus ({activeCustomer?.loyalty_tier || 'Member'})
            </span>
            <span className="font-bold tabular-nums">+{estimatedEarnedPoints} pts</span>
          </div>
        )}
      </div>

      {/* 2. Scrollable Cart Line Items */}
      <ScrollFadeList
        containerClassName="flex-1 min-h-0"
        maxHeightClass="max-h-full"
        className="space-y-3 rounded-[14px] bg-[#F5F6FA]/70 p-2.5"
      >
        {items.length === 0 ? (
          <div className="flex flex-1 min-h-[140px] flex-col items-center justify-center rounded-[12px] border border-dashed border-border-theme bg-white/80 px-4 py-6 text-center">
            <ShoppingBag className="mb-1.5 h-5 w-5 text-ink-muted/60" />
            <p className="text-[12px] font-bold text-[#222026]">Cart is empty</p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">
              Tap an item on the left or scan a barcode to start billing.
            </p>
          </div>
        ) : capabilities.splitLaborParts && (partItems.length > 0 || laborItems.length > 0) ? (
          <div data-testid="garage-split-cart" className="space-y-2.5">
            {partItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="px-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
                  Auto Parts & Goods ({partItems.length})
                </p>
                {partItems.map((item) => (
                  <CartLineCard
                    key={item.lineKey}
                    item={item}
                    capabilities={capabilities}
                    maxCashierDiscount={maxCashierDiscount}
                    onIncrement={onIncrementLine}
                    onDecrement={onDecrementLine}
                    onSetQty={onSetLineQty}
                    onSetDiscount={onSetLineDiscount}
                    onSetMeta={onSetLineMeta}
                    formatMoney={formatMoney}
                  />
                ))}
              </div>
            )}
            {laborItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="px-1 text-[10px] font-extrabold uppercase tracking-wider text-accent">
                  Service & Labor ({laborItems.length})
                </p>
                {laborItems.map((item) => (
                  <CartLineCard
                    key={item.lineKey}
                    item={item}
                    capabilities={capabilities}
                    maxCashierDiscount={maxCashierDiscount}
                    onIncrement={onIncrementLine}
                    onDecrement={onDecrementLine}
                    onSetQty={onSetLineQty}
                    onSetDiscount={onSetLineDiscount}
                    onSetMeta={onSetLineMeta}
                    formatMoney={formatMoney}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          items.map((item) => (
            <CartLineCard
              key={item.lineKey}
              item={item}
              capabilities={capabilities}
              maxCashierDiscount={maxCashierDiscount}
              onIncrement={onIncrementLine}
              onDecrement={onDecrementLine}
              onSetQty={onSetLineQty}
              onSetDiscount={onSetLineDiscount}
              onSetMeta={onSetLineMeta}
              formatMoney={formatMoney}
            />
          ))
        )}
      </ScrollFadeList>

      {/* 3. Zero-Float Tax & Grand Total Summary */}
      <div className="shrink-0 rounded-[14px] border border-border-theme/70 bg-[#F5F6FA]/85 px-3 py-2 space-y-1 text-[11px]">
        <div className="flex justify-between text-ink-muted">
          <span>Subtotal</span>
          <span className="font-semibold text-[#222026] tabular-nums">
            {formatMoney(totals.grossSubtotal)}
          </span>
        </div>

        {cmpDecimal(totals.totalDiscount, '0') > 0 && (
          <div className="flex justify-between text-[#EF4444]">
            <span>Discount</span>
            <span className="font-semibold tabular-nums">
              -{formatMoney(totals.totalDiscount)}
            </span>
          </div>
        )}

        {totals.taxBreakdown.map((tax) => (
          <div key={tax.code} className="flex justify-between text-ink-muted">
            <span>{formatTaxLabel(tax.name, tax.code)}</span>
            <span className="font-semibold text-[#222026] tabular-nums">
              {formatMoney(tax.amount)}
            </span>
          </div>
        ))}

        <div className="my-1 border-t border-dashed border-ink-muted/35" />

        <div className="flex justify-between items-baseline text-[13.5px] font-extrabold text-[#222026]">
          <span>Grand Total</span>
          <span data-testid="cart-grand-total" className="tabular-nums">
            {formatMoney(totals.grandTotal)}
          </span>
        </div>
      </div>

      {/* 4. Payment Selector & Cash Numpad */}
      <div className="shrink-0 space-y-1.5">
        <div className="grid grid-cols-3 gap-1.5">
          {paymentOptions.map((pm) => {
            const Icon = pm.icon;
            const active = paymentMethod === pm.id;
            return (
              <button
                key={pm.id}
                type="button"
                data-testid={`payment-method-${pm.id}`}
                onClick={() => onSetPaymentMethod(pm.id)}
                aria-pressed={active}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-[12px] border px-2 py-1.5 text-[10.5px] font-bold transition-all cursor-pointer ${
                  active
                    ? 'border-[#222026] bg-[#222026] text-white shadow-xs'
                    : 'border-border-theme/80 bg-white text-ink-muted hover:border-accent/55 hover:text-[#222026]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{pm.label}</span>
              </button>
            );
          })}
        </div>

        {paymentMethod === 'CASH' && (
          <div
            data-testid="pos-cash-numpad"
            className="space-y-1.5 rounded-[14px] border border-border-theme/70 bg-[#F5F6FA] p-2"
          >
            <div className="flex items-center justify-between gap-2 rounded-[10px] bg-[#222026] px-2.5 py-1.5 text-white">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/70">
                  Tendered
                </p>
                <p className="text-[11.5px] font-bold tabular-nums">
                  {tenderedAmount
                    ? `${currencySymbol}${tenderedAmount}`
                    : formatMoney(totals.grandTotal)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-white/70">
                  Change Due
                </p>
                <p className="text-[11.5px] font-bold text-[#22C55E] tabular-nums">
                  {formatMoney(totals.changeDue)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => onSetTenderedAmount(totals.grandTotal)}
                className="min-h-[26px] rounded-[7px] border border-border-theme bg-white text-[10px] font-bold text-[#222026] hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                Exact
              </button>
              {quickCashTargets.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => onSetTenderedAmount(amt)}
                  className="min-h-[26px] rounded-[7px] border border-border-theme bg-white text-[10px] font-bold text-[#222026] hover:border-accent hover:text-accent transition-colors tabular-nums cursor-pointer"
                >
                  {currencySymbol}
                  {amt.replace(/\.00$/, '')}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => (
                <TactileButton
                  key={k}
                  tone="light"
                  onClick={() => onAppendNumpad(k)}
                  className="min-h-[28px] py-0.5 text-xs font-bold"
                >
                  {k === '⌫' ? <Delete className="h-3.5 w-3.5" /> : k}
                </TactileButton>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5. Secondary Hold/KOT/Quote & Bottom-Right Primary Charge CTA */}
      <div className="shrink-0 space-y-2 border-t border-border-theme/70 pt-2">
        <div className="grid grid-cols-2 gap-2">
          <TactileButton
            tone="soft"
            data-testid="pos-secondary-park-btn"
            disabled={items.length === 0 || holdingBill}
            onClick={onSecondaryParkAction}
            className="min-h-[36px] py-1 text-[11px]"
          >
            <SecondaryIcon className="mr-1.5 h-3.5 w-3.5 text-accent" />
            {holdingBill ? 'Saving...' : secondaryActionMeta.label}
          </TactileButton>

          <HoldToConfirm
            label="Void Cart"
            holdingLabel="Hold 1s..."
            variant="muted"
            durationMs={1100}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            disabled={items.length === 0}
            onConfirm={() => void onVoidCartConfirm()}
            className="min-h-[36px] py-1 text-[11px]"
          />
        </div>

        <DynamicButton
          data-testid="pos-charge-cta"
          variant="obsidian"
          loading={charging}
          success={chargeSuccess}
          disabled={items.length === 0 || missingRequiredPlate}
          onClick={onChargeClick}
          className="w-full min-h-[44px] rounded-[12px] text-[13px] font-bold"
        >
          {missingRequiredPlate
            ? 'Enter Vehicle Plate Above'
            : chargeStage || `Charge ${formatMoney(totals.grandTotal)}`}
        </DynamicButton>
      </div>
    </section>
  );
}

