import * as React from 'react';
import { format } from 'date-fns';
import { formatLocalYMD, parseLocalYMD } from '@/components/ui/date-range-picker';
import { useCurrency } from '@/hooks/useCurrency';
import { formatDisplayLabel } from '@/lib/formatLabel';
import {
  getDisplayTradeName,
  useAuthStore,
  type BranchOption,
} from '@/store/authStore';
import { toReportNumber, type ReportsPayload } from './types';

export type ReportTabKey =
  | 'executive'
  | 'products'
  | 'categories'
  | 'customers'
  | 'channels'
  | 'procurement'
  | 'valuation';

const TAB_TITLES: Record<ReportTabKey, { title: string; subtitle: string }> = {
  executive: {
    title: 'Executive Financial & Operations Report',
    subtitle: 'Consolidated sales revenue, FIFO COGS, branch performance, tax liability & daily trajectory',
  },
  products: {
    title: 'Product Performance & Margin Report',
    subtitle: 'Complete SKU-level revenue, FIFO cost, gross margin, and stock status breakdown',
  },
  categories: {
    title: 'Category Contribution & Inventory Mix',
    subtitle: 'Category-wise net revenue share, margin yield, unit volume, and FIFO stock valuation',
  },
  customers: {
    title: 'Customer Intelligence & Spend Ledger',
    subtitle: 'Customer purchase frequency, loyalty tier distribution, discounts, and gross margin value',
  },
  channels: {
    title: 'Sales Channels & Transaction Register',
    subtitle: 'Payment tender distribution, branch comparison, tax summary, and complete invoice register',
  },
  procurement: {
    title: 'Procurement, Suppliers & Accounts Payable',
    subtitle: 'Supplier balances, automated & manual purchase orders, and vendor AP invoice schedule',
  },
  valuation: {
    title: 'FIFO Inventory Valuation & Replenishment Audit',
    subtitle: 'Full FIFO batch asset valuation, reorder thresholds, and open replenishment exposure',
  },
};

function fmtHumanDate(raw: string | undefined | null): string {
  const d = parseLocalYMD(raw);
  return d ? format(d, 'MMM dd, yyyy') : raw || '—';
}

function fmtTimestamp(raw: string | undefined | null): string {
  if (!raw) return '—';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return format(parsed, 'MMM dd, yyyy HH:mm');
}

function fmtQty(raw: string | number | undefined | null): string {
  const n = toReportNumber(raw);
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(raw: string | number | undefined | null): string {
  return `${toReportNumber(raw).toFixed(2)}%`;
}

function includesQuery(q: string, ...fields: Array<string | null | undefined>): boolean {
  if (!q) return true;
  return fields.some((f) => (f || '').toLowerCase().includes(q));
}

export interface ReportsPrintSheetProps {
  data: ReportsPayload;
  activeTab: ReportTabKey;
  fromDate: string;
  toDate: string;
  selectedBranch: string;
  branches: BranchOption[];
  search: string;
}

export function ReportsPrintSheet({
  data,
  activeTab,
  fromDate,
  toDate,
  selectedBranch,
  branches,
  search,
}: ReportsPrintSheetProps) {
  const { context, publicBranding } = useAuthStore();
  const { formatMoney, currencyCode } = useCurrency();

  const q = search.trim().toLowerCase();
  const tradeName = getDisplayTradeName(context, publicBranding);
  const branchObj =
    selectedBranch !== 'ALL' ? branches.find((b) => b.id === selectedBranch) : null;
  const branchScopeLabel = branchObj
    ? `${branchObj.name}${branchObj.code ? ` (${branchObj.code})` : ''}`
    : 'All Branches (Consolidated)';

  const meta = TAB_TITLES[activeTab] || TAB_TITLES.executive;
  const ss = data.sales_summary;
  const is = data.inventory_summary;

  const filteredProducts = React.useMemo(
    () =>
      (data.product_report || []).filter((r) =>
        includesQuery(q, r.sku, r.name, r.category_name, r.stock_status)
      ),
    [data.product_report, q]
  );

  const filteredCategories = React.useMemo(
    () =>
      (data.category_report || []).filter((r) =>
        includesQuery(q, r.name, r.slug, r.gender_segment)
      ),
    [data.category_report, q]
  );

  const filteredCustomers = React.useMemo(
    () =>
      (data.customer_report || []).filter((r) =>
        includesQuery(q, r.name, r.email, r.phone, r.tier, r.customer_segment)
      ),
    [data.customer_report, q]
  );

  const filteredInvoices = React.useMemo(
    () =>
      (data.sales_invoices || []).filter((r) =>
        includesQuery(
          q,
          r.invoice_number,
          r.customer_name,
          r.cashier_name,
          r.branch_name,
          r.payment_method,
          r.status
        )
      ),
    [data.sales_invoices, q]
  );

  const filteredSuppliers = React.useMemo(
    () =>
      (data.supplier_report || []).filter((r) =>
        includesQuery(q, r.name, r.code, r.email)
      ),
    [data.supplier_report, q]
  );

  const filteredPOs = React.useMemo(
    () =>
      (data.purchase_orders || []).filter((r) =>
        includesQuery(q, r.po_number, r.supplier_name, r.branch_name, r.status)
      ),
    [data.purchase_orders, q]
  );

  const filteredPurchaseInvoices = React.useMemo(
    () =>
      (data.purchase_invoices || []).filter((r) =>
        includesQuery(q, r.invoice_number, r.po_number, r.supplier_name, r.branch_name, r.status)
      ),
    [data.purchase_invoices, q]
  );

  const filteredValuation = React.useMemo(
    () =>
      (data.stock_valuation || []).filter((r) =>
        includesQuery(q, r.sku, r.name, r.category_name)
      ),
    [data.stock_valuation, q]
  );

  const generatedStamp = React.useMemo(() => {
    const now = new Date();
    return `${format(now, 'MMM dd, yyyy')} · ${format(now, 'HH:mm')}`;
  }, [data, activeTab, fromDate, toDate]);

  const logoUrl = context?.logo_light_url || context?.logo_receipt_url || publicBranding?.logo_light_url;

  return (
    <article
      aria-label="Printable full-page report"
      className="hidden print:block w-full bg-white text-slate-900 text-[11px] leading-[1.45] font-sans"
    >
      {/* Editorial Document Masthead */}
      <header className="border-b-2 border-slate-900 pb-4 mb-5 flex items-start justify-between gap-6">
        <div className="flex items-start gap-3 min-w-0">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={tradeName}
              className="h-10 w-10 rounded-md object-contain border border-slate-200 p-0.5 shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-bold tracking-tight text-slate-950">
                {tradeName}
              </span>
              <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
                {currencyCode}
              </span>
            </div>
            {context?.business_name && context.business_name !== tradeName && (
              <p className="text-[10.5px] text-slate-600">{context.business_name}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
              <span>Scope: <strong className="font-semibold text-slate-800">{branchScopeLabel}</strong></span>
              {context?.tax_registration_no && (
                <span>Tax ID: <strong className="font-semibold text-slate-800">{context.tax_registration_no}</strong></span>
              )}
              <span>Printed: <strong className="font-semibold text-slate-800">{generatedStamp}</strong></span>
            </div>
          </div>
        </div>

        <div className="text-right shrink-0 max-w-[340px]">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-700">
            Official Enterprise Statement
          </p>
          <h1 className="text-[15px] font-bold tracking-tight text-slate-950 mt-0.5">
            {meta.title}
          </h1>
          <p className="text-[10px] text-slate-500 mt-0.5">{meta.subtitle}</p>
          <div className="mt-2 inline-flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-800 tabular-nums">
            <span>Period: {fmtHumanDate(fromDate || formatLocalYMD(new Date()))} — {fmtHumanDate(toDate || formatLocalYMD(new Date()))}</span>
          </div>
          {q && (
            <p className="mt-1 text-[9.5px] text-slate-600">
              Filtered by search: <span className="font-semibold text-slate-900">“{search.trim()}”</span>
            </p>
          )}
        </div>
      </header>

      {/* Symmetrical 4-Column Executive KPI Strip (Always 4 columns on print paper) */}
      <section className="grid grid-cols-4 gap-3 mb-5 break-inside-avoid">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Net Sales Revenue
          </p>
          <p className="mt-1 text-[15px] font-bold text-slate-950 tabular-nums">
            {formatMoney(ss.net_revenue)}
          </p>
          <p className="mt-0.5 text-[9.5px] text-slate-600 tabular-nums">
            {ss.paid_count} paid · AOV {formatMoney(ss.avg_order_value || '0')}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Gross Profit & Margin
          </p>
          <p className="mt-1 text-[15px] font-bold text-slate-950 tabular-nums">
            {formatMoney(ss.gross_profit)}
          </p>
          <p className="mt-0.5 text-[9.5px] text-emerald-700 font-medium tabular-nums">
            {fmtPct(ss.margin_pct)} margin · COGS {formatMoney(ss.total_cogs)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            Taxes & Discounts
          </p>
          <p className="mt-1 text-[15px] font-bold text-slate-950 tabular-nums">
            {formatMoney(ss.total_taxes)}
          </p>
          <p className="mt-0.5 text-[9.5px] text-slate-600 tabular-nums">
            Disc {formatMoney(ss.total_discounts)} · Void/Ref {ss.void_refund_count}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            FIFO Asset & Unpaid AP
          </p>
          <p className="mt-1 text-[15px] font-bold text-slate-950 tabular-nums">
            {formatMoney(is.total_valuation)}
          </p>
          <p className="mt-0.5 text-[9.5px] text-slate-600 tabular-nums">
            {fmtQty(is.total_units)} units · AP {formatMoney(is.unpaid_ap_total || '0')}
          </p>
        </div>
      </section>

      {/* TAB 1: EXECUTIVE CONSOLIDATED STATEMENT */}
      {activeTab === 'executive' && (
        <div className="space-y-5">
          {/* Row 1: Revenue Waterfall + Payment Channels (Symmetrical 2-column grid) */}
          <section className="grid grid-cols-2 gap-4 break-inside-avoid">
            <div className="rounded-lg border border-slate-200 p-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1.5 mb-2">
                Income & Margin Waterfall
              </h2>
              <table className="w-full text-[10.5px]">
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-1.5 text-slate-600">Gross Merchandise Sales</td>
                    <td className="py-1.5 text-right font-medium text-slate-900 tabular-nums">
                      {formatMoney(ss.gross_subtotal)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-600">Discounts & Markdowns</td>
                    <td className="py-1.5 text-right font-medium text-rose-700 tabular-nums">
                      -{formatMoney(ss.total_discounts)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-600">Taxes Collected (VAT / SSCL / Sales)</td>
                    <td className="py-1.5 text-right font-medium text-slate-900 tabular-nums">
                      {formatMoney(ss.total_taxes)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/80 font-semibold">
                    <td className="py-1.5 text-slate-900">Net Sales Revenue</td>
                    <td className="py-1.5 text-right text-slate-950 tabular-nums">
                      {formatMoney(ss.net_revenue)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-600">FIFO Cost of Goods Sold (COGS)</td>
                    <td className="py-1.5 text-right font-medium text-slate-900 tabular-nums">
                      -{formatMoney(ss.total_cogs)}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-300 font-bold">
                    <td className="py-2 text-slate-950">
                      Gross Profit ({fmtPct(ss.margin_pct)})
                    </td>
                    <td className="py-2 text-right text-emerald-700 tabular-nums">
                      {formatMoney(ss.gross_profit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1.5 mb-2">
                Payment Tender Distribution
              </h2>
              {(data.payment_method_report || []).length === 0 ? (
                <p className="py-6 text-center text-[10px] text-slate-500">
                  No payment tender activity recorded in this period.
                </p>
              ) : (
                <table className="w-full text-[10.5px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[9.5px] font-semibold uppercase text-slate-500">
                      <th className="py-1">Method</th>
                      <th className="py-1 text-right">Txns</th>
                      <th className="py-1 text-right">Share</th>
                      <th className="py-1 text-right">Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.payment_method_report.map((pm) => (
                      <tr key={pm.payment_method}>
                        <td className="py-1.5 font-medium text-slate-900">
                          {formatDisplayLabel(pm.payment_method)}
                        </td>
                        <td className="py-1.5 text-right text-slate-600 tabular-nums">{pm.tx_count}</td>
                        <td className="py-1.5 text-right text-slate-600 tabular-nums">{fmtPct(pm.share_pct)}</td>
                        <td className="py-1.5 text-right font-semibold text-slate-950 tabular-nums">
                          {formatMoney(pm.total_collected)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Row 2: Branch Performance + Tax Schedule */}
          <section className="grid grid-cols-2 gap-4 break-inside-avoid">
            <div className="rounded-lg border border-slate-200 p-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1.5 mb-2">
                Branch & Warehouse Snapshot
              </h2>
              {(data.branch_report || []).length === 0 ? (
                <p className="py-6 text-center text-[10px] text-slate-500">No branch records available.</p>
              ) : (
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[9px] font-semibold uppercase text-slate-500">
                      <th className="py-1">Branch</th>
                      <th className="py-1 text-right">Paid</th>
                      <th className="py-1 text-right">Net Sales</th>
                      <th className="py-1 text-right">FIFO Val</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.branch_report.map((b) => (
                      <tr key={b.id}>
                        <td className="py-1.5 font-medium text-slate-900">{b.name}</td>
                        <td className="py-1.5 text-right text-slate-600 tabular-nums">{b.paid_count}</td>
                        <td className="py-1.5 text-right font-medium text-slate-900 tabular-nums">
                          {formatMoney(b.net_revenue)}
                        </td>
                        <td className="py-1.5 text-right text-slate-700 tabular-nums">
                          {formatMoney(b.stock_valuation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1.5 mb-2">
                Tax Compliance Schedule
              </h2>
              {(data.tax_report || []).length === 0 ? (
                <p className="py-6 text-center text-[10px] text-slate-500">
                  No tax charges collected in selected period.
                </p>
              ) : (
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[9px] font-semibold uppercase text-slate-500">
                      <th className="py-1">Tax Component</th>
                      <th className="py-1 text-right">Rate</th>
                      <th className="py-1 text-right">Base</th>
                      <th className="py-1 text-right">Tax Amt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.tax_report.map((t, idx) => (
                      <tr key={`${t.tax_name}-${idx}`}>
                        <td className="py-1.5 font-medium text-slate-900">{formatDisplayLabel(t.tax_name)}</td>
                        <td className="py-1.5 text-right text-slate-600 tabular-nums">{fmtPct(t.rate_percent)}</td>
                        <td className="py-1.5 text-right text-slate-700 tabular-nums">{formatMoney(t.taxable_base)}</td>
                        <td className="py-1.5 text-right font-semibold text-slate-950 tabular-nums">
                          {formatMoney(t.tax_collected)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Row 3: Daily Revenue & Profit Trajectory */}
          <section>
            <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
                Daily Revenue & Gross Profit Trajectory
              </h2>
              <span className="text-[9.5px] text-slate-500 tabular-nums">
                {(data.daily_trend || []).length} day(s) with activity
              </span>
            </div>
            {(data.daily_trend || []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-5 text-center text-[10.5px] text-slate-500">
                No paid POS sales transactions occurred in {fmtHumanDate(fromDate)} — {fmtHumanDate(toDate)}.
              </p>
            ) : (
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50 text-left text-[9px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="py-1.5 px-2">Date</th>
                    <th className="py-1.5 px-2 text-right">Invoices</th>
                    <th className="py-1.5 px-2 text-right">Units</th>
                    <th className="py-1.5 px-2 text-right">Gross Sales</th>
                    <th className="py-1.5 px-2 text-right">Discounts</th>
                    <th className="py-1.5 px-2 text-right">Taxes</th>
                    <th className="py-1.5 px-2 text-right">Net Revenue</th>
                    <th className="py-1.5 px-2 text-right">FIFO COGS</th>
                    <th className="py-1.5 px-2 text-right">Gross Profit</th>
                    <th className="py-1.5 px-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.daily_trend.map((pt) => (
                    <tr key={pt.day_date}>
                      <td className="py-1.5 px-2 font-medium text-slate-900 tabular-nums">
                        {fmtHumanDate(pt.day_date)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{pt.invoice_count}</td>
                      <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{fmtQty(pt.units_sold)}</td>
                      <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{formatMoney(pt.gross_subtotal)}</td>
                      <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{formatMoney(pt.total_discounts)}</td>
                      <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{formatMoney(pt.total_taxes)}</td>
                      <td className="py-1.5 px-2 text-right font-semibold text-slate-950 tabular-nums">
                        {formatMoney(pt.net_revenue)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{formatMoney(pt.total_cogs)}</td>
                      <td className="py-1.5 px-2 text-right font-semibold text-emerald-700 tabular-nums">
                        {formatMoney(pt.gross_profit)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{fmtPct(pt.margin_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Row 4: Category Summary + Cashier Summary */}
          {filteredCategories.length > 0 && (
            <section>
              <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
                  Category Performance & Stock Valuation
                </h2>
                <span className="text-[9.5px] text-slate-500">{filteredCategories.length} categories</span>
              </div>
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50 text-left text-[9px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="py-1.5 px-2">Category</th>
                    <th className="py-1.5 px-2 text-right">SKUs</th>
                    <th className="py-1.5 px-2 text-right">Units Sold</th>
                    <th className="py-1.5 px-2 text-right">Net Revenue</th>
                    <th className="py-1.5 px-2 text-right">Share</th>
                    <th className="py-1.5 px-2 text-right">Gross Profit</th>
                    <th className="py-1.5 px-2 text-right">On Hand</th>
                    <th className="py-1.5 px-2 text-right">FIFO Valuation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredCategories.map((c) => (
                    <tr key={c.id}>
                      <td className="py-1.5 px-2 font-medium text-slate-900">{c.name}</td>
                      <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{c.sku_count}</td>
                      <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{fmtQty(c.units_sold)}</td>
                      <td className="py-1.5 px-2 text-right font-semibold text-slate-950 tabular-nums">
                        {formatMoney(c.net_revenue)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{fmtPct(c.revenue_share_pct)}</td>
                      <td className="py-1.5 px-2 text-right font-medium text-emerald-700 tabular-nums">
                        {formatMoney(c.gross_profit)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{fmtQty(c.stock_on_hand)}</td>
                      <td className="py-1.5 px-2 text-right font-semibold text-slate-900 tabular-nums">
                        {formatMoney(c.stock_valuation)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}

      {/* TAB 2: PRODUCTS REPORT (FULL UNPAGINATED TABLE) */}
      {activeTab === 'products' && (
        <section>
          <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
              Complete Product Ledger ({filteredProducts.length} SKUs)
            </h2>
          </div>
          <table className="w-full text-[9.5px] border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 text-left text-[8.5px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-1.5 px-1.5">SKU / Product</th>
                <th className="py-1.5 px-1.5">Category</th>
                <th className="py-1.5 px-1.5 text-right">Sold</th>
                <th className="py-1.5 px-1.5 text-right">Net Rev</th>
                <th className="py-1.5 px-1.5 text-right">COGS</th>
                <th className="py-1.5 px-1.5 text-right">Profit</th>
                <th className="py-1.5 px-1.5 text-right">Margin</th>
                <th className="py-1.5 px-1.5 text-right">Stock</th>
                <th className="py-1.5 px-1.5 text-right">FIFO Value</th>
                <th className="py-1.5 px-1.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProducts.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 px-1.5">
                    <div className="font-semibold text-slate-900">{r.name}</div>
                    <div className="text-[8.5px] text-slate-500 font-mono">{r.sku}</div>
                  </td>
                  <td className="py-1.5 px-1.5 text-slate-600">{r.category_name || '—'}</td>
                  <td className="py-1.5 px-1.5 text-right text-slate-700 tabular-nums">{fmtQty(r.units_sold)}</td>
                  <td className="py-1.5 px-1.5 text-right font-semibold text-slate-950 tabular-nums">
                    {formatMoney(r.net_revenue)}
                  </td>
                  <td className="py-1.5 px-1.5 text-right text-slate-600 tabular-nums">{formatMoney(r.total_cogs)}</td>
                  <td className="py-1.5 px-1.5 text-right font-semibold text-emerald-700 tabular-nums">
                    {formatMoney(r.gross_profit)}
                  </td>
                  <td className="py-1.5 px-1.5 text-right text-slate-700 tabular-nums">{fmtPct(r.margin_pct)}</td>
                  <td className="py-1.5 px-1.5 text-right text-slate-700 tabular-nums">{fmtQty(r.stock_on_hand)}</td>
                  <td className="py-1.5 px-1.5 text-right font-medium text-slate-900 tabular-nums">
                    {formatMoney(r.fifo_value)}
                  </td>
                  <td className="py-1.5 px-1.5 text-right text-[8.5px] font-semibold uppercase text-slate-700">
                    {formatDisplayLabel(r.stock_status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* TAB 3: CATEGORIES REPORT */}
      {activeTab === 'categories' && (
        <section>
          <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
              Category Performance Breakdown ({filteredCategories.length} Categories)
            </h2>
          </div>
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 text-left text-[9px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-1.5 px-2">Category</th>
                <th className="py-1.5 px-2">Segment</th>
                <th className="py-1.5 px-2 text-right">SKUs</th>
                <th className="py-1.5 px-2 text-right">Units Sold</th>
                <th className="py-1.5 px-2 text-right">Net Revenue</th>
                <th className="py-1.5 px-2 text-right">Share</th>
                <th className="py-1.5 px-2 text-right">COGS</th>
                <th className="py-1.5 px-2 text-right">Gross Profit</th>
                <th className="py-1.5 px-2 text-right">Margin</th>
                <th className="py-1.5 px-2 text-right">FIFO Asset</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCategories.map((c) => (
                <tr key={c.id}>
                  <td className="py-1.5 px-2 font-semibold text-slate-900">{c.name}</td>
                  <td className="py-1.5 px-2 text-slate-600">{formatDisplayLabel(c.gender_segment || 'General')}</td>
                  <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{c.sku_count}</td>
                  <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{fmtQty(c.units_sold)}</td>
                  <td className="py-1.5 px-2 text-right font-semibold text-slate-950 tabular-nums">
                    {formatMoney(c.net_revenue)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{fmtPct(c.revenue_share_pct)}</td>
                  <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{formatMoney(c.total_cogs)}</td>
                  <td className="py-1.5 px-2 text-right font-semibold text-emerald-700 tabular-nums">
                    {formatMoney(c.gross_profit)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{fmtPct(c.margin_pct)}</td>
                  <td className="py-1.5 px-2 text-right font-semibold text-slate-900 tabular-nums">
                    {formatMoney(c.stock_valuation)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* TAB 4: CUSTOMERS REPORT */}
      {activeTab === 'customers' && (
        <section>
          <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
              Customer Spending & Retention Register ({filteredCustomers.length} Accounts)
            </h2>
          </div>
          <table className="w-full text-[9.5px] border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 text-left text-[8.5px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-1.5 px-2">Customer</th>
                <th className="py-1.5 px-2">Contact</th>
                <th className="py-1.5 px-2">Segment / Tier</th>
                <th className="py-1.5 px-2 text-right">Orders</th>
                <th className="py-1.5 px-2 text-right">Items</th>
                <th className="py-1.5 px-2 text-right">Discounts</th>
                <th className="py-1.5 px-2 text-right">Total Spent</th>
                <th className="py-1.5 px-2 text-right">AOV</th>
                <th className="py-1.5 px-2 text-right">Gross Profit</th>
                <th className="py-1.5 px-2 text-right">Last Visit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCustomers.map((c) => (
                <tr key={c.id}>
                  <td className="py-1.5 px-2 font-semibold text-slate-900">{c.name}</td>
                  <td className="py-1.5 px-2 text-slate-600">{c.phone || c.email || 'Walk-in'}</td>
                  <td className="py-1.5 px-2 text-slate-700">
                    {c.customer_segment} · {formatDisplayLabel(c.tier)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{c.paid_orders}</td>
                  <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{fmtQty(c.items_bought)}</td>
                  <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{formatMoney(c.discount_total)}</td>
                  <td className="py-1.5 px-2 text-right font-semibold text-slate-950 tabular-nums">
                    {formatMoney(c.total_spent)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{formatMoney(c.avg_order_value)}</td>
                  <td className="py-1.5 px-2 text-right font-medium text-emerald-700 tabular-nums">
                    {formatMoney(c.gross_profit)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">
                    {c.last_purchase_at ? fmtTimestamp(c.last_purchase_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* TAB 5: CHANNELS & SALES REGISTER */}
      {activeTab === 'channels' && (
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-4 break-inside-avoid">
            <div className="rounded-lg border border-slate-200 p-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1.5 mb-2">
                Payment Tender Channels
              </h2>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[9px] font-semibold uppercase text-slate-500">
                    <th className="py-1">Method</th>
                    <th className="py-1 text-right">Txns</th>
                    <th className="py-1 text-right">Avg Ticket</th>
                    <th className="py-1 text-right">Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.payment_method_report || []).map((pm) => (
                    <tr key={pm.payment_method}>
                      <td className="py-1.5 font-medium text-slate-900">{formatDisplayLabel(pm.payment_method)}</td>
                      <td className="py-1.5 text-right text-slate-600 tabular-nums">{pm.tx_count}</td>
                      <td className="py-1.5 text-right text-slate-700 tabular-nums">{formatMoney(pm.avg_ticket)}</td>
                      <td className="py-1.5 text-right font-semibold text-slate-950 tabular-nums">
                        {formatMoney(pm.total_collected)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1.5 mb-2">
                Cashier Performance Summary
              </h2>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[9px] font-semibold uppercase text-slate-500">
                    <th className="py-1">Cashier</th>
                    <th className="py-1 text-right">Paid</th>
                    <th className="py-1 text-right">Net Rev</th>
                    <th className="py-1 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.cashier_report || []).map((ch) => (
                    <tr key={ch.user_id}>
                      <td className="py-1.5 font-medium text-slate-900">{ch.full_name}</td>
                      <td className="py-1.5 text-right text-slate-600 tabular-nums">{ch.paid_count}</td>
                      <td className="py-1.5 text-right font-semibold text-slate-950 tabular-nums">
                        {formatMoney(ch.net_revenue)}
                      </td>
                      <td className="py-1.5 text-right text-emerald-700 tabular-nums">
                        {formatMoney(ch.gross_profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
                POS Sales Invoice Register ({filteredInvoices.length} Invoices)
              </h2>
            </div>
            {filteredInvoices.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-5 text-center text-[10px] text-slate-500">
                No POS sales invoices match the selected filters.
              </p>
            ) : (
              <table className="w-full text-[9.5px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50 text-left text-[8.5px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="py-1.5 px-1.5">Invoice #</th>
                    <th className="py-1.5 px-1.5">Date / Time</th>
                    <th className="py-1.5 px-1.5">Branch</th>
                    <th className="py-1.5 px-1.5">Customer</th>
                    <th className="py-1.5 px-1.5">Method</th>
                    <th className="py-1.5 px-1.5">Status</th>
                    <th className="py-1.5 px-1.5 text-right">Tax</th>
                    <th className="py-1.5 px-1.5 text-right">COGS</th>
                    <th className="py-1.5 px-1.5 text-right">Grand Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-1.5 px-1.5 font-mono font-semibold text-slate-900">{inv.invoice_number}</td>
                      <td className="py-1.5 px-1.5 text-slate-600 tabular-nums">{fmtTimestamp(inv.created_at)}</td>
                      <td className="py-1.5 px-1.5 text-slate-700">{inv.branch_name}</td>
                      <td className="py-1.5 px-1.5 text-slate-800">{inv.customer_name || 'Walk-in Customer'}</td>
                      <td className="py-1.5 px-1.5 text-slate-600">{formatDisplayLabel(inv.payment_method)}</td>
                      <td className="py-1.5 px-1.5 text-slate-700 font-medium">{formatDisplayLabel(inv.status)}</td>
                      <td className="py-1.5 px-1.5 text-right text-slate-600 tabular-nums">{formatMoney(inv.tax_total)}</td>
                      <td className="py-1.5 px-1.5 text-right text-slate-600 tabular-nums">{formatMoney(inv.total_cogs)}</td>
                      <td className="py-1.5 px-1.5 text-right font-semibold text-slate-950 tabular-nums">
                        {formatMoney(inv.grand_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {/* TAB 6: PROCUREMENT & AP */}
      {activeTab === 'procurement' && (
        <div className="space-y-5">
          <section>
            <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
                Supplier Ledger & Unpaid Accounts Payable ({filteredSuppliers.length})
              </h2>
            </div>
            <table className="w-full text-[9.5px] border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-50 text-left text-[8.5px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-1.5 px-2">Supplier</th>
                  <th className="py-1.5 px-2 text-right">Terms</th>
                  <th className="py-1.5 px-2 text-right">POs</th>
                  <th className="py-1.5 px-2 text-right">Ordered Total</th>
                  <th className="py-1.5 px-2 text-right">Invoiced</th>
                  <th className="py-1.5 px-2 text-right">Paid</th>
                  <th className="py-1.5 px-2 text-right">Unpaid AP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredSuppliers.map((sup) => (
                  <tr key={sup.id}>
                    <td className="py-1.5 px-2">
                      <span className="font-semibold text-slate-900">{sup.name}</span>
                      <span className="ml-1.5 text-[8.5px] text-slate-500 font-mono">{sup.code}</span>
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{sup.payment_terms_days}d</td>
                    <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{sup.po_count}</td>
                    <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{formatMoney(sup.total_ordered)}</td>
                    <td className="py-1.5 px-2 text-right text-slate-800 tabular-nums">{formatMoney(sup.invoiced_total)}</td>
                    <td className="py-1.5 px-2 text-right text-emerald-700 tabular-nums">{formatMoney(sup.paid_total)}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-slate-950 tabular-nums">
                      {formatMoney(sup.unpaid_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
                Purchase Orders & Vendor Invoices ({filteredPOs.length} POs · {filteredPurchaseInvoices.length} Invoices)
              </h2>
            </div>
            <table className="w-full text-[9.5px] border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-50 text-left text-[8.5px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-1.5 px-2">PO #</th>
                  <th className="py-1.5 px-2">Created</th>
                  <th className="py-1.5 px-2">Branch</th>
                  <th className="py-1.5 px-2">Supplier</th>
                  <th className="py-1.5 px-2">Status</th>
                  <th className="py-1.5 px-2">Linked Invoice</th>
                  <th className="py-1.5 px-2 text-right">PO Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPOs.map((po) => (
                  <tr key={po.id}>
                    <td className="py-1.5 px-2 font-mono font-semibold text-slate-900">
                      {po.po_number}
                      {po.auto_generated && (
                        <span className="ml-1 rounded border border-slate-300 px-1 text-[8px] font-sans uppercase text-slate-600">
                          Auto
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-slate-600 tabular-nums">{fmtTimestamp(po.created_at)}</td>
                    <td className="py-1.5 px-2 text-slate-700">{po.branch_name}</td>
                    <td className="py-1.5 px-2 text-slate-800">{po.supplier_name}</td>
                    <td className="py-1.5 px-2 font-medium text-slate-700">{formatDisplayLabel(po.status)}</td>
                    <td className="py-1.5 px-2 text-slate-600 font-mono">
                      {po.invoice_number ? `${po.invoice_number} (${formatDisplayLabel(po.invoice_status)})` : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-semibold text-slate-950 tabular-nums">
                      {formatMoney(po.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* TAB 7: FIFO STOCK VALUATION */}
      {activeTab === 'valuation' && (
        <section>
          <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
              FIFO Stock Asset Valuation ({filteredValuation.length} SKUs)
            </h2>
          </div>
          <table className="w-full text-[9.5px] border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 text-left text-[8.5px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-1.5 px-2">SKU / Product</th>
                <th className="py-1.5 px-2">Category</th>
                <th className="py-1.5 px-2 text-right">On Hand</th>
                <th className="py-1.5 px-2 text-right">Reorder Pt</th>
                <th className="py-1.5 px-2 text-right">Open POs</th>
                <th className="py-1.5 px-2 text-right">Sale Price</th>
                <th className="py-1.5 px-2 text-right">FIFO Asset Valuation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredValuation.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 px-2">
                    <span className="font-semibold text-slate-900">{r.name}</span>
                    <span className="ml-1.5 text-[8.5px] text-slate-500 font-mono">{r.sku}</span>
                  </td>
                  <td className="py-1.5 px-2 text-slate-600">{r.category_name || '—'}</td>
                  <td className="py-1.5 px-2 text-right font-medium text-slate-900 tabular-nums">
                    {fmtQty(r.total_remaining)} {r.unit_of_measure}
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{fmtQty(r.reorder_point)}</td>
                  <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums">{r.open_po_count}</td>
                  <td className="py-1.5 px-2 text-right text-slate-700 tabular-nums">{formatMoney(r.sale_price)}</td>
                  <td className="py-1.5 px-2 text-right font-semibold text-slate-950 tabular-nums">
                    {formatMoney(r.fifo_valuation)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Executive Audit & Sign-Off Footer */}
      <footer className="mt-8 pt-3 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-500 break-inside-avoid">
        <div>
          <p className="font-semibold text-slate-700">
            {tradeName} · {branchScopeLabel}
          </p>
          <p>
            Verified from immutable PostgreSQL ACID GL &amp; FIFO inventory batch records · All monetary figures in {currencyCode}.
          </p>
        </div>
        <div className="text-right tabular-nums">
          <p>Prepared by: {context?.full_name || 'Authorized Operator'}</p>
          <p>{context?.role_name ? formatDisplayLabel(context.role_name) : 'Enterprise ERP'} · {generatedStamp}</p>
        </div>
      </footer>
    </article>
  );
}

