import { create } from 'zustand';
import type { CartItemMeta, LocalProduct } from '@/lib/dexie-db';
import type { OrderChannel } from '@/features/pos/components/capabilities';
import {
  addDecimal,
  getProductPromoPercent,
  isPositiveDecimal,
  normalizeDecimal,
  roundDecimal,
} from '@/lib/decimal';

export interface CartItem {
  lineKey: string;
  product: LocalProduct;
  qty: number;
  discountPercent: number;
  itemMeta?: CartItemMeta;
}

export interface OrderMetaState {
  orderChannel: OrderChannel;
  tableOrBayLabel: string;
  vehiclePlate: string;
  driverName: string;
  orderNotes: string;
}

export function buildCartLineKey(productId: string, itemMeta?: CartItemMeta): string {
  if (!itemMeta) return productId;
  const variant = itemMeta.variant?.trim() || '';
  const uom = itemMeta.uom_label?.trim() || '';
  const mods = (itemMeta.modifiers || []).slice().sort().join(',');
  if (!variant && !uom && !mods) return productId;
  return `${productId}::${variant}::${uom}::${mods}`;
}

export function parseSerialImeiList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchesLine(item: CartItem, keyOrProductId: string): boolean {
  return item.lineKey === keyOrProductId || item.product.id === keyOrProductId;
}

interface POSState extends OrderMetaState {
  items: CartItem[];
  selectedCustomerId: string | null;
  selectedCustomerName: string;
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT';
  tenderedAmount: string;
  activeHeldBillId: string | null;
  pendingOutboxCount: number;
  addItem: (product: LocalProduct, itemMeta?: CartItemMeta, qtyDelta?: number) => void;
  updateQty: (lineKeyOrProductId: string, delta: number) => void;
  setQty: (lineKeyOrProductId: string, exactQty: string | number) => void;
  setItemDiscount: (lineKeyOrProductId: string, pct: number) => void;
  setItemMeta: (lineKeyOrProductId: string, metaPatch: Partial<CartItemMeta>) => void;
  removeItem: (lineKeyOrProductId: string) => void;
  setCustomer: (id: string | null, name: string) => void;
  setPaymentMethod: (method: 'CASH' | 'CARD' | 'SPLIT') => void;
  setTenderedAmount: (val: string) => void;
  setOrderMeta: (patch: Partial<OrderMetaState>) => void;
  loadHeldBill: (
    billId: string,
    customerId: string | null,
    customerName: string,
    items: CartItem[],
    meta?: Partial<OrderMetaState>,
  ) => void;
  setPendingOutboxCount: (count: number) => void;
  clearCart: (defaultChannel?: OrderChannel) => void;
}

export const usePOSStore = create<POSState>((set) => ({
  items: [],
  selectedCustomerId: null,
  selectedCustomerName: 'Walk-in Guest',
  paymentMethod: 'CARD',
  tenderedAmount: '',
  activeHeldBillId: null,
  pendingOutboxCount: 0,
  orderChannel: 'COUNTER',
  tableOrBayLabel: '',
  vehiclePlate: '',
  driverName: '',
  orderNotes: '',

  addItem: (product, itemMeta, qtyDelta = 1) =>
    set((state) => {
      const lineKey = buildCartLineKey(product.id, itemMeta);
      const idx = state.items.findIndex((i) => i.lineKey === lineKey);
      if (idx >= 0) {
        const next = [...state.items];
        const existing = next[idx];
        const nextQtyStr = roundDecimal(addDecimal(existing.qty, qtyDelta), 3, 'HALF_UP');
        const existingImeis = parseSerialImeiList(existing.itemMeta?.serial_imei);
        const incomingImeis = parseSerialImeiList(itemMeta?.serial_imei);
        const mergedImeis = Array.from(new Set([...existingImeis, ...incomingImeis]));
        const nextMeta: CartItemMeta | undefined =
          existing.itemMeta || itemMeta
            ? {
                ...(existing.itemMeta || {}),
                ...(itemMeta || {}),
                ...(mergedImeis.length > 0 ? { serial_imei: mergedImeis.join(', ') } : {}),
              }
            : undefined;
        next[idx] = {
          ...existing,
          qty: Number(normalizeDecimal(nextQtyStr, 0)),
          itemMeta: nextMeta,
        };
        return { items: next };
      }
      const autoDiscountPercent = getProductPromoPercent(product);
      return {
        items: [
          ...state.items,
          {
            lineKey,
            product,
            qty: qtyDelta > 0 ? qtyDelta : 1,
            discountPercent: autoDiscountPercent,
            itemMeta,
          },
        ],
      };
    }),

  updateQty: (lineKeyOrProductId, delta) =>
    set((state) => ({
      items: state.items
        .map((i) => {
          if (!matchesLine(i, lineKeyOrProductId)) return i;
          const nextStr = roundDecimal(addDecimal(i.qty, delta), 3, 'HALF_UP');
          const nextNum = Number(normalizeDecimal(nextStr, 0));
          return { ...i, qty: nextNum };
        })
        .filter((i) => i.qty > 0),
    })),

  setQty: (lineKeyOrProductId, exactQty) =>
    set((state) => {
      const parsed = roundDecimal(exactQty, 3, 'HALF_UP');
      const positive = isPositiveDecimal(parsed);
      return {
        items: state.items
          .map((i) =>
            matchesLine(i, lineKeyOrProductId)
              ? { ...i, qty: positive ? Number(normalizeDecimal(parsed, 0)) : 0 }
              : i,
          )
          .filter((i) => i.qty > 0),
      };
    }),

  setItemDiscount: (lineKeyOrProductId, pct) =>
    set((state) => ({
      items: state.items.map((i) =>
        matchesLine(i, lineKeyOrProductId) ? { ...i, discountPercent: pct } : i,
      ),
    })),

  setItemMeta: (lineKeyOrProductId, metaPatch) =>
    set((state) => ({
      items: state.items.map((i) => {
        if (!matchesLine(i, lineKeyOrProductId)) return i;
        const merged = { ...(i.itemMeta || {}), ...metaPatch };
        return {
          ...i,
          itemMeta: merged,
          lineKey: buildCartLineKey(i.product.id, merged),
        };
      }),
    })),

  removeItem: (lineKeyOrProductId) =>
    set((state) => ({
      items: state.items.filter((i) => !matchesLine(i, lineKeyOrProductId)),
    })),

  setCustomer: (id, name) =>
    set({ selectedCustomerId: id, selectedCustomerName: name }),

  setPaymentMethod: (method) => set({ paymentMethod: method }),

  setTenderedAmount: (val) => set({ tenderedAmount: val }),

  setOrderMeta: (patch) =>
    set((state) => ({
      ...state,
      ...patch,
    })),

  loadHeldBill: (billId, customerId, customerName, items, meta) =>
    set({
      activeHeldBillId: billId,
      selectedCustomerId: customerId,
      selectedCustomerName: customerName,
      items: items.map((item) => ({
        ...item,
        lineKey: item.lineKey || buildCartLineKey(item.product.id, item.itemMeta),
      })),
      orderChannel: meta?.orderChannel ?? 'COUNTER',
      tableOrBayLabel: meta?.tableOrBayLabel ?? '',
      vehiclePlate: meta?.vehiclePlate ?? '',
      driverName: meta?.driverName ?? '',
      orderNotes: meta?.orderNotes ?? '',
    }),

  setPendingOutboxCount: (count) => set({ pendingOutboxCount: count }),

  clearCart: (defaultChannel) =>
    set((state) => ({
      items: [],
      tenderedAmount: '',
      activeHeldBillId: null,
      orderChannel: defaultChannel ?? state.orderChannel,
      tableOrBayLabel: '',
      vehiclePlate: '',
      driverName: '',
      orderNotes: '',
    })),
}));
