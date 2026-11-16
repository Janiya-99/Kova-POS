import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  Pencil,
  Percent,
  Sparkles,
  CheckCircle2,
  Tags,
  LayoutGrid,
  TableProperties,
  ArrowUpDown,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  SortableTableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DataTablePagination,
  usePagination,
  useSortableData,
} from '@/components/ui/data-table-pagination';
import { ProductManagementDrawer } from '../inventory/ProductManagementDrawer';
import type { POSBootstrapResponse } from '../pos/types';
import type { LocalProduct } from '@/lib/dexie-db';
import { apiFetch } from '@/lib/api';
import {
  getProductPromoPercent,
  previewProductDiscountPrice,
} from '@/lib/decimal';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

type ProductsViewMode = 'cards' | 'table';

function readStoredViewMode(): ProductsViewMode {
  try {
    const raw = localStorage.getItem('pos-products-view-mode');
    if (raw === 'table' || raw === 'cards') return raw;
  } catch {
    // Ignore storage errors
  }
  return 'cards';
}

function ProductsSkeleton({ viewMode }: { viewMode: ProductsViewMode }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-stretch">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="zona-card p-4 h-[98px] flex flex-col justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="zona-card p-5 space-y-4">
        <Skeleton className="h-9 w-full" />
        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="zona-card p-3.5 space-y-3">
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function computePriceDelta(p: LocalProduct): {
  mode: 'DISCOUNT' | 'SPREAD' | 'PAR';
  pct: number;
} {
  const sell = Number(p.sale_price || 0);
  const base = Number(p.base_price || 0);
  const discPct = Number(p.discount_percent || 0);
  if (discPct > 0) {
    return { mode: 'DISCOUNT', pct: discPct };
  }
  if (base > 0 && sell < base) {
    return { mode: 'DISCOUNT', pct: ((base - sell) / base) * 100 };
  }
  if (sell > 0 && sell > base && base > 0) {
    return { mode: 'SPREAD', pct: ((sell - base) / sell) * 100 };
  }
  return { mode: 'PAR', pct: 0 };
}

export function ProductsPage() {
  const { context, hasPermission } = useAuthStore();
  const canManageCatalog = hasPermission('catalog:manage');
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();

  const [viewMode, setViewMode] = React.useState<ProductsViewMode>(readStoredViewMode);
  const [search, setSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = React.useState<string>('ALL');
  const [lowStockOnly, setLowStockOnly] = React.useState(false);
  const [policyFilter, setPolicyFilter] = React.useState<'ALL' | 'STRICT' | 'ALLOW_NEG'>('ALL');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<LocalProduct | null>(null);
  const [scanningLowStock, setScanningLowStock] = React.useState(false);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);
  const [bulkDiscountPct, setBulkDiscountPct] = React.useState('15');
  const [applyingBulkDiscount, setApplyingBulkDiscount] = React.useState(false);

  const changeViewMode = (mode: ProductsViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('pos-products-view-mode', mode);
    } catch {
      // Ignore storage failures
    }
  };

  const { data: bootstrap, isLoading } = useQuery({
    queryKey: ['pos-bootstrap', context?.business_id, context?.branch_id],
    queryFn: () => apiFetch<POSBootstrapResponse>('/api/v1/pos/bootstrap'),
    enabled: Boolean(context?.business_id),
  });

  const handleLowStockAutoScan = async () => {
    setScanningLowStock(true);
    try {
      const res = await apiFetch<{
        scanned_low_count: number;
        created_count: number;
      }>('/api/v1/inventory/low-stock/scan', { method: 'POST' });
      toast.success(
        res.created_count > 0
          ? `Created ${res.created_count} Auto-PO(s) & Supplier Invoice(s) from minimum thresholds`
          : `Checked ${res.scanned_low_count} low-stock SKU(s) — open Auto-POs already exist`
      );
      queryClient.invalidateQueries({ queryKey: ['notifications', context?.business_id] });
      queryClient.invalidateQueries({ queryKey: ['inventory', context?.business_id] });
      queryClient.invalidateQueries({ queryKey: ['reports', context?.business_id] });
    } catch (err: any) {
      toast.error(err?.message || 'Unable to run low-stock Auto-PO scan');
    } finally {
      setScanningLowStock(false);
    }
  };

  const categories = bootstrap?.categories || [];
  const brands = bootstrap?.brands || [];
  const products = bootstrap?.products || [];
  const allowNegSetting = bootstrap?.resolved_settings?.find(
    (s) => s.key === 'pos.allow_negative_fifo_stock'
  );
  const defaultAllowNeg = allowNegSetting
    ? allowNegSetting.effective_json === 'true'
    : false;
  const categoryNameMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const brandNameMap = new Map<string, string>(brands.map((b) => [b.id, b.name]));

  const activeProductsById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  React.useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => activeProductsById.has(id)));
  }, [activeProductsById]);

  const selectedIdSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedProducts = React.useMemo(
    () => selectedIds.map((id) => activeProductsById.get(id)).filter(Boolean) as LocalProduct[],
    [selectedIds, activeProductsById]
  );

  const toggleProductSelection = React.useCallback((productId: string) => {
    setSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }, []);

  const invalidateCatalogQueries = React.useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['pos-bootstrap', context?.business_id, context?.branch_id],
    });
    queryClient.invalidateQueries({ queryKey: ['overview'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', context?.business_id] });
    queryClient.invalidateQueries({ queryKey: ['notifications', context?.business_id] });
    queryClient.invalidateQueries({ queryKey: ['reports', context?.business_id] });
  }, [queryClient, context?.business_id, context?.branch_id]);

  const submitBulkDiscount = async (targetPctStr: string, targetIds = selectedIds) => {
    if (targetIds.length === 0) return;
    const numeric = Number(targetPctStr);
    if (Number.isNaN(numeric) || numeric < 0 || numeric > 95) {
      toast.error('Enter a valid discount percentage between 0% and 95%');
      return;
    }
    setApplyingBulkDiscount(true);
    try {
      const res = await apiFetch<{ updated_count: number; discount_percent: string }>(
        '/api/v1/products/bulk-discount',
        {
          method: 'POST',
          body: JSON.stringify({
            product_ids: targetIds,
            discount_percent: numeric.toFixed(2),
          }),
        }
      );
      toast.success(
        numeric > 0
          ? `Applied ${numeric}% discount to ${res.updated_count} SKU(s) — auto-applies in POS checkout`
          : `Removed promo discount from ${res.updated_count} SKU(s)`
      );
      setBulkDialogOpen(false);
      setSelectedIds([]);
      invalidateCatalogQueries();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to update bulk discounts');
    } finally {
      setApplyingBulkDiscount(false);
    }
  };

  const filtered = React.useMemo(
    () =>
      products.filter((p) => {
        if (selectedCategory !== 'ALL' && p.category_id !== selectedCategory) return false;
        if (selectedBrand !== 'ALL' && (p.brand_id || '') !== selectedBrand) return false;
        if (lowStockOnly && Number(p.branch_stock || 0) > Number(p.reorder_point || 0)) return false;
        const allowNeg =
          p.allow_negative_stock === true ||
          (p.allow_negative_stock == null && defaultAllowNeg);
        if (policyFilter === 'STRICT' && allowNeg) return false;
        if (policyFilter === 'ALLOW_NEG' && !allowNeg) return false;
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        const bName = (p.brand_name || brandNameMap.get(p.brand_id || '') || '').toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          bName.includes(q) ||
          (p.primary_barcode || '').toLowerCase().includes(q)
        );
      }),
    [products, selectedCategory, selectedBrand, lowStockOnly, policyFilter, defaultAllowNeg, search, brandNameMap]
  );

  const { sortedItems, sortConfig, setSortConfig, requestSort } = useSortableData(
    filtered,
    { key: 'name', dir: 'asc' },
    (p, key) => {
      if (key === 'category') return categoryNameMap.get(p.category_id || '') || p.category_name || 'General';
      if (key === 'brand') return p.brand_name || brandNameMap.get(p.brand_id || '') || 'Unbranded';
      if (key === 'allow_neg') {
        const allowNeg =
          p.allow_negative_stock === true ||
          (p.allow_negative_stock == null && defaultAllowNeg);
        return allowNeg ? 'Allow Negative' : 'Strict FIFO';
      }
      if (key === 'base_price') return Number(p.base_price || 0);
      if (key === 'sale_price') return Number(p.sale_price || 0);
      if (key === 'discount_pct') return computePriceDelta(p).pct;
      if (key === 'branch_stock') return Number(p.branch_stock || 0);
      if (key === 'reorder_point') return Number(p.reorder_point || 0);
      return p.name;
    }
  );
  const pagination = usePagination(sortedItems, 12);

  if (isLoading || !bootstrap) {
    return <ProductsSkeleton viewMode={viewMode} />;
  }

  const lowStockCount = products.filter(
    (p) => Number(p.branch_stock || 0) <= Number(p.reorder_point || 0)
  ).length;

  const totalUnits = products.reduce(
    (acc, p) => acc + Math.max(0, Number(p.branch_stock || 0)),
    0
  );
  const promoCount = products.filter(
    (p) => computePriceDelta(p).mode === 'DISCOUNT'
  ).length;
  const avgSalePrice =
    products.length > 0
      ? products.reduce((acc, p) => acc + Number(p.sale_price || 0), 0) / products.length
      : 0;

  const openEditDrawer = (p: LocalProduct) => {
    setEditingProduct(p);
    setDrawerOpen(true);
  };

  const pagedIds = pagination.pagedItems.map((p) => p.id);
  const allPageSelected = pagedIds.length > 0 && pagedIds.every((id) => selectedIdSet.has(id));
  const somePageSelected = !allPageSelected && pagedIds.some((id) => selectedIdSet.has(id));
  const toggleSelectAllOnPage = () => {
    if (allPageSelected) {
      const pageSet = new Set(pagedIds);
      setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pagedIds])));
    }
  };
  const anySelectedHasDiscount = selectedProducts.some((p) => getProductPromoPercent(p) > 0);

  return (
    <div className="space-y-4">
      {/* KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-stretch">
        <div className="zona-card h-full p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Active Products</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">{products.length}</p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">Multi-tenant catalog</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-accent-soft text-accent-soft-fg">
            <Package className="h-4 w-4" />
          </span>
        </div>

        <div className="zona-card h-full p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Low Stock Alerts</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">{lowStockCount}</p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">At or below min threshold</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-[#EF4444]/12 text-[#EF4444]">
            <AlertTriangle className="h-4 w-4" />
          </span>
        </div>

        <div className="zona-card h-full p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Categories</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">{categories.length}</p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">Tax-linked groups</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-surface-muted text-accent">
            <Tags className="h-4 w-4" />
          </span>
        </div>

        <div className="zona-card h-full p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Catalog On-Hand Units</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">
              {totalUnits.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted tabular-nums">
              Avg {formatMoney(avgSalePrice)} • {promoCount} promo SKUs
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-[#22C55E]/15 text-[#22C55E]">
            <CheckCircle2 className="h-4 w-4" />
          </span>
        </div>
      </section>

      {/* Catalog Toolbar & Card / Table View Workspace */}
      <section className="zona-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, product name, or barcode..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher: Card-Wise vs Table-Wise */}
            <div
              role="group"
              aria-label="Product catalog view mode"
              className="inline-flex items-center rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-0.5 text-xs"
            >
              <button
                type="button"
                aria-pressed={viewMode === 'cards'}
                data-testid="products-view-cards-btn"
                onClick={() => changeViewMode('cards')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[calc(var(--theme-radius-control)-2px)] px-3 py-1 font-semibold transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Cards
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'table'}
                data-testid="products-view-table-btn"
                onClick={() => changeViewMode('table')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[calc(var(--theme-radius-control)-2px)] px-3 py-1 font-semibold transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <TableProperties className="h-3.5 w-3.5" />
                Table
              </button>
            </div>

            <button
              type="button"
              onClick={() => setLowStockOnly((v) => !v)}
              className={`min-h-[36px] rounded-[var(--theme-radius-control)] border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                lowStockOnly
                  ? 'border-[#EF4444]/40 bg-[#EF4444]/12 text-[#EF4444]'
                  : 'border-border-theme bg-surface-muted text-ink hover:bg-accent-soft/40'
              }`}
            >
              Low Stock ({lowStockCount})
            </button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={scanningLowStock}
              onClick={handleLowStockAutoScan}
              data-testid="products-auto-po-scan-btn"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {scanningLowStock ? 'Scanning...' : 'Auto-PO Sweep'}
            </Button>

            {canManageCatalog && (
              <Button
                type="button"
                variant="lavender"
                size="sm"
                data-testid="add-product-btn"
                onClick={() => {
                  setEditingProduct(null);
                  setDrawerOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Product
              </Button>
            )}
          </div>
        </div>

        {/* Inline Bulk Selection & Discount Action Strip */}
        {canManageCatalog && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[var(--theme-radius-control)] border border-border-theme/70 bg-surface-muted/65 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer select-none">
                <Checkbox
                  checked={allPageSelected}
                  indeterminate={somePageSelected}
                  onCheckedChange={toggleSelectAllOnPage}
                  data-testid="products-select-all-visible"
                  aria-label="Select all visible products"
                />
                <span>
                  {allPageSelected
                    ? `All ${pagedIds.length} on page selected`
                    : `Select page (${pagedIds.length})`}
                </span>
              </label>

              {selectedIds.length > 0 && (
                <Badge variant="lavender" data-testid="products-selected-count" className="tabular-nums">
                  {selectedIds.length} selected
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={selectedIds.length > 0 ? 'default' : 'outline'}
                size="xs"
                disabled={selectedIds.length === 0}
                data-testid="products-bulk-discount-btn"
                onClick={() => {
                  setBulkDiscountPct('15');
                  setBulkDialogOpen(true);
                }}
              >
                <Percent className="h-3.5 w-3.5" />
                {selectedIds.length > 0
                  ? `Set Discount (${selectedIds.length})`
                  : 'Select SKUs to Discount'}
              </Button>

              {selectedIds.length > 0 && anySelectedHasDiscount && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={applyingBulkDiscount}
                  data-testid="products-bulk-clear-discount-btn"
                  onClick={() => void submitBulkDiscount('0')}
                >
                  Clear Discounts
                </Button>
              )}

              {selectedIds.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setSelectedIds([])}
                  aria-label="Clear selected products"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Category Pills, Sort Control (Cards) & FIFO Policy Filter */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`rounded-[var(--theme-radius-badge)] px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-accent text-accent-fg'
                  : 'bg-surface-muted text-ink-muted hover:text-ink'
              }`}
            >
              All ({products.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-[var(--theme-radius-badge)] px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-accent text-accent-fg'
                    : 'bg-surface-muted text-ink-muted hover:text-ink'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {brands.length > 0 && (
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger
                  aria-label="Filter by brand"
                  data-testid="products-brand-filter"
                  className="h-8 w-[160px] text-[11px]"
                >
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Brands ({brands.length})</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {viewMode === 'cards' && (
              <div className="flex items-center gap-1.5">
                <Select
                  value={sortConfig?.key || 'name'}
                  onValueChange={(nextKey) =>
                    setSortConfig((prev) => ({
                      key: nextKey,
                      dir: prev?.dir || 'asc',
                    }))
                  }
                >
                  <SelectTrigger
                    aria-label="Sort product cards"
                    className="h-8 w-[152px] text-[11px]"
                  >
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Sort: Name</SelectItem>
                    <SelectItem value="sale_price">Sort: Sale Price</SelectItem>
                    <SelectItem value="discount_pct">Sort: Promo Disc %</SelectItem>
                    <SelectItem value="branch_stock">Sort: Stock On Hand</SelectItem>
                    <SelectItem value="category">Sort: Category</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  aria-label="Toggle sort direction"
                  onClick={() =>
                    setSortConfig((prev) => ({
                      key: prev?.key || 'name',
                      dir: prev?.dir === 'asc' ? 'desc' : 'asc',
                    }))
                  }
                >
                  <ArrowUpDown className="h-3 w-3" />
                  {sortConfig?.dir === 'desc' ? 'Desc' : 'Asc'}
                </Button>
              </div>
            )}

            <div className="inline-flex rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-0.5 text-[11px]">
              {(
                [
                  { id: 'ALL', label: 'All Policies' },
                  { id: 'STRICT', label: 'Strict FIFO' },
                  { id: 'ALLOW_NEG', label: 'Allow Negative' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPolicyFilter(f.id)}
                  className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                    policyFilter === f.id
                      ? 'bg-accent text-accent-fg shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CARD-WISE VIEW */}
        {viewMode === 'cards' ? (
          pagination.pagedItems.length > 0 ? (
            <div
              data-testid="products-cards-grid"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch"
            >
              {pagination.pagedItems.map((p) => {
                const stock = Number(p.branch_stock || 0);
                const min = Number(p.reorder_point || 0);
                const isLow = stock <= min;
                const priceDelta = computePriceDelta(p);
                const catName =
                  categoryNameMap.get(p.category_id || '') || p.category_name || 'General';
                const brandName =
                  p.brand_name || brandNameMap.get(p.brand_id || '') || '';
                const gallery = Array.from(
                  new Set(
                    [p.image_url, ...(Array.isArray(p.image_urls) ? p.image_urls : [])]
                      .map((s) => (s || '').trim())
                      .filter(Boolean),
                  ),
                );
                const heroImg = gallery[0] || '';
                const isSelected = selectedIdSet.has(p.id);

                return (
                  <article
                    key={p.id}
                    data-testid={`product-card-${p.sku}`}
                    onClick={() => {
                      if (canManageCatalog) toggleProductSelection(p.id);
                    }}
                    className={`group h-full flex flex-col justify-between overflow-hidden rounded-[22px] border bg-surface p-0 transition-all duration-150 ${
                      canManageCatalog ? 'cursor-pointer' : ''
                    } ${
                      isSelected
                        ? 'border-accent ring-1 ring-accent bg-accent-soft/15 shadow-[0_8px_22px_rgba(135,127,193,0.16)]'
                        : 'border-border-theme/70 shadow-[var(--theme-shadow)] hover:border-accent/60'
                    }`}
                  >
                    {/* Upper Full-Bleed Image Stage (No White Padding, Edge-to-Edge Cover) */}
                    <div className="relative flex h-44 w-full items-center justify-center overflow-hidden bg-surface-muted/45 border-b border-border-theme/35 p-0">
                      {heroImg ? (
                        <img
                          src={heroImg}
                          alt={p.name}
                          loading="lazy"
                          className="block h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <span className="text-xl font-extrabold tracking-wider text-accent-soft-fg">
                          {p.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}

                      {canManageCatalog && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-2 left-2 z-10 inline-flex items-center justify-center rounded-full bg-surface/90 p-1 shadow-xs backdrop-blur-sm"
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleProductSelection(p.id)}
                            data-testid={`product-select-${p.sku}`}
                            aria-label={`Select ${p.name}`}
                          />
                        </div>
                      )}

                      <span
                        className={`absolute top-2 right-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-2xs backdrop-blur-md tabular-nums ${
                          isLow
                            ? 'bg-[#EF4444]/90 text-white'
                            : 'bg-black/40 text-white'
                        }`}
                      >
                        {isLow && <AlertTriangle className="h-3 w-3" />}
                        {stock} {p.unit_of_measure || 'PCS'}
                      </span>

                      {priceDelta.mode === 'DISCOUNT' && (
                        <span
                          data-testid={`product-discount-badge-${p.sku}`}
                          className="absolute bottom-2 left-2 rounded-full bg-[#D97706] px-2 py-0.5 text-[10px] font-extrabold text-white shadow-xs tabular-nums"
                        >
                          -{Math.round(priceDelta.pct)}% Off
                        </span>
                      )}

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
                    </div>

                    {/* Bottom Studio Info Strip: Title + Price Left, Circular Icon Edit Action Right */}
                    <div className="flex items-center justify-between gap-2.5 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[13.5px] font-bold leading-snug text-ink">
                          {p.name}
                        </h3>
                        <div className="mt-0.5 flex items-baseline gap-1.5 min-w-0 tabular-nums">
                          <span className="text-[14.5px] font-extrabold text-[#B45309] dark:text-[#F59E0B]">
                            {formatMoney(p.sale_price)}
                          </span>
                          {priceDelta.mode === 'DISCOUNT' &&
                            Number.parseFloat(String(p.base_price || 0)) >
                              Number.parseFloat(String(p.sale_price || 0)) && (
                              <span className="truncate text-[11px] font-medium text-ink-muted line-through">
                                {formatMoney(p.base_price)}
                              </span>
                            )}
                        </div>
                        <p className="mt-0.5 truncate text-[10.5px] font-medium text-ink-muted tabular-nums">
                          {brandName ? `${brandName} • ` : ''}{p.sku} • {catName} • Min {min}
                        </p>
                      </div>

                      {canManageCatalog && (
                        <button
                          type="button"
                          data-testid={`product-edit-${p.sku}`}
                          aria-label={`Edit ${p.name}`}
                          title={`Edit ${p.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDrawer(p);
                          }}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-theme/70 bg-surface-muted text-ink transition-colors hover:border-accent hover:bg-accent hover:text-accent-fg cursor-pointer"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[var(--theme-radius-inner)] border border-dashed border-border-theme py-12 text-center text-xs text-ink-muted">
              No products match your search criteria.
            </div>
          )
        ) : (
          /* TABLE-WISE VIEW */
          <div className="min-w-0" data-testid="products-table-view">
            <Table>
              <TableHeader>
                <TableRow>
                  {canManageCatalog && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allPageSelected}
                        indeterminate={somePageSelected}
                        onCheckedChange={toggleSelectAllOnPage}
                        aria-label="Select all visible rows"
                      />
                    </TableHead>
                  )}
                  <SortableTableHead
                    sortKey="name"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                  >
                    Product &amp; SKU
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="category"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                  >
                    Category &amp; Brand
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="base_price"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                    align="right"
                  >
                    Base Price
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="sale_price"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                    align="right"
                  >
                    Sale Price
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="discount_pct"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                    align="right"
                  >
                    Promo / Spread
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="branch_stock"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                    align="right"
                  >
                    On Hand
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="reorder_point"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                    align="right"
                  >
                    Min / Reorder
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="allow_neg"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                  >
                    Policy
                  </SortableTableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pagedItems.map((p) => {
                  const stock = Number(p.branch_stock || 0);
                  const min = Number(p.reorder_point || 0);
                  const reorderQty = Number(p.reorder_qty || 25);
                  const isLow = stock <= min;
                  const allowNeg =
                    p.allow_negative_stock === true ||
                    (p.allow_negative_stock == null && defaultAllowNeg);
                  const priceDelta = computePriceDelta(p);

                  const isSelected = selectedIdSet.has(p.id);

                  return (
                    <TableRow
                      key={p.id}
                      className={isSelected ? 'bg-accent-soft/20' : undefined}
                    >
                      {canManageCatalog && (
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleProductSelection(p.id)}
                            aria-label={`Select row ${p.name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2.5 min-w-[200px]">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="h-9 w-9 shrink-0 rounded-[var(--theme-radius-badge)] border border-border-theme bg-surface-muted object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--theme-radius-badge)] bg-accent-soft/50 text-xs font-bold text-accent-soft-fg">
                              {p.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-ink">{p.name}</div>
                            <div className="text-[11px] text-ink-muted tabular-nums">
                              {p.sku} {p.primary_barcode ? `• ${p.primary_barcode}` : ''}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {(p.brand_name || brandNameMap.get(p.brand_id || '')) && (
                            <Badge variant="lavender">
                              {p.brand_name || brandNameMap.get(p.brand_id || '')}
                            </Badge>
                          )}
                          <Badge variant="outline">
                            {categoryNameMap.get(p.category_id || '') || p.category_name || 'General'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-ink-muted">
                        {formatMoney(p.base_price)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatMoney(p.sale_price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {priceDelta.mode === 'DISCOUNT' ? (
                          <Badge variant="lavender">-{priceDelta.pct.toFixed(0)}% promo</Badge>
                        ) : priceDelta.mode === 'SPREAD' ? (
                          <Badge variant="positive">+{priceDelta.pct.toFixed(1)}%</Badge>
                        ) : (
                          <span className="text-[11px] text-ink-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant={isLow ? 'negative' : 'positive'}>
                          {isLow ? (
                            <AlertTriangle className="mr-1 h-3 w-3" />
                          ) : (
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                          )}
                          {stock} {p.unit_of_measure || 'PCS'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-[11px] text-ink-muted">
                        Min {min} • Order +{reorderQty}
                      </TableCell>
                      <TableCell>
                        <Badge variant={allowNeg ? 'lavender' : 'outline'}>
                          {allowNeg ? 'Allow Negative' : 'Strict FIFO'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="info"
                          size="xs"
                          onClick={() => openEditDrawer(p)}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {pagination.pagedItems.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canManageCatalog ? 10 : 9}
                      className="py-8 text-center text-xs text-ink-muted"
                    >
                      No products match your search criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <DataTablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          pageSizeOptions={[8, 12, 24, 48]}
          itemLabel="products"
          testIdPrefix="products-pagination"
        />
      </section>

      <ProductManagementDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        product={editingProduct}
        categories={categories}
        brands={brands}
        defaultAllowNegativeStock={defaultAllowNeg}
        onSaved={invalidateCatalogQueries}
      />

      {/* Bulk Product Discount Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent
          data-testid="bulk-discount-dialog"
          className="w-[calc(100vw-2rem)] max-w-lg rounded-[22px] p-5"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-ink">
              <Percent className="h-4 w-4 text-accent" />
              <span>Bulk Product Discount ({selectedProducts.length} selected)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Set a promotional discount percentage across selected SKUs. Active product discounts apply automatically when cashiers add items to POS checkout.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <label
                htmlFor="bulk-discount-pct-input"
                className="text-xs font-semibold text-ink"
              >
                Discount Percentage (%)
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="bulk-discount-pct-input"
                  data-testid="bulk-discount-input"
                  type="number"
                  min="0"
                  max="95"
                  step="0.5"
                  value={bulkDiscountPct}
                  onChange={(e) => setBulkDiscountPct(e.target.value)}
                  className="tabular-nums font-bold"
                  placeholder="e.g. 15"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkDiscountPct('0')}
                >
                  Reset 0%
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {['5', '10', '15', '20', '25', '50'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    data-testid={`bulk-discount-preset-${preset}`}
                    onClick={() => setBulkDiscountPct(preset)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition cursor-pointer tabular-nums ${
                      Number(bulkDiscountPct) === Number(preset)
                        ? 'bg-accent text-accent-fg shadow-2xs'
                        : 'bg-surface-muted text-ink hover:bg-accent-soft/60'
                    }`}
                  >
                    -{preset}%
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-ink-muted">
                <span>Live Price Preview</span>
                <span>{selectedProducts.length} SKU(s)</span>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-border-theme/55 rounded-[var(--theme-radius-inner)] border border-border-theme/70 bg-surface-muted/40">
                {selectedProducts.map((p) => {
                  const preview = previewProductDiscountPrice(p, bulkDiscountPct || '0');
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs tabular-nums"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{p.name}</p>
                        <p className="text-[10.5px] text-ink-muted">{p.sku}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[11px] text-ink-muted line-through mr-1.5">
                          {formatMoney(preview.listPrice)}
                        </span>
                        <span className="font-bold text-[#B45309] dark:text-[#F59E0B]">
                          {formatMoney(preview.salePrice)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-theme/65">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBulkDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="lavender"
                size="sm"
                disabled={applyingBulkDiscount || selectedProducts.length === 0}
                data-testid="bulk-discount-apply-btn"
                onClick={() => void submitBulkDiscount(bulkDiscountPct)}
              >
                <Percent className="h-3.5 w-3.5" />
                {applyingBulkDiscount
                  ? 'Applying...'
                  : Number(bulkDiscountPct || 0) > 0
                    ? `Apply ${bulkDiscountPct}% to ${selectedProducts.length} SKU(s)`
                    : `Clear Discount on ${selectedProducts.length} SKU(s)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
