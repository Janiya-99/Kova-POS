# Kova POS & ERP — Complete System User Guide

Welcome to **Kova POS & ERP**, an enterprise-grade, multi-business Point of Sale and Enterprise Resource Planning platform designed for high-velocity retail, mobile & electronics lounges, restaurants, hardware stores, automotive garages, and stationery centers.

This manual walks a **fresh user, store manager, cashier, accountant, or platform administrator** through every screen, login credential, workflow, and configuration option in the system.

---

## Table of Contents

1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Quick-Start URLs & Complete Login Credentials](#2-quick-start-urls--complete-login-credentials)
3. [Signing In & Smart Workspace Auto-Discovery](#3-signing-in--smart-workspace-auto-discovery)
4. [Executive Overview Dashboard (`/overview`)](#4-executive-overview-dashboard-overview)
5. [4-Pane Dynamic POS Terminal (`/pos`)](#5-4-pane-dynamic-pos-terminal-pos)
6. [Catalog Management: Products, Categories & Brands (`/products`, `/categories`, `/brands`)](#6-catalog-management-products-categories--brands-products-categories-brands)
7. [FIFO Inventory, Suppliers & GRN Stock Intake (`/inventory`, `/suppliers`)](#7-fifo-inventory-suppliers--grn-stock-intake-inventory-suppliers)
8. [CRM Customer Directory & Loyalty (`/customers`)](#8-crm-customer-directory--loyalty-customers)
9. [Double-Entry General Ledger & Fiscal Period Locking (`/accounting`, `/reports`)](#9-double-entry-general-ledger--fiscal-period-locking-accounting-reports)
10. [6-Level Settings Inheritance, Industry Blueprints & RBAC (`/settings`)](#10-6-level-settings-inheritance-industry-blueprints--rbac-settings)
11. [Platform SuperAdmin Control Plane (`/admin/login`)](#11-platform-superadmin-control-plane-adminlogin)
12. [Database Inspection with pgAdmin 4 (`http://localhost:5050`)](#12-database-inspection-with-pgadmin-4-httplocalhost5050)
13. [Re-Seeding & Running the Empirical Verification Suite](#13-re-seeding--running-the-empirical-verification-suite)

---

## 1. System Overview & Architecture

Kova POS operates on a **Database-per-Company (1-to-1 Tenant Isolation)** topology backed by PostgreSQL 16, Redis 7.2, a Go 1.24 backend (`pgx/v5`, `sqlc`, `shopspring/decimal`), and a React 19 + TypeScript + Tailwind CSS v4 + Dexie.js offline-capable frontend:

- **Master Control Plane Database (`enterprise_pos`):** Stores the global `tenant_databases` registry, Platform SuperAdmin accounts (`platform_admins`), global `setting_definitions`, RBAC `roles`/`permissions`, and cross-tenant audit logs.
- **Dedicated Company Database (`pos_tenant_kova_mobile`):** Every registered company runs inside its own physical PostgreSQL database (`pos_tenant_<slug>`) with strictly 3NF tables, FIFO inventory batches, immutable stock ledgers, and balanced double-entry accounting triggers.
- **Flagship Seeded Company — `Kova Mobile Hub` (`kova-mobile`):**
  - **Vertical:** Mobile & Electronics (`mobile`)
  - **Currency & Tax Engine:** `LKR` with automated Sri Lankan **SSCL (2.5%)** and **VAT (18%)** tax rules.
  - **Branches (`3`):** `Colombo Flagship Tech Lounge` (`COL-01`), `Kandy City Tech Lounge` (`KND-02`), and `Galle Fort Mobile Hub` (`GAL-03`).
  - **Terminals (`4`):** `COL-POS-01`, `COL-POS-02`, `KND-POS-01`, and `GAL-POS-01`.
  - **Catalog (`16` Brands, `7` Categories, `40` Products):** Genuine product photography (`frontend/public/products/mobile/*.jpg`) across **Apple, OPPO, Infinix, Soundcore, Samsung, Google, Xiaomi, OnePlus, Garmin, Anker, Ugreen, Belkin, Spigen, TP-Link, SanDisk, and Kova Certified**.
  - **Multi-Year Dataset (`2023–2027`):** `1,240+` historical & scheduled future sales invoices, `83` purchase orders, `71` GRN purchase invoices, `426` FIFO inventory batches, `180` CRM customers, and `20` fiscal quarters (`FY2023-Q1` through `FY2027-Q4`).

---

## 2. Quick-Start URLs & Complete Login Credentials

### Application & Infrastructure Endpoints

| Service | URL | Purpose |
| :--- | :--- | :--- |
| **Company Workspace Login (Smart Discovery)** | http://localhost:5173/login | Main staff login — enter any staff email to auto-discover and sign in to their company |
| **1-to-1 Company Portal (`Kova Mobile Hub`)** | http://localhost:5173/c/kova-mobile/login | Direct branded login portal for `Kova Mobile Hub` |
| **Platform SuperAdmin Portal** | http://localhost:5173/admin/login | Root Control Plane for provisioning companies, switching verticals, and auditing |
| **Vite Dev Server (Optional Local Dev)** | http://localhost:5174/login | Local Vite hot-reload frontend when running `npm --prefix frontend run dev` |
| **Backend REST & WebSocket API** | http://localhost:8080/api/v1/health | Go 1.24 API server + `/api/v1/ws` real-time event hub |
| **pgAdmin 4 Web Console** | http://localhost:5050 | Browser-based PostgreSQL 16 administration & SQL query tool |

### `Kova Mobile Hub` (`kova-mobile`) Staff Accounts

All seeded staff accounts share the password **`Kova@2026!`** and the 6-digit Supervisor Override PIN **`123456`**:

| Role | Designation | Email | Password | Default Branch | Supervisor PIN | Key Capabilities |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BusinessOwner** | Store Director | `owner@kovamobile.lk` | `Kova@2026!` | All Branches (`COL-01`, `KND-02`, `GAL-03`) | `123456` | Full access to Overview, POS, Catalog, Brands, FIFO Inventory, Accounting GL, Reports, Settings, RBAC, and Branch Switching |
| **BranchManager** | Store & Warranty Manager | `manager@kovamobile.lk` | `Kova@2026!` | Colombo Flagship Tech Lounge (`COL-01`) | `123456` | POS Checkout, PIN Overrides, Refunds/Returns, Catalog, Brands, GRN Stock Intake, Reports |
| **BranchManager** | Device & IMEI Specialist | `specialist@kovamobile.lk` | `Kova@2026!` | Kandy City Tech Lounge (`KND-02`) | `123456` | Serialized IMEI sales, Warranty desk, Branch inventory & POS management |
| **Cashier** | Sales Associate | `cashier@kovamobile.lk` | `Kova@2026!` | Colombo Flagship Tech Lounge (`COL-01`) | *(Requires Manager PIN)* | Fast POS checkout, barcode/IMEI scan, customer lookup, held bills; restricted from GL/Settings |
| **Accountant** | Senior Accountant | `accountant@kovamobile.lk` | `Kova@2026!` | Colombo Flagship Tech Lounge (`COL-01`) | *(Accounting Scope)* | Double-Entry General Ledger Explorer, Trial Balance, Fiscal Period Lock, Tax & Financial Reports |
| **InventoryController** | Serialized Stock Controller | `inventory@kovamobile.lk` | `Kova@2026!` | Galle Fort Mobile Hub (`GAL-03`) | *(Warehouse Scope)* | FIFO Batches, Purchase Orders, GRN Stock Intake, Suppliers, Catalog & Brands |

### Platform SuperAdmin & Database Admin Credentials

| System | URL | Email / Username | Password | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Kova POS Control (SuperAdmin)** | http://localhost:5173/admin/login | `admin@kovapos.com` | `Kova@2026!` | Isolated `PLATFORM_ADMIN` JWT scope; manages tenant DBs & company provisioning |
| **pgAdmin 4 Web UI** | http://localhost:5050 | `admin@kovapos.com` | `Kova@2026!` | Pre-attached to `Kova POS PostgreSQL 16` server (`postgres:5432`) |
| **PostgreSQL 16 Direct Engine** | `localhost:5433` (host) / `postgres:5432` (Docker) | `pos_admin` | `pos_secret_2026` | Databases: `enterprise_pos` (control plane) & `pos_tenant_kova_mobile` (company DB) |

---

## 3. Signing In & Smart Workspace Auto-Discovery

1. Open **http://localhost:5173/login** in your browser.
2. **Smart Email Auto-Discovery:** As you type your staff email (for example, `owner@kovamobile.lk`), the login page queries `GET /api/v1/auth/discover?email=...` in real time and automatically locks onto **Kova Mobile Hub (`kova-mobile`)**, displaying the company's trade name and encrypted session badge.
3. **1-to-1 Company Portal:** You can also bookmark or share your company's dedicated URL (`http://localhost:5173/c/kova-mobile/login`), which scopes authentication strictly to `pos_tenant_kova_mobile`.
4. **Language Switcher:** Use the top-right language pill to switch the entire UI between **English (`EN`)**, **Sinhala (`සිං`)**, and **Tamil (`தமிழ்`)** at any time.
5. **Password Recovery (`Reset Password?`):**
   - Click **Reset Password?** on the login form.
   - Choose either **Email Verification Code** (sends a 6-digit recovery code) or **Supervisor PIN Reset** (allows an on-floor Branch Manager or Store Director to enter their 6-digit PIN `123456` to immediately reset a cashier's password).

---

## 4. Executive Overview Dashboard (`/overview`)

After signing in as `owner@kovamobile.lk` or `manager@kovamobile.lk`, you land on the **12-Column Executive Overview Bento Dashboard**:

- **Branch & Time-Horizon Switcher (Top Header):**
  - Switch between **Colombo Flagship Tech Lounge (`COL-01`)**, **Kandy City Tech Lounge (`KND-02`)**, and **Galle Fort Mobile Hub (`GAL-03`)**.
  - Filter telemetry across `Today`, `7D`, `30D`, or `1Y`.
- **Live KPI Cards:** View gross revenue, net settled orders, average ticket value, active FIFO batch valuation, and tax liability in `LKR`.
- **Category & Brand Performance:** Visual breakdown of sales across Smartphones, Audio & ANC Gear, Wearables, Power & GaN Charging, Protection, Networking, and Services.
- **Real-Time WebSocket Sync (`LIVE SYNC` indicator):** Whenever any cashier completes a sale or receives a GRN on another terminal, the dashboard updates automatically via WebSocket (`/api/v1/ws`) without refreshing the page.

---

## 5. 4-Pane Dynamic POS Terminal (`/pos`)

Navigate to **POS Terminal (`/pos`)** from the left floating sidebar to run live counter sales.

### Step-by-Step Checkout Workflow
1. **Pane 1 — Vertical Category Rail (Far Left):**
   - Click `All Items` or filter by `Flagship Smartphones`, `Audio & ANC Gear`, `Smartwatches & Wearables`, `Fast Charging & Power`, `Cases & Screen Protection`, `Networking & Storage`, or `Mobile Care & Repairs`.
2. **Pane 2 — Brand Filter Bar & Tactile Product Grid (Center-Left):**
   - **Brand Filter Pills:** Directly beneath the search bar, click any brand pill (`All Brands`, `Apple`, `OPPO`, `Infinix`, `Soundcore`, `Samsung`, `Google`, `Xiaomi`, `OnePlus`, `Garmin`, `Anker`, `Ugreen`, `Belkin`, `Spigen`, `TP-Link`, `SanDisk`, `Kova Certified`) to filter products by manufacturer.
   - **Search & Barcode Scan:** Type a model name, SKU (e.g., `KM-IP16PM-256`, `KM-OPFX8P-512`, `KM-INFGT20-256`, `KM-SCL4NC`), or scan a barcode (`EAN-13`).
   - Click any product card to add it to the active bill. Each card displays its real hardware photo, brand badge, SKU, FIFO stock on hand, and unit price in `LKR`.
3. **Pane 3 — Active Cart & Mobile Industry Controls (Center-Right):**
   - **IMEI / Serial Capture & Warranty Terms:** Because `Kova Mobile Hub` runs the `mobile` vertical preset (`pos.require_serial_imei = true`), you can record device IMEI/Serial numbers and warranty coverage (`12M Apple Care / Official Agent Warranty`, `24M Anker / Soundcore Warranty`, etc.) on serialized line items.
   - **Line Discounts & Supervisor PIN Gate:** Adjusting prices or applying manual discounts beyond the cashier's threshold prompts for a **6-digit Supervisor PIN (`123456`)**, issuing a short-lived cryptographic override token (`POST /api/v1/auth/verify-pin`).
   - **Hold / Recall Bills:** Click **Hold Bill** to park an in-progress customer order as a perforated ticket, or open the **Held Bills** drawer in the footer to recall one of the `12` pre-seeded held bills.
4. **Pane 4 — Payment Tender, Tax Breakdown & Receipt Engine (Far Right):**
   - **Customer Linking:** Attach one of the `180` CRM customers (or walk-in customer) to track warranty history and award loyalty points.
   - **Automated Sri Lankan Tax Engine:** The terminal automatically computes **SSCL (`2.5%`)** and **VAT (`18%`)** using exact `NUMERIC(19,4)` decimal math.
   - **Payment Methods:** Select `CASH`, `CARD`, `QR_LANAKAPAY`, or `SPLIT`, enter the tendered amount on the tactile keypad, and click **Complete Checkout**.
   - **Atomic Execution:** Behind the scenes, a single ACID transaction depletes the oldest FIFO inventory batches, logs immutable `stock_ledger_entries`, creates the `sales_invoices` record (protected by a UUIDv7 `idempotency_key`), and posts a balanced double-entry journal (`DR Cash/Bank`, `CR Sales Revenue`, `CR VAT/SSCL Payable`, `DR COGS`, `CR Inventory Asset`).
   - **Receipt Printing:** Print directly to an 80mm/58mm ESC/POS thermal printer (via WebUSB, WebSerial, or Android RawBT) or generate a full **A4 Tax & Warranty Invoice**.

### Offline Resilience (Dexie.js IndexedDB Outbox)
If internet or LAN connectivity drops, the POS terminal continues operating using its local **Dexie.js IndexedDB catalog and outbox**. Queued checkouts automatically replay with their original UUIDv7 `idempotency_key` once connectivity returns—guaranteeing zero duplicate invoices.

---

## 6. Catalog Management: Products, Categories & Brands (`/products`, `/categories`, `/brands`)

### A. Brands & Manufacturers (`/brands`)
Click **Brands** in the sidebar to manage manufacturer partnerships:
- **KPI Summary Row:** View `Registered Brands (16)`, `Branded SKUs (40)`, `Stock Units On Hand`, and `Country Origins (8)`.
- **Filter & Search:** Filter brands by country of origin (`United States`, `China`, `Hong Kong`, `South Korea`, `Japan`, `Taiwan`, `Sri Lanka`) or search by brand name/slug.
- **Brand Portfolio Inspector (Right Pane):** Click any brand row (e.g., **Apple**, **OPPO**, **Infinix**, or **Soundcore**) to inspect its official website, description, total inventory valuation, and every linked SKU with live stock counts and retail pricing.
- **Add / Edit Brand:** Click **+ New Brand** to register a new manufacturer (`Name`, `Slug`, `Country`, `Website`, `Description`, `Active` status).

### B. Products & Pricing (`/products`)
Click **Products** in the sidebar to manage SKUs:
- Filter by **Category**, **Brand**, or stock status (`In Stock`, `Low Stock`, `Out of Stock`).
- Click **+ Add Product** or edit any existing SKU in the **Product Management Drawer** to configure:
  - `SKU`, `Barcode`, `Product Name`, `Category`, and **Brand (`brand_id`)**
  - `Unit of Measure`, `Reorder Point`, `Standard Cost`, `Retail Price`, and `Tax Category`
  - `Product Image URL` (served from `/products/mobile/*.jpg` or custom uploads)

### C. Categories (`/categories`)
Organize products into logical department groups (`Flagship Smartphones`, `Mid-Range & 5G Phones`, `Audio & ANC Gear`, `Smartwatches & Wearables`, `Fast Charging & Power`, `Cases & Screen Protection`, `Networking, Storage & Services`) and configure category-level settings overrides.

---

## 7. FIFO Inventory, Suppliers & GRN Stock Intake (`/inventory`, `/suppliers`)

1. **FIFO Batch Explorer (`/inventory`):**
   - Inspect live stock quantities across branches, filter by **Category** or **Brand**, and expand any product to view its active **FIFO Inventory Batches** (`batch_number`, `unit_cost`, `initial_qty`, `remaining_qty`, `received_at`, `expiry_date`).
   - Use **Stock Adjustment / Return** to record damaged goods or supplier returns with full audit trails.
2. **Receive New Stock — GRN Intake Drawer (`/inventory` -> `Receive GRN`):**
   - Select a Supplier (from the `18` official distributors such as *Abans Apple Authorized Dist.*, *OPPO Lanka Official Distribution*, *Infinix Mobility Sri Lanka*, *Anker Soundcore Lanka Distribution*, *John Keells Office Automation*, *Singer Sri Lanka Digital Hub*) and optionally link an approved Purchase Order.
   - Add line items with batch numbers, unit cost, and received quantity.
   - Submitting a GRN atomically creates new `inventory_batches`, writes `GRN_INTAKE` rows to `stock_ledger_entries`, and posts a balanced General Ledger entry (`DR Inventory Asset`, `CR Accounts Payable`).
3. **Automated Low-Stock Purchase Orders:**
   - Click **Run Low-Stock Auto-PO Scan** to automatically detect SKUs below their `reorder_level` and generate draft `PO-AUTO-*` purchase orders.

---

## 8. CRM Customer Directory & Loyalty (`/customers`)

- Browse and search all `180` seeded retail and corporate customers (`Dialog Enterprise Solutions`, `SLIIT Campus Faculty`, individual buyers, etc.).
- View lifetime spend, total orders, loyalty point balances, credit limits, and full invoice history for warranty verification.

---

## 9. Double-Entry General Ledger & Fiscal Period Locking (`/accounting`, `/reports`)

1. **General Ledger Explorer (`/accounting`):**
   - View the **Chart of Accounts** (`Assets`, `Liabilities`, `Equity`, `Revenue`, `Expenses`), live **Trial Balance**, and every posted `journal_entry` (`JE-POS-*`, `JE-GRN-*`, `JE-REV-*`).
   - Expand any journal entry to inspect its balanced `journal_lines` (`SUM(debit) = SUM(credit)`).
2. **Fiscal Period Locking:**
   - The system seeds `20` fiscal quarters (`FY2023-Q1` through `FY2027-Q4`). Historical quarters `FY2023-Q1` through `FY2025-Q4` are marked `LOCKED`.
   - Accountants or Business Owners can lock completed quarters; PostgreSQL trigger `trg_prevent_locked_period_posting` blocks any backdated journal entry into a locked period at the database engine level.
3. **Multi-Year Analytics & Tax Reports (`/reports`):**
   - Run date-range reports across `2023–2027` (`1,240+` invoices) to inspect gross revenue, COGS, FIFO gross margin, and Sri Lankan **VAT (18%) + SSCL (2.5%)** return summaries.

---

## 10. 6-Level Settings Inheritance, Industry Blueprints & RBAC (`/settings`)

Open **Settings (`/settings`)** as `owner@kovamobile.lk`:

1. **6-Level Settings Inheritance Matrix:**
   - Every setting resolves deterministically in priority order:
     $$\text{System Default} \rightarrow \text{Business} \rightarrow \text{Branch} \rightarrow \text{Terminal} \rightarrow \text{Category} \rightarrow \text{Product}$$
   - Override settings at the Business level or scope a specific rule (such as `tax.vat_rate`, `pos.require_serial_imei`, `receipt.footer_text`, or `pos.offline_outbox_enabled`) to a single Branch or Terminal. Every change invalidates the Redis settings cache (`settings:*`) for immediate propagation.
2. **Industry Blueprint Auto-Migration:**
   - Switching or applying a vertical blueprint (`mobile`, `retail`, `restaurant`, `hardware`, `garage`, `stationery`) automatically provisions vertical-specific **Scoped Settings**, **Staff Designations**, **Starter Categories**, and **Starter Brands** (e.g., `Apple`, `OPPO`, `Infinix`, `Soundcore` for `mobile`; `Nike`, `Adidas`, `Zara`, `Levi's` for `retail`; `Lavazza`, `Dilmah`, `Monin`, `Nestle Pro` for `restaurant`; `Makita`, `Bosch`, `DeWalt`, `3M` for `hardware`; `Mobil 1`, `Castrol`, `Bosch Auto`, `Denso` for `garage`; `Faber-Castell`, `Pilot`, `Casio`, `Double A` for `stationery`).
3. **Staff & RBAC Permission Matrix:**
   - Create staff accounts, assign designations, set 6-digit supervisor PINs, and inspect or revoke active JWT login sessions (`DELETE /api/v1/settings/sessions`).

---

## 11. Platform SuperAdmin Control Plane (`/admin/login`)

For SaaS platform operators (`Kova POS Control` root team):

1. Navigate to **http://localhost:5173/admin/login** and sign in with **`admin@kovapos.com`** / **`Kova@2026!`**.
2. **1-to-1 Database Provisioning:**
   - Enter a **Company Name** (e.g., `Lanka Spice Co`) — the portal automatically generates the **Company Slug (`lanka-spice`)**, **Trade Name**, dedicated database name (`pos_tenant_lanka_spice`), and initial owner email.
   - Select one of the **6 Business Verticals** (`Fashion & Retail`, `Restaurant & F&B`, `Hardware & Building`, `Auto Service & Garage`, `Mobile & Electronics`, `Stationery & High-Velocity`). The preview card displays the exact **Starter Brands**, **Categories**, **Staff Designations**, and **Settings** that will be auto-migrated.
   - Click **Provision Company & Database**: the backend creates the physical PostgreSQL database, applies all 3NF migrations (`000001`–`000016`), seeds the chart of accounts, tax rules, starter brands, categories, and initial owner account, and registers the tenant in `enterprise_pos.tenant_databases`.
3. **Strict Scope Isolation:** Platform SuperAdmin JWTs (`scope: PLATFORM_ADMIN`) cannot access tenant POS or General Ledger endpoints (`HTTP 401`), and tenant staff JWTs cannot access `/api/v1/admin/*` (`HTTP 403`).

---

## 12. Database Inspection with pgAdmin 4 (`http://localhost:5050`)

A pre-configured **pgAdmin 4** container runs alongside the stack so you can inspect schemas, triggers, and live rows visually:

1. Open **http://localhost:5050** and sign in with:
   - **Email:** `admin@kovapos.com`
   - **Password:** `Kova@2026!`
2. Expand **Servers -> Kova POS PostgreSQL 16** (if prompted for the database password, enter **`pos_secret_2026`**).
3. Inspect the two databases under **Databases**:
   - **`enterprise_pos`**: Master Control Plane (`tenant_databases`, `platform_admins`, `platform_audit_logs`).
   - **`pos_tenant_kova_mobile`**: Dedicated company database for `Kova Mobile Hub` (`brands`, `products`, `categories`, `inventory_batches`, `stock_ledger_entries`, `sales_invoices`, `sales_invoice_items`, `journal_entries`, `journal_lines`, `fiscal_periods`, `customers`, `suppliers`, `purchase_orders`, `purchase_invoices`).

---

## 13. Re-Seeding & Running the Empirical Verification Suite

If you ever want to reset `Kova Mobile Hub` back to a clean initial state (`16,928` rows spanning `2023–2027`) or re-run the automated concurrency, performance, and security test suite:

```bash
# 1. Rebuild and start all Docker services (PostgreSQL 16, Redis 7.2, Go Backend, Nginx Frontend, pgAdmin 4)
docker compose up -d --build

# 2. Reset & seed Kova Mobile Hub (removes any legacy demo DB and seeds 2023-2027 data + 16 brands + 40 products)
POSTGRES_PORT=5433 REDIS_ADDR=localhost:6379 go -C backend run ./cmd/seed-mobile

# 3. Execute the empirical performance, EXPLAIN ANALYZE, 25-goroutine concurrency & 11-point security audit
POSTGRES_PORT=5433 REDIS_ADDR=localhost:6379 API_BASE_URL=http://localhost:8080/api/v1 go -C backend run ./cmd/verify-kova
```

For full benchmark tables, query execution plans, concurrency stress test telemetry, and security trigger proofs, see [PERFORMANCE_AND_SECURITY.md](file:///home/janith/Projects/POS/PERFORMANCE_AND_SECURITY.md).

