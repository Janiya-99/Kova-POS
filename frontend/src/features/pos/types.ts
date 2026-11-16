import type {
  CartItemMeta,
  LocalProduct,
  LocalTaxRule,
  LocalResolvedSetting,
  ProductUOMOption,
  ProductVariantOption,
} from '@/lib/dexie-db';
import type { OrderChannel } from './components/capabilities';

export type { CartItemMeta, ProductUOMOption, ProductVariantOption, OrderChannel };

export interface POSCategory {
  id: string;
  name: string;
  slug: string;
}

export interface POSBrand {
  id: string;
  business_id?: string;
  name: string;
  slug: string;
  country?: string;
  website?: string;
  logo_url?: string;
  description?: string;
  is_active?: boolean;
  product_count?: number;
  total_stock?: string | number;
}

export interface POSCustomer {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  avatar_url?: string;
  loyalty_tier?: string;
  loyalty_points: number;
  credit_enabled?: boolean;
  credit_limit?: string | number;
  is_walk_in?: boolean;
}

export interface HeldBillItemDTO {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  image_url: string;
  qty: string | number;
  unit_price: string | number;
  discount_percent: string | number;
  item_meta_json?: CartItemMeta | string | null;
}

export interface HeldBillEntryDTO {
  bill: {
    id: string;
    hold_code: string;
    customer_id?: string | null;
    customer_name: string;
    terminal_name: string;
    notes: string;
    order_channel?: OrderChannel | string;
    table_or_bay_label?: string;
    vehicle_plate?: string;
    kot_status?: string;
    grand_total: string | number;
    held_at: string;
  };
  items: HeldBillItemDTO[];
}

export interface POSBootstrapResponse {
  products: LocalProduct[];
  categories: POSCategory[];
  brands?: POSBrand[];
  customers: POSCustomer[];
  tax_rules: LocalTaxRule[];
  resolved_settings: LocalResolvedSetting[];
  held_bills: HeldBillEntryDTO[];
}

export interface CheckoutResponse {
  invoice_id: string;
  invoice_number: string;
  status: string;
  order_channel?: OrderChannel | string;
  order_meta?: Record<string, unknown>;
  warranty_terms?: string[];
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  total_cogs: string;
  change_given: string;
  points_earned?: number;
  tax_lines: Array<{
    code: string;
    name: string;
    tax_type: string;
    rate_percent: string;
    taxable_amount: string;
    tax_amount: string;
  }>;
  idempotent_hit: boolean;
  created_at: string;
}

/** Parse a JSONB column whether already decoded by sqlc json.RawMessage or encoded as a JSON string. */
export function parseJSONField<T>(raw: T | string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

