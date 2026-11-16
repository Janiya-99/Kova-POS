import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Globe, Layers, Package, Pencil, Plus, Search, Trash2, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { confirmDestructiveAction } from '@/lib/swal';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useCurrency } from '@/hooks/useCurrency';
import type { POSBootstrapResponse, POSBrand } from '@/features/pos/types';
import { toast } from 'sonner';

interface BrandRecord extends POSBrand {
  id: string;
  business_id: string;
  name: string;
  slug: string;
  country: string;
  website: string;
  logo_url: string;
  description: string;
  is_active: boolean;
  product_count: number;
  total_stock: string | number;
}

export function BrandsPage() {
  const { context, hasPermission } = useAuthStore();
  const canManageCatalog = hasPermission('catalog:manage');
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();

  const [search, setSearch] = React.useState('');
  const [countryFilter, setCountryFilter] = React.useState<string>('ALL');
  const [selectedBrandId, setSelectedBrandId] = React.useState<string | null>(null);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BrandRecord | null>(null);
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [country, setCountry] = React.useState('');
  const [website, setWebsite] = React.useState('');
  const [logoUrl, setLogoUrl] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['brands', context?.business_id],
    queryFn: () => apiFetch<{ brands: BrandRecord[] }>('/api/v1/brands'),
    enabled: Boolean(context?.business_id),
  });

  const { data: bootstrap } = useQuery({
    queryKey: ['pos-bootstrap', context?.business_id, context?.branch_id],
    queryFn: () => apiFetch<POSBootstrapResponse>('/api/v1/pos/bootstrap'),
    enabled: Boolean(context?.business_id),
  });

  const brands = data?.brands || [];
  const allProducts = bootstrap?.products || [];

  const countries = React.useMemo(() => {
    const uniq = Array.from(
      new Set(brands.map((b) => (b.country || '').trim()).filter(Boolean))
    );
    return uniq.sort((a, b) => a.localeCompare(b));
  }, [brands]);

  const filtered = React.useMemo(
    () =>
      brands.filter((b) => {
        if (countryFilter !== 'ALL' && (b.country || '').trim() !== countryFilter) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          b.name.toLowerCase().includes(q) ||
          b.slug.toLowerCase().includes(q) ||
          (b.country || '').toLowerCase().includes(q) ||
          (b.description || '').toLowerCase().includes(q)
        );
      }),
    [brands, countryFilter, search]
  );

  const { sortedItems, sortConfig, requestSort } = useSortableData(
    filtered,
    { key: 'name', dir: 'asc' },
    (b, key) => {
      if (key === 'country') return b.country || '';
      if (key === 'slug') return b.slug;
      if (key === 'product_count') return Number(b.product_count || 0);
      if (key === 'total_stock') return Number(b.total_stock || 0);
      return b.name;
    }
  );
  const pagination = usePagination(sortedItems, 12);

  const inspectedBrand = React.useMemo(
    () => brands.find((b) => b.id === selectedBrandId) || sortedItems[0] || null,
    [brands, selectedBrandId, sortedItems]
  );

  const brandProducts = React.useMemo(() => {
    if (!inspectedBrand) return [];
    return allProducts.filter((p) => p.brand_id === inspectedBrand.id);
  }, [allProducts, inspectedBrand]);

  const invalidateBrandQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['brands', context?.business_id] });
    queryClient.invalidateQueries({ queryKey: ['pos-bootstrap'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSlug('');
    setCountry('');
    setWebsite('');
    setLogoUrl('');
    setDescription('');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (brand: BrandRecord) => {
    setEditing(brand);
    setName(brand.name);
    setSlug(brand.slug);
    setCountry(brand.country || '');
    setWebsite(brand.website || '');
    setLogoUrl(brand.logo_url || '');
    setDescription(brand.description || '');
    setIsActive(Boolean(brand.is_active));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Brand name is required');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(editing ? `/api/v1/brands/${editing.id}` : '/api/v1/brands', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          country: country.trim(),
          website: website.trim(),
          logo_url: logoUrl.trim(),
          description: description.trim(),
          is_active: isActive,
        }),
      });
      toast.success(editing ? `Updated brand ${name}` : `Created brand ${name}`);
      setModalOpen(false);
      invalidateBrandQueries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save brand');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (brand: BrandRecord) => {
    const ok = await confirmDestructiveAction({
      title: `Delete "${brand.name}"?`,
      text: 'Brands with assigned products must be cleared first to preserve audit integrity.',
      confirmLabel: 'Yes, Delete Brand',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/v1/brands/${brand.id}`, { method: 'DELETE' });
      toast.success(`Brand "${brand.name}" removed`);
      if (selectedBrandId === brand.id) setSelectedBrandId(null);
      invalidateBrandQueries();
    } catch (err: any) {
      toast.error(err.message || 'Unable to delete brand');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-stretch">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="zona-card p-4 h-[94px] flex flex-col justify-between">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="zona-card p-5 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const totalAssignedSkus = brands.reduce((acc, b) => acc + Number(b.product_count || 0), 0);
  const totalBrandStock = brands.reduce((acc, b) => acc + Number(b.total_stock || 0), 0);

  return (
    <div className="space-y-4" data-testid="brands-page">
      {/* KPI Bento Header */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-stretch">
        <div className="zona-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>Registered Brands</span>
            <Award className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-1 text-xl font-bold text-ink tabular-nums">{brands.length}</p>
          <p className="text-[11px] text-ink-muted">OEM &amp; distributor lines</p>
        </div>
        <div className="zona-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>Branded SKUs</span>
            <Layers className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-1 text-xl font-bold text-ink tabular-nums">{totalAssignedSkus}</p>
          <p className="text-[11px] text-ink-muted">Mapped in product catalog</p>
        </div>
        <div className="zona-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>Stock Units On Hand</span>
            <Package className="h-4 w-4 text-[#16A34A]" />
          </div>
          <p className="mt-1 text-xl font-bold text-ink tabular-nums">
            {totalBrandStock.toLocaleString()}
          </p>
          <p className="text-[11px] text-ink-muted">Across all FIFO batches</p>
        </div>
        <div className="zona-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>Country Origins</span>
            <Globe className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-1 text-xl font-bold text-ink tabular-nums">{countries.length}</p>
          <p className="text-[11px] text-ink-muted">Global hardware ecosystems</p>
        </div>
      </section>

      {/* Main Split Grid: Brand Directory (Left 8 cols) + Live Brand Product Portfolio (Right 4 cols) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 zona-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search OPPO, Infinix, Apple, Soundcore..."
                  className="pl-9"
                  data-testid="brands-search-input"
                />
              </div>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="w-[165px]">
                  <SelectValue placeholder="All Origins" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Countries</SelectItem>
                  {countries.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canManageCatalog && (
              <DynamicButton
                type="button"
                variant="obsidian"
                onClick={openCreate}
                data-testid="add-brand-btn"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Brand
              </DynamicButton>
            )}
          </div>

          <Table data-testid="brands-table">
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  sortKey="name"
                  activeSortKey={sortConfig?.key}
                  sortDir={sortConfig?.dir}
                  onSort={requestSort}
                >
                  Brand Name
                </SortableTableHead>
                <SortableTableHead
                  sortKey="country"
                  activeSortKey={sortConfig?.key}
                  sortDir={sortConfig?.dir}
                  onSort={requestSort}
                >
                  Origin
                </SortableTableHead>
                <SortableTableHead
                  sortKey="product_count"
                  activeSortKey={sortConfig?.key}
                  sortDir={sortConfig?.dir}
                  onSort={requestSort}
                  align="right"
                >
                  SKUs
                </SortableTableHead>
                <SortableTableHead
                  sortKey="total_stock"
                  activeSortKey={sortConfig?.key}
                  sortDir={sortConfig?.dir}
                  onSort={requestSort}
                  align="right"
                >
                  Stock Qty
                </SortableTableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pagedItems.map((brand) => {
                const isSelected = inspectedBrand?.id === brand.id;
                return (
                  <TableRow
                    key={brand.id}
                    onClick={() => setSelectedBrandId(brand.id)}
                    className={`cursor-pointer ${
                      isSelected ? 'bg-accent-soft/20' : ''
                    }`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--theme-radius-badge)] bg-accent-soft/75 text-xs font-extrabold text-accent-soft-fg">
                          {brand.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-ink">{brand.name}</span>
                            {brand.is_active && (
                              <CheckCircle2 className="h-3 w-3 text-[#16A34A]" />
                            )}
                          </div>
                          <p className="truncate max-w-[260px] text-[11px] text-ink-muted">
                            {brand.description || brand.slug}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{brand.country || 'Global'}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {brand.product_count}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {Number(brand.total_stock || 0).toLocaleString()}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canManageCatalog && (
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="info"
                            size="xs"
                            onClick={() => openEdit(brand)}
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="xs"
                            onClick={() => handleDelete(brand)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {pagination.pagedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-ink-muted">
                    No brands match your filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <DataTablePagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={[8, 12, 24]}
            itemLabel="brands"
            testIdPrefix="brands-pagination"
          />
        </div>

        {/* Right Panel: Selected Brand Portfolio Products */}
        <aside className="xl:col-span-4 zona-card p-5 space-y-3.5">
          {inspectedBrand ? (
            <>
              <div className="flex items-start justify-between gap-2 border-b border-border-theme pb-3">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                    Brand Portfolio
                  </p>
                  <h3 className="truncate text-base font-bold text-ink">
                    {inspectedBrand.name}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {inspectedBrand.country || 'Global'} • {brandProducts.length} active model(s)
                  </p>
                </div>
                <Badge variant="lavender">{inspectedBrand.slug}</Badge>
              </div>

              {inspectedBrand.description && (
                <p className="text-xs text-ink-muted leading-relaxed">
                  {inspectedBrand.description}
                </p>
              )}

              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {brandProducts.length === 0 ? (
                  <div className="rounded-[var(--theme-radius-inner)] border border-dashed border-border-theme p-6 text-center text-xs text-ink-muted">
                    No products assigned to {inspectedBrand.name} yet.
                  </div>
                ) : (
                  brandProducts.map((prod) => (
                    <div
                      key={prod.id}
                      className="flex items-center gap-3 rounded-[var(--theme-radius-inner)] border border-border-theme/70 bg-surface-muted/40 p-2.5"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--theme-radius-badge)] border border-border-theme bg-surface flex items-center justify-center">
                        {prod.image_url ? (
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] font-bold text-ink-muted">
                            {prod.sku.slice(0, 4)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-ink">{prod.name}</p>
                        <p className="text-[10.5px] text-ink-muted font-mono tabular-nums">
                          {prod.sku} • {Number(prod.branch_stock || 0)} {prod.unit_of_measure || 'PCS'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-extrabold text-ink tabular-nums">
                          {formatMoney(prod.sale_price)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-xs text-ink-muted">
              Select a brand row to inspect assigned models.
            </p>
          )}
        </aside>
      </section>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Brand'}</DialogTitle>
            <DialogDescription>
              Organize mobile hardware, warranty partners, and brand-wise POS filters.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="mt-2 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink">Brand Name *</label>
                <Input
                  value={name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setName(v);
                    if (!editing) {
                      setSlug(
                        v
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/(^-|-$)/g, '')
                      );
                    }
                  }}
                  placeholder="e.g., OPPO, Infinix, Soundcore"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink">Slug</label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="oppo"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink">Country Origin</label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g., USA, China, South Korea"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink">Official Website</label>
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://oppo.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Authorized warranty & product portfolio details..."
              />
            </div>

            <div className="flex items-center justify-between rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/60 px-3 py-2">
              <span className="text-xs font-semibold text-ink">Brand Active In POS Filters</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <DynamicButton type="submit" variant="obsidian" loading={saving}>
                {editing ? 'Update Brand' : 'Save Brand'}
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
