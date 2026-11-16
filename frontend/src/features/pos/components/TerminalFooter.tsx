import * as React from 'react';
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  PackagePlus,
  Printer,
  Sparkles,
  Wallet,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import { Can } from '@/features/auth/Can';
import { apiFetch } from '@/lib/api';
import type { LocalProduct } from '@/lib/dexie-db';
import { toast } from 'sonner';
import type { POSCategory } from '../types';
import type { POSCapabilities } from './capabilities';

export interface TerminalFooterProps {
  activeBranchName: string;
  capabilities: POSCapabilities;
  products: LocalProduct[];
  categories: POSCategory[];
  isOnline: boolean;
  pendingOutboxCount: number;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onTriggerCashDrawerKick: () => void;
  onOpenLastReceipt: () => void;
  onProductSaved: () => void;
  onExitPOS: () => void;
}

/**
 * Fixed 64px Obsidian Terminal Footer with:
 * - Left CTA -> Slide-in Product Quick-Edit / Create Sheet (~400px, business-vertical scoped)
 * - Center Branch / Industry Profile / Sync telemetry pill cluster
 * - Right Direct Inline Buttons: Cash Drawer, Reprint, Fullscreen, and Exit POS
 */
export function TerminalFooter({
  activeBranchName,
  capabilities,
  products,
  categories,
  isOnline,
  pendingOutboxCount,
  isFullscreen,
  onToggleFullscreen,
  onTriggerCashDrawerKick,
  onOpenLastReceipt,
  onProductSaved,
  onExitPOS,
}: TerminalFooterProps) {
  const [productSheetOpen, setProductSheetOpen] = React.useState(false);

  // Quick Product Editor state
  const [editMode, setEditMode] = React.useState<'EDIT' | 'CREATE'>('EDIT');
  const [selectedProductId, setSelectedProductId] = React.useState<string>('');
  const [name, setName] = React.useState('');
  const [sku, setSku] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [basePrice, setBasePrice] = React.useState('20.00');
  const [salePrice, setSalePrice] = React.useState('25.00');
  const [uom, setUom] = React.useState('PCS');
  const [warrantyTerms, setWarrantyTerms] = React.useState('');
  const [enableSerial, setEnableSerial] = React.useState(false);
  const [isServiceLabor, setIsServiceLabor] = React.useState(false);
  const [allowFractional, setAllowFractional] = React.useState(false);
  const [savingProduct, setSavingProduct] = React.useState(false);

  const hydrateFromProduct = React.useCallback(
    (prod?: LocalProduct) => {
      if (!prod) {
        setName('');
        setSku('');
        setCategoryId(categories[0]?.id || '');
        setBasePrice('20.00');
        setSalePrice('25.00');
        setUom('PCS');
        setWarrantyTerms('');
        setEnableSerial(false);
        setIsServiceLabor(false);
        setAllowFractional(false);
        return;
      }
      setName(prod.name);
      setSku(prod.sku);
      setCategoryId(prod.category_id || categories[0]?.id || '');
      setBasePrice(prod.base_price || '0.00');
      setSalePrice(prod.sale_price || '0.00');
      setUom(prod.unit_of_measure || 'PCS');
      setWarrantyTerms(prod.warranty_terms || '');
      setEnableSerial(Boolean(prod.enable_serial_tracking));
      setIsServiceLabor(Boolean(prod.is_service_labor));
      setAllowFractional(Boolean(prod.allow_fractional_qty));
    },
    [categories]
  );

  React.useEffect(() => {
    if (!productSheetOpen) return;
    if (editMode === 'EDIT') {
      const target = products.find((p) => p.id === selectedProductId) || products[0];
      if (target) {
        setSelectedProductId(target.id);
        hydrateFromProduct(target);
      }
    } else {
      hydrateFromProduct(undefined);
    }
  }, [productSheetOpen, editMode, products, selectedProductId, hydrateFromProduct]);

  const handleSaveQuickProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProduct) return;
    const cleanName = name.trim();
    const cleanSku = sku.trim().toUpperCase();
    if (!cleanName || !cleanSku || !categoryId) {
      toast.error('Product name, SKU, and category are required');
      return;
    }

    setSavingProduct(true);
    try {
      const payload = {
        category_id: categoryId,
        sku: cleanSku,
        name: cleanName,
        unit_of_measure: uom.trim() || 'PCS',
        base_price: basePrice.trim() || '0.00',
        sale_price: salePrice.trim() || '0.00',
        enable_serial_tracking: enableSerial,
        is_service_labor: isServiceLabor,
        allow_fractional_qty: allowFractional,
        warranty_terms: warrantyTerms.trim(),
      };

      if (editMode === 'EDIT' && selectedProductId) {
        await apiFetch(`/api/v1/products/${selectedProductId}`, {
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
      onProductSaved();
      setProductSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save product');
    } finally {
      setSavingProduct(false);
    }
  };

  const showWarrantyField = capabilities.requireSerialImei || capabilities.requireVehiclePlate;
  const hasIndustryFlags =
    capabilities.requireSerialImei ||
    capabilities.splitLaborParts ||
    capabilities.allowFractionalQty;

  return (
    <>
      <footer
        data-testid="pos-terminal-footer"
        className="h-[62px] shrink-0 rounded-t-[18px] bg-[#222026] px-2.5 sm:px-5 text-white shadow-[0_-6px_24px_rgba(34,32,38,0.12)] flex items-center justify-between gap-2"
      >
        {/* Left Action: Quick Product Update Drawer */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {capabilities.footerQuickEditSidebar && (
            <button
              type="button"
              data-testid="footer-product-update-btn"
              onClick={() => setProductSheetOpen(true)}
              className="inline-flex h-9 sm:h-10 items-center gap-1.5 sm:gap-2 rounded-[11px] border border-white/15 bg-white/10 px-2.5 sm:px-3.5 text-[11.5px] sm:text-[12px] font-bold text-white transition-colors hover:bg-white/20 cursor-pointer"
            >
              <PackagePlus className="h-4 w-4 text-accent-soft shrink-0" />
              <span className="hidden sm:inline whitespace-nowrap">
                Product <span className="hidden md:inline">Update</span>
              </span>
            </button>
          )}
        </div>

        {/* Center Status Cluster */}
        <div className="hidden lg:flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-semibold text-white/90">
            <Sparkles className="h-3.5 w-3.5 text-accent-soft" />
            <span>{capabilities.preset.label}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-medium text-white/80">
            {isOnline ? (
              <Wifi className="h-3.5 w-3.5 text-[#22C55E]" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-[#F59E0B]" />
            )}
            <span>
              {activeBranchName || 'Active Branch'}
              {pendingOutboxCount > 0 ? ` • ${pendingOutboxCount} queued` : ''}
            </span>
          </span>
        </div>

        {/* Right Actions: Inline Hardware, Fullscreen & Direct Exit POS Controls */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            data-testid="footer-cash-drawer-btn"
            onClick={onTriggerCashDrawerKick}
            title="Kick Cash Drawer (ESC/POS Pulse)"
            className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-[11px] border border-white/15 bg-white/10 px-2.5 sm:px-3 text-[11.5px] sm:text-[12px] font-bold text-white transition-colors hover:bg-white/20 cursor-pointer"
          >
            <Wallet className="h-4 w-4 text-accent-soft shrink-0" />
            <span className="hidden md:inline">Cash Drawer</span>
          </button>

          <button
            type="button"
            data-testid="footer-reprint-btn"
            onClick={onOpenLastReceipt}
            title="Reprint Last Receipt / Test Slip"
            className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-[11px] border border-white/15 bg-white/10 px-2.5 sm:px-3 text-[11.5px] sm:text-[12px] font-bold text-white transition-colors hover:bg-white/20 cursor-pointer"
          >
            <Printer className="h-4 w-4 text-accent-soft shrink-0" />
            <span className="hidden md:inline">Reprint</span>
          </button>

          <button
            type="button"
            data-testid="footer-fullscreen-btn"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (80% POS Scale)'}
            className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-[11px] border border-white/15 bg-white/10 px-2.5 sm:px-3 text-[11.5px] sm:text-[12px] font-bold text-white transition-colors hover:bg-white/20 cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4 text-accent-soft shrink-0" />
            ) : (
              <Maximize2 className="h-4 w-4 text-accent-soft shrink-0" />
            )}
            <span className="hidden lg:inline">{isFullscreen ? 'Windowed' : 'Fullscreen'}</span>
          </button>

          <button
            type="button"
            data-testid="footer-exit-pos-btn"
            onClick={onExitPOS}
            className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-[11px] bg-accent px-3 sm:px-4 text-[11.5px] sm:text-[12px] font-bold text-white shadow-sm transition-opacity hover:opacity-95 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span>Exit POS</span>
          </button>
        </div>
      </footer>

      {/* Left Slide-Over Sheet: Product Update (Strictly scoped to active Business Vertical) */}
      <Sheet open={productSheetOpen} onOpenChange={setProductSheetOpen}>
        <SheetContent
          side="left"
          data-testid="pos-product-update-sheet"
          className="w-full sm:max-w-[400px] overflow-y-auto bg-white"
        >
          <SheetHeader className="mb-4">
            <SheetTitle>Quick Product Update</SheetTitle>
            <SheetDescription>
              Adjust live pricing or create an item scoped to {capabilities.preset.label}.
            </SheetDescription>
          </SheetHeader>

          <Can
            permission="catalog:manage"
            fallback={
              <div className="rounded-[14px] border border-border-theme bg-[#F5F6FA] p-4 text-xs text-ink-muted">
                Your role does not have `catalog:manage` permission to edit or create SKUs from the register.
              </div>
            }
          >
            <form onSubmit={handleSaveQuickProduct} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-[#F5F6FA] p-1">
                {(
                  [
                    { id: 'EDIT', label: 'Edit Existing SKU' },
                    { id: 'CREATE', label: 'New SKU' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEditMode(tab.id)}
                    className={`min-h-[34px] rounded-[9px] text-[11.5px] font-bold transition-colors cursor-pointer ${
                      editMode === tab.id
                        ? 'bg-[#222026] text-white'
                        : 'text-ink-muted hover:text-[#222026]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {editMode === 'EDIT' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    Select Catalog Item
                  </label>
                  <Select
                    value={selectedProductId}
                    onValueChange={(id) => {
                      setSelectedProductId(id);
                      hydrateFromProduct(products.find((p) => p.id === id));
                    }}
                  >
                    <SelectTrigger data-testid="quick-edit-product-select">
                      <SelectValue placeholder="Choose SKU..." />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Product Name
                </label>
                <Input
                  data-testid="quick-edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    SKU
                  </label>
                  <Input
                    data-testid="quick-edit-sku"
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    UOM
                  </label>
                  <Input value={uom} onChange={(e) => setUom(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Category
                </label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category..." />
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

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    Cost / Base Price
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    Sale Price
                  </label>
                  <Input
                    data-testid="quick-edit-sale-price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    required
                  />
                </div>
              </div>

              {showWarrantyField && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    Warranty Terms
                  </label>
                  <Input
                    value={warrantyTerms}
                    onChange={(e) => setWarrantyTerms(e.target.value)}
                    placeholder="e.g. 1 Year Apple Care"
                  />
                </div>
              )}

              {hasIndustryFlags && (
                <div className="space-y-2 rounded-[14px] border border-border-theme/70 bg-[#F5F6FA]/75 p-3">
                  {capabilities.requireSerialImei && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] font-bold text-[#222026]">
                        Mandatory IMEI / Serial Tracking
                      </span>
                      <Switch checked={enableSerial} onCheckedChange={setEnableSerial} />
                    </div>
                  )}
                  {capabilities.splitLaborParts && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] font-bold text-[#222026]">
                        Garage Service / Labor Item
                      </span>
                      <Switch checked={isServiceLabor} onCheckedChange={setIsServiceLabor} />
                    </div>
                  )}
                  {capabilities.allowFractionalQty && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] font-bold text-[#222026]">
                        Allow Fractional Qty (0.5, 1.25)
                      </span>
                      <Switch checked={allowFractional} onCheckedChange={setAllowFractional} />
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <TactileButton tone="light" onClick={() => setProductSheetOpen(false)}>
                  Cancel
                </TactileButton>
                <DynamicButton
                  type="submit"
                  data-testid="quick-edit-save-btn"
                  variant="obsidian"
                  loading={savingProduct}
                >
                  {editMode === 'EDIT' ? 'Save SKU Changes' : 'Create SKU'}
                </DynamicButton>
              </div>
            </form>
          </Can>
        </SheetContent>
      </Sheet>
    </>
  );
}
