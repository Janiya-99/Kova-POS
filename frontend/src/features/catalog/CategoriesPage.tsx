import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderPlus, Pencil, Trash2, Search, Tags } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { toast } from 'sonner';

interface CategoryRecord {
  id: string;
  business_id: string;
  tax_group_id?: string | null;
  tax_group_name: string;
  name: string;
  slug: string;
  gender_segment: 'Men' | 'Women' | 'Unisex';
  product_count: number;
}

export function CategoriesPage() {
  const { context } = useAuthStore();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState('');
  const [segmentFilter, setSegmentFilter] = React.useState<'ALL' | 'Men' | 'Women' | 'Unisex'>('ALL');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CategoryRecord | null>(null);
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [segment, setSegment] = React.useState<'Men' | 'Women' | 'Unisex'>('Unisex');
  const [saving, setSaving] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['categories', context?.business_id],
    queryFn: () => apiFetch<{ categories: CategoryRecord[] }>('/api/v1/categories'),
    enabled: Boolean(context?.business_id),
  });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSlug('');
    setSegment('Unisex');
    setModalOpen(true);
  };

  const openEdit = (cat: CategoryRecord) => {
    setEditing(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setSegment(cat.gender_segment || 'Unisex');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Category name is required');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(editing ? `/api/v1/categories/${editing.id}` : '/api/v1/categories', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          gender_segment: segment,
        }),
      });
      toast.success(editing ? 'Category updated' : 'Category created');
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['categories', context?.business_id] });
      queryClient.invalidateQueries({
        queryKey: ['pos-bootstrap', context?.business_id, context?.branch_id],
      });
    } catch (err: any) {
      toast.error(err?.message || 'Unable to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: CategoryRecord) => {
    const ok = await confirmDestructiveAction({
      title: `Delete "${cat.name}"?`,
      text: 'Categories with active assigned products cannot be deleted until SKUs are reassigned.',
      confirmLabel: 'Yes, Delete Category',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/v1/categories/${cat.id}`, { method: 'DELETE' });
      toast.success(`Category "${cat.name}" deleted`);
      queryClient.invalidateQueries({ queryKey: ['categories', context?.business_id] });
      queryClient.invalidateQueries({
        queryKey: ['pos-bootstrap', context?.business_id, context?.branch_id],
      });
    } catch (err: any) {
      toast.error(err?.message || 'Unable to delete category');
    }
  };

  const categories = data?.categories || [];
  const filtered = React.useMemo(
    () =>
      categories.filter((c) => {
        if (segmentFilter !== 'ALL' && c.gender_segment !== segmentFilter) return false;
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
      }),
    [categories, segmentFilter, search]
  );
  const { sortedItems, sortConfig, requestSort } = useSortableData(filtered, {
    key: 'name',
    dir: 'asc',
  });
  const pagination = usePagination(sortedItems, 8);

  if (isLoading || !data) {
    return (
      <div className="zona-card p-5 space-y-3">
        <Skeleton className="h-9 w-72" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="zona-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative flex-1 min-w-[210px] max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search category name or slug..."
                className="pl-9"
              />
            </div>

            <div className="inline-flex rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-0.5 text-[11px]">
              {(['ALL', 'Men', 'Women', 'Unisex'] as const).map((seg) => (
                <button
                  key={seg}
                  type="button"
                  onClick={() => setSegmentFilter(seg)}
                  className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                    segmentFilter === seg
                      ? 'bg-accent text-accent-fg shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {seg === 'ALL' ? 'All Segments' : seg}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            variant="lavender"
            size="sm"
            onClick={openCreate}
            data-testid="add-category-btn"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Add Category
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                sortKey="name"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
              >
                Category
              </SortableTableHead>
              <SortableTableHead
                sortKey="slug"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
              >
                Slug
              </SortableTableHead>
              <SortableTableHead
                sortKey="gender_segment"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
              >
                Segment
              </SortableTableHead>
              <SortableTableHead
                sortKey="tax_group_name"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
              >
                Tax Group
              </SortableTableHead>
              <SortableTableHead
                sortKey="product_count"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
                align="right"
              >
                Active SKUs
              </SortableTableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pagedItems.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-[var(--theme-radius-badge)] bg-accent-soft/60 text-accent-soft-fg">
                      <Tags className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-semibold text-ink">{cat.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-ink-muted">{cat.slug}</TableCell>
                <TableCell>
                  <Badge variant="outline">{formatDisplayLabel(cat.gender_segment)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="lavender">{cat.tax_group_name || 'Default Tax'}</Badge>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {cat.product_count}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="info"
                      size="xs"
                      onClick={() => openEdit(cat)}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      onClick={() => handleDelete(cat)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {pagination.pagedItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-xs text-ink-muted">
                  No categories match your filter.
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
          itemLabel="categories"
          testIdPrefix="categories-pagination"
        />
      </section>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>
              Organize POS catalog navigation, tax rules, and Level-5 category overrides.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="mt-3 space-y-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">Category Name *</label>
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
                placeholder="e.g., Knitwear"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">Slug</label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="knitwear"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">Segment</label>
              <Select
                value={segment}
                onValueChange={(v) => setSegment(v as 'Men' | 'Women' | 'Unisex')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Unisex">Unisex</SelectItem>
                  <SelectItem value="Women">Women</SelectItem>
                  <SelectItem value="Men">Men</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <DynamicButton type="submit" variant="lavender" loading={saving}>
                {editing ? 'Update Category' : 'Save Category'}
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

