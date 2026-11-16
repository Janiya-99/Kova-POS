import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Truck,
  Plus,
  Search,
  Pencil,
  Trash2,
  ClipboardList,
  PackageCheck,
  Wallet,
  Mail,
  Phone,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useCurrency } from '@/hooks/useCurrency';
import { confirmDestructiveAction } from '@/lib/swal';
import { useAuthStore } from '@/store/authStore';
import { Can } from '@/features/auth/Can';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { SupplierFormSheet, type SupplierRecord } from './SupplierFormSheet';
import { toast } from 'sonner';

interface SuppliersResponse {
  suppliers: SupplierRecord[];
}

export function SuppliersPage() {
  const queryClient = useQueryClient();
  const { context } = useAuthStore();
  const { formatMoney } = useCurrency();
  const [search, setSearch] = React.useState('');
  const [apFilter, setApFilter] = React.useState<'ALL' | 'OPEN_AP' | 'NET30'>('ALL');
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editingSupplier, setEditingSupplier] = React.useState<SupplierRecord | null>(null);

  const { data, isLoading } = useQuery<SuppliersResponse>({
    queryKey: ['suppliers', context?.business_id],
    queryFn: () => apiFetch('/api/v1/suppliers'),
  });

  const suppliers = data?.suppliers ?? [];

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (apFilter === 'OPEN_AP' && Number.parseFloat(s.open_ap_balance || '0') <= 0) return false;
      if (apFilter === 'NET30' && Number(s.payment_terms_days || 0) < 30) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.tax_id.toLowerCase().includes(q)
      );
    });
  }, [suppliers, search, apFilter]);

  const { sortedItems, sortConfig, requestSort } = useSortableData(
    filtered,
    { key: 'name', dir: 'asc' },
    (s, key) => {
      if (key === 'docs') return Number(s.po_count || 0) + Number(s.grn_count || 0);
      if (key === 'open_ap_balance') return Number.parseFloat(s.open_ap_balance || '0') || 0;
      if (key === 'payment_terms_days') return Number(s.payment_terms_days || 0);
      return (s as Record<string, any>)[key] ?? '';
    }
  );

  const pagination = usePagination(sortedItems, 8);

  const metrics = React.useMemo(() => {
    let poCount = 0;
    let grnCount = 0;
    let openAp = 0;
    for (const s of suppliers) {
      poCount += Number(s.po_count || 0);
      grnCount += Number(s.grn_count || 0);
      openAp += Number.parseFloat(s.open_ap_balance || '0') || 0;
    }
    return { total: suppliers.length, poCount, grnCount, openAp };
  }, [suppliers]);

  const handleDelete = async (sup: SupplierRecord) => {
    const ok = await confirmDestructiveAction({
      title: `Remove Supplier "${sup.name}"?`,
      text: `Only unused vendors without Purchase Orders, GRNs, or Invoices can be removed.`,
      confirmLabel: 'Delete Supplier',
    });
    if (!ok) return;

    try {
      await apiFetch(`/api/v1/suppliers/${sup.id}`, { method: 'DELETE' });
      toast.success(`Supplier ${sup.name} removed`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ]);
    } catch (err: any) {
      toast.error(err.message || 'Unable to delete supplier');
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI Bento Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="zona-card flex items-center justify-between p-4">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Approved Vendors</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-ink">{metrics.total}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] bg-accent-soft text-accent">
            <Truck className="h-4 w-4" />
          </div>
        </div>

        <div className="zona-card flex items-center justify-between p-4">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Linked Purchase Orders</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-ink">{metrics.poCount}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] bg-surface-muted text-ink">
            <ClipboardList className="h-4 w-4" />
          </div>
        </div>

        <div className="zona-card flex items-center justify-between p-4">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">GRN Deliveries</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-ink">{metrics.grnCount}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] bg-emerald-500/12 text-emerald-600">
            <PackageCheck className="h-4 w-4" />
          </div>
        </div>

        <div className="zona-card flex items-center justify-between p-4">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Open Vendor Payable</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-ink">
              {formatMoney(metrics.openAp)}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] bg-amber-500/12 text-amber-600">
            <Wallet className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Suppliers Directory Table Card */}
      <section className="zona-card p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-bold text-ink">Suppliers &amp; Vendor Master</h2>
            <p className="text-[11px] text-ink-muted">
              Manage vendor accounts used across GRN stock receipts, Auto-PO replenishment, and Accounts Payable.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-0.5 text-[11px]">
              {(
                [
                  { id: 'ALL', label: 'All Vendors' },
                  { id: 'OPEN_AP', label: 'Open AP Balance' },
                  { id: 'NET30', label: 'Net 30d+' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setApFilter(f.id)}
                  className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                    apFilter === f.id
                      ? 'bg-accent text-accent-fg shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, vendor, VAT..."
                className="pl-8 h-9 text-xs"
              />
            </div>

            <Can permission="inventory:grn_create">
              <Button
                type="button"
                variant="lavender"
                size="sm"
                data-testid="add-supplier-btn"
                onClick={() => {
                  setEditingSupplier(null);
                  setSheetOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Supplier
              </Button>
            </Can>
          </div>
        </div>

        {isLoading && suppliers.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="code"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                  >
                    Code
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="name"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                  >
                    Supplier Name
                  </SortableTableHead>
                  <TableHead>Contact</TableHead>
                  <SortableTableHead
                    sortKey="tax_id"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                  >
                    Tax / VAT ID
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="payment_terms_days"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                  >
                    Terms
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="docs"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                    align="right"
                  >
                    PO / GRN
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="open_ap_balance"
                    activeSortKey={sortConfig?.key}
                    sortDir={sortConfig?.dir}
                    onSort={requestSort}
                    align="right"
                  >
                    Open AP
                  </SortableTableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pagedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-xs text-ink-muted">
                      No suppliers match your search. Click <strong>Add Supplier</strong> to register a vendor.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagination.pagedItems.map((sup) => (
                    <TableRow key={sup.id}>
                      <TableCell className="font-mono text-[11px] font-bold text-ink">
                        {sup.code}
                      </TableCell>
                      <TableCell className="font-semibold text-ink">{sup.name}</TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-[11px] text-ink-muted">
                          {sup.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[180px]">{sup.email}</span>
                            </div>
                          )}
                          {sup.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0" />
                              <span>{sup.phone}</span>
                            </div>
                          )}
                          {!sup.email && !sup.phone && <span>—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-ink-muted">
                        {sup.tax_id || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10.5px]">
                          Net {sup.payment_terms_days}d
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-[11.5px] tabular-nums text-ink-muted">
                        {sup.po_count ?? 0} PO / {sup.grn_count ?? 0} GRN
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-ink">
                        {formatMoney(sup.open_ap_balance || '0')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Can permission="inventory:grn_create">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="info"
                              size="xs"
                              data-testid={`edit-supplier-${sup.code}`}
                              onClick={() => {
                                setEditingSupplier(sup);
                                setSheetOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="xs"
                              data-testid={`delete-supplier-${sup.code}`}
                              onClick={() => handleDelete(sup)}
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </Button>
                          </div>
                        </Can>
                      </TableCell>
                    </TableRow>
                  ))
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
              itemLabel="suppliers"
              testIdPrefix="suppliers-pagination"
            />
          </div>
        )}
      </section>

      <SupplierFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        supplier={editingSupplier}
      />
    </div>
  );
}
