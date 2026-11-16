import * as React from 'react';
import {
  Banknote,
  CreditCard,
  Delete,
  Minus,
  PauseCircle,
  Plus,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Split,
  Ticket,
  Trash2,
  UserCheck,
  UserPlus,
  WifiOff,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { HoldToConfirm } from '@/components/dqnamo/HoldToConfirm';
import { formatTaxLabel } from '@/lib/formatLabel';
import type { LocalProduct } from '@/lib/dexie-db';
import type { CartItem } from '@/store/posStore';
import type { HeldBillEntryDTO, POSCustomer } from './types';

interface TaxSummaryLine {
  code: string;
  name: string;
  amount: number;
}

export interface POSTotalsSummary {
  grossSubtotal: number;
  totalDiscount: number;
  taxTotal: number;
  grandTotal: number;
  changeDue: number;
  tenderedNum: number;
  taxBreakdown: TaxSummaryLine[];
}

interface POSCartCheckoutPanelProps {
  activeBranchName: string;
  items: CartItem[];
  selectedCustomerId: string | null;
  selectedCustomerName: string;
  activeCustomer?: POSCustomer | null;
  customers: POSCustomer[];
  customerPopoverOpen: boolean;
  onCustomerPopoverOpenChange: (open: boolean) => void;
  onSelectCustomer: (id: string | null, name: string) => void;
  onOpenNewCustomer: () => void;
  pendingOutboxCount: number;
  activeHeldBillId: string | null;
  heldBills: HeldBillEntryDTO[];
  onRecallHeldBill: (entry: HeldBillEntryDTO) => void;
  onVoidHeldBill: (billId: string) => void;
  onOpenHeldDrawer: () => void;
  estimatedEarnedPoints: number;
  totals: POSTotalsSummary;
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT';
  onSetPaymentMethod: (method: 'CASH' | 'CARD' | 'SPLIT') => void;
  tenderedAmount: string;
  onSetTenderedAmount: (val: string) => void;
  onAppendNumpad: (key: string) => void;
  onAddProduct: (product: LocalProduct) => void;
  onDecrementItem: (productId: string, name: string, qty: number) => void;
  onSetItemDiscount: (productId: string, pct: number) => void;
  maxCashierDiscount: number;
  onHoldBill: () => void;
  holdingBill: boolean;
  onVoidCartConfirm: () => Promise<void> | void;
  onChargeClick: () => void;
  charging: boolean;
  chargeStage: string | null;
  chargeSuccess: boolean;
  currencySymbol: string;
  formatMoney: (value: number | string) => string;
  labels: {
    addCustomer: string;
    walkInGuest: string;
    emptyCart: string;
    subtotal: string;
    discount: string;
    grandTotal: string;
    card: string;
    cash: string;
    split: string;
    tendered: string;
    changeDue: string;
    holdBill: string;
    voidCart: string;
    charge: string;
  };
}

/**
 * Right-hand checkout register panel matching the modern stacked order layout:
 * Customer header with circular quick controls, Active/Parked segmented toggle,
 * thumbnail cart cards, dashed-divider financial summary, 3 payment tiles,
 * compact cash numpad, and primary Gutenberg bottom-right Charge CTA.
 */
export function POSCartCheckoutPanel({
  activeBranchName,
  items,
  selectedCustomerId,
  selectedCustomerName,
  activeCustomer,
  customers,
  customerPopoverOpen,
  onCustomerPopoverOpenChange,
  onSelectCustomer,
  onOpenNewCustomer,
  pendingOutboxCount,
  activeHeldBillId,
  heldBills,
  onRecallHeldBill,
  onVoidHeldBill,
  onOpenHeldDrawer,
  estimatedEarnedPoints,
  totals,
  paymentMethod,
  onSetPaymentMethod,
  tenderedAmount,
  onSetTenderedAmount,
  onAppendNumpad,
  onAddProduct,
  onDecrementItem,
  onSetItemDiscount,
  maxCashierDiscount,
  onHoldBill,
  holdingBill,
  onVoidCartConfirm,
  onChargeClick,
  charging,
  chargeStage,
  chargeSuccess,
  currencySymbol,
  formatMoney,
  labels,
}: POSCartCheckoutPanelProps) {
  const [panelTab, setPanelTab] = React.useState<'active' | 'parked'>('active');
  const prevQtyRef = React.useRef(0);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

  // Switch back to the active cart whenever a new item is scanned or added
  React.useEffect(() => {
    if (totalQty > prevQtyRef.current) {
      setPanelTab('active');
    }
    prevQtyRef.current = totalQty;
  }, [totalQty]);

  const paymentOptions = [
    { id: 'CARD', label: labels.card, icon: CreditCard },
    { id: 'CASH', label: labels.cash, icon: Banknote },
    { id: 'SPLIT', label: labels.split, icon: Split },
  ] as const;

  const quickCashTargets = React.useMemo(() => {
    const gt = totals.grandTotal;
    if (gt <= 0) return [10, 20, 50];
    const ceil10 = Math.ceil(gt / 10) * 10;
    const ceil50 = Math.ceil(gt / 50) * 50;
    const ceil100 = Math.ceil(gt / 100) * 100;
    return Array.from(
      new Set([ceil10 > gt ? ceil10 : ceil10 + 10, ceil50 > gt ? ceil50 : ceil50 + 50, ceil100 > gt ? ceil100 : ceil100 + 100])
    ).slice(0, 3);
  }, [totals.grandTotal]);

  const customerSubtitle =
    activeCustomer && !activeCustomer.is_walk_in
      ? `${activeCustomer.phone || 'Member'} • ${activeCustomer.loyalty_points} pts${
          activeCustomer.loyalty_tier ? ` • ${activeCustomer.loyalty_tier}` : ''
        }`
      : `${activeBranchName || 'Main Register'} • Counter Checkout`;

  return (
    <div className="flex h-full min-h-0 flex-col justify-between gap-2.5">
      {/* 1. Order / Customer Header & 2-Segment Switch */}
      <div className="shrink-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-[15px] font-extrabold text-ink leading-tight">
                {selectedCustomerId ? selectedCustomerName : labels.walkInGuest}
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
            <p className="mt-0.5 truncate text-[11px] font-medium text-ink-muted">
              {customerSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Popover open={customerPopoverOpen} onOpenChange={onCustomerPopoverOpenChange}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={labels.addCustomer || 'Add Customer'}
                  title="Select or switch customer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-theme/80 bg-surface-muted text-ink hover:border-accent hover:text-accent transition-colors cursor-pointer"
                >
                  <UserCheck className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[310px] p-0">
                <Command>
                  <CommandInput placeholder="e.g., +94 77 123 4567 or Name" />
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
                    className="flex min-h-[36px] w-full items-center justify-center gap-2 rounded-[var(--theme-radius-control)] bg-accent px-3 py-1.5 text-xs font-bold text-accent-fg hover:opacity-90 transition cursor-pointer"
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-theme/80 bg-surface-muted text-accent hover:bg-accent hover:text-accent-fg transition-colors cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Register Mode Toggle: Active Cart vs Parked Held Bills */}
        <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface-muted p-1">
          <button
            type="button"
            onClick={() => setPanelTab('active')}
            className={`min-h-[30px] rounded-[9px] px-2.5 text-[11.5px] font-bold transition-all cursor-pointer tabular-nums ${
              panelTab === 'active'
                ? 'bg-accent-soft/85 text-ink shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Current Bill ({totalQty})
          </button>
          <button
            type="button"
            onClick={() => setPanelTab('parked')}
            className={`min-h-[30px] rounded-[9px] px-2.5 text-[11.5px] font-bold transition-all cursor-pointer tabular-nums ${
              panelTab === 'parked'
                ? 'bg-accent-soft/85 text-ink shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Parked ({heldBills.length})
          </button>
        </div>

        {estimatedEarnedPoints > 0 && panelTab === 'active' && (
          <div className="flex items-center justify-between rounded-[10px] bg-accent-soft/55 px-3 py-1 text-[10.5px] font-semibold text-accent-soft-fg">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-accent" />
              Loyalty Bonus ({activeCustomer?.loyalty_tier || 'Member'})
            </span>
            <span className="font-bold tabular-nums">+{estimatedEarnedPoints} pts</span>
          </div>
        )}
      </div>

      {/* 2. Scrollable Line Items or Quick Parked Tickets List */}
      {panelTab === 'parked' ? (
        <div className="flex-1 min-h-[120px] overflow-y-auto pos-clean-scroll pr-1 space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] font-bold text-ink-muted">
              Suspended Tickets
            </span>
            <button
              type="button"
              onClick={onOpenHeldDrawer}
              className="text-[11px] font-bold text-accent hover:underline cursor-pointer"
            >
              Open Full Drawer
            </button>
          </div>
          {heldBills.length === 0 ? (
            <div className="flex h-[180px] flex-col items-center justify-center rounded-[14px] border border-dashed border-border-theme bg-surface-muted/55 px-4 text-center">
              <Ticket className="h-6 w-6 text-accent/65" />
              <p className="mt-1.5 text-[11.5px] font-semibold text-ink-muted">
                No parked bills in queue
              </p>
            </div>
          ) : (
            heldBills.map((entry) => (
              <div
                key={entry.bill.id}
                className="rounded-[14px] border border-border-theme/75 bg-surface p-2.5 space-y-2 shadow-[0_1px_4px_rgba(34,32,38,0.03)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-[6px] bg-accent-soft/80 px-1.5 py-0.5 text-[10px] font-extrabold text-ink tabular-nums">
                        {entry.bill.hold_code}
                      </span>
                      <span className="truncate text-[12px] font-bold text-ink">
                        {entry.bill.customer_name || 'Walk-in Guest'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-ink-muted tabular-nums">
                      {entry.items.length} line{entry.items.length === 1 ? '' : 's'} •{' '}
                      {new Date(entry.bill.held_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="text-[12.5px] font-extrabold text-accent tabular-nums">
                    {formatMoney(entry.bill.grand_total)}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onVoidHeldBill(entry.bill.id)}
                    className="inline-flex h-7 items-center gap-1 rounded-[8px] border border-border-theme px-2.5 text-[10.5px] font-semibold text-ink-muted hover:border-[#EF4444]/40 hover:text-[#EF4444] transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Void
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRecallHeldBill(entry);
                      setPanelTab('active');
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-[8px] bg-contrast px-3 text-[10.5px] font-bold text-contrast-fg hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Recall
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-[110px] overflow-y-auto pos-clean-scroll pr-1 space-y-2">
          {items.length === 0 ? (
            <div className="flex h-full min-h-[130px] flex-col items-center justify-center rounded-[14px] border border-dashed border-border-theme bg-surface-muted/55 px-4 py-6 text-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft/60 text-accent">
                <ShoppingCart className="h-5 w-5" />
              </span>
              <p className="mt-2 text-[12px] font-bold text-ink">{labels.emptyCart}</p>
              <p className="mt-0.5 text-[10.5px] text-ink-muted">
                Scan a barcode or click &ldquo;Add to Bill&rdquo; on any item.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const thumb =
                (Array.isArray(item.product.image_urls)
                  ? item.product.image_urls[0]
                  : undefined) ||
                item.product.image_url ||
                '/products/cardigan.svg';
              const lineTotal =
                (parseFloat(
                  Number(item.product.discount_percent || 0) > 0 &&
                    parseFloat(item.product.base_price) > parseFloat(item.product.sale_price)
                    ? item.product.base_price
                    : item.product.sale_price
                ) || 0) *
                item.qty *
                (1 - item.discountPercent / 100);

              return (
                <div
                  key={item.product.id}
                  data-testid={`pos-cart-item-${item.product.id}`}
                  className="rounded-[14px] border border-border-theme/75 bg-surface p-2.5 shadow-[0_1px_4px_rgba(34,32,38,0.03)] transition-colors hover:border-accent/50"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-surface-muted p-1">
                      <img
                        src={thumb}
                        alt={item.product.name}
                        onError={(e) => {
                          e.currentTarget.src = '/products/cardigan.svg';
                        }}
                        className="h-full w-auto object-contain"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[12.5px] font-bold text-ink">
                          {item.product.name}
                        </p>
                        <span className="shrink-0 text-[12.5px] font-extrabold text-accent tabular-nums">
                          {formatMoney(lineTotal)}
                        </span>
                      </div>
                      <p className="text-[10.5px] font-medium text-ink-muted tabular-nums">
                        {formatMoney(item.product.sale_price)} × {item.qty}
                        {item.discountPercent > 0 ? ` (${item.discountPercent}% off)` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-border-theme/45 pt-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onDecrementItem(item.product.id, item.product.name, item.qty)
                        }
                        aria-label="Decrease quantity"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-border-theme bg-surface-muted text-ink hover:border-accent hover:text-accent transition-colors cursor-pointer"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-[11.5px] font-extrabold text-ink tabular-nums">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => onAddProduct(item.product)}
                        aria-label="Increase quantity"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-border-theme bg-surface-muted text-ink hover:border-accent hover:text-accent transition-colors cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Discount Chips (exceeding designation/setting cap triggers Supervisor PIN) */}
                    <div className="flex items-center gap-1">
                      {[0, 10, 25].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => onSetItemDiscount(item.product.id, pct)}
                          className={`rounded-[7px] px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
                            item.discountPercent === pct
                              ? pct > maxCashierDiscount
                                ? 'bg-contrast text-contrast-fg'
                                : 'bg-accent text-accent-fg'
                              : 'bg-surface-muted text-ink-muted hover:bg-accent-soft/55 hover:text-ink'
                          }`}
                          title={
                            pct > maxCashierDiscount
                              ? `Exceeds ${maxCashierDiscount}% cap — requires Manager PIN`
                              : `${pct}% discount`
                          }
                        >
                          {pct === 0 ? '0%' : `-${pct}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 3. Financial Summary Box with Dashed Separator */}
      <div className="shrink-0 rounded-[14px] border border-border-theme/70 bg-surface-muted/75 px-3.5 py-2.5 space-y-1 text-[11.5px]">
        <div className="flex justify-between text-ink-muted">
          <span>{labels.subtotal}</span>
          <span className="font-semibold text-ink tabular-nums">
            {formatMoney(totals.grossSubtotal)}
          </span>
        </div>

        {totals.totalDiscount > 0 && (
          <div className="flex justify-between text-[#EF4444]">
            <span>{labels.discount}</span>
            <span className="font-semibold tabular-nums">
              -{formatMoney(totals.totalDiscount)}
            </span>
          </div>
        )}

        {totals.taxBreakdown.map((tax) => (
          <div key={tax.code} className="flex justify-between text-ink-muted">
            <span>{formatTaxLabel(tax.name, tax.code)}</span>
            <span className="font-semibold text-ink tabular-nums">
              {formatMoney(tax.amount)}
            </span>
          </div>
        ))}

        <div className="my-1 border-t border-dashed border-ink-muted/35" />

        <div className="flex justify-between items-baseline text-[13.5px] font-extrabold text-ink">
          <span>{labels.grandTotal}</span>
          <span className="tabular-nums">{formatMoney(totals.grandTotal)}</span>
        </div>
      </div>

      {/* 4. 3-Tile Payment Method Selector & Compact Cash Pad */}
      <div className="shrink-0 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {paymentOptions.map((pm) => {
            const Icon = pm.icon;
            const active = paymentMethod === pm.id;
            return (
              <button
                key={pm.id}
                type="button"
                onClick={() => onSetPaymentMethod(pm.id)}
                aria-pressed={active}
                className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[12px] border px-2 py-2 text-[11px] font-bold transition-all cursor-pointer ${
                  active
                    ? 'border-accent bg-accent-soft/75 text-ink shadow-xs'
                    : 'border-border-theme/80 bg-surface text-ink-muted hover:border-accent/55 hover:text-ink'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-accent' : ''}`} />
                <span>{pm.label}</span>
              </button>
            );
          })}
        </div>

        {paymentMethod === 'CASH' && (
          <div
            data-testid="pos-cash-numpad"
            className="space-y-1.5 rounded-[14px] border border-border-theme/70 bg-surface-muted/65 p-2"
          >
            <div className="flex items-center justify-between gap-2 rounded-[10px] bg-contrast px-2.5 py-1.5 text-contrast-fg">
              <div>
                <p className="text-[9.5px] font-semibold uppercase tracking-wider text-white/75">
                  {labels.tendered}
                </p>
                <p className="text-[12px] font-bold tabular-nums">
                  {tenderedAmount
                    ? `${currencySymbol}${tenderedAmount}`
                    : formatMoney(totals.grandTotal)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9.5px] font-semibold uppercase tracking-wider text-white/75">
                  {labels.changeDue}
                </p>
                <p className="text-[12px] font-bold text-[#22C55E] tabular-nums">
                  {formatMoney(totals.changeDue)}
                </p>
              </div>
            </div>

            {/* Quick Cash Tenders */}
            <div className="grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => onSetTenderedAmount(totals.grandTotal.toFixed(2))}
                className="min-h-[26px] rounded-[7px] border border-border-theme bg-surface text-[10px] font-bold text-ink hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                Exact
              </button>
              {quickCashTargets.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => onSetTenderedAmount(amt.toFixed(2))}
                  className="min-h-[26px] rounded-[7px] border border-border-theme bg-surface text-[10px] font-bold text-ink hover:border-accent hover:text-accent transition-colors tabular-nums cursor-pointer"
                >
                  {currencySymbol}
                  {amt}
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

      {/* 5. Secondary Hold/Void Row + Bottom-Right Gutenberg Charge CTA */}
      <div className="shrink-0 space-y-2 border-t border-border-theme/70 pt-2">
        <div className="grid grid-cols-2 gap-2">
          <TactileButton
            tone="soft"
            disabled={items.length === 0 || holdingBill}
            onClick={onHoldBill}
            className="min-h-[34px] py-1 text-[11px]"
          >
            <PauseCircle className="mr-1.5 h-3.5 w-3.5 text-accent" />
            {holdingBill ? 'Holding...' : labels.holdBill}
          </TactileButton>

          <HoldToConfirm
            label={labels.voidCart}
            holdingLabel="Hold 1.5s..."
            variant="muted"
            durationMs={1500}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            disabled={items.length === 0}
            onConfirm={() => void onVoidCartConfirm()}
            className="min-h-[34px] py-1 text-[11px]"
          />
        </div>

        <DynamicButton
          variant="obsidian"
          loading={charging}
          success={chargeSuccess}
          disabled={items.length === 0}
          onClick={onChargeClick}
          className="w-full min-h-[44px] rounded-[12px] text-[13px] font-bold"
        >
          {chargeStage || `${labels.charge} ${formatMoney(totals.grandTotal)}`}
        </DynamicButton>
      </div>
    </div>
  );
}
