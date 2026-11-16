export interface SalesSummaryMetrics {
  paid_count: number;
  void_refund_count: number;
  gross_subtotal: string;
  total_discounts: string;
  total_taxes: string;
  net_revenue: string;
  total_cogs: string;
  gross_profit: string;
  margin_pct: string;
  refunded_amount?: string;
  avg_order_value?: string;
}

export interface InventorySummaryMetrics {
  total_skus: number;
  low_stock_skus: number;
  total_units: string;
  total_valuation: string;
  auto_po_count: number;
  purchase_inv_cnt: number;
  unpaid_ap_total?: string;
}

export interface DailyTrendPoint {
  day_date: string;
  invoice_count: number;
  units_sold: string;
  gross_subtotal: string;
  total_discounts: string;
  total_taxes: string;
  net_revenue: string;
  total_cogs: string;
  gross_profit: string;
  margin_pct: string;
}

export interface ProductReportRow {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  category_name: string;
  gender_segment: string;
  unit_of_measure: string;
  base_price: string;
  sale_price: string;
  reorder_point: string;
  invoice_count: number;
  units_sold: string;
  gross_sales: string;
  discount_amount: string;
  tax_amount: string;
  taxable_sales: string;
  net_revenue: string;
  total_cogs: string;
  gross_profit: string;
  margin_pct: string;
  avg_selling_price: string;
  revenue_share_pct: string;
  stock_on_hand: string;
  fifo_value: string;
  stock_status: 'HEALTHY' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface CategoryReportRow {
  id: string;
  name: string;
  slug: string;
  gender_segment: string;
  sku_count: number;
  invoice_count: number;
  units_sold: string;
  gross_sales: string;
  discount_amount: string;
  tax_amount: string;
  taxable_sales: string;
  net_revenue: string;
  total_cogs: string;
  gross_profit: string;
  margin_pct: string;
  revenue_share_pct: string;
  stock_on_hand: string;
  stock_valuation: string;
}

export interface CustomerReportRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: string;
  loyalty_points: number;
  credit_enabled: boolean;
  credit_limit: string;
  is_walk_in: boolean;
  paid_orders: number;
  refund_void_count: number;
  items_bought: string;
  subtotal_spent: string;
  discount_total: string;
  tax_total: string;
  total_spent: string;
  total_cogs: string;
  gross_profit: string;
  margin_pct: string;
  avg_order_value: string;
  spend_share_pct: string;
  last_purchase_at: string;
  customer_segment: 'High Value' | 'Repeat' | 'One-Time' | 'Dormant' | 'Walk-in' | string;
}

export interface PaymentMethodReportRow {
  payment_method: string;
  tx_count: number;
  total_collected: string;
  total_tendered: string;
  total_change: string;
  avg_ticket: string;
  share_pct: string;
}

export interface BranchReportRow {
  id: string;
  code: string;
  name: string;
  country_name: string;
  paid_count: number;
  void_refund_count: number;
  gross_subtotal: string;
  total_discounts: string;
  total_taxes: string;
  net_revenue: string;
  total_cogs: string;
  gross_profit: string;
  margin_pct: string;
  avg_order_value: string;
  revenue_share_pct: string;
  stock_units: string;
  stock_valuation: string;
}

export interface CashierReportRow {
  user_id: string;
  full_name: string;
  email: string;
  paid_count: number;
  void_refund_count: number;
  items_sold: string;
  total_discounts: string;
  net_revenue: string;
  total_cogs: string;
  gross_profit: string;
  margin_pct: string;
  avg_order_value: string;
  revenue_share_pct: string;
}

export interface TaxReportRow {
  tax_name: string;
  tax_type: string;
  rate_percent: string;
  invoice_count: number;
  taxable_base: string;
  tax_collected: string;
  share_pct: string;
}

export interface SupplierReportRow {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  payment_terms_days: number;
  po_count: number;
  auto_po_count: number;
  received_po_count: number;
  total_ordered: string;
  invoice_count: number;
  invoiced_total: string;
  paid_total: string;
  unpaid_total: string;
}

export interface SalesInvoiceReportRow {
  id: string;
  invoice_number: string;
  invoice_type: string;
  status: string;
  grand_total: string;
  tax_total: string;
  total_cogs: string;
  branch_id: string;
  branch_name: string;
  customer_name: string;
  cashier_name: string;
  payment_method: string;
  total_items: number;
  created_at: string;
}

export interface PurchaseOrderReportRow {
  id: string;
  po_number: string;
  branch_id: string;
  branch_name: string;
  supplier_name: string;
  status: string;
  auto_generated: boolean;
  total_amount: string;
  notes: string;
  created_at: string;
  invoice_id: string;
  invoice_number: string;
  invoice_status: string;
  invoice_grand_total: string;
  items: Array<{
    id: string;
    sku: string;
    product_name: string;
    ordered_qty: string;
    unit_cost: string;
    min_stock_threshold: string;
    stock_at_order: string;
  }>;
}

export interface StockValuationReportRow {
  id: string;
  sku: string;
  name: string;
  category_name: string;
  unit_of_measure: string;
  base_price: string;
  sale_price: string;
  reorder_point: string;
  reorder_qty: string;
  total_remaining: string;
  fifo_valuation: string;
  open_po_count: number;
}

export interface ReportsPayload {
  period: {
    from: string;
    to: string;
    branch_id?: string;
  };
  sales_summary: SalesSummaryMetrics;
  inventory_summary: InventorySummaryMetrics;
  daily_trend: DailyTrendPoint[];
  product_report: ProductReportRow[];
  category_report: CategoryReportRow[];
  customer_report: CustomerReportRow[];
  payment_method_report: PaymentMethodReportRow[];
  branch_report: BranchReportRow[];
  cashier_report: CashierReportRow[];
  tax_report: TaxReportRow[];
  supplier_report: SupplierReportRow[];
  sales_invoices: SalesInvoiceReportRow[];
  purchase_orders: PurchaseOrderReportRow[];
  purchase_invoices: Array<{
    id: string;
    invoice_number: string;
    po_number: string;
    branch_name: string;
    supplier_name: string;
    status: string;
    subtotal: string;
    tax_total: string;
    grand_total: string;
    due_date: string;
    auto_generated: boolean;
    notes: string;
    created_at: string;
  }>;
  stock_valuation: StockValuationReportRow[];
}

export function toReportNumber(val: string | number | null | undefined): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const parsed = Number.parseFloat(String(val ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sanitizeCsvCell(val: unknown): string {
  const raw = String(val ?? '');
  const trimmed = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${trimmed.replace(/"/g, '""')}"`;
}

export function exportTabularCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
) {
  const csvLines = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((r) => r.map(sanitizeCsvCell).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

