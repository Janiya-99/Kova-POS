import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PackagePlus,
  Layers,
  CheckCircle2,
  FileText,
  Package,
  Search,
  Edit3,
  Plus,
  History,
  Eye,
  Printer,
  Pencil,
  Warehouse,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SortableTableHead,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DataTablePagination,
  usePagination,
  useSortableData,
} from '@/components/ui/data-table-pagination';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import { InventorySkeleton } from '@/components/skeletons/InventorySkeleton';
import { CreateGRNDrawer, type EditableGRNDetail } from './CreateGRNDrawer';
import { ProductManagementDrawer } from './ProductManagementDrawer';
import { Can } from '@/features/auth/Can';
import { apiFetch } from '@/lib/api';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { useAuthStore } from '@/store/authStore';
import { useCurrency } from '@/hooks/useCurrency';
import { confirmAction } from '@/lib/swal';
import { toast } from 'sonner';
import type { LocalProduct } from '@/lib/dexie-db';
import type { POSBootstrapResponse } from '../pos/types';

interface InventoryBatchDTO {
  id: string;
  sku: string;
  product_name: string;
  batch_number: string;
  received_at: string;
  expiry_date?: string | null;
  unit_cost: string | number;
  initial_qty: string | number;
  remaining_qty: string | number;
}

interface GRNRecordDTO {
  id: string;
  branch_name: string;
  supplier_name: string;
  grn_number: string;
  supplier_invoice_no: string;
  attachment_name: string;
  status: string;
  total_cost: string | number;
  created_at: string;
}

interface ApprovalLogDTO {
  id: string;
  document_type: string;
  document_id: string;
  action: string;
  actor_name: string;
  notes: string;
  created_at: string;
}

interface InventoryResponse {
  batches: InventoryBatchDTO[];
  grns: GRNRecordDTO[];
  suppliers: Array<{ id: string; code: string; name: string }>;
  approval_logs?: ApprovalLogDTO[];
}

interface GRNVoucherDetail {
  grn: {
    id: string;
    business_id: string;
    branch_id: string;
    branch_name: string;
    branch_code: string;
    supplier_id: string;
    supplier_code: string;
    supplier_name: string;
    supplier_email: string;
    supplier_phone: string;
    supplier_tax_id: string;
    grn_number: string;
    supplier_invoice_no: string;
    attachment_name: string;
    status: string;
    total_cost: string | number;
    received_by_name?: string;
    approved_by_name?: string;
    approved_at?: string | { Time?: string; Valid?: boolean } | null;
    created_at?: string | { Time?: string; Valid?: boolean } | null;
  };
  items: Array<{
    id: string;
    product_id: string;
    sku: string;
    product_name: string;
    batch_number: string;
    expiry_date?: string | { Time?: string; Valid?: boolean } | null;
    ordered_qty: string | number;
    qty_received: string | number;
    unit_cost: string | number;
    line_total: string | number;
  }>;
}

function formatPgDate(raw: unknown): string {
  if (!raw) return '—';
  const iso =
    typeof raw === 'string'
      ? raw
      : typeof raw === 'object' && (raw as { Valid?: boolean; Time?: string }).Valid
      ? (raw as { Time?: string }).Time || ''
      : '';
  if (!iso || iso.startsWith('0001-01-01')) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function printGRNVoucherHtml(
  detail: GRNVoucherDetail,
  formatMoneyFn: (v: string | number) => string,
  businessName: string,
  taxRegNo?: string
) {
  const { grn, items } = detail;
  const rowsHtml = items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;">
          <strong>${it.product_name}</strong><br/>
          <span style="color:#6b7280;font-size:11px;">${it.sku}</span>
        </td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;font-family:monospace;">${it.batch_number}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;">${formatPgDate(it.expiry_date)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(it.ordered_qty)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;">${Number(it.qty_received)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoneyFn(it.unit_cost)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;">${formatMoneyFn(it.line_total)}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html><html><head><title>GRN Voucher ${grn.grn_number}</title>
    <style>
      body{font-family:system-ui,-apple-system,sans-serif;color:#111827;margin:28px;font-size:12px;}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111827;padding-bottom:12px;margin-bottom:16px;}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;background:#f9fafb;padding:12px;border-radius:8px;border:1px solid #e5e7eb;}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;}
      th{background:#f3f4f6;text-align:left;padding:8px 6px;font-size:11px;text-transform:uppercase;border-bottom:1px solid #d1d5db;}
      .tot{text-align:right;font-size:16px;font-weight:700;padding-top:8px;border-top:2px solid #111827;}
    </style></head><body>
    <div class="hdr">
      <div>
        <h1 style="margin:0;font-size:20px;">${businessName}</h1>
        ${taxRegNo ? `<div style="color:#4b5563;margin-top:2px;">Tax Reg: ${taxRegNo}</div>` : ''}
        <div style="color:#4b5563;margin-top:2px;">Goods Received Note (FIFO Intake Voucher)</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:18px;font-weight:700;">${grn.grn_number}</div>
        <div>Status: <strong>${grn.status}</strong></div>
        <div>Invoice: ${grn.supplier_invoice_no || '—'}</div>
      </div>
    </div>
    <div class="meta">
      <div>
        <div style="font-weight:700;margin-bottom:4px;">Supplier</div>
        <div>${grn.supplier_name} (${grn.supplier_code})</div>
        <div>${grn.supplier_email || ''} ${grn.supplier_phone ? '• ' + grn.supplier_phone : ''}</div>
        ${grn.supplier_tax_id ? `<div>Supplier Tax ID: ${grn.supplier_tax_id}</div>` : ''}
      </div>
      <div>
        <div style="font-weight:700;margin-bottom:4px;">Warehouse / Audit</div>
        <div>Branch: ${grn.branch_name} (${grn.branch_code})</div>
        <div>Created: ${formatPgDate(grn.created_at)} • By: ${grn.received_by_name || 'Staff'}</div>
        ${grn.approved_by_name ? `<div>Approved By: ${grn.approved_by_name} (${formatPgDate(grn.approved_at)})</div>` : ''}
      </div>
    </div>
    <table>
      <thead><tr>
        <th>Product / SKU</th><th>Batch #</th><th>Expiry</th>
        <th style="text-align:right;">Ordered</th><th style="text-align:right;">Received</th>
        <th style="text-align:right;">Unit Cost</th><th style="text-align:right;">Line Total</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="tot">Total Received Cost: ${formatMoneyFn(grn.total_cost)}</div>
    </body></html>`;

  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    frame.contentWindow?.focus();
    setTimeout(() => {
      try {
        frame.contentWindow?.print();
      } finally {
        setTimeout(() => frame.remove(), 1000);
      }
    }, 150);
  } else {
    frame.remove();
  }
}

export function InventoryPage() {
  const queryClient = useQueryClient();
  const { context, branches, warehouses, activeWarehouseId } = useAuthStore();
  const { formatMoney } = useCurrency();
  const [grnOpen, setGrnOpen] = React.useState(false);
  const [editGrnData, setEditGrnData] = React.useState<EditableGRNDetail | null>(null);
  const [voucherDetail, setVoucherDetail] = React.useState<GRNVoucherDetail | null>(null);
  const [voucherOpen, setVoucherOpen] = React.useState(false);
  const [loadingGrnId, setLoadingGrnId] = React.useState<string | null>(null);
  const [productDrawerOpen, setProductDrawerOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<LocalProduct | null>(null);
  const [catalogSearch, setCatalogSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('ALL');
  const [selectedBrand, setSelectedBrand] = React.useState('ALL');
  const [stockFilter, setStockFilter] = React.useState<'ALL' | 'LOW' | 'OUT'>('ALL');
  const [batchFilter, setBatchFilter] = React.useState<'ALL' | 'IN_STOCK' | 'LOW' | 'DEPLETED'>('ALL');
  const [grnStatusFilter, setGrnStatusFilter] = React.useState<'ALL' | 'DRAFT' | 'APPROVED'>('ALL');

  const activeWarehouse = React.useMemo(
    () =>
      warehouses.find((w) => w.id === activeWarehouseId) ||
      warehouses.find((w) => w.branch_id === context?.branch_id),
    [warehouses, activeWarehouseId, context?.branch_id]
  );
  const activeBranchName =
    branches.find((b) => b.id === context?.branch_id)?.name || 'Active Branch';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory', context?.business_id, context?.branch_id],
    queryFn: () => apiFetch<InventoryResponse>('/api/v1/inventory'),
  });

  const { data: bootstrap, refetch: refetchBootstrap } = useQuery({
    queryKey: ['pos-bootstrap', context?.business_id, context?.branch_id],
    queryFn: () => apiFetch<POSBootstrapResponse>('/api/v1/pos/bootstrap'),
  });

  const requireGrnApproval = React.useMemo(() => {
    const match = bootstrap?.resolved_settings?.find(
      (s) => s.key === 'warehouse.grn.require_approval'
    );
    if (!match) return false;
    try {
      return Boolean(JSON.parse(match.effective_json));
    } catch {
      return match.effective_json === 'true';
    }
  }, [bootstrap]);

  const defaultAllowNegativeStock = React.useMemo(() => {
    const match = bootstrap?.resolved_settings?.find(
      (s) => s.key === 'pos.allow_negative_fifo_stock'
    );
    if (!match) return false;
    try {
      return Boolean(JSON.parse(match.effective_json));
    } catch {
      return match.effective_json === 'true';
    }
  }, [bootstrap]);

  const products = bootstrap?.products || [];
  const categories = bootstrap?.categories || [];
  const brands = bootstrap?.brands || [];

  const filteredProducts = React.useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'ALL' && p.category_id !== selectedCategory) return false;
      if (selectedBrand !== 'ALL' && (p.brand_id || '') !== selectedBrand) return false;
      const qty = Number(p.branch_stock || 0);
      if (stockFilter === 'LOW' && (qty <= 0 || qty > Number(p.reorder_point || 10))) return false;
      if (stockFilter === 'OUT' && qty > 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.brand_name || '').toLowerCase().includes(q) ||
        (p.primary_barcode || '').toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, selectedBrand, stockFilter, catalogSearch]);

  const filteredBatches = React.useMemo(() => {
    const list = data?.batches || [];
    const q = catalogSearch.trim().toLowerCase();
    return list.filter((b) => {
      const rem = Number(b.remaining_qty || 0);
      if (batchFilter === 'IN_STOCK' && rem <= 0) return false;
      if (batchFilter === 'LOW' && (rem <= 0 || rem > 10)) return false;
      if (batchFilter === 'DEPLETED' && rem > 0) return false;
      if (!q) return true;
      return (
        b.product_name.toLowerCase().includes(q) ||
        b.sku.toLowerCase().includes(q) ||
        b.batch_number.toLowerCase().includes(q)
      );
    });
  }, [data?.batches, batchFilter, catalogSearch]);

  const filteredGRNs = React.useMemo(() => {
    const list = data?.grns || [];
    const q = catalogSearch.trim().toLowerCase();
    return list.filter((g) => {
      if (grnStatusFilter !== 'ALL' && g.status !== grnStatusFilter) return false;
      if (!q) return true;
      return (
        g.grn_number.toLowerCase().includes(q) ||
        g.supplier_name.toLowerCase().includes(q) ||
        g.branch_name.toLowerCase().includes(q) ||
        g.supplier_invoice_no.toLowerCase().includes(q)
      );
    });
  }, [data?.grns, grnStatusFilter, catalogSearch]);

  const catalogSort = useSortableData(
    filteredProducts,
    { key: 'name', dir: 'asc' },
    (p, key) => {
      if (key === 'branch_stock') return Number(p.branch_stock || 0);
      if (key === 'base_price') return Number(p.base_price || 0);
      if (key === 'sale_price') return Number(p.sale_price || 0);
      if (key === 'category_name') return p.category_name || '';
      return (p as Record<string, any>)[key];
    }
  );

  const batchSort = useSortableData(
    filteredBatches,
    { key: 'received_at', dir: 'desc' },
    (b, key) => {
      if (key === 'unit_cost') return Number(b.unit_cost || 0);
      if (key === 'initial_qty') return Number(b.initial_qty || 0);
      if (key === 'remaining_qty') return Number(b.remaining_qty || 0);
      return (b as Record<string, any>)[key];
    }
  );

  const grnSort = useSortableData(
    filteredGRNs,
    { key: 'grn_number', dir: 'desc' },
    (g, key) => {
      if (key === 'total_cost') return Number(g.total_cost || 0);
      return (g as Record<string, any>)[key];
    }
  );

  const catalogPagination = usePagination(catalogSort.sortedItems, 12);
  const batchPagination = usePagination(batchSort.sortedItems, 10);
  const grnPagination = usePagination(grnSort.sortedItems, 10);

  if (isLoading || !data) {
    return <InventorySkeleton />;
  }

  const totalRemainingUnits = data.batches.reduce(
    (sum, b) => sum + Number(b.remaining_qty || 0),
    0
  );
  const totalValuation = data.batches.reduce(
    (sum, b) => sum + Number(b.remaining_qty || 0) * Number(b.unit_cost || 0),
    0
  );
  const draftCount = data.grns.filter((g) => g.status === 'DRAFT').length;
  const approvalLogs = data.approval_logs || [];

  const handleViewGRN = async (grnId: string, triggerPrint = false) => {
    setLoadingGrnId(grnId);
    try {
      const detail = await apiFetch<GRNVoucherDetail>(`/api/v1/inventory/grns/${grnId}`);
      setVoucherDetail(detail);
      setVoucherOpen(true);
      if (triggerPrint) {
        printGRNVoucherHtml(
          detail,
          formatMoney,
          context?.trade_name || context?.business_name || 'Retail Store',
          context?.tax_registration_no
        );
      }
    } catch (err: any) {
      toast.error(err.message || 'Unable to load GRN voucher details');
    } finally {
      setLoadingGrnId(null);
    }
  };

  const handleEditDraftGRN = async (grnId: string) => {
    setLoadingGrnId(grnId);
    try {
      const detail = await apiFetch<GRNVoucherDetail>(`/api/v1/inventory/grns/${grnId}`);
      setEditGrnData(detail);
      setVoucherOpen(false);
      setGrnOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Unable to load Draft GRN for editing');
    } finally {
      setLoadingGrnId(null);
    }
  };

  const handleApproveGRN = async (grn: GRNRecordDTO) => {
    const ok = await confirmAction({
      title: 'Commit GRN to Ledger?',
      text: `This will create active FIFO batches and post to Accounts Payable (${formatMoney(grn.total_cost)}).`,
      cancelLabel: 'Review Again',
      confirmLabel: 'Approve & Post GRN',
    });
    if (!ok) return;

    try {
      await apiFetch(`/api/v1/inventory/grns/${grn.id}/approve`, { method: 'POST' });
      toast.success(`GRN ${grn.grn_number} approved`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      queryClient.invalidateQueries({ queryKey: ['pos-bootstrap'] });
    } catch (err: any) {
      toast.error(err.message || 'Approval failed');
    }
  };

  return (
    <>
      <div className="space-y-5">
        {/* Symmetrical 4-Card Metric Summary Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="zona-card flex flex-col justify-between p-5">
            <span className="text-[11px] font-semibold text-ink-muted uppercase">
              Active FIFO Layers
            </span>
            <p className="mt-1.5 text-[20px] sm:text-[22px] font-bold text-ink tabular-nums">
              {data.batches.length}
            </p>
            <span className="mt-1.5 text-[11px] text-accent font-semibold">
              Ordered received_at ASC
            </span>
          </div>

          <div className="zona-card flex flex-col justify-between p-5">
            <span className="text-[11px] font-semibold text-ink-muted uppercase">
              Remaining Stock Units
            </span>
            <p className="mt-1.5 text-[20px] sm:text-[22px] font-bold text-ink tabular-nums">
              {totalRemainingUnits.toLocaleString()}
            </p>
            <span className="mt-1.5 text-[11px] text-ink-muted">Across {products.length} active SKUs</span>
          </div>

          <div className="rounded-[var(--theme-radius-card)] border border-border-theme bg-contrast flex flex-col justify-between p-5 text-contrast-fg shadow-[var(--theme-shadow)]">
            <span className="text-[11px] font-semibold text-accent uppercase">
              FIFO Asset Valuation
            </span>
            <p className="mt-1.5 text-[20px] sm:text-[22px] font-bold tabular-nums">
              {formatMoney(totalValuation)}
            </p>
            <span className="mt-1.5 text-[11px] opacity-75">Exact layer cost basis</span>
          </div>

          <div className="rounded-[var(--theme-radius-card)] border border-border-theme bg-sand flex flex-col justify-between p-5 text-ink shadow-[var(--theme-shadow)]">
            <span className="text-[11px] font-semibold text-ink-muted uppercase">
              GRN Pipeline
            </span>
            <p className="mt-1.5 text-[20px] sm:text-[22px] font-bold tabular-nums">
              {data.grns.length}
            </p>
            <span className="mt-1.5 text-[11px] font-semibold text-accent">
              {draftCount} pending approval
            </span>
          </div>
        </div>

        {/* Main Inventory, Product Catalog & GRN Workspace */}
        <section className="zona-card p-5 sm:p-6">
          <Tabs defaultValue="catalog">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="catalog">
                  <Package className="mr-1.5 h-3.5 w-3.5" />
                  Products Catalog ({products.length})
                </TabsTrigger>
                <TabsTrigger value="batches">
                  <Layers className="mr-1.5 h-3.5 w-3.5" />
                  FIFO Batches
                </TabsTrigger>
                <TabsTrigger value="grns">
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  <span>GRN &amp; Approvals ({data.grns.length})</span>
                  {draftCount > 0 && (
                    <Badge variant="accent" className="ml-1.5 px-1.5 py-0 text-[9.5px]">
                      {draftCount} Draft
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap items-center gap-2">
                {activeWarehouse && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border-theme bg-surface-muted/80 px-3 py-1 text-[11px] font-semibold text-ink">
                    <Warehouse className="h-3.5 w-3.5 text-accent" />
                    {activeBranchName} • {activeWarehouse.name}
                  </span>
                )}
                <Can permission="catalog:manage">
                  <DynamicButton
                    variant="lavender"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setEditingProduct(null);
                      setProductDrawerOpen(true);
                    }}
                    data-testid="new-product-btn"
                  >
                    New Product
                  </DynamicButton>
                </Can>

                <Can permission="inventory:grn_create">
                  <DynamicButton
                    variant="obsidian"
                    icon={<PackagePlus className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setEditGrnData(null);
                      setGrnOpen(true);
                    }}
                    data-testid="new-grn-btn"
                  >
                    New GRN Shipment
                  </DynamicButton>
                </Can>
              </div>
            </div>

            {/* TAB 1: UIUX Reference Clean Filter-Split Catalog Workbench */}
            <TabsContent value="catalog">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
                {/* Left Fixed Filter Sidebar Card */}
                <aside
                  data-testid="inventory-filter-aside"
                  className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/75 p-4 space-y-4 lg:col-span-3 lg:sticky lg:top-4 self-start max-h-[calc(100vh-140px)] overflow-y-auto"
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">
                      Search SKU / Barcode
                    </p>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                      <Input
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        placeholder="Filter catalog..."
                        className="h-9 min-h-[36px] pl-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                      Stock Health
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'ALL', label: 'All' },
                          { id: 'LOW', label: 'Low' },
                          { id: 'OUT', label: 'Empty' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setStockFilter(opt.id)}
                          className={`rounded-full py-1.5 text-[11px] font-semibold transition cursor-pointer ${
                            stockFilter === opt.id
                              ? 'bg-contrast text-contrast-fg'
                              : 'bg-surface text-ink-muted hover:text-ink'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                      Category Filter
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('ALL')}
                      className={`flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-xs font-semibold transition cursor-pointer ${
                        selectedCategory === 'ALL'
                          ? 'bg-accent text-accent-fg'
                          : 'text-ink hover:bg-surface'
                      }`}
                    >
                      <span>All Categories</span>
                      <span className="tabular-nums opacity-80">{products.length}</span>
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-xs font-medium transition cursor-pointer ${
                          selectedCategory === cat.id
                            ? 'bg-accent text-accent-fg font-semibold'
                            : 'text-ink hover:bg-surface'
                        }`}
                      >
                        <span className="truncate">{cat.name}</span>
                        <span className="tabular-nums opacity-75">
                          {products.filter((p) => p.category_id === cat.id).length}
                        </span>
                      </button>
                    ))}
                  </div>

                  {brands.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-border-theme/70">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                        Brand Filter
                      </p>
                      <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                        <SelectTrigger className="h-8 text-xs">
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
                    </div>
                  )}
                </aside>

                {/* Right Clean Product Rows & Edit Actions */}
                <div className="lg:col-span-9 space-y-3 min-w-0">
                  <div className="hidden md:block">
                    <Table
                      data-testid="inventory-catalog-table"
                      containerClassName="max-h-[calc(100vh-310px)] overflow-y-auto"
                    >
                      <TableHeader>
                        <TableRow>
                          <SortableTableHead
                            sortKey="name"
                            activeSortKey={catalogSort.sortConfig?.key}
                            sortDir={catalogSort.sortConfig?.dir}
                            onSort={catalogSort.requestSort}
                          >
                            Product
                          </SortableTableHead>
                          <SortableTableHead
                            sortKey="category_name"
                            activeSortKey={catalogSort.sortConfig?.key}
                            sortDir={catalogSort.sortConfig?.dir}
                            onSort={catalogSort.requestSort}
                          >
                            Category
                          </SortableTableHead>
                          <SortableTableHead
                            sortKey="branch_stock"
                            activeSortKey={catalogSort.sortConfig?.key}
                            sortDir={catalogSort.sortConfig?.dir}
                            onSort={catalogSort.requestSort}
                            align="right"
                          >
                            In Stock
                          </SortableTableHead>
                          <SortableTableHead
                            sortKey="base_price"
                            activeSortKey={catalogSort.sortConfig?.key}
                            sortDir={catalogSort.sortConfig?.dir}
                            onSort={catalogSort.requestSort}
                            align="right"
                          >
                            Cost / Ref
                          </SortableTableHead>
                          <SortableTableHead
                            sortKey="sale_price"
                            activeSortKey={catalogSort.sortConfig?.key}
                            sortDir={catalogSort.sortConfig?.dir}
                            onSort={catalogSort.requestSort}
                            align="right"
                          >
                            Selling Price
                          </SortableTableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {catalogPagination.pagedItems.map((p) => {
                          const qty = Number(p.branch_stock || 0);
                          const reorder = Number(p.reorder_point || 10);
                          return (
                            <TableRow key={p.id}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[var(--theme-radius-badge)] border border-border-theme bg-surface-muted flex items-center justify-center text-[11px] font-bold text-ink-muted">
                                    {p.image_url ? (
                                      <img
                                        src={p.image_url}
                                        alt={p.name}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      p.sku.slice(0, 2)
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-ink">{p.name}</p>
                                    <p className="text-[11px] text-ink-muted font-mono tabular-nums">
                                      {p.sku}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1">
                                  {p.brand_name && (
                                    <Badge variant="lavender">{p.brand_name}</Badge>
                                  )}
                                  <Badge variant="outline">{p.category_name}</Badge>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={
                                    qty <= 0 ? 'negative' : qty <= reorder ? 'lavender' : 'positive'
                                  }
                                >
                                  {qty} {p.unit_of_measure || 'PCS'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-ink-muted tabular-nums">
                                {formatMoney(p.base_price)}
                              </TableCell>
                              <TableCell className="text-right font-bold text-ink tabular-nums">
                                {formatMoney(p.sale_price)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Can permission="catalog:manage">
                                  <Button
                                    type="button"
                                    variant="info"
                                    size="xs"
                                    onClick={() => {
                                      setEditingProduct(p);
                                      setProductDrawerOpen(true);
                                    }}
                                  >
                                    <Edit3 className="h-3 w-3" />
                                    Edit
                                  </Button>
                                </Can>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Catalog Cards */}
                  <div className="grid grid-cols-1 gap-2.5 md:hidden">
                    {catalogPagination.pagedItems.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-3 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-3.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-ink">{p.name}</p>
                          <p className="text-[11px] text-ink-muted tabular-nums">
                            {p.sku} • {Number(p.branch_stock || 0)} left
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-ink tabular-nums">
                            {formatMoney(p.sale_price)}
                          </span>
                          <Can permission="catalog:manage">
                            <Button
                              type="button"
                              variant="info"
                              size="xs"
                              onClick={() => {
                                setEditingProduct(p);
                                setProductDrawerOpen(true);
                              }}
                            >
                              <Edit3 className="h-3 w-3" />
                              Edit
                            </Button>
                          </Can>
                        </div>
                      </div>
                    ))}
                  </div>

                  <DataTablePagination
                    page={catalogPagination.page}
                    pageSize={catalogPagination.pageSize}
                    totalItems={catalogPagination.totalItems}
                    totalPages={catalogPagination.totalPages}
                    onPageChange={catalogPagination.setPage}
                    onPageSizeChange={catalogPagination.setPageSize}
                    itemLabel="products"
                    testIdPrefix="inv-catalog-pagination"
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: FIFO Batches */}
            <TabsContent value="batches" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'ALL', label: 'All Batches' },
                      { id: 'IN_STOCK', label: 'Available Stock' },
                      { id: 'LOW', label: 'Low Layer (<= 10)' },
                      { id: 'DEPLETED', label: 'Depleted' },
                    ] as const
                  ).map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setBatchFilter(pill.id)}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                        batchFilter === pill.id
                          ? 'bg-accent text-accent-fg shadow-xs'
                          : 'bg-surface-muted/80 text-ink-muted hover:text-ink border border-border-theme'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-ink-muted tabular-nums">
                  Showing {filteredBatches.length} FIFO layers
                </span>
              </div>

              <div className="hidden md:block">
                <Table containerClassName="max-h-[calc(100vh-330px)] overflow-y-auto">
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        sortKey="product_name"
                        activeSortKey={batchSort.sortConfig?.key}
                        sortDir={batchSort.sortConfig?.dir}
                        onSort={batchSort.requestSort}
                      >
                        SKU &amp; Product
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="batch_number"
                        activeSortKey={batchSort.sortConfig?.key}
                        sortDir={batchSort.sortConfig?.dir}
                        onSort={batchSort.requestSort}
                      >
                        Batch #
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="received_at"
                        activeSortKey={batchSort.sortConfig?.key}
                        sortDir={batchSort.sortConfig?.dir}
                        onSort={batchSort.requestSort}
                      >
                        Received
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="unit_cost"
                        activeSortKey={batchSort.sortConfig?.key}
                        sortDir={batchSort.sortConfig?.dir}
                        onSort={batchSort.requestSort}
                      >
                        Unit Cost
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="initial_qty"
                        activeSortKey={batchSort.sortConfig?.key}
                        sortDir={batchSort.sortConfig?.dir}
                        onSort={batchSort.requestSort}
                        align="right"
                      >
                        Initial
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="remaining_qty"
                        activeSortKey={batchSort.sortConfig?.key}
                        sortDir={batchSort.sortConfig?.dir}
                        onSort={batchSort.requestSort}
                        align="right"
                      >
                        Remaining
                      </SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchPagination.pagedItems.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <p className="font-semibold text-ink">{b.product_name}</p>
                          <p className="text-[11px] text-ink-muted tabular-nums">{b.sku}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="tabular-nums font-mono">
                            {b.batch_number}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11.5px] text-ink-muted tabular-nums">
                          {new Date(b.received_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums">
                          {formatMoney(b.unit_cost)}
                        </TableCell>
                        <TableCell className="text-right text-ink-muted tabular-nums">
                          {Number(b.initial_qty)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={Number(b.remaining_qty) <= 10 ? 'negative' : 'positive'}
                            className="tabular-nums"
                          >
                            {Number(b.remaining_qty)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 gap-3 md:hidden">
                {batchPagination.pagedItems.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-ink">{b.product_name}</p>
                        <p className="text-[11px] text-ink-muted tabular-nums">
                          {b.sku} • {b.batch_number}
                        </p>
                      </div>
                      <Badge variant={Number(b.remaining_qty) <= 10 ? 'negative' : 'positive'}>
                        {Number(b.remaining_qty)} / {Number(b.initial_qty)}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-[11px] text-ink-muted">
                      <span>Cost: {formatMoney(b.unit_cost)}</span>
                      <span>{new Date(b.received_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>

              <DataTablePagination
                page={batchPagination.page}
                pageSize={batchPagination.pageSize}
                totalItems={batchPagination.totalItems}
                totalPages={batchPagination.totalPages}
                onPageChange={batchPagination.setPage}
                onPageSizeChange={batchPagination.setPageSize}
                itemLabel="batches"
                testIdPrefix="inv-batches-pagination"
              />
            </TabsContent>

            {/* TAB 3: GRN History & Approval Logs */}
            <TabsContent value="grns" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'ALL', label: `All GRNs (${data.grns.length})` },
                      { id: 'DRAFT', label: `Pending Approval (${draftCount})` },
                      {
                        id: 'APPROVED',
                        label: `Approved (${data.grns.length - draftCount})`,
                      },
                    ] as const
                  ).map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setGrnStatusFilter(pill.id)}
                      data-testid={`grn-filter-${pill.id.toLowerCase()}`}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                        grnStatusFilter === pill.id
                          ? 'bg-accent text-accent-fg shadow-xs'
                          : 'bg-surface-muted/80 text-ink-muted hover:text-ink border border-border-theme'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-ink-muted">
                  View voucher details, print GRN slips, edit DRAFT receipts, or Approve &amp; Post into FIFO + GL.
                </span>
              </div>

              <div className="hidden md:block">
                <Table
                  data-testid="inventory-grns-table"
                  containerClassName="max-h-[calc(100vh-340px)] overflow-y-auto"
                >
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        sortKey="grn_number"
                        activeSortKey={grnSort.sortConfig?.key}
                        sortDir={grnSort.sortConfig?.dir}
                        onSort={grnSort.requestSort}
                      >
                        GRN #
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="supplier_name"
                        activeSortKey={grnSort.sortConfig?.key}
                        sortDir={grnSort.sortConfig?.dir}
                        onSort={grnSort.requestSort}
                      >
                        Supplier
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="branch_name"
                        activeSortKey={grnSort.sortConfig?.key}
                        sortDir={grnSort.sortConfig?.dir}
                        onSort={grnSort.requestSort}
                      >
                        Branch
                      </SortableTableHead>
                      <TableHead>Invoice / File</TableHead>
                      <SortableTableHead
                        sortKey="status"
                        activeSortKey={grnSort.sortConfig?.key}
                        sortDir={grnSort.sortConfig?.dir}
                        onSort={grnSort.requestSort}
                      >
                        Status
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="total_cost"
                        activeSortKey={grnSort.sortConfig?.key}
                        sortDir={grnSort.sortConfig?.dir}
                        onSort={grnSort.requestSort}
                        align="right"
                      >
                        Total Cost
                      </SortableTableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grnPagination.pagedItems.map((g) => (
                      <TableRow key={g.id} data-testid={`grn-row-${g.grn_number}`}>
                        <TableCell className="font-bold tabular-nums">{g.grn_number}</TableCell>
                        <TableCell>{g.supplier_name}</TableCell>
                        <TableCell className="text-[11.5px] text-ink-muted">
                          {g.branch_name}
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-semibold text-ink">{g.supplier_invoice_no}</p>
                          <p className="text-[11px] text-ink-muted">{g.attachment_name}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={g.status === 'APPROVED' ? 'positive' : 'lavender'}>
                            {formatDisplayLabel(g.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {formatMoney(g.total_cost)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="info"
                              size="xs"
                              disabled={loadingGrnId === g.id}
                              onClick={() => void handleViewGRN(g.id, false)}
                              data-testid={`view-grn-${g.grn_number}`}
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              disabled={loadingGrnId === g.id}
                              onClick={() => void handleViewGRN(g.id, true)}
                              data-testid={`print-grn-${g.grn_number}`}
                            >
                              <Printer className="h-3 w-3" />
                              Print
                            </Button>

                            {g.status === 'DRAFT' && (
                              <Can permission="inventory:grn_create">
                                <Button
                                  type="button"
                                  variant="lavender"
                                  size="xs"
                                  disabled={loadingGrnId === g.id}
                                  onClick={() => void handleEditDraftGRN(g.id)}
                                  data-testid={`edit-grn-${g.grn_number}`}
                                >
                                  <Pencil className="h-3 w-3" />
                                  Edit
                                </Button>
                              </Can>
                            )}

                            {g.status === 'DRAFT' ? (
                              <Can permission="inventory:grn_approve">
                                <Button
                                  type="button"
                                  variant="success"
                                  size="xs"
                                  onClick={() => handleApproveGRN(g)}
                                  data-testid={`approve-grn-${g.grn_number}`}
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Approve &amp; Post
                                </Button>
                              </Can>
                            ) : (
                              <Badge variant="positive" className="px-2 py-0.5 text-[10px]">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Posted
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {grnPagination.pagedItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-xs text-ink-muted">
                          No GRN shipments match the current status or search filter.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 gap-3 md:hidden">
                {grnPagination.pagedItems.map((g) => (
                  <div
                    key={g.id}
                    className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-4 space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-ink">{g.grn_number}</p>
                        <p className="text-[11px] text-ink-muted">
                          {g.supplier_name} • {g.branch_name}
                        </p>
                      </div>
                      <Badge variant={g.status === 'APPROVED' ? 'positive' : 'lavender'}>
                        {formatDisplayLabel(g.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-bold tabular-nums">
                        {formatMoney(g.total_cost)}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          variant="info"
                          size="xs"
                          onClick={() => void handleViewGRN(g.id, false)}
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => void handleViewGRN(g.id, true)}
                        >
                          <Printer className="h-3 w-3" />
                          Print
                        </Button>
                        {g.status === 'DRAFT' && (
                          <Can permission="inventory:grn_create">
                            <Button
                              type="button"
                              variant="lavender"
                              size="xs"
                              onClick={() => void handleEditDraftGRN(g.id)}
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </Button>
                          </Can>
                        )}
                        {g.status === 'DRAFT' && (
                          <Can permission="inventory:grn_approve">
                            <Button
                              type="button"
                              variant="success"
                              size="xs"
                              onClick={() => handleApproveGRN(g)}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Approve &amp; Post
                            </Button>
                          </Can>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <DataTablePagination
                page={grnPagination.page}
                pageSize={grnPagination.pageSize}
                totalItems={grnPagination.totalItems}
                totalPages={grnPagination.totalPages}
                onPageChange={grnPagination.setPage}
                onPageSizeChange={grnPagination.setPageSize}
                itemLabel="GRNs"
                testIdPrefix="inv-grns-pagination"
              />

              {approvalLogs.length > 0 && (
                <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/70 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink">
                    <History className="h-3.5 w-3.5 text-accent" />
                    <span>Warehouse Approval Audit Trail</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {approvalLogs.slice(0, 6).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-control)] bg-surface px-3.5 py-2.5 border border-border-theme"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-ink">
                            {log.document_type} • {log.action}
                          </p>
                          <p className="truncate text-[10.5px] text-ink-muted">
                            {log.actor_name} — {log.notes || 'Workflow state transition'}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] text-ink-muted tabular-nums">
                          {new Date(log.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <CreateGRNDrawer
        open={grnOpen}
        onOpenChange={(nextOpen) => {
          setGrnOpen(nextOpen);
          if (!nextOpen) setEditGrnData(null);
        }}
        suppliers={data.suppliers}
        products={products}
        requireGrnApproval={requireGrnApproval}
        editGrn={editGrnData}
        onCreated={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['accounting'] });
          queryClient.invalidateQueries({ queryKey: ['pos-bootstrap'] });
        }}
      />

      <Dialog open={voucherOpen} onOpenChange={setVoucherOpen}>
        <DialogContent
          data-testid="grn-voucher-dialog"
          className="w-[calc(100vw-2rem)] max-w-[820px] max-h-[88vh] flex flex-col p-0 overflow-hidden"
        >
          {voucherDetail && (
            <>
              <div className="border-b border-border-theme px-6 py-4 pr-14">
                <DialogHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="tabular-nums">
                      GRN Voucher — {voucherDetail.grn.grn_number}
                    </DialogTitle>
                    <Badge
                      variant={
                        voucherDetail.grn.status === 'APPROVED' ? 'positive' : 'lavender'
                      }
                    >
                      {voucherDetail.grn.status}
                    </Badge>
                  </div>
                  <DialogDescription>
                    Goods Received Note FIFO batch breakdown, supplier metadata &amp; approval audit.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/70 p-3.5 space-y-1">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                      Supplier Details
                    </p>
                    <p className="text-xs font-bold text-ink">
                      {voucherDetail.grn.supplier_name} ({voucherDetail.grn.supplier_code})
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {voucherDetail.grn.supplier_email || 'No email'}
                      {voucherDetail.grn.supplier_phone
                        ? ` • ${voucherDetail.grn.supplier_phone}`
                        : ''}
                    </p>
                    {voucherDetail.grn.supplier_tax_id && (
                      <p className="text-[11px] font-mono text-ink-muted">
                        Tax ID: {voucherDetail.grn.supplier_tax_id}
                      </p>
                    )}
                  </div>

                  <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/70 p-3.5 space-y-1">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                      Branch &amp; Audit Trail
                    </p>
                    <p className="text-xs font-bold text-ink">
                      {voucherDetail.grn.branch_name} ({voucherDetail.grn.branch_code})
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      Supplier Invoice:{' '}
                      <span className="font-semibold text-ink">
                        {voucherDetail.grn.supplier_invoice_no || '—'}
                      </span>
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      Created: {formatPgDate(voucherDetail.grn.created_at)} • By{' '}
                      {voucherDetail.grn.received_by_name || 'Warehouse Staff'}
                    </p>
                    {voucherDetail.grn.approved_by_name && (
                      <p className="text-[11px] font-semibold text-[#22C55E]">
                        Approved by {voucherDetail.grn.approved_by_name} (
                        {formatPgDate(voucherDetail.grn.approved_at)})
                      </p>
                    )}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product / SKU</TableHead>
                      <TableHead>Batch #</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {voucherDetail.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell>
                          <div className="font-semibold text-ink">{it.product_name}</div>
                          <div className="text-[11px] text-ink-muted tabular-nums">{it.sku}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{it.batch_number}</TableCell>
                        <TableCell className="text-xs text-ink-muted">
                          {formatPgDate(it.expiry_date)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(it.ordered_qty)}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {Number(it.qty_received)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(it.unit_cost)}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {formatMoney(it.line_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/65 px-4 py-3">
                  <span className="text-xs font-semibold text-ink-muted uppercase">
                    Total Received Valuation
                  </span>
                  <span className="text-lg font-bold text-ink tabular-nums">
                    {formatMoney(voucherDetail.grn.total_cost)}
                  </span>
                </div>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border-theme bg-surface px-6 py-3.5">
                <span className="text-[11px] text-ink-muted">
                  Attachment: {voucherDetail.grn.attachment_name || 'None'}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="voucher-print-btn"
                    onClick={() =>
                      printGRNVoucherHtml(
                        voucherDetail,
                        formatMoney,
                        context?.trade_name || context?.business_name || 'Retail Store',
                        context?.tax_registration_no
                      )
                    }
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Voucher
                  </Button>
                  {voucherDetail.grn.status === 'DRAFT' && (
                    <Can permission="inventory:grn_create">
                      <Button
                        type="button"
                        variant="lavender"
                        size="sm"
                        data-testid="voucher-edit-btn"
                        onClick={() => void handleEditDraftGRN(voucherDetail.grn.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Draft
                      </Button>
                    </Can>
                  )}
                  {voucherDetail.grn.status === 'DRAFT' && (
                    <Can permission="inventory:grn_approve">
                      <Button
                        type="button"
                        variant="success"
                        size="sm"
                        data-testid="voucher-approve-btn"
                        onClick={async () => {
                          setVoucherOpen(false);
                          await handleApproveGRN({
                            id: voucherDetail.grn.id,
                            grn_number: voucherDetail.grn.grn_number,
                            supplier_name: voucherDetail.grn.supplier_name,
                            branch_name: voucherDetail.grn.branch_name,
                            supplier_invoice_no: voucherDetail.grn.supplier_invoice_no,
                            attachment_name: voucherDetail.grn.attachment_name,
                            status: voucherDetail.grn.status,
                            total_cost: voucherDetail.grn.total_cost,
                            created_at: formatPgDate(voucherDetail.grn.created_at),
                          });
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve &amp; Post
                      </Button>
                    </Can>
                  )}
                </div>
              </footer>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ProductManagementDrawer
        open={productDrawerOpen}
        onOpenChange={setProductDrawerOpen}
        product={editingProduct}
        categories={categories}
        brands={brands}
        defaultAllowNegativeStock={defaultAllowNegativeStock}
        onSaved={() => {
          refetchBootstrap();
          refetch();
          queryClient.invalidateQueries({ queryKey: ['pos-bootstrap'] });
          queryClient.invalidateQueries({ queryKey: ['overview'] });
        }}
      />
    </>
  );
}
