import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Download,
  Layers,
  Lock,
  Package,
  Printer,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateRangePicker, formatLocalYMD } from '@/components/ui/date-range-picker';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/api';
import { isMultiBranchRole } from '@/lib/branchAccess';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import { ExecutiveAnalysisTab } from './ExecutiveAnalysisTab';
import { ProductWiseReportTab } from './ProductWiseReportTab';
import { CategoryWiseReportTab } from './CategoryWiseReportTab';
import { CustomerWiseReportTab } from './CustomerWiseReportTab';
import {
  ChannelsBreakdownTab,
  ProcurementAndSuppliersTab,
  StockValuationTab,
} from './ChannelsAndLedgerTabs';
import { ReportsPrintSheet, type ReportTabKey } from './ReportsPrintSheet';
import { exportTabularCsv, type ReportsPayload } from './types';

function getPresetDates(preset: 'TODAY' | '7D' | '30D' | '90D' | 'YTD'): {
  from: string;
  to: string;
} {
  const now = new Date();
  const to = formatLocalYMD(now);
  const start = new Date(now);
  if (preset === 'TODAY') {
    return { from: to, to };
  }
  if (preset === '7D') {
    start.setDate(start.getDate() - 7);
    return { from: formatLocalYMD(start), to };
  }
  if (preset === '30D') {
    start.setDate(start.getDate() - 30);
    return { from: formatLocalYMD(start), to };
  }
  if (preset === '90D') {
    start.setDate(start.getDate() - 90);
    return { from: formatLocalYMD(start), to };
  }
  return { from: `${now.getFullYear()}-01-01`, to };
}

function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 items-stretch">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="zona-card p-4 h-[106px] flex flex-col justify-between">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </section>
      <section className="zona-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-9 w-72" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Skeleton className="xl:col-span-8 h-[310px]" />
          <Skeleton className="xl:col-span-4 h-[310px]" />
        </div>
      </section>
    </div>
  );
}

export function ReportsPage() {
  const { context, branches } = useAuthStore();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const canMultiBranch = isMultiBranchRole(context?.role_code);

  const [tab, setTab] = React.useState('executive');
  const [branchFilter, setBranchFilter] = React.useState<string>(() =>
    canMultiBranch ? 'ALL' : context?.branch_id || ''
  );

  React.useEffect(() => {
    if (!canMultiBranch && context?.branch_id && branchFilter !== context.branch_id) {
      setBranchFilter(context.branch_id);
    } else if (canMultiBranch && !branchFilter) {
      setBranchFilter('ALL');
    }
  }, [canMultiBranch, context?.branch_id, branchFilter]);
  const [activePreset, setActivePreset] = React.useState<'TODAY' | '7D' | '30D' | '90D' | 'YTD' | 'CUSTOM'>('30D');
  const [fromDate, setFromDate] = React.useState(() => getPresetDates('30D').from);
  const [toDate, setToDate] = React.useState(() => getPresetDates('30D').to);
  const [search, setSearch] = React.useState('');
  const [scanning, setScanning] = React.useState(false);

  const reportUrl = React.useMemo(() => {
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    if (branchFilter !== 'ALL') {
      params.set('branch_id', branchFilter);
    }
    return `/api/v1/reports/summary?${params.toString()}`;
  }, [fromDate, toDate, branchFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', context?.business_id, branchFilter, fromDate, toDate],
    queryFn: () => apiFetch<ReportsPayload>(reportUrl),
    enabled: Boolean(context?.business_id),
  });

  const applyPreset = (preset: 'TODAY' | '7D' | '30D' | '90D' | 'YTD') => {
    const next = getPresetDates(preset);
    setActivePreset(preset);
    setFromDate(next.from);
    setToDate(next.to);
  };

  const handleLowStockAutoScan = async () => {
    setScanning(true);
    try {
      const scanBranch = branchFilter && branchFilter !== 'ALL' ? `?branch_id=${encodeURIComponent(branchFilter)}` : '';
      const res = await apiFetch<{
        scanned_low_count: number;
        created_count: number;
      }>(`/api/v1/inventory/low-stock/scan${scanBranch}`, { method: 'POST' });
      toast.success(
        res.created_count > 0
          ? `Drafted ${res.created_count} Auto-PO(s) + Linked Vendor Invoice(s)`
          : `Checked ${res.scanned_low_count} low-stock SKU(s); open POs are already active`
      );
      queryClient.invalidateQueries({ queryKey: ['reports', context?.business_id] });
      queryClient.invalidateQueries({ queryKey: ['notifications', context?.business_id] });
      queryClient.invalidateQueries({ queryKey: ['inventory', context?.business_id] });
    } catch (err: any) {
      toast.error(err?.message || 'Unable to run Auto-PO sweep');
    } finally {
      setScanning(false);
    }
  };

  const handleMarkInvoicePaid = async (invId: string) => {
    try {
      await apiFetch(`/api/v1/procurement/invoices/${invId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'PAID' }),
      });
      toast.success('Vendor purchase invoice marked PAID');
      queryClient.invalidateQueries({ queryKey: ['reports', context?.business_id] });
    } catch (err: any) {
      toast.error(err?.message || 'Unable to update purchase invoice status');
    }
  };

  const handleExportCSV = () => {
    if (!data) return;
    const prefix = `business-analysis-${tab}-${fromDate}-to-${toDate}.csv`;

    if (tab === 'executive') {
      exportTabularCsv(
        prefix,
        ['Date', 'Paid Orders', 'Units Sold', 'Subtotal', 'Discounts', 'Tax', 'Net Revenue', 'COGS', 'Gross Profit', 'Margin %'],
        (data.daily_trend || []).map((d) => [
          d.day_date,
          d.invoice_count,
          d.units_sold,
          d.gross_subtotal,
          d.total_discounts,
          d.total_taxes,
          d.net_revenue,
          d.total_cogs,
          d.gross_profit,
          d.margin_pct,
        ])
      );
    } else if (tab === 'products') {
      exportTabularCsv(
        prefix,
        ['SKU', 'Product Name', 'Category', 'Segment', 'UOM', 'Units Sold', 'Orders', 'Gross Sales', 'Discounts', 'Tax', 'Net Revenue', 'COGS', 'Gross Profit', 'Margin %', 'Share %', 'Stock On Hand', 'FIFO Value', 'Stock Status'],
        (data.product_report || []).map((p) => [
          p.sku,
          p.name,
          p.category_name,
          p.gender_segment,
          p.unit_of_measure,
          p.units_sold,
          p.invoice_count,
          p.gross_sales,
          p.discount_amount,
          p.tax_amount,
          p.net_revenue,
          p.total_cogs,
          p.gross_profit,
          p.margin_pct,
          p.revenue_share_pct,
          p.stock_on_hand,
          p.fifo_value,
          p.stock_status,
        ])
      );
    } else if (tab === 'categories') {
      exportTabularCsv(
        prefix,
        ['Category', 'Segment', 'Active SKUs', 'Orders', 'Units Sold', 'Gross Sales', 'Discounts', 'Tax', 'Net Revenue', 'COGS', 'Gross Profit', 'Margin %', 'Share %', 'Stock On Hand', 'Stock Asset Valuation'],
        (data.category_report || []).map((c) => [
          c.name,
          c.gender_segment,
          c.sku_count,
          c.invoice_count,
          c.units_sold,
          c.gross_sales,
          c.discount_amount,
          c.tax_amount,
          c.net_revenue,
          c.total_cogs,
          c.gross_profit,
          c.margin_pct,
          c.revenue_share_pct,
          c.stock_on_hand,
          c.stock_valuation,
        ])
      );
    } else if (tab === 'customers') {
      exportTabularCsv(
        prefix,
        ['Customer', 'Segment', 'Tier', 'Email', 'Phone', 'Loyalty Points', 'Paid Orders', 'Void/Refund', 'Items Bought', 'Avg Order Value', 'Discounts', 'Tax', 'Total Spend', 'Share %', 'Last Purchase'],
        (data.customer_report || []).map((c) => [
          c.name,
          c.customer_segment,
          c.tier,
          c.email,
          c.phone,
          c.loyalty_points,
          c.paid_orders,
          c.refund_void_count,
          c.items_bought,
          c.avg_order_value,
          c.discount_total,
          c.tax_total,
          c.total_spent,
          c.spend_share_pct,
          c.last_purchase_at,
        ])
      );
    } else if (tab === 'channels') {
      exportTabularCsv(
        prefix,
        ['Invoice #', 'Date', 'Branch', 'Customer', 'Cashier', 'Payment Method', 'Items', 'Tax', 'Status', 'Grand Total'],
        (data.sales_invoices || []).map((inv) => [
          inv.invoice_number,
          inv.created_at,
          inv.branch_name,
          inv.customer_name,
          inv.cashier_name,
          inv.payment_method,
          inv.total_items,
          inv.tax_total,
          inv.status,
          inv.grand_total,
        ])
      );
    } else if (tab === 'procurement') {
      exportTabularCsv(
        prefix,
        ['PO #', 'Auto Generated', 'Supplier', 'Branch', 'Linked Invoice #', 'Invoice Status', 'PO Status', 'Total Amount'],
        (data.purchase_orders || []).map((po) => [
          po.po_number,
          po.auto_generated,
          po.supplier_name,
          po.branch_name,
          po.invoice_number,
          po.invoice_status,
          po.status,
          po.invoice_grand_total || po.total_amount,
        ])
      );
    } else {
      exportTabularCsv(
        prefix,
        ['SKU', 'Product', 'Category', 'On Hand', 'Min Threshold', 'Reorder Qty', 'FIFO Valuation'],
        (data.stock_valuation || []).map((sv) => [
          sv.sku,
          sv.name,
          sv.category_name,
          sv.total_remaining,
          sv.reorder_point,
          sv.reorder_qty,
          sv.fifo_valuation,
        ])
      );
    }
    toast.success(`Exported ${tab} business analysis CSV`);
  };

  if (isLoading || !data) {
    return <ReportsSkeleton />;
  }

  const ss = data.sales_summary ?? {
    paid_count: 0,
    void_refund_count: 0,
    gross_subtotal: '0.00',
    total_discounts: '0.00',
    total_taxes: '0.00',
    net_revenue: '0.00',
    total_cogs: '0.00',
    gross_profit: '0.00',
    margin_pct: '0.00',
    refunded_amount: '0.00',
    avg_order_value: '0.00',
  };
  const is = data.inventory_summary ?? {
    total_skus: 0,
    low_stock_skus: 0,
    total_units: '0',
    total_valuation: '0.00',
    auto_po_count: 0,
    purchase_inv_cnt: 0,
    unpaid_ap_total: '0.00',
  };

  return (
    <>
      <div className="space-y-4 print:hidden">
      {/* KPI Summary Strip (Strictly Symmetrical 4-Column Bento Row) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 items-stretch">
        <div className="zona-card h-full p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-ink-muted">Net Sales Revenue</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">
              {formatMoney(ss.net_revenue)}
            </p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted tabular-nums">
              {ss.paid_count} paid • Avg {formatMoney(ss.avg_order_value || 0)}
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-accent-soft text-accent-soft-fg">
            <TrendingUp className="h-4 w-4" />
          </span>
        </div>

        <div className="zona-card h-full p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-ink-muted">Gross Profit &amp; Margin</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">
              {formatMoney(ss.gross_profit)}
            </p>
            <p className="mt-0.5 text-[10.5px] text-[#22C55E] font-semibold tabular-nums">
              {ss.margin_pct}% margin • COGS {formatMoney(ss.total_cogs)}
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-[#22C55E]/15 text-[#22C55E]">
            <CheckCircle2 className="h-4 w-4" />
          </span>
        </div>

        <div className="zona-card h-full p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-ink-muted">Taxes &amp; Discounts</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">
              {formatMoney(ss.total_taxes)}
            </p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted tabular-nums">
              Disc {formatMoney(ss.total_discounts)} • Void/Ret {ss.void_refund_count}
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-surface-muted text-accent">
            <Receipt className="h-4 w-4" />
          </span>
        </div>

        <div className="zona-card h-full p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-ink-muted">FIFO Asset &amp; Unpaid AP</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">
              {formatMoney(is.total_valuation)}
            </p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted tabular-nums">
              {is.total_units} units • {is.low_stock_skus} low • AP {formatMoney(is.unpaid_ap_total || 0)}
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-sand text-ink">
            <Layers className="h-4 w-4" />
          </span>
        </div>
      </section>

      {/* Main Business Analysis Workspace */}
      <section className="zona-card p-4 sm:p-5 space-y-4">
        {/* Balanced Command Toolbar */}
        <div className="space-y-2.5">
          {/* Row 1: Search & Branch Scope (Left) + Action Suite (Right) */}
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2.5">
            <div className="flex flex-1 flex-col sm:flex-row sm:items-center gap-2.5 min-w-0">
              <div className="relative flex-1 min-w-[200px] sm:max-w-[340px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search SKU, customer, category, PO..."
                  className="pl-8"
                />
              </div>

              {canMultiBranch ? (
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger
                    aria-label="Filter by branch"
                    data-testid="reports-branch-select"
                    className="w-full sm:w-[248px] shrink-0 whitespace-nowrap [&>span]:truncate"
                  >
                    <Building2 className="mr-1.5 h-3.5 w-3.5 text-accent shrink-0" />
                    <SelectValue placeholder="All Branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Branches (Consolidated)</SelectItem>
                    {branches.map((br) => (
                      <SelectItem key={br.id} value={br.id}>
                        {br.name} ({br.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div
                  className="inline-flex h-9 w-full sm:w-[248px] shrink-0 items-center gap-2 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted/70 px-3 text-xs font-semibold text-ink"
                  data-testid="reports-branch-locked"
                >
                  <Lock className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="truncate">
                    {branches.find((b) => b.id === (context?.branch_id || branchFilter))?.name ||
                      'Assigned Branch'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="lavender"
                size="sm"
                disabled={scanning}
                onClick={handleLowStockAutoScan}
                data-testid="reports-auto-po-sweep-btn"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {scanning ? 'Checking Minimums...' : 'Generate Auto-PO & Invoices'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="reports-export-csv-btn"
                onClick={handleExportCSV}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
            </div>
          </div>

          {/* Row 2: Connected Period & Date Range Strip */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 rounded-[var(--theme-radius-inner)] border border-border-theme/75 bg-surface-muted/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Window
              </span>
              <div className="inline-flex rounded-[var(--theme-radius-control)] border border-border-theme/80 bg-surface p-0.5 text-[11px]">
                {(['TODAY', '7D', '30D', '90D', 'YTD'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`min-h-[28px] rounded-[calc(var(--theme-radius-control)-3px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                      activePreset === preset
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <DateRangePicker
              fromDate={fromDate}
              toDate={toDate}
              align="end"
              onRangeChange={({ from, to, presetId }) => {
                setFromDate(from);
                setToDate(to);
                if (
                  presetId === 'TODAY' ||
                  presetId === '7D' ||
                  presetId === '30D' ||
                  presetId === '90D' ||
                  presetId === 'YTD'
                ) {
                  setActivePreset(presetId);
                } else {
                  setActivePreset('CUSTOM');
                }
              }}
            />
          </div>
        </div>

        {/* Progressive One-by-One Report Navigation Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full flex-wrap xl:grid xl:grid-cols-7 justify-start gap-1 p-1">
            {[
              { id: 'executive', label: 'Executive', icon: BarChart3, count: null, testid: 'reports-tab-executive' },
              { id: 'products', label: 'Products', icon: Package, count: data.product_report?.length ?? 0, testid: 'reports-tab-products' },
              { id: 'categories', label: 'Categories', icon: Layers, count: data.category_report?.length ?? 0, testid: 'reports-tab-categories' },
              { id: 'customers', label: 'Customers', icon: Users, count: data.customer_report?.length ?? 0, testid: 'reports-tab-customers' },
              { id: 'channels', label: 'Channels & Sales', icon: Building2, count: data.sales_invoices?.length ?? 0, testid: 'reports-tab-channels' },
              { id: 'procurement', label: 'Procurement & AP', icon: ShoppingBag, count: data.purchase_orders?.length ?? 0, testid: 'reports-tab-procurement' },
              { id: 'valuation', label: 'FIFO & Min', icon: Receipt, count: data.stock_valuation?.length ?? 0, testid: 'reports-tab-valuation' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  data-testid={item.testid}
                  className="gap-1.5 px-2.5 [&[data-state=active]>.tab-count]:bg-white/25 [&[data-state=active]>.tab-count]:text-white"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.label}</span>
                  {item.count !== null && (
                    <span className="tab-count rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums">
                      {item.count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="executive">
            <ExecutiveAnalysisTab data={data} onSelectTab={setTab} />
          </TabsContent>

          <TabsContent value="products">
            <ProductWiseReportTab rows={data.product_report || []} search={search} onResetSearch={() => setSearch('')} />
          </TabsContent>

          <TabsContent value="categories">
            <CategoryWiseReportTab rows={data.category_report || []} search={search} onResetSearch={() => setSearch('')} />
          </TabsContent>

          <TabsContent value="customers">
            <CustomerWiseReportTab rows={data.customer_report || []} search={search} onResetSearch={() => setSearch('')} />
          </TabsContent>

          <TabsContent value="channels">
            <ChannelsBreakdownTab
              branches={data.branch_report || []}
              cashiers={data.cashier_report || []}
              payments={data.payment_method_report || []}
              taxes={data.tax_report || []}
              salesInvoices={data.sales_invoices || []}
              search={search}
              onResetSearch={() => setSearch('')}
            />
          </TabsContent>

          <TabsContent value="procurement">
            <ProcurementAndSuppliersTab
              suppliers={data.supplier_report || []}
              purchaseOrders={data.purchase_orders || []}
              search={search}
              scanningAutoPO={scanning}
              onAutoPOScan={handleLowStockAutoScan}
              onResetSearch={() => setSearch('')}
              onMarkInvoicePaid={handleMarkInvoicePaid}
            />
          </TabsContent>

          <TabsContent value="valuation">
            <StockValuationTab rows={data.stock_valuation || []} search={search} onResetSearch={() => setSearch('')} />
          </TabsContent>
        </Tabs>
      </section>
      </div>

      <ReportsPrintSheet
        data={{
          ...data,
          sales_summary: ss,
          inventory_summary: is,
        }}
        activeTab={tab as ReportTabKey}
        fromDate={fromDate}
        toDate={toDate}
        selectedBranch={branchFilter}
        branches={branches}
        search={search}
      />
    </>
  );
}
