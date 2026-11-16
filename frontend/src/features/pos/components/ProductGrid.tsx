import * as React from 'react';
import {
  ArrowUpRight,
  Barcode,
  Boxes,
  Layers,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
  ZoomIn,
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
import type { LocalProduct } from '@/lib/dexie-db';
import { cmpDecimal, getProductPromoPercent } from '@/lib/decimal';
import {
  parseJSONField,
  type CartItemMeta,
  type ProductUOMOption,
  type ProductVariantOption,
} from '../types';
import type { CartItem } from '@/store/posStore';
import type { POSCapabilities } from './capabilities';
import { ProductConfigureDialog } from './ProductConfigureDialog';

export interface ProductGridProps {
  products: LocalProduct[];
  cartItems: CartItem[];
  capabilities: POSCapabilities;
  search: string;
  onSearchChange: (val: string) => void;
  onSearchEnter: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  bundlesOnly: boolean;
  onToggleBundlesOnly: () => void;
  onResetFilters: () => void;
  onAddToCart: (product: LocalProduct, meta?: CartItemMeta) => void;
  onDecrementProduct: (productId: string) => void;
  formatMoney: (value: string | number) => string;
}

function getStockStatus(product: LocalProduct) {
  const stockNum = Number(product.branch_stock || 0);
  if (product.is_service_labor) {
    return { label: 'Service', tone: 'bg-accent-soft/80 text-accent-soft-fg' };
  }
  if (stockNum <= 0) {
    return { label: 'Out', tone: 'bg-[#FEE2E2] text-[#B91C1C]' };
  }
  if (stockNum <= 10) {
    return { label: `${stockNum} left`, tone: 'bg-[#FEF3C7] text-[#B45309]' };
  }
  return { label: `${stockNum} left`, tone: 'bg-[#F5F6FA] text-ink-muted' };
}

const HOLD_PREVIEW_MS = 420;
const HOLD_MOVE_TOLERANCE_PX = 8;

/**
 * Pane 2: Symmetrical high-speed product matrix.
 * Adapts column density automatically (3 cols -> 4 cols when Pane 3 is hidden in Stationery/Fast mode).
 */
export function ProductGrid({
  products,
  cartItems,
  capabilities,
  search,
  onSearchChange,
  onSearchEnter,
  searchInputRef,
  bundlesOnly,
  onToggleBundlesOnly,
  onResetFilters,
  onAddToCart,
  onDecrementProduct,
  formatMoney,
}: ProductGridProps) {
  const [configuringProduct, setConfiguringProduct] = React.useState<LocalProduct | null>(null);
  const [previewProduct, setPreviewProduct] = React.useState<LocalProduct | null>(null);

  const holdTimerRef = React.useRef<number | null>(null);
  const holdResetTimerRef = React.useRef<number | null>(null);
  const holdTriggeredRef = React.useRef(false);
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      if (holdResetTimerRef.current !== null) window.clearTimeout(holdResetTimerRef.current);
    };
  }, []);

  const qtyByProduct = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cartItems) {
      map.set(item.product.id, (map.get(item.product.id) || 0) + item.qty);
    }
    return map;
  }, [cartItems]);

  const requiresModal = React.useCallback(
    (product: LocalProduct): boolean => {
      const variants = parseJSONField<ProductVariantOption[]>(product.variants_json, []);
      const modifiers = parseJSONField<string[]>(product.modifiers_json, []);
      if (capabilities.requireSerialImei && Boolean(product.enable_serial_tracking)) return true;
      if (capabilities.matrixVariants && variants.length > 0) return true;
      if (capabilities.enableKot && modifiers.length > 0) return true;
      return false;
    },
    [capabilities],
  );

  const handleCardTap = React.useCallback(
    (product: LocalProduct) => {
      if (requiresModal(product)) {
        setConfiguringProduct(product);
        return;
      }
      onAddToCart(product);
    },
    [onAddToCart, requiresModal],
  );

  const cancelPendingHold = React.useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    pointerStartRef.current = null;
  }, []);

  const clearHoldAndScheduleReset = React.useCallback(() => {
    cancelPendingHold();
    if (holdTriggeredRef.current) {
      if (holdResetTimerRef.current !== null) window.clearTimeout(holdResetTimerRef.current);
      holdResetTimerRef.current = window.setTimeout(() => {
        holdTriggeredRef.current = false;
        holdResetTimerRef.current = null;
      }, 120);
    }
  }, [cancelPendingHold]);

  const startHoldTimer = React.useCallback(
    (e: React.PointerEvent<HTMLElement>, product: LocalProduct) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-card-control="true"]')) return;

      cancelPendingHold();
      if (holdResetTimerRef.current !== null) {
        window.clearTimeout(holdResetTimerRef.current);
        holdResetTimerRef.current = null;
      }
      holdTriggeredRef.current = false;
      pointerStartRef.current = { x: e.clientX, y: e.clientY };

      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        pointerStartRef.current = null;
        holdTriggeredRef.current = true;
        setPreviewProduct(product);
      }, HOLD_PREVIEW_MS);
    },
    [cancelPendingHold],
  );

  const handleCardPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!pointerStartRef.current || holdTimerRef.current === null) return;
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      if (Math.hypot(dx, dy) > HOLD_MOVE_TOLERANCE_PX) {
        cancelPendingHold();
      }
    },
    [cancelPendingHold],
  );

  const handleCardClick = React.useCallback(
    (e: React.MouseEvent<HTMLElement>, product: LocalProduct) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-card-control="true"]')) return;
      if (holdTriggeredRef.current) {
        e.preventDefault();
        holdTriggeredRef.current = false;
        return;
      }
      handleCardTap(product);
    },
    [handleCardTap],
  );

  // Expanded Pane 2 (col-span-7) renders up to 4 cards per row on desktop; standard (col-span-5) renders 3 cols.
  const gridColsClass = capabilities.showOutgoingOrdersPane
    ? 'grid-cols-2 md:grid-cols-3'
    : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

  return (
    <section
      data-testid="pos-pane-products"
      aria-label="Product Catalog"
      className="flex h-full min-h-0 flex-col justify-between gap-3 rounded-[20px] border border-border-theme/70 bg-white p-4 shadow-xs"
    >
      {/* Top Search & Mode Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <label htmlFor="pos-barcode-scan" className="sr-only">
            Scan Barcode or Search Product
          </label>
          <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
          <Input
            id="pos-barcode-scan"
            data-testid="pos-search-input"
            ref={searchInputRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onSearchEnter}
            placeholder="Scan barcode, SKU, or product name..."
            className="h-10 rounded-[14px] border-border-theme/80 bg-[#F5F6FA]/75 pl-9 pr-9 text-[12.5px] focus:bg-white"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-[#222026] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {capabilities.enableBundles && (
          <button
            type="button"
            data-testid="pos-bundles-filter-btn"
            onClick={onToggleBundlesOnly}
            className={`inline-flex h-10 items-center gap-1.5 rounded-[14px] border px-3 text-[11.5px] font-bold transition-colors cursor-pointer ${
              bundlesOnly
                ? 'border-[#222026] bg-[#222026] text-white'
                : 'border-border-theme bg-[#F5F6FA]/75 text-[#222026] hover:border-accent'
            }`}
          >
            <Boxes className="h-3.5 w-3.5" />
            <span>Packs & Bundles</span>
          </button>
        )}

        <Badge
          variant="outline"
          data-testid="pos-active-mode-badge"
          className="hidden sm:inline-flex h-10 rounded-[14px] px-3 text-[11px] font-bold text-[#222026]"
        >
          {capabilities.preset.label}
        </Badge>
      </div>

      {/* Independently Scrollable Catalog Grid */}
      <div
        data-testid="pos-catalog-scroll"
        className="flex-1 min-h-0 overflow-y-auto pos-clean-scroll pr-1"
      >
        {products.length === 0 ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-[16px] border border-dashed border-border-theme bg-[#F5F6FA]/60 px-6 py-10 text-center">
            <p className="text-sm font-bold text-[#222026]">No matching items in catalog</p>
            <p className="mt-1 text-xs text-ink-muted">
              Clear your search filter or switch back to All Items.
            </p>
            <button
              type="button"
              onClick={onResetFilters}
              className="mt-3 inline-flex h-9 items-center rounded-[10px] bg-[#222026] px-4 text-xs font-bold text-white hover:opacity-90 transition cursor-pointer"
            >
              Show All Items
            </button>
          </div>
        ) : (
          <div className={`grid ${gridColsClass} gap-3 items-stretch`}>
            {products.map((product) => {
              const inCartQty = qtyByProduct.get(product.id) || 0;
              const stockInfo = getStockStatus(product);
              const variants = parseJSONField<ProductVariantOption[]>(product.variants_json, []);
              const uoms = parseJSONField<ProductUOMOption[]>(product.uom_options_json, []);
              const promoPct = getProductPromoPercent(product);
              const hasDiscount = promoPct > 0 || cmpDecimal(product.base_price, product.sale_price) > 0;
              const modalRequired = requiresModal(product);
              const gallery = Array.from(
                new Set(
                  [product.image_url, ...(product.image_urls ?? [])]
                    .map((s) => (s || '').trim())
                    .filter(Boolean),
                ),
              );
              const primaryImage = gallery[0] || '';

              return (
                <article
                  key={product.id}
                  tabIndex={0}
                  title="Click card to add • Hold to preview image"
                  data-testid={`pos-product-card-${product.sku}`}
                  style={{ WebkitTouchCallout: 'none' }}
                  onPointerDown={(e) => startHoldTimer(e, product)}
                  onPointerMove={handleCardPointerMove}
                  onPointerUp={clearHoldAndScheduleReset}
                  onPointerLeave={clearHoldAndScheduleReset}
                  onPointerCancel={clearHoldAndScheduleReset}
                  onContextMenu={(e) => {
                    if (holdTriggeredRef.current) e.preventDefault();
                  }}
                  onClick={(e) => handleCardClick(e, product)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCardTap(product);
                    }
                  }}
                  className={`group flex h-full select-none cursor-pointer flex-col justify-between overflow-hidden rounded-[22px] border bg-white p-0 transition-all duration-150 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#222026]/40 ${
                    inCartQty > 0
                      ? 'border-[#222026] ring-1 ring-[#222026] shadow-[0_8px_22px_rgba(34,32,38,0.09)]'
                      : 'border-border-theme/70 shadow-[0_4px_16px_rgba(34,32,38,0.04)] hover:border-[#222026]/35 hover:shadow-[0_8px_24px_rgba(34,32,38,0.08)]'
                  }`}
                >
                  {/* Upper Full-Bleed Image Stage (No White Frame Padding, Edge-to-Edge Cover) */}
                  <div className="relative flex h-36 sm:h-40 w-full items-center justify-center overflow-hidden bg-surface-muted/40 border-b border-border-theme/35 p-0">
                    {primaryImage ? (
                      <img
                        src={primaryImage}
                        alt={product.name}
                        loading="lazy"
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        className="block h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <span className="text-lg font-extrabold tracking-tight text-[#222026]/35">
                        {product.sku.slice(0, 4)}
                      </span>
                    )}

                    {/* Top-Left Minimal Badges (Discount / IMEI / Labor) */}
                    <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap items-center gap-1">
                      {promoPct > 0 && (
                        <span
                          data-testid={`pos-card-discount-badge-${product.sku}`}
                          className="inline-flex items-center rounded-full bg-[#D97706] px-2 py-0.5 text-[9.5px] font-extrabold text-white shadow-xs tabular-nums"
                        >
                          -{Math.round(promoPct)}%
                        </span>
                      )}
                      {capabilities.requireSerialImei && product.enable_serial_tracking && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#222026]/85 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-bold text-white">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          IMEI
                        </span>
                      )}
                      {capabilities.splitLaborParts && product.is_service_labor && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/90 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-bold text-white">
                          <Wrench className="h-2.5 w-2.5" />
                          Labor
                        </span>
                      )}
                    </div>

                    {/* Top-Right Frosted Stock Indicator */}
                    <span
                      className={`pointer-events-none absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9.5px] font-bold tabular-nums backdrop-blur-md shadow-2xs ${
                        Number(product.branch_stock || 0) <= 0 && !product.is_service_labor
                          ? 'bg-[#EF4444]/90 text-white'
                          : Number(product.branch_stock || 0) <= 10 && !product.is_service_labor
                            ? 'bg-[#F59E0B]/90 text-white'
                            : 'bg-black/40 text-white'
                      }`}
                    >
                      {stockInfo.label}
                    </span>

                    {/* Multi-image indicator dots at bottom-center when >1 image */}
                    {gallery.length > 1 && (
                      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1">
                        {gallery.slice(0, 4).map((_, idx) => (
                          <span
                            key={idx}
                            className={`h-1.5 w-1.5 rounded-full ${
                              idx === 0 ? 'bg-white shadow-2xs' : 'bg-white/55'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Hover Preview Zoom Trigger */}
                    <button
                      type="button"
                      data-card-control="true"
                      data-testid={`pos-preview-btn-${product.sku}`}
                      aria-label={`Preview ${product.name} image`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewProduct(product);
                      }}
                      className="absolute bottom-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md shadow-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-[#222026] cursor-pointer"
                    >
                      <ZoomIn className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Bottom Two-Column Studio Footer: Title & Price Left + Circular Icon Action Right */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-[88px] sm:min-w-0 flex-1 overflow-hidden">
                      <h3 className="truncate text-[13px] font-bold leading-snug text-[#222026]">
                        {product.name}
                      </h3>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0 min-w-0 tabular-nums">
                        <span className="whitespace-nowrap text-[13.5px] sm:text-[14px] font-extrabold text-[#B45309]">
                          {formatMoney(product.sale_price)}
                        </span>
                        {cmpDecimal(product.base_price, product.sale_price) > 0 && (
                          <span className="whitespace-nowrap text-[10.5px] font-medium text-ink-muted line-through">
                            {formatMoney(product.base_price)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[10px] font-medium text-ink-muted">
                        {product.category_name || 'General'} • {product.sku}
                        {capabilities.matrixVariants && variants.length > 0 ? ` • ${variants.length} var` : ''}
                        {capabilities.multiUomToggle && uoms.length > 1 ? ' • UOM' : ''}
                      </p>
                    </div>

                    <div
                      data-card-control="true"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto shrink-0"
                    >
                      {inCartQty > 0 && !modalRequired ? (
                        <div className="flex h-8 sm:h-10 items-center gap-0.5 sm:gap-1 rounded-full bg-[#222026] px-1 sm:px-1.5 text-white shadow-xs">
                          <button
                            type="button"
                            aria-label={`Decrease ${product.name}`}
                            onClick={() => onDecrementProduct(product.id)}
                            className="inline-flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full hover:bg-white/15 transition-colors cursor-pointer"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-[16px] sm:min-w-[18px] text-center text-[11px] sm:text-[11.5px] font-extrabold tabular-nums">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase ${product.name}`}
                            onClick={() => onAddToCart(product)}
                            className="inline-flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full hover:bg-white/15 transition-colors cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          data-testid={`pos-add-btn-${product.sku}`}
                          aria-label={
                            modalRequired
                              ? `Configure & add ${product.name}`
                              : `Add ${product.name} to checkout`
                          }
                          onClick={() => handleCardTap(product)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F6FA] text-[#222026] border border-border-theme/60 transition-all group-hover:bg-[#222026] group-hover:text-white group-hover:border-[#222026] cursor-pointer"
                        >
                          {modalRequired ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <ProductConfigureDialog
        product={configuringProduct}
        open={Boolean(configuringProduct)}
        onOpenChange={(o) => !o && setConfiguringProduct(null)}
        capabilities={capabilities}
        formatMoney={formatMoney}
        onConfirmAdd={(prod, meta) => onAddToCart(prod, meta)}
      />

      <ProductImagePreviewDialog
        product={previewProduct}
        open={Boolean(previewProduct)}
        onOpenChange={(o) => {
          if (!o) {
            setPreviewProduct(null);
            holdTriggeredRef.current = false;
          }
        }}
        inCartQty={previewProduct ? qtyByProduct.get(previewProduct.id) || 0 : 0}
        modalRequired={previewProduct ? requiresModal(previewProduct) : false}
        capabilities={capabilities}
        formatMoney={formatMoney}
        onAddAction={handleCardTap}
      />
    </section>
  );
}

interface ProductImagePreviewDialogProps {
  product: LocalProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inCartQty: number;
  modalRequired: boolean;
  capabilities: POSCapabilities;
  formatMoney: (value: string | number) => string;
  onAddAction: (product: LocalProduct) => void;
}

/**
 * Symmetrical preview dialog shown when holding a POS product card.
 */
function ProductImagePreviewDialog({
  product,
  open,
  onOpenChange,
  inCartQty,
  modalRequired,
  capabilities,
  formatMoney,
  onAddAction,
}: ProductImagePreviewDialogProps) {
  const gallery = React.useMemo(() => {
    if (!product) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const candidate of [product.image_url, ...(product.image_urls ?? [])]) {
      const trimmed = candidate?.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        list.push(trimmed);
      }
    }
    return list;
  }, [product]);

  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [product?.id, open]);

  if (!product) return null;

  const activeImageUrl = gallery[activeIndex] || '';
  const stockInfo = getStockStatus(product);
  const hasDiscount = cmpDecimal(product.base_price, product.sale_price) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="pos-product-image-preview-dialog"
        className="w-[calc(100vw-2rem)] max-w-md p-4 sm:p-5"
      >
        <DialogHeader className="space-y-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted truncate">
            {product.category_name || 'General'} • {product.sku}
          </p>
          <DialogTitle className="text-[16px] font-extrabold leading-snug text-[#222026]">
            {product.name}
          </DialogTitle>
          <DialogDescription className="text-[11.5px] text-ink-muted line-clamp-2">
            {product.description?.trim() || 'Product image preview • Hold any card to inspect'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 space-y-3">
          <div className="relative flex h-60 sm:h-72 w-full items-center justify-center overflow-hidden rounded-[14px] border border-border-theme/70 bg-[#F5F6FA]">
            {activeImageUrl ? (
              <img
                src={activeImageUrl}
                alt={product.name}
                draggable={false}
                className="h-full w-full select-none object-contain p-3"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 text-[#222026]/35">
                <span className="text-4xl font-extrabold tracking-tight">
                  {product.sku.slice(0, 4)}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  No product image uploaded
                </span>
              </div>
            )}

            <span
              className={`absolute right-2.5 top-2.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold tabular-nums shadow-2xs ${stockInfo.tone}`}
            >
              {stockInfo.label}
            </span>

            {capabilities.requireSerialImei && product.enable_serial_tracking && (
              <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[#222026] px-2 py-0.5 text-[10px] font-bold text-white">
                <ShieldCheck className="h-3 w-3" />
                IMEI Required
              </span>
            )}
            {capabilities.splitLaborParts && product.is_service_labor && (
              <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">
                <Wrench className="h-3 w-3" />
                Labor
              </span>
            )}
          </div>

          {gallery.length > 1 && (
            <div className="flex items-center justify-center gap-2 overflow-x-auto pb-0.5">
              {gallery.map((url, idx) => (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  aria-label={`View image ${idx + 1} of ${product.name}`}
                  className={`h-12 w-12 shrink-0 overflow-hidden rounded-[9px] border bg-[#F5F6FA] p-1 transition cursor-pointer ${
                    idx === activeIndex
                      ? 'border-[#222026] ring-1 ring-[#222026]'
                      : 'border-border-theme/70 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img
                    src={url}
                    alt={`${product.name} ${idx + 1}`}
                    draggable={false}
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border-theme/65 bg-[#F5F6FA]/60 px-3.5 py-2.5">
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                data-testid="pos-preview-sale-price"
                className="text-lg font-extrabold text-[#222026] tabular-nums"
              >
                {formatMoney(product.sale_price)}
              </span>
              {hasDiscount && (
                <span className="text-xs text-ink-muted line-through tabular-nums">
                  {formatMoney(product.base_price)}
                </span>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#222026] border border-border-theme/70 tabular-nums">
              {inCartQty > 0 ? `${inCartQty} in cart` : 'Not in cart'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-10 items-center justify-center rounded-[10px] border border-border-theme bg-white text-xs font-bold text-[#222026] transition-colors hover:bg-[#F5F6FA] cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              data-testid="pos-preview-add-btn"
              onClick={() => {
                onOpenChange(false);
                onAddAction(product);
              }}
              className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-[#222026] text-xs font-bold text-white transition-opacity hover:opacity-90 cursor-pointer"
            >
              {modalRequired ? (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Configure & Add</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>{inCartQty > 0 ? 'Add More' : 'Add to Cart'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

