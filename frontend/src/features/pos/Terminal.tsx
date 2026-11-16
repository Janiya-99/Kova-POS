import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Boxes,
  Layers,
  LayoutGrid,
  LogOut,
  PauseCircle,
  Package,
  Printer,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  Truck,
  Users,
} from 'lucide-react';
import type { AppRoute } from '@/components/layout/FloatingSidebar';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { POSGridSkeleton } from '@/components/skeletons/POSGridSkeleton';
import { CheckoutReceiptModal, type ReceiptModalData } from './CheckoutReceiptModal';
import { CustomerFormSheet } from './CustomerFormSheet';
import { SupervisorPinModal } from '@/features/auth/SupervisorPinModal';
import { apiFetch, ApiError } from '@/lib/api';
import {
  addDecimal,
  cmpDecimal,
  divDecimal,
  getProductGrossUnitPrice,
  maxDecimal,
  mulDecimal,
  normalizeRoundingMode,
  roundDecimal,
  roundHalfUp2,
  subDecimal,
  type RoundingMode,
} from '@/lib/decimal';
import {
  createIdempotencyKeyV7,
  dexieDB,
  enqueueOfflineCheckout,
  type LocalProduct,
  type LocalTaxRule,
} from '@/lib/dexie-db';
import { dispatchESCPOSPrint, type PaperWidth } from '@/lib/escpos-bridge';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { confirmDestructiveAction } from '@/lib/swal';
import { getDisplayTradeName, useAuthStore } from '@/store/authStore';
import { useT } from '@/store/i18nStore';
import { buildCartLineKey, usePOSStore, type CartItem } from '@/store/posStore';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import {
  CategoryList,
  type LaborPartsFilter,
} from './components/CategoryList';
import { ProductGrid } from './components/ProductGrid';
import { OutgoingOrdersQueue } from './components/OutgoingOrdersQueue';
import { ActiveCart, type CartTotalsSummary } from './components/ActiveCart';
import { TerminalTopBar } from './components/TerminalTopBar';
import { TerminalFooter } from './components/TerminalFooter';
import {
  resolvePOSCapabilities,
  type OrderChannel,
} from './components/capabilities';
import {
  parseJSONField,
  type CartItemMeta,
  type CheckoutResponse,
  type HeldBillEntryDTO,
  type POSBootstrapResponse,
} from './types';

type MobilePaneTab = 'CATEGORIES' | 'PRODUCTS' | 'OUTGOING' | 'CART';

export interface TerminalProps {
  activeRoute?: AppRoute;
  onNavigate?: (route: AppRoute) => void;
  onExitPOS?: () => void;
}

function formatLineMetaSummary(meta?: CartItemMeta): string | undefined {
  if (!meta) return undefined;
  const parts: string[] = [];
  if (meta.variant) parts.push(meta.variant);
  if (meta.uom_label) parts.push(`UOM: ${meta.uom_label}`);
  if (meta.serial_imei) parts.push(`IMEI: ${meta.serial_imei}`);
  if (meta.modifiers?.length) parts.push(meta.modifiers.join(', '));
  if (meta.notes) parts.push(meta.notes);
  return parts.length > 0 ? parts.join(' • ') : undefined;
}

function computeClientTaxPreviewDecimal(
  netAfterDiscount: string,
  taxGroupId: string | null | undefined,
  taxRules: LocalTaxRule[],
  defaultInclusive: boolean,
  roundingMode: RoundingMode,
) {
  const rules = taxRules
    .filter((r) => !taxGroupId || r.tax_group_id === taxGroupId)
    .sort((a, b) => a.priority - b.priority);

  if (rules.length === 0) {
    return {
      exclNet: netAfterDiscount,
      taxTotal: '0',
      lines: [] as Array<{ code: string; name: string; amount: string }>,
    };
  }

  const inclusiveRules = rules.filter((r) => r.tax_type === 'INCLUSIVE');
  const otherRules = rules.filter((r) => r.tax_type !== 'INCLUSIVE');

  let exclNet = netAfterDiscount;
  let runningTax = '0';
  const lines: Array<{ code: string; name: string; amount: string }> = [];

  if (inclusiveRules.length > 0 || defaultInclusive) {
    const useRules = inclusiveRules.length > 0 ? inclusiveRules : rules;
    let sumRate = '0';
    for (const r of useRules) {
      sumRate = addDecimal(sumRate, divDecimal(r.rate_percent, '100', 6, roundingMode));
    }
    exclNet =
      cmpDecimal(sumRate, '0') > 0
        ? divDecimal(netAfterDiscount, addDecimal('1', sumRate), 4, roundingMode)
        : netAfterDiscount;

    for (const r of useRules) {
      const rate = divDecimal(r.rate_percent, '100', 6, roundingMode);
      const amt = roundDecimal(mulDecimal(exclNet, rate), 4, roundingMode);
      runningTax = addDecimal(runningTax, amt);
      lines.push({ code: r.code, name: r.name, amount: amt });
    }
    if (inclusiveRules.length === 0) {
      return { exclNet, taxTotal: runningTax, lines };
    }
  }

  for (const r of otherRules) {
    const base = r.tax_type === 'COMPOUND' ? addDecimal(exclNet, runningTax) : exclNet;
    const rate = divDecimal(r.rate_percent, '100', 6, roundingMode);
    const amt = roundDecimal(mulDecimal(base, rate), 4, roundingMode);
    runningTax = addDecimal(runningTax, amt);
    lines.push({ code: r.code, name: r.name, amount: amt });
  }

  return { exclNet, taxTotal: runningTax, lines };
}

/**
 * Fullscreen 4-Pane Dynamic Industry POS Terminal (`2-5-2-3` / `2-7-3` desktop split + 68px Obsidian Footer).
 */
export function Terminal({
  activeRoute = '/pos',
  onNavigate,
  onExitPOS,
}: TerminalProps) {
  const queryClient = useQueryClient();
  const {
    context,
    publicBranding,
    branches,
    resolvedSettings,
    setResolvedSettings,
    hasPermission,
    logout,
  } = useAuthStore();
  const { t } = useT();
  const { formatMoney, currencyCode, currencySymbol } = useCurrency();
  const pos = usePOSStore();

  const [selectedCategory, setSelectedCategory] = React.useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = React.useState<string>('ALL');
  const [laborPartsFilter, setLaborPartsFilter] = React.useState<LaborPartsFilter>('ALL');
  const [bundlesOnly, setBundlesOnly] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [customerPopoverOpen, setCustomerPopoverOpen] = React.useState(false);
  const [customerSheetOpen, setCustomerSheetOpen] = React.useState(false);
  const [sidebarSheetOpen, setSidebarSheetOpen] = React.useState(false);
  const [receiptData, setReceiptData] = React.useState<ReceiptModalData | null>(null);
  const [lastReceipt, setLastReceipt] = React.useState<ReceiptModalData | null>(null);
  const [charging, setCharging] = React.useState(false);
  const [chargeStage, setChargeStage] = React.useState<string | null>(null);
  const [chargeSuccess, setChargeSuccess] = React.useState(false);
  const [holdingBill, setHoldingBill] = React.useState(false);
  const [pinModalOpen, setPinModalOpen] = React.useState(false);
  const [pendingPayload, setPendingPayload] = React.useState<Record<string, unknown> | null>(null);
  const [pendingKey, setPendingKey] = React.useState<string>('');
  const [mobileTab, setMobileTab] = React.useState<MobilePaneTab>('PRODUCTS');
  const [isOnline, setIsOnline] = React.useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isFullscreen, setIsFullscreen] = React.useState(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );
  const [viewportSize, setViewportSize] = React.useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));
  const [posZoom, setPosZoom] = React.useState<'0.8' | '1'>('0.8');
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  const appliedZoom80 = posZoom === '0.8' && viewportSize.width >= 768;

  const activeBranchName =
    branches.find((b) => b.id === context?.branch_id)?.name || 'Main Branch';

  // Keep network + fullscreen + viewport states synced cleanly
  React.useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onFs = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (active) {
        setPosZoom('0.8');
      }
    };
    const onResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  // Automatically scale POS workspace to 80% on tablet/desktop viewports and restore cleanly on exit
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.zoom = appliedZoom80 ? '0.8' : '';
    return () => {
      document.documentElement.style.zoom = '';
    };
  }, [appliedZoom80]);

  const { data, isLoading, refetch } = useQuery<POSBootstrapResponse>({
    queryKey: ['pos-bootstrap', context?.business_id, context?.branch_id],
    queryFn: async () => {
      try {
        const res = await apiFetch<POSBootstrapResponse>('/api/v1/pos/bootstrap');
        await dexieDB.products.bulkPut(res.products);
        await dexieDB.tax_rules.bulkPut(res.tax_rules);
        await dexieDB.resolved_settings.bulkPut(res.resolved_settings);
        const dict: Record<string, string> = {};
        for (const s of res.resolved_settings || []) {
          try {
            const parsed = JSON.parse(s.effective_json);
            dict[s.key] = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          } catch {
            dict[s.key] = s.effective_json;
          }
        }
        setResolvedSettings(dict);
        return res;
      } catch (err) {
        const cachedProducts = await dexieDB.products.toArray();
        const cachedTaxes = await dexieDB.tax_rules.toArray();
        const cachedSettings = await dexieDB.resolved_settings.toArray();
        if (cachedProducts.length > 0) {
          return {
            products: cachedProducts,
            categories: [],
            brands: [],
            customers: [],
            tax_rules: cachedTaxes,
            resolved_settings: cachedSettings,
            held_bills: [],
          };
        }
        throw err;
      }
    },
  });

  // Merge bootstrapped settings with real-time WS zustand resolvedSettings
  const mergedSettingsDict = React.useMemo(() => {
    const dict: Record<string, string> = {};
    for (const s of data?.resolved_settings || []) {
      try {
        const parsed = JSON.parse(s.effective_json);
        dict[s.key] = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      } catch {
        dict[s.key] = s.effective_json;
      }
    }
    return { ...dict, ...resolvedSettings };
  }, [data?.resolved_settings, resolvedSettings]);

  const capabilities = React.useMemo(
    () => resolvePOSCapabilities(mergedSettingsDict, context?.industry_profile),
    [mergedSettingsDict, context?.industry_profile],
  );

  // Sync default orderChannel cleanly when switching industries on an empty cart
  React.useEffect(() => {
    if (pos.items.length === 0 && !pos.activeHeldBillId) {
      const targetChannel = capabilities.preset.defaultChannel;
      if (pos.orderChannel !== targetChannel) {
        pos.setOrderMeta({ orderChannel: targetChannel });
      }
    }
  }, [capabilities.preset.defaultChannel, pos]);

  // If Outgoing Orders pane gets hidden (e.g. Stationery mode), ensure mobile tab doesn't stay orphaned on OUTGOING
  React.useEffect(() => {
    if (!capabilities.showOutgoingOrdersPane && mobileTab === 'OUTGOING') {
      setMobileTab('PRODUCTS');
    }
    if (!capabilities.showCategoriesPane && mobileTab === 'CATEGORIES') {
      setMobileTab('PRODUCTS');
    }
  }, [capabilities.showOutgoingOrdersPane, capabilities.showCategoriesPane, mobileTab]);

  const toggleFullscreen = React.useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    const activation = (navigator as { userActivation?: { isActive?: boolean } }).userActivation;
    if (activation && !activation.isActive) {
      return;
    }
    setPosZoom('0.8');
    void document.documentElement
      .requestFullscreen?.()
      .catch(() => toast.info('Fullscreen is restricted by the browser until user interaction.'));
  }, []);

  const paperWidthRaw = mergedSettingsDict['pos.thermal_paper_width'] || '80mm';
  const paperWidth = (
    ['58mm', '76.2mm', '80mm'].includes(paperWidthRaw) ? paperWidthRaw : '80mm'
  ) as PaperWidth;

  const kickDrawer =
    (mergedSettingsDict['pos.auto_kick_cash_drawer'] ??
      mergedSettingsDict['hardware.cash_drawer_kick'] ??
      'true') !== 'false';
  const allowNegativeStock =
    (mergedSettingsDict['pos.allow_negative_fifo_stock'] ??
      mergedSettingsDict['inventory.allow_negative_stock'] ??
      'false') === 'true';

  const designationCap = context?.max_pos_discount_pct
    ? Number(context.max_pos_discount_pct)
    : undefined;
  const maxCashierDiscount =
    designationCap !== undefined && !Number.isNaN(designationCap)
      ? designationCap
      : Number(mergedSettingsDict['pos.max_cashier_discount_pct'] ?? 10);

  const loyaltyPerUnit = Number(mergedSettingsDict['pos.loyalty_points_per_unit'] ?? 1);
  const defaultInclusiveTax = mergedSettingsDict['tax.default_inclusive'] === 'true';
  const roundingMode = normalizeRoundingMode(mergedSettingsDict['tax.rounding_mode']);

  const products = (data?.products || []).filter((p) => !p.is_archived);
  const categories = data?.categories || [];
  const brands = data?.brands || [];
  const customers = data?.customers || [];
  const taxRules = data?.tax_rules || [];
  const heldBills = data?.held_bills || [];

  const activeCustomer = React.useMemo(
    () => customers.find((c) => c.id === pos.selectedCustomerId) || null,
    [customers, pos.selectedCustomerId],
  );

  const filteredProducts = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'ALL' && p.category_id !== selectedCategory) return false;
      if (selectedBrand !== 'ALL' && (p.brand_id || '') !== selectedBrand) return false;
      if (capabilities.splitLaborParts) {
        if (laborPartsFilter === 'LABOR' && !p.is_service_labor) return false;
        if (laborPartsFilter === 'PARTS' && Boolean(p.is_service_labor)) return false;
      }
      if (bundlesOnly) {
        const uoms = parseJSONField<unknown[]>(p.uom_options_json, []);
        const isBundle = uoms.length > 1 || p.name.toLowerCase().includes('pack') || p.name.toLowerCase().includes('bundle');
        if (!isBundle) return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.brand_name || '').toLowerCase().includes(q) ||
        (p.primary_barcode || '').toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, selectedBrand, capabilities.splitLaborParts, laborPartsFilter, bundlesOnly, search]);

  const isNegativeAllowedForProduct = React.useCallback(
    (product: LocalProduct): boolean => {
      if (typeof product.allow_negative_stock === 'boolean') {
        return product.allow_negative_stock;
      }
      return allowNegativeStock;
    },
    [allowNegativeStock],
  );

  const addProductWithCheck = React.useCallback(
    (product: LocalProduct, itemMeta?: CartItemMeta) => {
      if (!product.is_service_labor) {
        const stockStr = product.branch_stock || '0';
        const uomFactor = itemMeta?.uom_factor ? String(itemMeta.uom_factor) : '1';
        let currentBaseUnits = '0';
        for (const line of pos.items) {
          if (line.product.id === product.id) {
            const f = line.itemMeta?.uom_factor ? String(line.itemMeta.uom_factor) : '1';
            currentBaseUnits = addDecimal(currentBaseUnits, mulDecimal(line.qty, f));
          }
        }
        const neededBaseUnits = addDecimal(currentBaseUnits, uomFactor);
        if (!isNegativeAllowedForProduct(product) && cmpDecimal(neededBaseUnits, stockStr) > 0) {
          toast.error(`Insufficient branch FIFO stock for ${product.name} (${stockStr} available)`);
          return;
        }
      }
      pos.addItem(product, itemMeta, 1);
    },
    [pos, isNegativeAllowedForProduct],
  );

  // Postel's Law: handle barcode scans with spaces stripped and auto-submit 13-digit EAN
  const handleBarcodeChange = (value: string) => {
    setSearch(value);
    const stripped = value.replace(/\s+/g, '').toLowerCase();
    if (/^\d{13}$/.test(stripped)) {
      const match = products.find(
        (p) =>
          (p.primary_barcode || '').replace(/\s+/g, '').toLowerCase() === stripped ||
          p.sku.replace(/\s+/g, '').toLowerCase() === stripped,
      );
      if (match) {
        addProductWithCheck(match);
        setSearch('');
        toast.success(`Scanned ${match.name}`);
      }
    }
  };

  const handleBarcodeEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const raw = search.trim().toLowerCase();
    const stripped = search.replace(/\s+/g, '').toLowerCase();
    if (!raw) return;
    const exact = products.find(
      (p) =>
        p.primary_barcode.toLowerCase() === raw ||
        p.primary_barcode.replace(/\s+/g, '').toLowerCase() === stripped ||
        p.sku.toLowerCase() === raw,
    );
    if (exact) {
      addProductWithCheck(exact);
      setSearch('');
      toast.success(`Scanned ${exact.name}`);
    } else if (filteredProducts.length === 1) {
      addProductWithCheck(filteredProducts[0]);
      setSearch('');
    }
  };

  const handleDecrementLine = async (
    lineKey: string,
    name: string,
    currentQty: number,
    step: number,
  ) => {
    if (currentQty - step <= 0) {
      const ok = await confirmDestructiveAction({
        title: 'Remove item from cart?',
        text: `Discard ${name} from the current bill?`,
        cancelLabel: 'Keep Item',
        confirmLabel: 'Remove Item',
      });
      if (!ok) return;
      pos.removeItem(lineKey);
      return;
    }
    pos.updateQty(lineKey, -step);
  };

  const handleIncrementLine = (lineKey: string, step: number) => {
    const line = pos.items.find((i) => i.lineKey === lineKey);
    if (!line) return;
    if (!line.product.is_service_labor && !isNegativeAllowedForProduct(line.product)) {
      const factor = line.itemMeta?.uom_factor ? String(line.itemMeta.uom_factor) : '1';
      let currentTotalBase = '0';
      for (const item of pos.items) {
        if (item.product.id === line.product.id) {
          const f = item.itemMeta?.uom_factor ? String(item.itemMeta.uom_factor) : '1';
          currentTotalBase = addDecimal(currentTotalBase, mulDecimal(item.qty, f));
        }
      }
      const nextTotalBase = addDecimal(currentTotalBase, mulDecimal(step, factor));
      if (cmpDecimal(nextTotalBase, line.product.branch_stock || '0') > 0) {
        toast.error(`Insufficient stock for ${line.product.name}`);
        return;
      }
    }
    pos.updateQty(lineKey, step);
  };

  // Zero-Float Accounting/Tax Calculation using BigInt decimal.ts
  const totals: CartTotalsSummary = React.useMemo(() => {
    let grossSubtotal = '0';
    let totalDiscount = '0';
    let exclNet = '0';
    let taxTotal = '0';
    const aggTaxMap = new Map<string, { code: string; name: string; amount: string }>();

    for (const item of pos.items) {
      const uomFactor = item.itemMeta?.uom_factor ? String(item.itemMeta.uom_factor) : '1';
      const baseUnit = getProductGrossUnitPrice(item.product);
      const effectiveUnitPrice = roundHalfUp2(mulDecimal(baseUnit, uomFactor));
      const gross = roundDecimal(mulDecimal(effectiveUnitPrice, item.qty), 4, roundingMode);
      const discRate = divDecimal(item.discountPercent || 0, '100', 4, roundingMode);
      const lineDisc = roundDecimal(mulDecimal(gross, discRate), 4, roundingMode);
      const netAfterDisc = subDecimal(gross, lineDisc);

      grossSubtotal = addDecimal(grossSubtotal, gross);
      totalDiscount = addDecimal(totalDiscount, lineDisc);

      const calc = computeClientTaxPreviewDecimal(
        netAfterDisc,
        item.product.effective_tax_group_id,
        taxRules,
        defaultInclusiveTax,
        roundingMode,
      );
      exclNet = addDecimal(exclNet, calc.exclNet);
      taxTotal = addDecimal(taxTotal, calc.taxTotal);
      for (const l of calc.lines) {
        const cur = aggTaxMap.get(l.code);
        if (cur) cur.amount = addDecimal(cur.amount, l.amount);
        else aggTaxMap.set(l.code, { ...l });
      }
    }

    const grandTotalRaw = addDecimal(exclNet, taxTotal);
    const grandTotal = roundHalfUp2(grandTotalRaw);
    const tenderedStr =
      pos.tenderedAmount && cmpDecimal(pos.tenderedAmount, '0') > 0
        ? pos.tenderedAmount
        : grandTotal;
    const changeDue =
      pos.paymentMethod === 'CASH'
        ? roundHalfUp2(maxDecimal('0', subDecimal(tenderedStr, grandTotal)))
        : '0.00';

    return {
      grossSubtotal: roundHalfUp2(grossSubtotal),
      totalDiscount: roundHalfUp2(totalDiscount),
      taxTotal: roundHalfUp2(taxTotal),
      grandTotal,
      changeDue,
      taxBreakdown: Array.from(aggTaxMap.values()).map((t) => ({
        ...t,
        amount: roundHalfUp2(t.amount),
      })),
    };
  }, [pos.items, pos.tenderedAmount, pos.paymentMethod, taxRules, defaultInclusiveTax, roundingMode]);

  const appendNumpad = (key: string) => {
    if (key === 'C') {
      pos.setTenderedAmount('');
      return;
    }
    if (key === '⌫') {
      pos.setTenderedAmount(pos.tenderedAmount.slice(0, -1));
      return;
    }
    if (key === '.' && pos.tenderedAmount.includes('.')) return;
    pos.setTenderedAmount(pos.tenderedAmount + key);
  };

  const handleSecondaryParkAction = async () => {
    if (pos.items.length === 0) return;
    if (capabilities.requireVehiclePlate && !pos.vehiclePlate.trim()) {
      toast.error('Enter the vehicle license plate before parking a service job.');
      return;
    }

    setHoldingBill(true);
    try {
      const channel: OrderChannel =
        capabilities.enableKot && capabilities.layoutMode === 'restaurant'
          ? pos.orderChannel
          : capabilities.layoutMode === 'hardware'
            ? 'QUOTATION'
            : capabilities.requireVehiclePlate
              ? 'JOB_CARD'
              : 'COUNTER';

      const kotStatus = capabilities.enableKot ? 'QUEUED' : 'NONE';

      await apiFetch('/api/v1/pos/held-bills', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: pos.selectedCustomerId,
          customer_name: pos.selectedCustomerName,
          notes: pos.orderNotes || 'Parked from 4-Pane POS Terminal',
          order_channel: channel,
          table_or_bay_label: pos.tableOrBayLabel.trim(),
          vehicle_plate: pos.vehiclePlate.trim().toUpperCase(),
          kot_status: kotStatus,
          items: pos.items.map((i) => ({
            product_id: i.product.id,
            qty: i.qty,
            discount_percent: i.discountPercent,
            item_meta: i.itemMeta || {},
          })),
        }),
      });

      pos.clearCart(capabilities.preset.defaultChannel);
      await refetch();
      if (capabilities.enableKot && capabilities.layoutMode === 'restaurant') {
        toast.success('Kitchen KOT fired & parked to Active Orders');
      } else if (capabilities.layoutMode === 'hardware') {
        toast.success('ProForma Quotation saved to Outgoing Queue');
      } else if (capabilities.requireVehiclePlate) {
        toast.success('Vehicle Job Card parked to Service Bays');
      } else {
        toast.success('Bill parked to Outgoing Queue');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to park ticket');
    } finally {
      setHoldingBill(false);
    }
  };

  const handleAdvanceKotStatus = async (
    entry: HeldBillEntryDTO,
    nextStatus: 'PREPARING' | 'READY',
  ) => {
    try {
      await apiFetch(`/api/v1/pos/held-bills/${entry.bill.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          kot_status: nextStatus,
          table_or_bay_label: entry.bill.table_or_bay_label || '',
        }),
      });
      await refetch();
      toast.success(`${entry.bill.hold_code} updated to ${formatDisplayLabel(nextStatus)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update KOT status');
    }
  };

  const handleRecallBill = (entry: HeldBillEntryDTO) => {
    const recalledItems: CartItem[] = entry.items
      .map((item) => {
        const prod = products.find((p) => p.id === item.product_id);
        if (!prod) return null;
        const meta = parseJSONField<CartItemMeta | undefined>(item.item_meta_json, undefined);
        return {
          lineKey: buildCartLineKey(prod.id, meta),
          product: prod,
          qty: Number(item.qty),
          discountPercent: Number(item.discount_percent || 0),
          itemMeta: meta,
        };
      })
      .filter(Boolean) as CartItem[];

    const normalizedChannel = (
      ['COUNTER', 'DINE_IN', 'TAKEAWAY', 'DELIVERY', 'QUOTATION', 'JOB_CARD'].includes(
        String(entry.bill.order_channel || '').toUpperCase(),
      )
        ? String(entry.bill.order_channel).toUpperCase()
        : capabilities.preset.defaultChannel
    ) as OrderChannel;

    pos.loadHeldBill(
      entry.bill.id,
      entry.bill.customer_id || null,
      entry.bill.customer_name || 'Walk-in Guest',
      recalledItems,
      {
        orderChannel: normalizedChannel,
        tableOrBayLabel: entry.bill.table_or_bay_label || '',
        vehiclePlate: entry.bill.vehicle_plate || '',
        orderNotes: entry.bill.notes || '',
      },
    );
    setMobileTab('CART');
    toast.success(`Recalled ${entry.bill.hold_code} into Active Cart`);
  };

  const handleVoidHeldBill = async (billId: string) => {
    try {
      await apiFetch(`/api/v1/pos/held-bills/${billId}`, { method: 'DELETE' });
      await refetch();
      toast.success('Ticket voided cleanly');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to void ticket');
    }
  };

  const handleVoidCartConfirm = async () => {
    if (pos.items.length === 0) return;
    const ok = await confirmDestructiveAction({
      title: 'Void this transaction?',
      text: 'This will discard all items in the active cart.',
      cancelLabel: 'Keep Transaction',
      confirmLabel: 'Yes, Void Transaction',
    });
    if (!ok) return;
    pos.clearCart(capabilities.preset.defaultChannel);
    toast.info('Active transaction voided');
  };

  const executeCheckout = async (
    payload: Record<string, unknown>,
    idempotencyKey: string,
    overrideToken?: string,
  ) => {
    if (pos.items.length === 0) return;
    setCharging(true);
    setChargeStage('Authorizing...');
    const itemsSnapshot = [...pos.items];
    const metaSnapshot = {
      orderChannel: pos.orderChannel,
      tableOrBayLabel: pos.tableOrBayLabel,
      vehiclePlate: pos.vehiclePlate,
    };

    try {
      if (!navigator.onLine) {
        throw new Error('OFFLINE_MODE');
      }

      const stageTimer = window.setTimeout(() => setChargeStage('Posting GL & Receipt...'), 260);
      const res = await apiFetch<CheckoutResponse>('/api/v1/pos/checkout', {
        method: 'POST',
        idempotencyKey,
        overrideToken,
        body: JSON.stringify(payload),
      }).finally(() => window.clearTimeout(stageTimer));

      setChargeSuccess(true);
      const nextReceipt: ReceiptModalData = {
        storeName: context?.trade_name || context?.business_name || 'Retail Store',
        branchName: activeBranchName,
        taxRegistrationNo: context?.tax_registration_no,
        logoReceiptUrl: context?.logo_receipt_url,
        footerMessage: mergedSettingsDict['pos.receipt_footer'] || '',
        currencyCode,
        cashierName: context?.full_name || 'Staff',
        invoiceNumber: res.invoice_number,
        customerName: pos.selectedCustomerName,
        paymentMethod: pos.paymentMethod,
        paperWidth,
        kickDrawer: kickDrawer && pos.paymentMethod !== 'CARD',
        pointsEarned: res.points_earned,
        orderChannel: res.order_channel || metaSnapshot.orderChannel,
        tableOrBayLabel: metaSnapshot.tableOrBayLabel || undefined,
        vehiclePlate: metaSnapshot.vehiclePlate || undefined,
        warrantyTerms: res.warranty_terms,
        items: itemsSnapshot.map((i) => {
          const factor = i.itemMeta?.uom_factor ? String(i.itemMeta.uom_factor) : '1';
          const unitPrice = roundHalfUp2(mulDecimal(getProductGrossUnitPrice(i.product), factor));
          const gross = mulDecimal(unitPrice, i.qty);
          const disc = mulDecimal(gross, divDecimal(i.discountPercent || 0, '100', 4, roundingMode));
          return {
            name: i.product.name,
            qty: i.qty,
            unitPrice,
            lineTotal: roundHalfUp2(subDecimal(gross, disc)),
            metaSummary: formatLineMetaSummary(i.itemMeta),
          };
        }),
        subtotal: res.subtotal,
        discountTotal: res.discount_total,
        taxTotal: res.tax_total,
        grandTotal: res.grand_total,
        changeGiven: res.change_given,
      };
      setReceiptData(nextReceipt);
      setLastReceipt(nextReceipt);

      pos.clearCart(capabilities.preset.defaultChannel);
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['accounting'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(`Charged ${formatMoney(res.grand_total)} • ${res.invoice_number}`);
      setTimeout(() => setChargeSuccess(false), 1400);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.data?.can_override_pin) {
        setPendingPayload(payload);
        setPendingKey(idempotencyKey);
        setPinModalOpen(true);
        return;
      }

      if ((err instanceof Error && err.message === 'OFFLINE_MODE') || err instanceof TypeError) {
        await enqueueOfflineCheckout(context?.business_id || '', payload);
        const count = await dexieDB.sync_outbox.where('status').equals('PENDING').count();
        pos.setPendingOutboxCount(count);
        const offlineReceipt: ReceiptModalData = {
          storeName: context?.trade_name || context?.business_name || 'Retail Store',
          branchName: activeBranchName,
          taxRegistrationNo: context?.tax_registration_no,
          logoReceiptUrl: context?.logo_receipt_url,
          footerMessage: mergedSettingsDict['pos.receipt_footer'] || '',
          currencyCode,
          cashierName: context?.full_name || 'Staff',
          invoiceNumber: `OFF-${Date.now().toString().slice(-6)}`,
          customerName: pos.selectedCustomerName,
          paymentMethod: pos.paymentMethod,
          paperWidth,
          kickDrawer: false,
          orderChannel: metaSnapshot.orderChannel,
          tableOrBayLabel: metaSnapshot.tableOrBayLabel || undefined,
          vehiclePlate: metaSnapshot.vehiclePlate || undefined,
          items: itemsSnapshot.map((i) => {
            const factor = i.itemMeta?.uom_factor ? String(i.itemMeta.uom_factor) : '1';
            const unitPrice = roundHalfUp2(mulDecimal(getProductGrossUnitPrice(i.product), factor));
            const gross = mulDecimal(unitPrice, i.qty);
            const disc = mulDecimal(gross, divDecimal(i.discountPercent || 0, '100', 4, roundingMode));
            return {
              name: i.product.name,
              qty: i.qty,
              unitPrice,
              lineTotal: roundHalfUp2(subDecimal(gross, disc)),
              metaSummary: formatLineMetaSummary(i.itemMeta),
            };
          }),
          subtotal: totals.grossSubtotal,
          discountTotal: totals.totalDiscount,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          changeGiven: totals.changeDue,
          offlineQueued: true,
        };
        setReceiptData(offlineReceipt);
        setLastReceipt(offlineReceipt);
        pos.clearCart(capabilities.preset.defaultChannel);
        toast.warning('Offline mode: checkout queued in IndexedDB Sync Outbox');
        return;
      }

      toast.error(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setCharging(false);
      setChargeStage(null);
    }
  };

  const handleChargeClick = () => {
    if (pos.items.length === 0) return;
    if (capabilities.requireVehiclePlate && !pos.vehiclePlate.trim()) {
      toast.error('Vehicle license plate is mandatory in Auto Service / Garage mode.');
      return;
    }
    if (capabilities.requireSerialImei) {
      const missingSerial = pos.items.find(
        (i) => i.product.enable_serial_tracking && !i.itemMeta?.serial_imei?.trim(),
      );
      if (missingSerial) {
        toast.error(`Missing IMEI / serial number for ${missingSerial.product.name}`);
        return;
      }
    }

    const tendered =
      pos.paymentMethod === 'CASH'
        ? pos.tenderedAmount && cmpDecimal(pos.tenderedAmount, '0') > 0
          ? roundHalfUp2(pos.tenderedAmount)
          : totals.grandTotal
        : totals.grandTotal;

    const payload: Record<string, unknown> = {
      customer_id: pos.selectedCustomerId,
      payment_method: pos.paymentMethod,
      tendered_amount: tendered,
      held_bill_id: pos.activeHeldBillId,
      order_channel: pos.orderChannel,
      order_meta: {
        table_or_bay_label: pos.tableOrBayLabel.trim(),
        vehicle_plate: pos.vehiclePlate.trim().toUpperCase(),
        driver_name: pos.driverName.trim(),
        notes: pos.orderNotes.trim(),
      },
      items: pos.items.map((i) => ({
        product_id: i.product.id,
        qty: i.qty,
        discount_percent: String(i.discountPercent),
        item_meta: i.itemMeta || {},
      })),
    };
    const key = createIdempotencyKeyV7();
    void executeCheckout(payload, key);
  };

  const handleTriggerCashDrawerKick = async () => {
    const res = await dispatchESCPOSPrint({
      storeName: context?.trade_name || context?.business_name || 'Retail Store',
      branchName: activeBranchName,
      invoiceNumber: 'DRAWER-KICK',
      cashierName: context?.full_name || 'Staff',
      customerName: 'Drawer Test',
      paymentMethod: 'CASH',
      paperWidth,
      kickDrawer: true,
      items: [],
      subtotal: '0.00',
      discountTotal: '0.00',
      taxTotal: '0.00',
      grandTotal: '0.00',
      changeGiven: '0.00',
    });
    toast.success(`Cash drawer pulse sent via ${res.transport}`);
  };

  const handleOpenLastReceipt = () => {
    if (lastReceipt) {
      setReceiptData(lastReceipt);
      return;
    }
    setReceiptData({
      storeName: context?.trade_name || context?.business_name || 'Retail Store',
      branchName: activeBranchName,
      taxRegistrationNo: context?.tax_registration_no,
      logoReceiptUrl: context?.logo_receipt_url,
      footerMessage: mergedSettingsDict['pos.receipt_footer'] || 'Test Slip • Hardware Ready',
      currencyCode,
      cashierName: context?.full_name || 'Staff',
      invoiceNumber: `TEST-${Date.now().toString().slice(-4)}`,
      customerName: 'Walk-in Guest',
      paymentMethod: 'CARD',
      paperWidth,
      kickDrawer: false,
      orderChannel: capabilities.preset.defaultChannel,
      items: [
        {
          name: `${capabilities.preset.label} Test Line`,
          qty: 1,
          unitPrice: '10.00',
          lineTotal: '10.00',
        },
      ],
      subtotal: '10.00',
      discountTotal: '0.00',
      taxTotal: '0.00',
      grandTotal: '10.00',
      changeGiven: '0.00',
    });
  };

  if (isLoading && !data) {
    return <POSGridSkeleton />;
  }

  const estimatedEarnedPoints =
    activeCustomer && !activeCustomer.is_walk_in && cmpDecimal(totals.grandTotal, '0') > 0
      ? Math.max(1, Math.floor(Number(totals.grandTotal) * Math.max(loyaltyPerUnit, 1)))
      : 0;

  // Symmetrical responsive Desktop track ratios so Cart & Held Bills never clip on 1280-1536px+ screens
  const mainGridColsClass =
    capabilities.showCategoriesPane && capabilities.showOutgoingOrdersPane
      ? 'xl:grid-cols-[204px_minmax(0,1.4fr)_268px_minmax(345px,0.95fr)] 2xl:grid-cols-[216px_minmax(0,1.55fr)_288px_minmax(372px,1fr)]'
      : capabilities.showCategoriesPane && !capabilities.showOutgoingOrdersPane
        ? 'xl:grid-cols-[212px_minmax(0,1fr)_minmax(360px,0.42fr)]'
        : !capabilities.showCategoriesPane && capabilities.showOutgoingOrdersPane
          ? 'xl:grid-cols-[minmax(0,1fr)_272px_minmax(360px,0.42fr)]'
          : 'xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.42fr)]';

  const totalCartUnits = pos.items.reduce((acc, it) => acc + it.qty, 0);

  const allSidebarRoutes: Array<{
    route: AppRoute;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    perm?: string;
  }> = [
    { route: '/overview', label: t.nav.overview, icon: LayoutGrid, perm: 'analytics:view' },
    { route: '/pos', label: t.nav.pos, icon: ShoppingBag, perm: 'pos:view' },
    { route: '/products', label: t.nav.products, icon: Package, perm: 'catalog:view' },
    { route: '/categories', label: t.nav.categories, icon: Tags, perm: 'catalog:view' },
    { route: '/customers', label: t.nav.customers, icon: Users, perm: 'customers:view' },
    { route: '/suppliers', label: t.nav.suppliers, icon: Truck, perm: 'inventory:view' },
    { route: '/inventory', label: t.nav.inventory, icon: Boxes, perm: 'inventory:view' },
    { route: '/reports', label: t.nav.reports, icon: BarChart3, perm: 'analytics:view' },
    { route: '/accounting', label: t.nav.accounting, icon: ReceiptText, perm: 'accounting:view' },
    { route: '/print-studio', label: t.nav.printStudio, icon: Printer, perm: 'print:view' },
    { route: '/settings', label: t.nav.settings, icon: SlidersHorizontal, perm: 'settings:view' },
  ];
  const sidebarRoutes = allSidebarRoutes.filter((item) => !item.perm || hasPermission(item.perm));

  const tradeName = getDisplayTradeName(context, publicBranding);

  return (
    <div
      data-testid="pos-fullscreen-shell"
      style={appliedZoom80 ? { width: '125vw', height: '125vh' } : undefined}
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#F5F6FA]"
    >
      {/* Persistent Top Bar with Sidebar Drawer Trigger, Company/Vertical, Branch, Zoom & Mandatory Clock */}
      <TerminalTopBar
        activeBranchName={activeBranchName}
        capabilities={capabilities}
        currencyCode={currencyCode}
        isOnline={isOnline}
        pendingOutboxCount={pos.pendingOutboxCount}
        zoomLevel={posZoom}
        onToggleZoom={() => setPosZoom((prev) => (prev === '0.8' ? '1' : '0.8'))}
        onOpenSidebar={() => setSidebarSheetOpen(true)}
      />

      {/* Mobile / Tablet Compact Segmented Pane Bar (< xl) */}
      <nav
        aria-label="Terminal Sections"
        className="xl:hidden shrink-0 border-b border-border-theme/70 bg-white px-3 py-2 flex items-center gap-1.5 overflow-x-auto pos-clean-scroll"
      >
        {capabilities.showCategoriesPane && (
          <button
            type="button"
            data-testid="mobile-tab-categories"
            onClick={() => setMobileTab('CATEGORIES')}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-bold transition-colors cursor-pointer ${
              mobileTab === 'CATEGORIES'
                ? 'bg-[#222026] text-white'
                : 'bg-[#F5F6FA] text-[#222026]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Categories</span>
          </button>
        )}
        <button
          type="button"
          data-testid="mobile-tab-products"
          onClick={() => setMobileTab('PRODUCTS')}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-bold transition-colors cursor-pointer ${
            mobileTab === 'PRODUCTS'
              ? 'bg-[#222026] text-white'
              : 'bg-[#F5F6FA] text-[#222026]'
          }`}
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          <span>Products</span>
        </button>
        {capabilities.showOutgoingOrdersPane && (
          <button
            type="button"
            data-testid="mobile-tab-outgoing"
            onClick={() => setMobileTab('OUTGOING')}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-bold transition-colors cursor-pointer tabular-nums ${
              mobileTab === 'OUTGOING'
                ? 'bg-[#222026] text-white'
                : 'bg-[#F5F6FA] text-[#222026]'
            }`}
          >
            <PauseCircle className="h-3.5 w-3.5" />
            <span>Queue ({heldBills.length})</span>
          </button>
        )}
        <button
          type="button"
          data-testid="mobile-tab-cart"
          onClick={() => setMobileTab('CART')}
          className={`md:hidden ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-bold transition-colors cursor-pointer tabular-nums ${
            mobileTab === 'CART'
              ? 'bg-[#222026] text-white'
              : 'bg-accent text-white'
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>
            Cart ({totalCartUnits}) • {formatMoney(totals.grandTotal)}
          </span>
        </button>
      </nav>

      {/* Main Symmetrical 4-Pane Workspace */}
      <main
        className={`flex-1 min-h-0 p-3 sm:p-4 grid grid-cols-1 md:grid-cols-12 ${mainGridColsClass} gap-3.5 sm:gap-4 items-stretch`}
      >
        {/* Pane 1: Category Rail (Desktop fixed track; Tablet/Mobile via tab) */}
        {capabilities.showCategoriesPane && (
          <div
            className={`h-full min-h-0 xl:col-span-1 ${
              mobileTab === 'CATEGORIES' ? 'block md:col-span-7' : 'hidden'
            } xl:block`}
          >
            <CategoryList
              categories={categories}
              products={products}
              selectedCategory={selectedCategory}
              onSelectCategory={(catId) => {
                setSelectedCategory(catId);
                if (mobileTab === 'CATEGORIES') setMobileTab('PRODUCTS');
              }}
              capabilities={capabilities}
              laborPartsFilter={laborPartsFilter}
              onChangeLaborPartsFilter={setLaborPartsFilter}
            />
          </div>
        )}

        {/* Pane 2: Product Grid (Fluid center track; Tablet Left 7 cols; Mobile via tab) */}
        <div
          className={`h-full min-h-0 xl:col-span-1 ${
            mobileTab === 'PRODUCTS' ? 'block md:col-span-7' : 'hidden'
          } xl:block`}
        >
          <ProductGrid
            products={filteredProducts}
            brands={brands}
            selectedBrand={selectedBrand}
            onSelectBrand={setSelectedBrand}
            cartItems={pos.items}
            capabilities={capabilities}
            search={search}
            onSearchChange={handleBarcodeChange}
            onSearchEnter={handleBarcodeEnter}
            searchInputRef={searchInputRef}
            bundlesOnly={bundlesOnly}
            onToggleBundlesOnly={() => setBundlesOnly((b) => !b)}
            onResetFilters={() => {
              setSearch('');
              setSelectedCategory('ALL');
              setSelectedBrand('ALL');
              setLaborPartsFilter('ALL');
              setBundlesOnly(false);
            }}
            onAddToCart={addProductWithCheck}
            onDecrementProduct={(prodId) => {
              const firstLine = pos.items.find((i) => i.product.id === prodId);
              if (!firstLine) return;
              const step =
                capabilities.allowFractionalQty || firstLine.product.allow_fractional_qty ? 0.5 : 1;
              void handleDecrementLine(
                firstLine.lineKey,
                firstLine.product.name,
                firstLine.qty,
                step,
              );
            }}
            formatMoney={formatMoney}
          />
        </div>

        {/* Pane 3: Outgoing Orders / KOT / Service Bays / Quotes (Desktop breathable track) */}
        {capabilities.showOutgoingOrdersPane && (
          <div
            className={`h-full min-h-0 xl:col-span-1 ${
              mobileTab === 'OUTGOING' ? 'block md:col-span-7' : 'hidden'
            } xl:block`}
          >
            <OutgoingOrdersQueue
              heldBills={heldBills}
              capabilities={capabilities}
              formatMoney={formatMoney}
              onRecallBill={handleRecallBill}
              onVoidHeldBill={handleVoidHeldBill}
              onAdvanceKotStatus={handleAdvanceKotStatus}
            />
          </div>
        )}

        {/* Pane 4: Active Cart & Checkout (Always visible on md+ tablet/desktop; Cart tab on mobile) */}
        <aside
          className={`h-full min-h-0 xl:col-span-1 ${
            mobileTab === 'CART' ? 'block' : 'hidden'
          } md:block md:col-span-5`}
        >
          <ActiveCart
            activeBranchName={activeBranchName}
            capabilities={capabilities}
            items={pos.items}
            selectedCustomerId={pos.selectedCustomerId}
            selectedCustomerName={pos.selectedCustomerName}
            activeCustomer={activeCustomer}
            customers={customers}
            customerPopoverOpen={customerPopoverOpen}
            onCustomerPopoverOpenChange={setCustomerPopoverOpen}
            onSelectCustomer={(id, name) => pos.setCustomer(id, name)}
            onOpenNewCustomer={() => setCustomerSheetOpen(true)}
            orderMeta={{
              orderChannel: pos.orderChannel,
              tableOrBayLabel: pos.tableOrBayLabel,
              vehiclePlate: pos.vehiclePlate,
              driverName: pos.driverName,
              orderNotes: pos.orderNotes,
            }}
            onUpdateOrderMeta={(patch) => pos.setOrderMeta(patch)}
            pendingOutboxCount={pos.pendingOutboxCount}
            activeHeldBillId={pos.activeHeldBillId}
            estimatedEarnedPoints={estimatedEarnedPoints}
            totals={totals}
            paymentMethod={pos.paymentMethod}
            onSetPaymentMethod={(m) => pos.setPaymentMethod(m)}
            tenderedAmount={pos.tenderedAmount}
            onSetTenderedAmount={(v) => pos.setTenderedAmount(v)}
            onAppendNumpad={appendNumpad}
            onIncrementLine={handleIncrementLine}
            onDecrementLine={handleDecrementLine}
            onSetLineQty={(lineKey, q) => pos.setQty(lineKey, q)}
            onSetLineDiscount={(lineKey, pct) => pos.setItemDiscount(lineKey, pct)}
            onSetLineMeta={(lineKey, patch) => pos.setItemMeta(lineKey, patch)}
            maxCashierDiscount={maxCashierDiscount}
            onSecondaryParkAction={() => void handleSecondaryParkAction()}
            holdingBill={holdingBill}
            onVoidCartConfirm={handleVoidCartConfirm}
            onChargeClick={handleChargeClick}
            charging={charging}
            chargeStage={chargeStage}
            chargeSuccess={chargeSuccess}
            currencySymbol={currencySymbol}
            formatMoney={formatMoney}
          />
        </aside>
      </main>

      {/* Fixed Obsidian Bottom Dock & Drawers */}
      <TerminalFooter
        activeBranchName={activeBranchName}
        capabilities={capabilities}
        products={products}
        categories={categories}
        isOnline={isOnline}
        pendingOutboxCount={pos.pendingOutboxCount}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onTriggerCashDrawerKick={() => void handleTriggerCashDrawerKick()}
        onOpenLastReceipt={handleOpenLastReceipt}
        onProductSaved={() => void refetch()}
        onExitPOS={() => {
          if (typeof document !== 'undefined' && document.fullscreenElement) {
            void document.exitFullscreen?.().catch(() => undefined);
          }
          onExitPOS?.();
        }}
      />

      {/* Left-Side Obsidian Workspace Navigation Drawer */}
      <Sheet open={sidebarSheetOpen} onOpenChange={setSidebarSheetOpen}>
        <SheetContent
          side="left"
          data-testid="pos-left-sidebar-drawer"
          className="w-[290px] sm:max-w-[300px] bg-[#222026] text-white border-r border-white/10 p-4 flex flex-col justify-between"
        >
          <div className="space-y-4 min-h-0 flex-1 flex flex-col">
            <SheetHeader className="text-left pb-3 border-b border-white/10">
              <SheetTitle className="text-white text-[15px] font-bold flex items-center justify-between gap-2">
                <span className="truncate">{tradeName}</span>
                <span className="rounded-full bg-[#D9F172]/15 text-[#D9F172] px-2.5 py-0.5 text-[10px] font-bold shrink-0">
                  {capabilities.preset.label}
                </span>
              </SheetTitle>
              <SheetDescription className="text-[11.5px] text-white/60">
                {activeBranchName} • {formatDisplayLabel(context?.role_name || context?.role_code) || 'Staff'}
              </SheetDescription>
            </SheetHeader>

            <nav aria-label="Workspace Navigation" className="flex-1 overflow-y-auto space-y-1 pr-1 pos-clean-scroll">
              {sidebarRoutes.map((item) => {
                const Icon = item.icon;
                const isActive = activeRoute === item.route;
                return (
                  <button
                    key={item.route}
                    type="button"
                    data-testid={`pos-sidebar-nav-${item.route.replace('/', '')}`}
                    onClick={() => {
                      setSidebarSheetOpen(false);
                      if (item.route !== activeRoute && onNavigate) {
                        if (typeof document !== 'undefined' && document.fullscreenElement) {
                          void document.exitFullscreen?.().catch(() => undefined);
                        }
                        onNavigate(item.route);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#D9F172] text-[#222026] shadow-sm'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="pt-3 border-t border-white/10 space-y-2">
            <button
              type="button"
              data-testid="pos-sidebar-signout-btn"
              onClick={() => {
                setSidebarSheetOpen(false);
                if (typeof document !== 'undefined' && document.fullscreenElement) {
                  void document.exitFullscreen?.().catch(() => undefined);
                }
                logout();
              }}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-full bg-[#FB4967]/15 text-[#FB4967] hover:bg-[#FB4967]/25 text-[12.5px] font-bold transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modals & Drawers */}
      <CustomerFormSheet
        open={customerSheetOpen}
        onOpenChange={setCustomerSheetOpen}
        onCreated={(customer) => {
          pos.setCustomer(customer.id, customer.name);
          void refetch();
        }}
      />

      <CheckoutReceiptModal
        open={!!receiptData}
        onOpenChange={(o) => !o && setReceiptData(null)}
        receipt={receiptData}
      />

      <SupervisorPinModal
        open={pinModalOpen}
        onOpenChange={setPinModalOpen}
        action="pos:discount_override"
        actionLabel={`Discount above ${maxCashierDiscount}% cap`}
        onVerified={(overrideToken) => {
          if (pendingPayload && pendingKey) {
            void executeCheckout(pendingPayload, pendingKey, overrideToken);
          }
        }}
      />
    </div>
  );
}
