import Dexie, { type Table } from 'dexie';
import { v7 as uuidv7 } from 'uuid';

export interface ProductVariantOption {
  sku?: string;
  size?: string;
  color?: string;
  label?: string;
  price_delta?: string | number;
  stock?: number;
}

export interface ProductUOMOption {
  label: string;
  factor: string | number;
  price_override?: string | number;
}

export interface CartItemMeta {
  variant?: string;
  modifiers?: string[];
  serial_imei?: string;
  uom_label?: string;
  uom_factor?: string | number;
  notes?: string;
}

export interface LocalProduct {
  id: string;
  business_id: string;
  category_id: string;
  category_name: string;
  gender_segment: string;
  effective_tax_group_id?: string | null;
  sku: string;
  name: string;
  description: string;
  unit_of_measure?: string;
  image_url: string;
  image_urls?: string[];
  base_price: string;
  sale_price: string;
  discount_percent: string;
  reorder_point?: string;
  reorder_qty?: string;
  allow_negative_stock?: boolean | null;
  is_archived?: boolean;
  primary_barcode: string;
  branch_stock: string;
  enable_serial_tracking?: boolean;
  is_service_labor?: boolean;
  allow_fractional_qty?: boolean;
  variants_json?: ProductVariantOption[] | string;
  modifiers_json?: string[] | string;
  uom_options_json?: ProductUOMOption[] | string;
  warranty_terms?: string;
}

export interface LocalFIFOBatch {
  id: string;
  product_id: string;
  batch_number: string;
  unit_cost: string;
  remaining_qty: string;
}

export interface LocalTaxRule {
  id: string;
  tax_group_id: string;
  code: string;
  name: string;
  tax_type: 'EXCLUSIVE' | 'INCLUSIVE' | 'COMPOUND';
  rate_percent: string;
  priority: number;
}

export interface LocalResolvedSetting {
  key: string;
  effective_json: string;
  inherited_from: string;
}

export interface LocalSuspendedBill {
  id: string;
  hold_code: string;
  customer_id?: string | null;
  customer_name: string;
  notes: string;
  order_channel?: string;
  table_or_bay_label?: string;
  vehicle_plate?: string;
  kot_status?: string;
  grand_total: string;
  held_at: string;
  items: Array<{
    product_id: string;
    product_name: string;
    sku: string;
    qty: number;
    unit_price: string;
    discount_percent: number;
    item_meta_json?: CartItemMeta | string;
  }>;
}

export interface SyncOutboxRecord {
  idempotency_key: string; // UUIDv7
  business_id: string;
  endpoint: string;
  payload_json: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  attempts: number;
  last_error?: string;
  created_at: string;
}

export interface LocalPrintTemplate {
  id: string;
  business_id: string;
  branch_id?: string | null;
  name: string;
  document_type: 'A4_INVOICE' | 'THERMAL_80MM' | 'THERMAL_58MM';
  paper_width_mm: number | string;
  paper_height_mm: number | string;
  snap_grid_mm: number | string;
  is_default: boolean;
  canvas_schema: Record<string, unknown>;
  printer_profile: Record<string, unknown>;
  updated_at?: string;
}

export interface LocalPrinterDevice {
  id: string;
  business_id: string;
  name: string;
  transport: 'webusb' | 'webserial' | 'pdf' | 'browser';
  vendor_id?: number | null;
  product_id?: number | null;
  paper_width: 'A4' | '80mm' | '58mm';
  auto_kick_drawer: boolean;
  cut_paper: boolean;
  paired_at: string;
}

class EnterprisePOSDexieDB extends Dexie {
  products!: Table<LocalProduct, string>;
  fifo_batches!: Table<LocalFIFOBatch, string>;
  tax_rules!: Table<LocalTaxRule, string>;
  resolved_settings!: Table<LocalResolvedSetting, string>;
  suspended_bills!: Table<LocalSuspendedBill, string>;
  sync_outbox!: Table<SyncOutboxRecord, string>;
  print_templates!: Table<LocalPrintTemplate, string>;
  printer_devices!: Table<LocalPrinterDevice, string>;

  constructor() {
    super('enterprise_pos_edge_db');
    this.version(1).stores({
      products: 'id, business_id, category_id, sku, primary_barcode',
      fifo_batches: 'id, product_id, batch_number',
      tax_rules: 'id, tax_group_id, code',
      resolved_settings: 'key',
      suspended_bills: 'id, hold_code, held_at',
      sync_outbox: 'idempotency_key, status, created_at',
    });
    this.version(2).stores({
      products: 'id, business_id, category_id, sku, primary_barcode',
      fifo_batches: 'id, product_id, batch_number',
      tax_rules: 'id, tax_group_id, code',
      resolved_settings: 'key',
      suspended_bills: 'id, hold_code, held_at',
      sync_outbox: 'idempotency_key, status, created_at',
      print_templates: 'id, business_id, branch_id, document_type, is_default',
      printer_devices: 'id, business_id, transport',
    });
  }
}

export const dexieDB = new EnterprisePOSDexieDB();

export function createIdempotencyKeyV7(): string {
  return uuidv7();
}

export async function enqueueOfflineCheckout(
  businessID: string,
  payload: unknown
): Promise<string> {
  const key = createIdempotencyKeyV7();
  await dexieDB.sync_outbox.put({
    idempotency_key: key,
    business_id: businessID,
    endpoint: '/api/v1/pos/checkout',
    payload_json: JSON.stringify(payload),
    status: 'PENDING',
    attempts: 0,
    created_at: new Date().toISOString(),
  });
  return key;
}

export async function flushSyncOutbox(
  token: string,
  onSynced?: (count: number) => void
): Promise<number> {
  if (!navigator.onLine || !token) return 0;
  const pending = await dexieDB.sync_outbox
    .where('status')
    .equals('PENDING')
    .toArray();

  let syncedCount = 0;
  for (const job of pending) {
    try {
      const res = await fetch(job.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Idempotency-Key': job.idempotency_key,
        },
        body: job.payload_json,
      });
      if (res.ok) {
        await dexieDB.sync_outbox.update(job.idempotency_key, {
          status: 'SYNCED',
          attempts: job.attempts + 1,
        });
        syncedCount += 1;
      } else {
        const errBody = await res.text();
        await dexieDB.sync_outbox.update(job.idempotency_key, {
          attempts: job.attempts + 1,
          last_error: errBody.slice(0, 200),
        });
      }
    } catch {
      await dexieDB.sync_outbox.update(job.idempotency_key, {
        attempts: job.attempts + 1,
      });
    }
  }
  if (syncedCount > 0 && onSynced) {
    onSynced(syncedCount);
  }
  return syncedCount;
}

