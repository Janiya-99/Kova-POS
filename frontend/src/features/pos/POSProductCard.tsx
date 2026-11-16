import { Minus, Plus } from 'lucide-react';
import type { LocalProduct } from '@/lib/dexie-db';

interface POSProductCardProps {
  product: LocalProduct;
  inCartQty: number;
  formatMoney: (value: number | string) => string;
  onAdd: (product: LocalProduct) => void;
  onDecrement: (productId: string, name: string, currentQty: number) => void;
}

/**
 * Symmetrical POS product tile matching the Zona Pro surface system and clean modern card layout:
 * promotional % pill on media frame, clear selling vs list price, active accent border when in cart,
 * and a full-width Fitts's-Law bottom action transitioning into an inline [- qty +] stepper.
 */
export function POSProductCard({
  product,
  inCartQty,
  formatMoney,
  onAdd,
  onDecrement,
}: POSProductCardProps) {
  const stock = parseFloat(product.branch_stock || '0');
  const explicitDisc = parseFloat(product.discount_percent || '0');
  const salePrice = parseFloat(product.sale_price || '0');
  const basePrice = parseFloat(product.base_price || '0');
  const promoPct =
    explicitDisc > 0
      ? Math.round(explicitDisc)
      : basePrice > salePrice && basePrice > 0
        ? Math.round(((basePrice - salePrice) / basePrice) * 100)
        : 0;

  const thumb =
    (Array.isArray(product.image_urls) ? product.image_urls[0] : undefined) ||
    product.image_url ||
    '/products/cardigan.svg';

  const isLowStock = stock <= 10;
  const inCart = inCartQty > 0;

  return (
    <article
      data-testid={`pos-product-card-${product.id}`}
      className={`group flex h-full flex-col justify-between rounded-[18px] border bg-surface p-3 transition-all duration-150 [contain:layout_style] ${
        inCart
          ? 'border-accent ring-1 ring-accent shadow-[0_8px_22px_rgba(135,127,193,0.16)]'
          : 'border-border-theme/80 shadow-[var(--theme-shadow)] hover:border-accent/60'
      }`}
    >
      {/* Top Clickable Media & Product Metadata */}
      <button
        type="button"
        onClick={() => onAdd(product)}
        className="flex flex-1 flex-col text-left cursor-pointer focus:outline-none"
      >
        <div className="relative flex h-28 sm:h-32 w-full items-center justify-center overflow-hidden rounded-[12px] bg-surface-muted p-2.5">
          {promoPct > 0 && (
            <span className="absolute left-2 top-2 z-10 rounded-[8px] bg-[#F59E0B] px-2 py-0.5 text-[10px] font-extrabold text-white shadow-xs tabular-nums">
              {promoPct}% Off
            </span>
          )}

          <span
            className={`absolute right-2 top-2 z-10 rounded-[8px] px-2 py-0.5 text-[10px] font-bold tabular-nums ${
              isLowStock
                ? 'bg-[#EF4444]/15 text-[#DC2626]'
                : 'border border-border-theme/60 bg-surface/90 text-ink-muted'
            }`}
          >
            {stock <= 0 ? 'Out of stock' : `${stock} left`}
          </span>

          <img
            src={thumb}
            alt={product.name}
            onError={(e) => {
              e.currentTarget.src = '/products/cardigan.svg';
            }}
            className="h-full w-auto object-contain transition-transform duration-200 group-hover:scale-105"
          />
        </div>

        <div className="mt-2.5 flex flex-1 flex-col justify-between gap-1.5">
          <div>
            <h3 className="line-clamp-2 min-h-[34px] text-[12.5px] font-bold leading-snug text-ink">
              {product.name}
            </h3>
            <p className="mt-0.5 truncate text-[10.5px] font-medium text-ink-muted tabular-nums">
              {product.sku}
            </p>
          </div>

          <div className="flex items-baseline justify-between gap-2 pt-0.5">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[13.5px] font-extrabold text-accent tabular-nums">
                {formatMoney(product.sale_price)}
              </span>
              {promoPct > 0 && basePrice > salePrice && (
                <span className="text-[10.5px] text-ink-muted line-through tabular-nums">
                  {formatMoney(product.base_price)}
                </span>
              )}
            </div>
            <span className="truncate text-[10.5px] font-semibold text-ink-muted">
              {product.category_name}
            </span>
          </div>
        </div>
      </button>

      {/* Full-Width Fitts's Law Bottom Action: "Add to Bill" -> Inline [- Qty +] Stepper */}
      <div className="mt-2.5 shrink-0">
        {inCart ? (
          <div
            data-testid={`pos-card-stepper-${product.id}`}
            className="flex h-9 w-full items-center justify-between rounded-[11px] border border-accent/30 bg-surface-muted px-1.5"
          >
            <button
              type="button"
              onClick={() => onDecrement(product.id, product.name, inCartQty)}
              aria-label={`Decrease ${product.name}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-accent text-accent-fg transition-opacity hover:opacity-90 active:scale-95 cursor-pointer"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            <span className="px-2 text-[13px] font-extrabold text-ink tabular-nums">
              {inCartQty}
            </span>

            <button
              type="button"
              onClick={() => onAdd(product)}
              aria-label={`Increase ${product.name}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-accent text-accent-fg transition-opacity hover:opacity-90 active:scale-95 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onAdd(product)}
            className="flex h-9 w-full items-center justify-center rounded-[11px] bg-accent-soft/65 px-3 text-[12px] font-bold text-accent-soft-fg transition-colors hover:bg-accent hover:text-accent-fg active:scale-[0.98] cursor-pointer"
          >
            Add to Bill
          </button>
        )}
      </div>
    </article>
  );
}

