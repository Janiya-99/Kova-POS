# Enterprise Multi-Business POS System Design Document (SDD)

**Version:** 1.0.0  
**Architecture Paradigm:** Multi-Tenant Clean / Hexagonal Architecture + Offline-First Edge POS  
**Backend Stack:** Go (Golang 1.22+/1.23+, Fiber v2, `sqlc`, `pgx/v5`, `shopspring/decimal`, Redis 7.2, Asynq Distributed Worker Queue, WebSockets)  
**Frontend Stack:** React 19 + TypeScript, Vite, Tailwind CSS v4, `shadcn/ui`, Zustand, TanStack Query v5, Dexie.js (IndexedDB Offline Engine)  
**Database Engine:** PostgreSQL 16+ (Strictly 3NF Normalized Relational Schema with Multi-Tenant Isolation)  
**Hardware Bridge:** WebUSB, WebSerial, ESC/POS Raw Byte Generator, RawBT (`58mm`, `76.2mm`, `80mm` Thermal Printers + Cash Drawer Kick)

---

## 1. System Architecture & Multi-Business Topology

### 1.1 High-Level Multi-Tier Architecture

The platform supports **multiple independent businesses (Multi-Tenancy)** on a single deployment while strictly isolating legal entities, tax rules, warehouse stock batches, and double-entry accounting ledgers via `business_id`.

### 1.2 The 6-Level Settings Inheritance Hierarchy

Settings resolve dynamically from the broadest system default down to the individual product SKU. Lower scopes override higher scopes:

$$\text{System Default} \rightarrow \text{Business (Global)} \rightarrow \text{Branch / Warehouse} \rightarrow \text{Terminal} \rightarrow \text{Category} \rightarrow \text{Product}$$

| Scope Level | Resolution Priority | Core Parameters Controlled at This Scope |
| :--- | :--- | :--- |
| **1. System Default** | Priority 6 (Fallback) | Hardcoded schema defaults in `setting_definitions.default_value`. |
| **2. Business (Global)** | Priority 5 | Base currency (`USD`, `LKR`), fiscal period lock, tax rounding mode, default COA mappings. |
| **3. Branch / Warehouse** | Priority 4 | Branch tax overrides, allow negative FIFO stock, auto-PO reorder threshold, country code. |
| **4. Terminal** | Priority 3 | Thermal paper width (`58mm` / `76.2mm` / `80mm`), auto-kick cash drawer, offline sync interval. |
| **5. Category** | Priority 2 | Default category tax group, discount cap percentage, return window days. |
| **6. Product** | Priority 1 (Highest) | SKU-specific tax exemption, serial/expiry tracking flag, max cashier discount %. |

---

## 2. Strictly 3NF Relational Schema & RBAC Model (34 Tables)

All business-scoped tables carry `business_id UUID NOT NULL REFERENCES businesses(id)` and use `NUMERIC(19,4)` for currency/quantity columns:

1. **Tenant & Organizational Topology:**
   - `businesses`, `branches` (`country_code`), `terminals`, `users`
2. **Multi-Tenant RBAC (4 Tables):**
   - `roles`, `permissions`, `role_permissions`, `user_business_roles` (`supervisor_pin_hash`, `branch_id`)
3. **6-Level Settings Engine (2 Tables):**
   - `setting_definitions`, `scoped_settings` (`scope_level`, `scope_target_id`, `value_json`)
4. **Catalog, CRM & Multi-Tier Tax (7 Tables):**
   - `categories`, `tax_groups`, `tax_rules` (`tax_type` `EXCLUSIVE|INCLUSIVE|COMPOUND`, `rate_percent`, `priority`), `products`, `product_barcodes`, `customers`
5. **Procurement & FIFO Inventory (7 Tables):**
   - `suppliers`, `purchase_orders`, `purchase_order_items`, `goods_received_notes`, `grn_items`, `inventory_batches` (`received_at`, `expiry_date`, `unit_cost`, `initial_qty`, `remaining_qty`), `stock_movements`
6. **POS Edge Operations (7 Tables):**
   - `pos_shifts`, `suspended_bills`, `suspended_bill_items`, `sales_invoices` (`idempotency_key` unique per business, `invoice_type` `SALE|REFUND`, `status` `PAID|REFUND|VOID`), `sales_invoice_items` (`batch_cogs`), `sales_invoice_taxes`, `invoice_payments`
7. **Immutable Double-Entry GL Accounting (4 Tables):**
   - `chart_of_accounts`, `fiscal_periods` (`is_locked`), `journal_entries`, `journal_lines` (`debit NUMERIC(19,4)`, `credit NUMERIC(19,4)`)

### Mandatory Database Constraint Trigger
`trg_verify_journal_balance` (`CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`) validates on commit that for every `journal_entry_id`:
$$\sum \text{journal\_lines.debit} = \sum \text{journal\_lines.credit}$$

---

## 3. Financial, Tax & FIFO Inventory State Machine

### 3.1 Multi-Tier Tax Engine
- **Exclusive Tax:** Applied sequentially on `line_subtotal` (`tax = base * rate / 100`).
- **Compound Tax-on-Tax:** Prior tax amounts are added to the taxable base for higher-priority compound rules.
- **Inclusive Tax:** Back-calculated out of tax-inclusive shelf price (`net = gross / (1 + sum_rates)`, `tax = gross - net`) with exact `shopspring/decimal` rounding (`HALF_UP`, `HALF_EVEN`, `FLOOR`, `CEIL` per resolved setting).

### 3.2 Warehouse FIFO Batch Depletion
1. On **GRN Approval (`POST /api/v1/inventory/grns/:id/approve`)**:
   - Marks GRN `APPROVED`, creates immutable `inventory_batches` row(s), inserts `stock_movements` (`IN_GRN`), and posts GL journal: `DR 1200 Inventory Asset` / `CR 2000 Accounts Payable`.
2. On **POS Checkout (`POST /api/v1/pos/checkout`)**:
   - Enforces `X-Idempotency-Key` (`UUIDv7`) via Redis + `sales_invoices.idempotency_key`.
   - Locks FIFO batches with `SELECT ... FOR UPDATE` ordered by `received_at ASC, expiry_date ASC NULLS LAST, id ASC`.
   - Deducts quantities across oldest batches, computes exact batch-weighted `COGS`, logs `stock_movements` (`OUT_SALE`), and posts balanced GL lines inside the single `pgx.Tx`:
     - `DR 1010 Cash / 1020 Card Clearing` = Grand Total
     - `CR 4000 Sales Revenue` = Net Sales
     - `CR 2100 Sales Tax Payable` = Total Tax
     - `DR 5000 Cost of Goods Sold` = Weighted FIFO COGS
     - `CR 1200 Inventory Asset` = Weighted FIFO COGS
   - Enqueues Asynq low-stock check (`low_stock_worker`) if remaining branch stock drops below `reorder_point`.

---

## 4. REST API & Real-Time WebSocket Contract

| Endpoint | Permission / Guard | Purpose |
| :--- | :--- | :--- |
| `POST /api/v1/auth/login` | Public | Authenticates staff, issues JWT with `business_id`, `branch_id`, `terminal_id`, `permissions[]` |
| `POST /api/v1/auth/switch-context` | Authenticated | Switches active `branch_id` / `business_id` for authorized roles |
| `POST /api/v1/auth/verify-pin` | Authenticated | Verifies 6-digit supervisor PIN and issues short-lived `X-Supervisor-Override-Token` |
| `GET /api/v1/overview` | `analytics:view` | Executive Bento metrics (`Sales Analytics`, `Top sales by country`, `Last activity`, `Product sales`, KPIs) |
| `GET /api/v1/pos/bootstrap` | `pos:view` | Catalog, FIFO batch stock, tax rules, customers, and resolved 6-level settings for Dexie offline cache |
| `POST /api/v1/pos/checkout` | `pos:checkout` + `X-Idempotency-Key` | Atomic FIFO + Tax + GL checkout |
| `POST /api/v1/pos/invoices/:id/void` | `pos:void_bill` or Override Token | Reverses GL entries & restores inventory batch quantities |
| `POST /api/v1/pos/invoices/:id/refund` | `pos:refund` or Override Token | Issues `REFUND` invoice (`status = 'REFUND'`), reverses revenue/tax/COGS GL lines |
| `GET / POST /api/v1/pos/held-bills` | `pos:hold_bill` | Lists, creates, recalls, and voids suspended bills synced via WebSocket |
| `GET / POST /api/v1/inventory/grns` | `inventory:grn` | Lists FIFO batches & suppliers, creates and approves GRNs with automatic GL posting |
| `GET / POST /api/v1/accounting/journals` | `accounting:view` / `accounting:lock_period` | Chart of Accounts, immutable journal drill-down, and Fiscal Period Lock |
| `GET / PUT /api/v1/settings/resolved` | `settings:view` / `settings:manage` | 6-level inheritance explorer, override upsert/reset, RBAC role matrix |
| `GET /ws` | JWT Query/Header | Broadcasts `SETTINGS_UPDATED`, `HELD_BILL_SYNC`, and `LOW_STOCK_ALERT` |

