import * as React from 'react';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  Layers,
  Receipt,
  Truck,
  UserCog,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SortableTableHead,
} from '@/components/ui/table';
import {
  DataTablePagination,
  usePagination,
  useSortableData,
} from '@/components/ui/data-table-pagination';
import { useCurrency } from '@/hooks/useCurrency';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { FilterPillGroup, ReportEmptyState, ReportTableShell } from './ReportSurfaceCard';
import {
  toReportNumber,
  type BranchReportRow,
  type CashierReportRow,
  type PaymentMethodReportRow,
  type PurchaseOrderReportRow,
  type SalesInvoiceReportRow,
  type StockValuationReportRow,
  type SupplierReportRow,
  type TaxReportRow,
} from './types';

/* -------------------------------------------------------------------------- */
/*  Channels, Branches, Cashiers, Payment Methods, Tax & POS Sales Invoices    */
/* -------------------------------------------------------------------------- */

interface ChannelsBreakdownTabProps {
  branches: BranchReportRow[];
  cashiers: CashierReportRow[];
  payments: PaymentMethodReportRow[];
  taxes: TaxReportRow[];
  salesInvoices: SalesInvoiceReportRow[];
  search: string;
  onResetSearch?: () => void;
}

export function ChannelsBreakdownTab({
  branches,
  cashiers,
  payments,
  taxes,
  salesInvoices,
  search,
  onResetSearch,
}: ChannelsBreakdownTabProps) {
  const { formatMoney } = useCurrency();
  const [salesStatusFilter, setSalesStatusFilter] = React.useState<
    'ALL' | 'PAID' | 'VOID' | 'REFUND'
  >('ALL');
  const [salesMethodFilter, setSalesMethodFilter] = React.useState<string>('ALL');

  const paymentMethods = React.useMemo(() => {
    const set = new Set<string>();
    salesInvoices.forEach((inv) => {
      if (inv.payment_method) set.add(inv.payment_method);
    });
    return ['ALL', ...Array.from(set)];
  }, [salesInvoices]);

  const filteredSalesInvoices = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return salesInvoices.filter((inv) => {
      if (salesStatusFilter !== 'ALL') {
        if (salesStatusFilter === 'REFUND') {
          if (inv.status !== 'REFUND' && inv.status !== 'REFUNDED') return false;
        } else if (inv.status !== salesStatusFilter) {
          return false;
        }
      }
      if (salesMethodFilter !== 'ALL' && inv.payment_method !== salesMethodFilter) return false;
      if (!q) return true;
      return (
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.customer_name.toLowerCase().includes(q) ||
        inv.branch_name.toLowerCase().includes(q) ||
        inv.cashier_name.toLowerCase().includes(q)
      );
    });
  }, [salesInvoices, search, salesStatusFilter, salesMethodFilter]);

  const salesSort = useSortableData(
    filteredSalesInvoices,
    { key: 'invoice_number', dir: 'desc' },
    (inv, key) => {
      if (key === 'total_items') return inv.total_items;
      if (key === 'tax_total' || key === 'grand_total') return toReportNumber(inv[key]);
      return (inv as unknown as Record<string, string>)[key];
    }
  );
  const salesPagination = usePagination(salesSort.sortedItems, 8);

  return (
    <div className="space-y-4">
      {/* Row 1: Symmetrical Branch & Cashier Performance Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/35 p-4 h-full flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-accent" />
                <h4 className="text-[13px] font-bold text-ink">Branch Performance</h4>
              </div>
              <Badge variant="outline">{branches.length} branches</Badge>
            </div>
            <div className="min-w-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((br) => (
                    <TableRow key={br.id}>
                      <TableCell>
                        <div className="font-semibold text-ink">{br.name}</div>
                        <div className="text-[10.5px] text-ink-muted">
                          {br.code} • {br.country_name} • Stock {formatMoney(br.stock_valuation)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {br.paid_count}
                        {br.void_refund_count > 0 && (
                          <span className="ml-1 text-[10px] text-[#EF4444]">/{br.void_refund_count}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatMoney(br.net_revenue)}
                      </TableCell>
                      <TableCell className="text-right text-[#22C55E] font-semibold tabular-nums">
                        {formatMoney(br.gross_profit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{br.margin_pct}%</TableCell>
                    </TableRow>
                  ))}
                  {branches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-xs text-ink-muted">
                        No branch sales metrics available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/35 p-4 h-full flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-accent" />
                <h4 className="text-[13px] font-bold text-ink">Cashier &amp; Register Performance</h4>
              </div>
              <Badge variant="outline">{cashiers.length} active staff</Badge>
            </div>
            <div className="min-w-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cashier</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Avg Bill</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashiers.map((ca) => (
                    <TableRow key={ca.user_id}>
                      <TableCell>
                        <div className="font-semibold text-ink">{ca.full_name}</div>
                        <div className="text-[10.5px] text-ink-muted">
                          {ca.email} • Disc {formatMoney(ca.total_discounts)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{ca.paid_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{ca.items_sold}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(ca.avg_order_value)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatMoney(ca.net_revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {cashiers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-xs text-ink-muted">
                        No cashier activity in this window.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Payment Methods & Multi-Tier Tax Collection Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-5 min-w-0">
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/35 p-4 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-accent" />
                  <h4 className="text-[13px] font-bold text-ink">Payment Method Settlements</h4>
                </div>
              </div>
              <div className="min-w-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Tx</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Collected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((pm) => (
                      <TableRow key={pm.payment_method}>
                        <TableCell>
                          <Badge variant="outline">{formatDisplayLabel(pm.payment_method)}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{pm.tx_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{pm.share_pct}%</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatMoney(pm.total_collected)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {payments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-xs text-ink-muted">
                          No settlements recorded.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-7 min-w-0">
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/35 p-4 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-accent" />
                  <h4 className="text-[13px] font-bold text-ink">Tax Rule &amp; Compliance Summary</h4>
                </div>
              </div>
              <div className="min-w-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tax Rule</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead className="text-right">Taxable Base</TableHead>
                      <TableHead className="text-right">Collected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxes.map((tx) => (
                      <TableRow key={`${tx.tax_name}-${tx.tax_type}`}>
                        <TableCell className="font-semibold text-ink">{formatDisplayLabel(tx.tax_name)}</TableCell>
                        <TableCell>
                          <Badge variant="lavender">{formatDisplayLabel(tx.tax_type)}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{tx.rate_percent}%</TableCell>
                        <TableCell className="text-right tabular-nums">{tx.invoice_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(tx.taxable_base)}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{formatMoney(tx.tax_collected)}</TableCell>
                      </TableRow>
                    ))}
                    {taxes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-6 text-center text-xs text-ink-muted">
                          No tax rule breakdowns collected in this period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Connected POS Sales Invoices Ledger */}
      <ReportTableShell
        toolbarLeft={
          <FilterPillGroup
            value={salesStatusFilter}
            onChange={setSalesStatusFilter}
            options={[
              { id: 'ALL', label: 'All Statuses' },
              { id: 'PAID', label: 'PAID' },
              { id: 'VOID', label: 'VOID' },
              { id: 'REFUND', label: 'REFUND' },
            ]}
          />
        }
        toolbarRight={
          <FilterPillGroup
            tone="contrast"
            value={salesMethodFilter}
            onChange={setSalesMethodFilter}
            options={paymentMethods.map((m) => ({
              id: m,
              label: m === 'ALL' ? 'All Methods' : m,
            }))}
          />
        }
        summaryText={`${filteredSalesInvoices.length} invoice${filteredSalesInvoices.length === 1 ? '' : 's'}`}
        footer={
          <DataTablePagination
            className="mt-0 rounded-none border-0 bg-transparent px-0 py-0"
            page={salesPagination.page}
            pageSize={salesPagination.pageSize}
            totalItems={salesPagination.totalItems}
            totalPages={salesPagination.totalPages}
            onPageChange={salesPagination.setPage}
            onPageSizeChange={salesPagination.setPageSize}
            itemLabel="sales invoices"
            testIdPrefix="reports-sales-pagination"
          />
        }
      >
        {salesPagination.pagedItems.length > 0 ? (
          <Table containerClassName="rounded-none border-0 shadow-none bg-transparent">
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="invoice_number" activeSortKey={salesSort.sortConfig?.key} sortDir={salesSort.sortConfig?.dir} onSort={salesSort.requestSort}>
                  Invoice #
                </SortableTableHead>
                <SortableTableHead sortKey="customer_name" activeSortKey={salesSort.sortConfig?.key} sortDir={salesSort.sortConfig?.dir} onSort={salesSort.requestSort}>
                  Customer
                </SortableTableHead>
                <SortableTableHead sortKey="branch_name" activeSortKey={salesSort.sortConfig?.key} sortDir={salesSort.sortConfig?.dir} onSort={salesSort.requestSort}>
                  Branch / Cashier
                </SortableTableHead>
                <SortableTableHead sortKey="payment_method" activeSortKey={salesSort.sortConfig?.key} sortDir={salesSort.sortConfig?.dir} onSort={salesSort.requestSort}>
                  Method
                </SortableTableHead>
                <SortableTableHead sortKey="total_items" activeSortKey={salesSort.sortConfig?.key} sortDir={salesSort.sortConfig?.dir} onSort={salesSort.requestSort} align="right">
                  Items
                </SortableTableHead>
                <SortableTableHead sortKey="tax_total" activeSortKey={salesSort.sortConfig?.key} sortDir={salesSort.sortConfig?.dir} onSort={salesSort.requestSort} align="right">
                  Tax
                </SortableTableHead>
                <SortableTableHead sortKey="grand_total" activeSortKey={salesSort.sortConfig?.key} sortDir={salesSort.sortConfig?.dir} onSort={salesSort.requestSort} align="right">
                  Total
                </SortableTableHead>
                <SortableTableHead sortKey="status" activeSortKey={salesSort.sortConfig?.key} sortDir={salesSort.sortConfig?.dir} onSort={salesSort.requestSort}>
                  Status
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesPagination.pagedItems.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-semibold tabular-nums">
                    <div>{inv.invoice_number}</div>
                    <div className="text-[10.5px] font-normal text-ink-muted">
                      {inv.created_at.slice(0, 10)}
                    </div>
                  </TableCell>
                  <TableCell>{inv.customer_name}</TableCell>
                  <TableCell className="text-xs text-ink-muted">
                    {inv.branch_name} • {inv.cashier_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatDisplayLabel(inv.payment_method)}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{inv.total_items}</TableCell>
                  <TableCell className="text-right tabular-nums text-ink-muted">
                    {formatMoney(inv.tax_total)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoney(inv.grand_total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={inv.status === 'PAID' ? 'positive' : 'negative'}>
                      {formatDisplayLabel(inv.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <ReportEmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="No POS sales invoices match this window"
            description="Adjust the reporting date window, branch scope, or status/payment filters to inspect sales transactions."
            actionLabel={
              salesStatusFilter !== 'ALL' || salesMethodFilter !== 'ALL' || search.trim()
                ? 'Reset Invoice Filters'
                : undefined
            }
            onAction={() => {
              setSalesStatusFilter('ALL');
              setSalesMethodFilter('ALL');
              onResetSearch?.();
            }}
          />
        )}
      </ReportTableShell>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Procurement, Supplier Exposure & Auto-PO Vendor Invoices Tab               */
/* -------------------------------------------------------------------------- */

interface ProcurementAndSuppliersTabProps {
  suppliers: SupplierReportRow[];
  purchaseOrders: PurchaseOrderReportRow[];
  search: string;
  scanningAutoPO?: boolean;
  onAutoPOScan?: () => void;
  onResetSearch?: () => void;
  onMarkInvoicePaid: (invoiceId: string) => void;
}

export function ProcurementAndSuppliersTab({
  suppliers,
  purchaseOrders,
  search,
  scanningAutoPO,
  onAutoPOScan,
  onResetSearch,
  onMarkInvoicePaid,
}: ProcurementAndSuppliersTabProps) {
  const { formatMoney } = useCurrency();
  const [poFilter, setPoFilter] = React.useState<'ALL' | 'AUTO' | 'UNPAID' | 'PAID'>('ALL');

  const filteredSuppliers = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  const filteredPOs = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      if (poFilter === 'AUTO' && !po.auto_generated) return false;
      if (poFilter === 'UNPAID' && (!po.invoice_id || po.invoice_status === 'PAID')) return false;
      if (poFilter === 'PAID' && po.invoice_status !== 'PAID') return false;
      if (!q) return true;
      return (
        po.po_number.toLowerCase().includes(q) ||
        po.invoice_number.toLowerCase().includes(q) ||
        po.supplier_name.toLowerCase().includes(q) ||
        po.notes.toLowerCase().includes(q)
      );
    });
  }, [purchaseOrders, search, poFilter]);

  const poSort = useSortableData(filteredPOs, { key: 'po_number', dir: 'desc' }, (po, key) => {
    if (key === 'amount') return toReportNumber(po.invoice_grand_total || po.total_amount);
    if (key === 'supplier_name') return po.supplier_name;
    if (key === 'invoice_number') return po.invoice_number || '';
    if (key === 'status') return po.status;
    if (key === 'invoice_status') return po.invoice_status || '';
    return po.po_number;
  });

  const poPagination = usePagination(poSort.sortedItems, 6);

  return (
    <div className="space-y-5">
      {/* Supplier-Wise Procurement & Payables Summary */}
      <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/35 p-4 space-y-3 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-accent" />
            <h4 className="text-[13px] font-bold text-ink">Supplier Spend &amp; Accounts Payable Summary</h4>
          </div>
          <Badge variant="outline">{filteredSuppliers.length} vendors</Badge>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Terms</TableHead>
              <TableHead className="text-right">POs (Auto)</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Total Ordered</TableHead>
              <TableHead className="text-right">Invoiced</TableHead>
              <TableHead className="text-right">Settled</TableHead>
              <TableHead className="text-right">Unpaid AP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSuppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-semibold text-ink">{s.name}</div>
                  <div className="text-[10.5px] text-ink-muted">{s.code} • {s.phone || s.email || 'Vendor'}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.payment_terms_days}d</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.po_count} <span className="text-[10.5px] text-accent">({s.auto_po_count} auto)</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.received_po_count}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatMoney(s.total_ordered)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(s.invoiced_total)}</TableCell>
                <TableCell className="text-right text-[#22C55E] font-semibold tabular-nums">
                  {formatMoney(s.paid_total)}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">
                  {toReportNumber(s.unpaid_total) > 0 ? (
                    <Badge variant="negative">{formatMoney(s.unpaid_total)}</Badge>
                  ) : (
                    <Badge variant="positive">{formatMoney(s.unpaid_total)}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filteredSuppliers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-xs text-ink-muted">
                  No supplier records match your search filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Connected Purchase Orders & Linked Vendor Invoices Card */}
      <ReportTableShell
        toolbarLeft={
          <FilterPillGroup
            value={poFilter}
            onChange={setPoFilter}
            options={[
              { id: 'ALL', label: 'All Purchase Orders' },
              { id: 'AUTO', label: 'Auto-Generated POs' },
              { id: 'UNPAID', label: 'Unpaid Invoices' },
              { id: 'PAID', label: 'Settled Invoices' },
            ]}
          />
        }
        summaryText={`Showing ${filteredPOs.length} purchase order${filteredPOs.length === 1 ? '' : 's'}`}
        footer={
          <DataTablePagination
            className="mt-0 rounded-none border-0 bg-transparent px-0 py-0"
            page={poPagination.page}
            pageSize={poPagination.pageSize}
            totalItems={poPagination.totalItems}
            totalPages={poPagination.totalPages}
            onPageChange={poPagination.setPage}
            onPageSizeChange={poPagination.setPageSize}
            itemLabel="purchase orders"
            testIdPrefix="reports-po-pagination"
          />
        }
      >
        {poPagination.pagedItems.length > 0 ? (
          <Table containerClassName="rounded-none border-0 shadow-none bg-transparent">
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="po_number" activeSortKey={poSort.sortConfig?.key} sortDir={poSort.sortConfig?.dir} onSort={poSort.requestSort}>
                  PO Number
                </SortableTableHead>
                <TableHead>Trigger &amp; Item Min Details</TableHead>
                <SortableTableHead sortKey="supplier_name" activeSortKey={poSort.sortConfig?.key} sortDir={poSort.sortConfig?.dir} onSort={poSort.requestSort}>
                  Supplier
                </SortableTableHead>
                <SortableTableHead sortKey="invoice_number" activeSortKey={poSort.sortConfig?.key} sortDir={poSort.sortConfig?.dir} onSort={poSort.requestSort}>
                  Linked Purchase Invoice
                </SortableTableHead>
                <SortableTableHead sortKey="amount" activeSortKey={poSort.sortConfig?.key} sortDir={poSort.sortConfig?.dir} onSort={poSort.requestSort} align="right">
                  Amount
                </SortableTableHead>
                <SortableTableHead sortKey="status" activeSortKey={poSort.sortConfig?.key} sortDir={poSort.sortConfig?.dir} onSort={poSort.requestSort}>
                  PO Status
                </SortableTableHead>
                <TableHead className="text-right">Invoice Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {poPagination.pagedItems.map((po) => (
                <TableRow key={po.id}>
                  <TableCell>
                    <div className="font-semibold text-ink tabular-nums">{po.po_number}</div>
                    {po.auto_generated && (
                      <Badge variant="lavender" className="mt-1">
                        Auto-PO
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {po.items && po.items.length > 0 ? (
                      <div className="space-y-1">
                        {po.items.map((it) => (
                          <div key={it.id} className="text-[11px]">
                            <span className="font-semibold text-ink">{it.product_name}</span>{' '}
                            <span className="text-ink-muted">({it.sku})</span>
                            <div className="text-[10.5px] text-ink-muted tabular-nums">
                              At Order: {Number(it.stock_at_order).toFixed(0)} • Min:{' '}
                              {Number(it.min_stock_threshold).toFixed(0)} •
                              Qty: {Number(it.ordered_qty).toFixed(0)} @{' '}
                              {formatMoney(it.unit_cost)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted">{po.notes}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-ink-muted">{po.supplier_name}</TableCell>
                  <TableCell>
                    {po.invoice_number ? (
                      <div>
                        <div className="inline-flex items-center gap-1 font-semibold text-ink text-xs tabular-nums">
                          <FileText className="h-3 w-3 text-accent" />
                          {po.invoice_number}
                        </div>
                        <div className="mt-0.5">
                          <Badge
                            variant={
                              po.invoice_status === 'PAID'
                                ? 'positive'
                                : po.invoice_status === 'ISSUED'
                                ? 'accent'
                                : 'outline'
                            }
                          >
                            {formatDisplayLabel(po.invoice_status)}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoney(po.invoice_grand_total || po.total_amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={po.status === 'RECEIVED' ? 'positive' : 'outline'}>
                      {formatDisplayLabel(po.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {po.invoice_id && po.invoice_status !== 'PAID' ? (
                      <Button
                        type="button"
                        variant="success"
                        size="xs"
                        onClick={() => onMarkInvoicePaid(po.invoice_id)}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Mark Paid
                      </Button>
                    ) : (
                      <Badge variant="positive">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Settled
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <ReportEmptyState
            icon={<Truck className="h-5 w-5" />}
            title="No purchase orders match your filter"
            description="Scan low-stock thresholds to auto-draft vendor purchase orders and linked payables, or reset active filters."
            actionLabel={onAutoPOScan ? (scanningAutoPO ? 'Checking Minimums...' : 'Generate Auto-PO & Invoices') : undefined}
            onAction={onAutoPOScan}
            secondaryLabel={poFilter !== 'ALL' || search.trim() ? 'Reset PO Filters' : undefined}
            onSecondaryAction={() => {
              setPoFilter('ALL');
              onResetSearch?.();
            }}
          />
        )}
      </ReportTableShell>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  FIFO Stock Valuation & Reorder Thresholds Tab                              */
/* -------------------------------------------------------------------------- */

interface StockValuationTabProps {
  rows: StockValuationReportRow[];
  search: string;
  onResetSearch?: () => void;
}

export function StockValuationTab({ rows, search, onResetSearch }: StockValuationTabProps) {
  const { formatMoney } = useCurrency();
  const [valFilter, setValFilter] = React.useState<'ALL' | 'LOW' | 'HEALTHY'>('ALL');

  const filteredValuation = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((sv) => {
      const low = Number(sv.total_remaining) <= Number(sv.reorder_point);
      if (valFilter === 'LOW' && !low) return false;
      if (valFilter === 'HEALTHY' && low) return false;
      if (!q) return true;
      return (
        sv.name.toLowerCase().includes(q) ||
        sv.sku.toLowerCase().includes(q) ||
        sv.category_name.toLowerCase().includes(q)
      );
    });
  }, [rows, search, valFilter]);

  const valSort = useSortableData(
    filteredValuation,
    { key: 'fifo_valuation', dir: 'desc' },
    (sv, key) => {
      if (key === 'total_remaining') return Number(sv.total_remaining);
      if (key === 'reorder_point') return Number(sv.reorder_point);
      if (key === 'reorder_qty') return Number(sv.reorder_qty);
      if (key === 'fifo_valuation') return Number(sv.fifo_valuation);
      if (key === 'status') return Number(sv.total_remaining) <= Number(sv.reorder_point) ? 0 : 1;
      return (sv as unknown as Record<string, string>)[key];
    }
  );

  const valPagination = usePagination(valSort.sortedItems, 8);

  const totalRetailPotential = React.useMemo(
    () =>
      filteredValuation.reduce(
        (acc, sv) => acc + Number(sv.total_remaining) * Number(sv.sale_price),
        0
      ),
    [filteredValuation]
  );

  const totalFifoCost = React.useMemo(
    () => filteredValuation.reduce((acc, sv) => acc + Number(sv.fifo_valuation), 0),
    [filteredValuation]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">FIFO Asset Cost</span>
          <span className="mt-1 text-lg font-bold text-ink tabular-nums">
            {formatMoney(totalFifoCost)}
          </span>
        </div>
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">Retail Value at Shelf Price</span>
          <span className="mt-1 text-lg font-bold text-ink tabular-nums">
            {formatMoney(totalRetailPotential)}
          </span>
        </div>
        <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3.5 h-full flex flex-col justify-between">
          <span className="text-[11px] font-medium text-ink-muted">Unrealized Inventory Margin</span>
          <span className="mt-1 text-lg font-bold text-[#22C55E] tabular-nums">
            {formatMoney(Math.max(0, totalRetailPotential - totalFifoCost))}
          </span>
        </div>
      </div>

      <ReportTableShell
        toolbarLeft={
          <FilterPillGroup
            value={valFilter}
            onChange={setValFilter}
            options={[
              { id: 'ALL', label: 'All SKUs' },
              { id: 'LOW', label: 'Below Min / Low Stock' },
              { id: 'HEALTHY', label: 'Healthy Stock' },
            ]}
          />
        }
        summaryText={`Showing ${filteredValuation.length} SKU${filteredValuation.length === 1 ? '' : 's'}`}
        footer={
          <DataTablePagination
            className="mt-0 rounded-none border-0 bg-transparent px-0 py-0"
            page={valPagination.page}
            pageSize={valPagination.pageSize}
            totalItems={valPagination.totalItems}
            totalPages={valPagination.totalPages}
            onPageChange={valPagination.setPage}
            onPageSizeChange={valPagination.setPageSize}
            itemLabel="SKUs"
            testIdPrefix="reports-valuation-pagination"
          />
        }
      >
        {valPagination.pagedItems.length > 0 ? (
          <Table containerClassName="rounded-none border-0 shadow-none bg-transparent">
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" activeSortKey={valSort.sortConfig?.key} sortDir={valSort.sortConfig?.dir} onSort={valSort.requestSort}>
                  SKU / Product
                </SortableTableHead>
                <SortableTableHead sortKey="category_name" activeSortKey={valSort.sortConfig?.key} sortDir={valSort.sortConfig?.dir} onSort={valSort.requestSort}>
                  Category
                </SortableTableHead>
                <SortableTableHead sortKey="total_remaining" activeSortKey={valSort.sortConfig?.key} sortDir={valSort.sortConfig?.dir} onSort={valSort.requestSort} align="right">
                  On Hand
                </SortableTableHead>
                <SortableTableHead sortKey="reorder_point" activeSortKey={valSort.sortConfig?.key} sortDir={valSort.sortConfig?.dir} onSort={valSort.requestSort} align="right">
                  Min Threshold
                </SortableTableHead>
                <SortableTableHead sortKey="reorder_qty" activeSortKey={valSort.sortConfig?.key} sortDir={valSort.sortConfig?.dir} onSort={valSort.requestSort} align="right">
                  Auto-Order Qty
                </SortableTableHead>
                <SortableTableHead sortKey="fifo_valuation" activeSortKey={valSort.sortConfig?.key} sortDir={valSort.sortConfig?.dir} onSort={valSort.requestSort} align="right">
                  FIFO Valuation
                </SortableTableHead>
                <SortableTableHead sortKey="status" activeSortKey={valSort.sortConfig?.key} sortDir={valSort.sortConfig?.dir} onSort={valSort.requestSort}>
                  Status
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {valPagination.pagedItems.map((sv) => {
                const rem = Number(sv.total_remaining);
                const min = Number(sv.reorder_point);
                const low = rem <= min;
                return (
                  <TableRow key={sv.id}>
                    <TableCell>
                      <div className="font-semibold text-ink">{sv.name}</div>
                      <div className="text-[11px] text-ink-muted tabular-nums">{sv.sku}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{sv.category_name}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {rem} {sv.unit_of_measure}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{min}</TableCell>
                    <TableCell className="text-right tabular-nums">+{Number(sv.reorder_qty)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(sv.fifo_valuation)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={low ? 'negative' : 'positive'}>
                        {low
                          ? sv.open_po_count > 0
                            ? `Low • ${sv.open_po_count} Auto-PO`
                            : 'Below Min'
                          : 'Healthy'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <ReportEmptyState
            icon={<Layers className="h-5 w-5" />}
            title="No SKU valuation rows match your filter"
            description="Reset stock health filter pills or clear search keywords to view FIFO inventory cost layers."
            actionLabel={valFilter !== 'ALL' || search.trim() ? 'Reset Valuation Filters' : undefined}
            onAction={() => {
              setValFilter('ALL');
              onResetSearch?.();
            }}
          />
        )}
      </ReportTableShell>
    </div>
  );
}

