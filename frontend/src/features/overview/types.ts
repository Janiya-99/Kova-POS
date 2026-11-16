export type OverviewPeriod = 'day' | 'week' | 'month' | 'year';

export type OverviewRolePersona =
  | 'EXECUTIVE'
  | 'BRANCH_MANAGER'
  | 'CASHIER'
  | 'ACCOUNTANT'
  | 'INVENTORY'
  | 'LIMITED';

export interface OverviewCapabilities {
  can_view_gl: boolean;
  can_view_profit: boolean;
  can_view_tax_detail: boolean;
  can_view_inventory: boolean;
  can_view_pos: boolean;
  can_view_customers: boolean;
  can_view_catalog: boolean;
  can_view_print: boolean;
  can_export_reports: boolean;
  can_switch_branch: boolean;
  can_manage_settings: boolean;
}

export interface OverviewKPI {
  total_customers: number;
  period_unique_customers: number;
  customers_growth_pct: number;
  customers_last_period: number;
  men_share_pct: number;
  women_share_pct: number;
  total_revenue: string;
  revenue_growth_pct: number;
  revenue_last_period: string;
  total_orders_amount: string;
  orders_growth_pct: number;
  orders_last_period_amount: string;
  orders_last_period_count: number;
  live_paid_orders: number;
  refund_void_count: number;
  live_paid_revenue: string;
  average_order_value: string;
  prev_average_order_value: string;
  units_sold: number;
  units_returned: number;
  held_bill_count: number;
  held_bill_total: string;
  total_taxes?: string;
  total_discounts?: string;
  gross_subtotal?: string;
  total_cogs?: string;
  gross_profit?: string;
  gross_margin_pct?: string;
}

export interface SalesAnalyticsPoint {
  month: string;
  label: string;
  women: number;
  men: number;
  sold: number;
  returned: number;
  revenue: number;
  orders: number;
  active?: boolean;
  cogs?: number;
  taxes?: number;
}

export interface RevenueBarPoint {
  day: string;
  value: number;
  orders: number;
  active?: boolean;
}

export interface OrderSparkPoint {
  label: string;
  value: number;
  orders: number;
}

export interface PaymentMixItem {
  payment_method: string;
  tx_count: number;
  total_collected: string;
  share_pct: string;
}

export interface CategoryMixItem {
  id: string;
  category_name: string;
  gender_segment: string;
  units_sold: number;
  revenue: string;
}

export interface CountrySalesPoint {
  country_code: string;
  country_name: string;
  revenue: string;
  percentage: number;
  color: string;
}

export interface RecentActivityItem {
  id: string;
  invoice_number: string;
  status: string;
  invoice_type: string;
  grand_total: string;
  order_channel: string;
  created_at: string;
  branch_name: string;
  cashier_name: string;
  customer_name: string;
  customer_avatar: string;
  payment_method: string;
  total_items: number;
  preview_image_url: string;
  preview_product_name: string;
  item_images: string[];
  tax_total?: string;
}

export interface HeldOrderItem {
  id: string;
  hold_code: string;
  notes: string;
  order_channel: string;
  table_or_bay_label: string;
  vehicle_plate: string;
  kot_status: string;
  grand_total: string;
  held_at: string;
  terminal_name: string;
  branch_name: string;
  cashier_name: string;
  customer_name: string;
  customer_avatar: string;
  item_count: number;
  preview_product_name: string;
  item_images: string[];
}

export interface ProductSalesItem {
  id: string;
  sku: string;
  name: string;
  category_name: string;
  image_url: string;
  base_price: string;
  sale_price: string;
  discount_percent: string;
  reorder_point: number;
  total_stock: number;
  units_sold: number;
  revenue: string;
  fifo_valuation?: string;
}

export interface InventorySummary {
  active_sku_count: number;
  low_stock_count: number;
  total_stock_units: string;
  total_fifo_valuation: string;
  open_po_count: number;
}

export interface LowStockAlertItem {
  id: string;
  sku: string;
  name: string;
  image_url: string;
  category_name: string;
  reorder_point: number;
  reorder_qty: number;
  total_stock: string;
  open_po_count: number;
}

export interface GLSummary {
  period_journal_count: number;
  period_total_debits: string;
  open_fiscal_period_count: number;
  current_fiscal_period_name: string;
}

export interface JournalEntrySummary {
  id: string;
  entry_number: string;
  source_type: string;
  description: string;
  entry_date: string;
  created_at: string;
  total_debit: string;
  total_credit: string;
  is_balanced: boolean;
}

export interface TaxBreakdownItem {
  tax_name: string;
  tax_type: string;
  rate_percent: string;
  invoice_count: number;
  taxable_base: string;
  tax_collected: string;
}

export interface OverviewResponse {
  period: OverviewPeriod;
  period_label: string;
  prev_period_label: string;
  from: string;
  to: string;
  role_persona: OverviewRolePersona;
  role_code: string;
  role_name: string;
  branch_scope: string;
  capabilities: OverviewCapabilities;
  kpi: OverviewKPI;
  sales_analytics: SalesAnalyticsPoint[];
  revenue_bars: RevenueBarPoint[];
  order_sparkline: OrderSparkPoint[];
  payment_mix: PaymentMixItem[];
  category_mix: CategoryMixItem[];
  top_countries: CountrySalesPoint[];
  recent_activity: RecentActivityItem[];
  held_orders: HeldOrderItem[];
  product_sales: ProductSalesItem[];
  inventory_summary?: InventorySummary;
  low_stock_alerts: LowStockAlertItem[];
  gl_summary?: GLSummary;
  recent_journals: JournalEntrySummary[];
  tax_breakdown: TaxBreakdownItem[];
}
