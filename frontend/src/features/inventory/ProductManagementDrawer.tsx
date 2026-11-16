import * as React from 'react';
import {
  AlertTriangle,
  Minus,
  Plus,
  Save,
  Trash2,
  Package,
  DollarSign,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MagneticDropZone, type UploadedFileItem } from '@/components/dqnamo/MagneticDropZone';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { apiFetch } from '@/lib/api';
import { confirmDestructiveAction } from '@/lib/swal';
import { useCurrency } from '@/hooks/useCurrency';
import type { LocalProduct } from '@/lib/dexie-db';
import type { POSBrand, POSCategory } from '../pos/types';
import { toast } from 'sonner';

interface ProductManagementDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: LocalProduct | null;
  categories: POSCategory[];
  brands?: POSBrand[];
  defaultAllowNegativeStock: boolean;
  onSaved: () => void;
}

const UOM_OPTIONS = ['PCS', 'EA', 'KG', 'BOX', 'SET'];

export function ProductManagementDrawer({
  open,
  onOpenChange,
  product,
  categories,
  brands = [],
  defaultAllowNegativeStock,
  onSaved,
}: ProductManagementDrawerProps) {
  const { currencyCode, formatMoney } = useCurrency();

  const [name, setName] = React.useState('');
  const [sku, setSku] = React.useState('');
  const [barcode, setBarcode] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [brandId, setBrandId] = React.useState('NONE');
  const [unitOfMeasure, setUnitOfMeasure] = React.useState('PCS');
  const [description, setDescription] = React.useState('');
  const [costPrice, setCostPrice] = React.useState('0.00');
  const [salePrice, setSalePrice] = React.useState('');
  const [discountPercent, setDiscountPercent] = React.useState('0');
  const [reorderPoint, setReorderPoint] = React.useState(10);
  const [reorderQty, setReorderQty] = React.useState(25);
  const [negStockMode, setNegStockMode] = React.useState<'INHERIT' | 'ALLOW' | 'BLOCK'>('INHERIT');
  const [imageUrls, setImageUrls] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name);
      setSku(product.sku.toUpperCase());
      setBarcode(product.primary_barcode || '');
      setCategoryId(product.category_id || categories[0]?.id || '');
      setBrandId(product.brand_id || 'NONE');
      setUnitOfMeasure(product.unit_of_measure || 'PCS');
      setDescription(product.description || '');
      setCostPrice(Number(product.base_price || 0).toFixed(2));
      setSalePrice(Number(product.sale_price || 0).toFixed(2));
      setDiscountPercent(
        Number(product.discount_percent || 0) > 0
          ? String(Number(product.discount_percent))
          : '0'
      );
      setReorderPoint(Math.max(0, Math.round(Number(product.reorder_point ?? 10))));
      setReorderQty(Math.max(1, Math.round(Number(product.reorder_qty ?? 25))));
      if (product.allow_negative_stock === true) setNegStockMode('ALLOW');
      else if (product.allow_negative_stock === false) setNegStockMode('BLOCK');
      else setNegStockMode('INHERIT');
      const imgs =
        Array.isArray(product.image_urls) && product.image_urls.length > 0
          ? product.image_urls
          : product.image_url
          ? [product.image_url]
          : [];
      setImageUrls(imgs.slice(0, 5));
    } else {
      setName('');
      setSku('');
      setBarcode('');
      setCategoryId(categories[0]?.id || '');
      setBrandId(brands[0]?.id || 'NONE');
      setUnitOfMeasure('PCS');
      setDescription('');
      setCostPrice('35.00');
      setSalePrice('');
      setDiscountPercent('0');
      setReorderPoint(10);
      setReorderQty(25);
      setNegStockMode('INHERIT');
      setImageUrls([]);
    }
  }, [open, product, categories, brands]);

  const costNum = Number(costPrice || 0);
  const saleNum = Number(salePrice || 0);
  const rawDisc = Number(discountPercent || 0);
  const discNum = Number.isNaN(rawDisc) ? 0 : Math.max(0, Math.min(95, rawDisc));
  const isPromoMode = discNum > 0;
  const hasPriceLoss =
    !isPromoMode &&
    salePrice.trim() !== '' &&
    !Number.isNaN(costNum) &&
    !Number.isNaN(saleNum) &&
    saleNum < costNum;

  const formattedCostLabel = formatMoney(costNum);
  const marginPct =
    saleNum > 0 && costNum >= 0 ? (((saleNum - costNum) / saleNum) * 100).toFixed(1) : '0.0';

  const handleDiscountChange = (rawVal: string) => {
    setDiscountPercent(rawVal);
    const parsedDisc = Number(rawVal || 0);
    const clampedDisc = Number.isNaN(parsedDisc) ? 0 : Math.max(0, Math.min(95, parsedDisc));
    if (clampedDisc > 0) {
      const anchor =
        discNum === 0 && !Number.isNaN(saleNum) && saleNum > costNum ? saleNum : costNum;
      if (discNum === 0 && !Number.isNaN(saleNum) && saleNum > costNum) {
        setCostPrice(saleNum.toFixed(2));
      }
      if (!Number.isNaN(anchor) && anchor > 0) {
        const baseCents = BigInt(Math.round(anchor * 100));
        const discBps = BigInt(Math.round(clampedDisc * 100));
        const netScaled = baseCents * (BigInt(10000) - discBps);
        const roundedCents = (netScaled + BigInt(5000)) / BigInt(10000);
        const whole = roundedCents / BigInt(100);
        const frac = (roundedCents % BigInt(100)).toString().padStart(2, '0');
        setSalePrice(`${whole.toString()}.${frac}`);
      }
    } else if (isPromoMode && !Number.isNaN(costNum) && costNum > 0) {
      setSalePrice(costNum.toFixed(2));
    }
  };

  const handleImagesChanged = (items: UploadedFileItem[]) => {
    setImageUrls(items.slice(0, 5).map((i) => i.dataUrl));
  };

  const handleSave = React.useCallback(async () => {
    if (saving) return;
    const cleanName = name.trim();
    const cleanSku = sku.trim().toUpperCase();
    if (!cleanName) {
      toast.error('Item Name is required');
      return;
    }
    if (!cleanSku) {
      toast.error('SKU is required');
      return;
    }
    if (!categoryId) {
      toast.error('Select a product category');
      return;
    }
    if (!salePrice.trim() || Number.isNaN(saleNum) || saleNum <= 0) {
      toast.error('Enter a valid Selling Price greater than 0');
      return;
    }
    if (hasPriceLoss) {
      toast.error(`Selling price must be higher than cost price (${formattedCostLabel}).`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        category_id: categoryId,
        brand_id: brandId && brandId !== 'NONE' ? brandId : null,
        sku: cleanSku,
        barcode: barcode.trim(),
        name: cleanName,
        description: description.trim(),
        image_urls: imageUrls.slice(0, 5),
        unit_of_measure: unitOfMeasure,
        base_price: (Number.isNaN(costNum) ? 0 : costNum).toFixed(2),
        sale_price: saleNum.toFixed(2),
        discount_percent: discNum.toFixed(2),
        reorder_point: String(Math.max(0, reorderPoint)),
        reorder_qty: String(Math.max(1, reorderQty)),
        allow_negative_stock_mode: negStockMode,
      };
      if (product) {
        await apiFetch(`/api/v1/products/${product.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`Updated SKU ${cleanSku}`);
      } else {
        await apiFetch('/api/v1/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Created SKU ${cleanSku}`);
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Unable to save product');
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    name,
    sku,
    categoryId,
    brandId,
    salePrice,
    saleNum,
    hasPriceLoss,
    formattedCostLabel,
    barcode,
    description,
    imageUrls,
    unitOfMeasure,
    costNum,
    discNum,
    reorderPoint,
    reorderQty,
    negStockMode,
    product,
    onSaved,
    onOpenChange,
  ]);

  // ⌘S / Ctrl+S shortcut while drawer is open
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleSave]);

  const handleDeleteOrArchive = async () => {
    if (!product) return;
    const confirmed = await confirmDestructiveAction({
      title: 'Delete Product?',
      text: 'Historical sales or FIFO layers preserve this SKU via soft-archive; unused drafts are removed permanently.',
      cancelLabel: 'Keep Product',
      confirmLabel: 'Yes, Archive Product',
    });
    if (!confirmed) return;

    try {
      const res = await apiFetch<{ status: string }>(`/api/v1/products/${product.id}`, {
        method: 'DELETE',
      });
      toast.success(
        res.status === 'ARCHIVED'
          ? `${product.sku} archived cleanly (history preserved)`
          : `${product.sku} permanently deleted`
      );
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Unable to archive product');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[720px] flex flex-col p-0 overflow-hidden"
      >
        <div className="border-b border-border-theme px-6 py-4 pr-14">
          <SheetHeader>
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle>{product ? `Edit SKU • ${product.sku}` : 'New Product SKU'}</SheetTitle>
              <Badge variant="lavender">3NF Catalog</Badge>
            </div>
            <SheetDescription>
              Configure SKU details, multi-image media, FIFO reorder thresholds, and Level-6 negative stock rule.
            </SheetDescription>
          </SheetHeader>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
        >
          {/* Chunk 1: Media (Up to 5 Images) */}
          <section className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/70 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Media Gallery ({imageUrls.length}/5)
              </span>
              <span className="text-[11px] text-ink-muted">Max 2MB per photo</span>
            </div>
            <MagneticDropZone
              maxFiles={5}
              maxSizeMB={2}
              accept=".png,.jpg,.jpeg,.webp"
              previewUrls={imageUrls}
              onFilesChanged={handleImagesChanged}
              onFileSelected={() => {}}
              label="Drop up to 5 product images or click to upload"
              helperText="PNG, JPG or WebP under 2MB • First image renders as primary POS card cover"
            />
          </section>

          {/* Chunk 2: General Identification */}
          <section className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface p-4 space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <Package className="h-3.5 w-3.5 text-accent" />
              <span>General Information</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-semibold text-ink">
                  Item Name <span className="text-[#EF4444]">*</span>
                </label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Premium Cotton T-Shirt"
                  data-testid="product-name-input"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">
                  SKU <span className="text-[#EF4444]">*</span>
                </label>
                <Input
                  required
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="e.g., APP-TSHIRT-BLK-XL"
                  className="font-mono uppercase"
                  data-testid="product-sku-input"
                />
                <p className="text-[10.5px] text-ink-muted">Auto-formats to uppercase & enforces tenant uniqueness.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">EAN-13 / Barcode</label>
                <Input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value.replace(/\s+/g, ''))}
                  placeholder="e.g., 8901234567890"
                  className="font-mono tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Category</label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Brand</label>
                <Select value={brandId} onValueChange={setBrandId}>
                  <SelectTrigger data-testid="product-brand-select">
                    <SelectValue placeholder="Choose brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Unbranded / Generic</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Unit of Measure</label>
                <Select value={unitOfMeasure} onValueChange={setUnitOfMeasure}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UOM_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Chunk 3: Pricing */}
          <section className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <DollarSign className="h-3.5 w-3.5 text-accent" />
                <span>Pricing &amp; Margin Guard</span>
              </div>
              <Badge variant={hasPriceLoss ? 'negative' : 'positive'}>
                {isPromoMode ? `Promo -${discNum.toFixed(0)}%` : `Margin ${marginPct}%`}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">
                  {isPromoMode ? `List Price (${currencyCode})` : `Cost Price (${currencyCode})`}
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="e.g., 4500.00"
                  className="tabular-nums"
                  data-testid="product-cost-input"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Discount %</label>
                <Input
                  type="number"
                  min="0"
                  max="95"
                  step="0.5"
                  value={discountPercent}
                  onChange={(e) => handleDiscountChange(e.target.value)}
                  placeholder="0"
                  className="tabular-nums"
                  data-testid="product-discount-input"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">
                  Selling Price <span className="text-[#EF4444]">*</span>
                </label>
                <Input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="e.g., 5000.00"
                  className={`tabular-nums ${hasPriceLoss ? 'border-[#EF4444] ring-1 ring-[#EF4444]' : ''}`}
                  data-testid="product-selling-input"
                />
              </div>
            </div>

            {hasPriceLoss && (
              <div className="flex items-center gap-2 rounded-[var(--theme-radius-control)] bg-[#EF4444]/10 px-3 py-2 text-[11.5px] font-medium text-[#EF4444]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Selling price must be higher than cost price ({formattedCostLabel}).</span>
              </div>
            )}
          </section>

          {/* Chunk 4: Stock & Level-6 Settings Override */}
          <section className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface p-4 space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" />
              <span>Stock Thresholds &amp; Level-6 Rule</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Reorder Level Stepper */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Reorder Level</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease reorder level"
                    onClick={() => setReorderPoint((v) => Math.max(0, v - 1))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-theme bg-surface-muted text-ink hover:bg-accent-soft/50 cursor-pointer"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <Input
                    type="number"
                    min="0"
                    value={reorderPoint}
                    onChange={(e) => setReorderPoint(Math.max(0, Number(e.target.value) || 0))}
                    className="text-center font-semibold tabular-nums"
                  />
                  <button
                    type="button"
                    aria-label="Increase reorder level"
                    onClick={() => setReorderPoint((v) => v + 1)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-theme bg-surface-muted text-ink hover:bg-accent-soft/50 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Reorder Batch Qty Stepper */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Auto-PO Reorder Qty</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease reorder qty"
                    onClick={() => setReorderQty((v) => Math.max(1, v - 5))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-theme bg-surface-muted text-ink hover:bg-accent-soft/50 cursor-pointer"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <Input
                    type="number"
                    min="1"
                    value={reorderQty}
                    onChange={(e) => setReorderQty(Math.max(1, Number(e.target.value) || 1))}
                    className="text-center font-semibold tabular-nums"
                  />
                  <button
                    type="button"
                    aria-label="Increase reorder qty"
                    onClick={() => setReorderQty((v) => v + 5)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-theme bg-surface-muted text-ink hover:bg-accent-soft/50 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-ink">
                    Level-6 Override: Allow Negative Stock
                  </label>
                  <Badge variant="outline">
                    Parent Default: {defaultAllowNegativeStock ? 'ALLOW' : 'BLOCK'}
                  </Badge>
                </div>
                <Select
                  value={negStockMode}
                  onValueChange={(v) => setNegStockMode(v as 'INHERIT' | 'ALLOW' | 'BLOCK')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INHERIT">
                      Inherit Parent Chain ({defaultAllowNegativeStock ? 'Allowed' : 'Blocked'})
                    </SelectItem>
                    <SelectItem value="ALLOW">Override: Always Allow Negative Stock</SelectItem>
                    <SelectItem value="BLOCK">Override: Strictly Block Zero-Stock Sale</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10.5px] text-ink-muted">
                  Evaluates at Level 6 (Product) above Category, Terminal, Branch, Business &amp; System defaults.
                </p>
              </div>
            </div>
          </section>
        </form>

        {/* Gutenberg Terminal Footer: Ghost Destructive Left + Primary ⌘S Right */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-theme bg-surface px-6 py-3.5">
          <div>
            {product ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDeleteOrArchive}
                className="text-[#EF4444] hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Product
              </Button>
            ) : (
              <span className="text-[11px] text-ink-muted">
                Profit / unit:{' '}
                <strong className="text-ink tabular-nums">
                  {formatMoney(Math.max(0, saleNum - costNum))}
                </strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <DynamicButton
              type="button"
              variant="lavender"
              disabled={saving || hasPriceLoss}
              onClick={() => void handleSave()}
              icon={<Save className="h-3.5 w-3.5" />}
              data-testid="save-product-btn"
            >
              {saving ? 'Saving...' : 'Save Product (⌘S)'}
            </DynamicButton>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
