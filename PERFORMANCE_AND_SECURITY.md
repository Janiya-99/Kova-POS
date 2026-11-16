# Kova POS & ERP — Empirical Performance, Concurrency & Security Audit Report

This document records the **empirical query speeds, HTTP API latencies, Redis cache acceleration, multi-threading / concurrency stress results, and 11-point security & database trigger verification** executed against the live **`Kova Mobile Hub` (`pos_tenant_kova_mobile`)** multi-year dataset (`2023–2027`).

All metrics in this report were captured directly from the live Dockerized stack (`PostgreSQL 16`, `Redis 7.2`, `Go 1.24 / pgx/v5`) via the automated verification harness (`backend/cmd/verify-kova/main.go`) and the Go race detector (`go test -race -count=1 ./...`).

---

## 1. Test Environment & Multi-Year Dataset Scale (`2023–2027`)

### 1.1 Tenant Topology Verification
- **Legacy `pos_tenant_zona_retail` Database Count:** `0` (completely purged)
- **Active Registered Tenant Databases:** `1` (`kova-mobile` $\rightarrow$ `pos_tenant_kova_mobile`)
- **Master Control Plane Database:** `enterprise_pos`
- **Tenant Connection Pool (`pgxpool`):** `max_conns = 25`, `min_conns = 2` per isolated tenant database

### 1.2 Exact Row Counts in `pos_tenant_kova_mobile`

| Table Name | Initial Seeded Rows (`seed-mobile`) | Post-Stress Rows (`verify-kova`) | Description & Horizon |
| :--- | ---: | ---: | :--- |
| `branches` | `3` | `3` | `COL-01` (Colombo), `KND-02` (Kandy), `GAL-03` (Galle) |
| `terminals` | `4` | `4` | `COL-POS-01`, `COL-POS-02`, `KND-POS-01`, `GAL-POS-01` |
| `users` | `6` | `6` | Owner, 2 Branch Managers, Cashier, Accountant, Inventory Controller |
| `categories` | `7` | `7` | Smartphones, 5G Phones, Audio, Wearables, Power, Protection, Networking/Services |
| `brands` | `16` | `16` | Apple, OPPO, Infinix, Soundcore, Samsung, Google, Xiaomi, OnePlus, Garmin, Anker, Ugreen, Belkin, Spigen, TP-Link, SanDisk, Kova Certified |
| `products` | `40` | `40` | Branded SKUs with original hardware photography (`/products/mobile/*.jpg`) |
| `suppliers` | `18` | `18` | Official Sri Lankan & international distributor accounts |
| `customers` | `180` | `180` | Retail & corporate CRM profiles with loyalty balances |
| `fiscal_periods` | `20` | `20` | `FY2023-Q1` through `FY2027-Q4` (`FY2023-Q1`..`FY2025-Q4` `LOCKED`) |
| `purchase_orders` | `83` | `83` | `73` historical (`2023–2026`) + `10` future scheduled (`2027`) |
| `purchase_order_items` | `438` | `438` | Multi-item procurement lines across 18 suppliers |
| `purchase_invoices` | `71` | `71` | Approved GRN supplier intake invoices (`2023–2026`) |
| `inventory_batches` | `426` | `426` | Active & depleted FIFO cost layers across 3 branches |
| `stock_ledger_entries` | `3,526` | `3,630` | Immutable `GRN_INTAKE` & `SALE` stock movements |
| `pos_shifts` | `46` | `46` | Historical closed shifts + active open terminal shifts |
| `sales_invoices` | `1,240` | `1,344` | Multi-year POS invoices (`2023` through scheduled `2027`) |
| `sales_invoice_items` | `3,100` | `3,204` | Serialized IMEI & accessory line items with tax breakdown |
| `journal_entries` | `1,311` | `1,415` | Double-entry GL headers (`JE-POS-*`, `JE-GRN-*`) |
| `journal_lines` | `6,342` | `6,862` | Balanced debit & credit ledger lines |
| `suspended_bills` | `12` | `12` | Perforated held bills awaiting customer recall |
| `suspended_bill_items` | `12` | `12` | Held bill line items |
| `print_templates` | `3` | `3` | `A4_INVOICE`, `THERMAL_80MM`, `THERMAL_58MM` |
| `system_notifications` | `4` | `4` | Real-time operational alerts |
| `scoped_settings` | `20` | `20` | 6-level settings overrides (`mobile` vertical + SL VAT/SSCL) |
| **Total Tenant Records** | **`16,928`** | **`17,864`** | **Zero unbalanced journals, zero negative FIFO batches** |

### 1.3 Multi-Year `sales_invoices` Distribution (`2023–2027`)

| Calendar Year | Initial Invoices | Post-Stress Invoices | Paid Count | Gross Settled Revenue (`LKR`) |
| :--- | ---: | ---: | ---: | ---: |
| **2023** (Historical Locked) | `309` | `309` | `309` | `171,244,670.8000` |
| **2024** (Historical Locked) | `314` | `314` | `314` | `173,237,975.7750` |
| **2025** (Historical Locked) | `313` | `313` | `313` | `173,348,793.6000` |
| **2026** (Current Active FY) | `265` | `369` | `369` | `147,444,347.2150` |
| **2027** (Future Preorders & Contracts) | `39` | `39` | `39` | `21,449,409.7000` |
| **Total (`2023–2027`)** | **`1,240`** | **`1,344`** | **`1,344`** | **`686,725,197.0900`** |

- **Double-Entry Accounting Integrity Check:**
  $$\sum \text{Debit} = \text{LKR } 4,082,554,097.0900 = \sum \text{Credit} \quad (\text{Unbalanced Journals} = 0)$$
- **FIFO Batch Integrity Check:** `0` batches with `remaining_qty < 0` or `remaining_qty > initial_qty`.

---

## 2. Database Query Speed (`EXPLAIN (ANALYZE, BUFFERS)`)

Executed directly against `pos_tenant_kova_mobile` on PostgreSQL 16 (`1,344` invoices, `1,415` journal headers, `6,862` journal lines, `426` FIFO batches):

| Query ID | Workload Description | Planning Time | Execution Time | Buffer Hits & Sort Telemetry |
| :--- | :--- | ---: | ---: | :--- |
| **Q1** | **Overview Sales Aggregation (`2023–2027` Paid Invoices)** — `COUNT(*)`, `COALESCE(SUM(net_total), 0)`, `COALESCE(SUM(tax_total), 0)` filtered by `business_id`, `status = 'PAID'`, and date range | `0.060 ms` | **`0.560 ms`** | `Aggregate` over `Seq Scan on sales_invoices` (`rows=1344`, `Buffers: shared hit=45`) |
| **Q2** | **FIFO Active Batch Lookup (Product Stock Depletion Order)** — Oldest active cost layers (`remaining_qty > 0`) ordered by `received_at ASC, created_at ASC` | `0.050 ms` | **`0.099 ms`** | `Sort Method: quicksort Memory: 26kB`, `rows=14`, `Buffers: shared hit=18` |
| **Q3** | **General Ledger Journal + Line Aggregation (Top 50 Recent Entries)** — `journal_entries JOIN journal_lines GROUP BY je.id ORDER BY entry_date DESC LIMIT 50` across `1,415` journals and `6,862` lines | `0.230 ms` | **`5.256 ms`** | `top-N heapsort Memory: 36kB`, `HashAggregate Memory: 881kB`, `Buffers: shared hit=179` |
| **Q4** | **Top 25 CRM Customers by Lifetime Spend** — `customers LEFT JOIN sales_invoices GROUP BY c.id ORDER BY lifetime_spend DESC LIMIT 25` (`180` customers $\times$ `1,344` invoices) | `0.223 ms` | **`1.133 ms`** | `top-N heapsort Memory: 31kB`, `Hash Right Join`, `Buffers: shared hit=49` |

---

## 3. Redis 6-Level Settings Cache & HTTP API Latency Benchmarks

### 3.1 6-Level Settings Inheritance Resolution (`GET /api/v1/settings/resolved`)
The 6-Level Settings Resolver evaluates configuration across:
$$\text{System Default} \rightarrow \text{Business} \rightarrow \text{Branch} \rightarrow \text{Terminal} \rightarrow \text{Category} \rightarrow \text{Product}$$

- **Cold Cache Miss (PostgreSQL 6-level inheritance query + Redis write-back):** `13.66 ms` (`35.93 ms` on initial uncached container start)
- **Warm Cache Hit (Redis `settings:*` key lookup, `n = 25`):**
  - `avg = 8.71 ms`, `p50 = 6.84 ms`, `p95 = 21.27 ms`, `max = 35.76 ms` (and `avg = 4.92 ms`, `p50 = 3.34 ms` on quiet loop — up to **`7.3x` faster** than cold PostgreSQL resolution).

### 3.2 Authentication & End-to-End HTTP API Latency Table

| Endpoint | Samples (`n`) | Errors | Min (`ms`) | Avg (`ms`) | p50 / Median (`ms`) | p95 (`ms`) | Max (`ms`) | Notes |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| `POST /api/v1/auth/login` | `1` | `0` | `178.59` | `178.59` | `178.59` | `178.59` | `178.59` | Intentionally CPU-hardened `bcrypt` password verification + PG session creation |
| `POST /api/v1/admin/login` | `1` | `0` | `75.07` | `75.07` | `75.07` | `75.07` | `75.07` | Platform SuperAdmin `bcrypt` verify + `PLATFORM_ADMIN` JWT |
| `GET /api/v1/health` | `25` | `0` | `0.14` | `0.21` | **`0.17`** | `0.25` | `0.65` | Liveness & readiness probe |
| `GET /api/v1/auth/discover` | `20` | `0` | `0.82` | `1.44` | **`1.05`** | `2.52` | `2.71` | Smart email-to-company workspace auto-discovery |
| `GET /api/v1/customers` | `20` | `0` | `1.77` | `2.56` | **`2.07`** | `4.15` | `4.20` | `180` CRM customer profiles + loyalty totals |
| `GET /api/v1/brands` | `20` | `0` | `3.67` | `5.46` | **`4.73`** | `9.33` | `9.47` | `16` brands with live aggregated SKU count & stock on hand |
| `GET /api/v1/pos/bootstrap` | `20` | `0` | `5.15` | `9.46` | **`8.19`** | `15.54` | `19.39` | Full POS terminal payload (`40` products, `16` brands, `7` categories, active shift, held bills, resolved settings) |
| `GET /api/v1/inventory` | `20` | `0` | `5.81` | `10.01` | **`9.49`** | `14.04` | `15.12` | `40` products + `426` FIFO batch cost layers + `83` POs |
| `GET /api/v1/accounting` | `16` | `0` | `9.15` | `12.17` | **`10.54`** | `16.69` | `19.02` | Chart of Accounts + Trial Balance + recent GL journals + `20` fiscal periods |
| `GET /api/v1/overview?period=1Y` | `16` | `0` | `27.66` | `42.85` | **`38.06`** | `59.47` | `85.58` | 12-column Executive Bento dashboard KPIs & category charts |
| `GET /api/v1/reports/summary (2023–2027)` | `16` | `0` | `117.35` | `217.32` | **`209.70`** | `326.16` | `416.93` | Full 5-year (`2023–2027`) financial, tax, and category aggregation across `1,344` invoices |

---

## 4. Multi-Threading, Concurrency & Race-Condition Verification

### 4.1 Go Race Detector (`go test -race -count=1 ./...`)
All backend packages were compiled and executed with the Go thread sanitizer (`-race`) enabled:
- `enterprise-pos-backend/internal/config` — **PASS**
- `enterprise-pos-backend/internal/delivery/http/middleware` — **PASS**
- `enterprise-pos-backend/internal/infrastructure/mailer` — **PASS**
- `enterprise-pos-backend/internal/infrastructure/ratelimit` — **PASS**
- `enterprise-pos-backend/internal/infrastructure/ws` — **PASS**
- `enterprise-pos-backend/internal/usecase` — **PASS** (`0` data races detected)

### 4.2 Live Multi-Goroutine Database & API Stress Tests

| Stress Test | Concurrency Profile | Throughput & Wall Time | Latency (`avg` / `p50` / `p95` / `max`) | Data Integrity Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **Test A — Concurrent FIFO Checkouts on Shared SKU (`KM-ARMOR16`)** | `25` simultaneous goroutines checking out `qty = 1` of the exact same product (`Spigen Tough Armor MagFit Case`) across `pgx/v5` ACID transactions | **`25 / 25` (`HTTP 201`)** in `1,460.0 ms` (**`17.1 tx/sec`**) | `avg = 865.75 ms`, `p50 = 800.18 ms`, `p95 = 1,347.26 ms`, `max = 1,459.56 ms` | FIFO stock `before = 369`, `after = 344`, `expected = 344` (**`0` lost updates, `0` negative batches, `0` unbalanced journals**) |
| **Test B — Concurrent Idempotency Replay Race** | `20` simultaneous goroutines firing identical checkout payloads with the same UUIDv7 `idempotency_key` (`replay-race-21cc80e8...`) | Completed in **`202.3 ms`** | Sub-`200 ms` lock resolution | Unique Invoice IDs returned = **`1`**; rows committed in `sales_invoices` = **`1`** (`Expected: 1`, zero duplicate billing) |
| **Test C — 100-Request Multi-User Parallel Read & Analytics Storm** | `25` concurrent workers $\times$ `5` distinct staff JWT tokens (`Owner`, `Manager`, `Cashier`, `Accountant`, `InventoryController`) hitting `/overview`, `/pos/bootstrap`, `/inventory`, `/accounting`, `/customers` | **`100 / 100` (`HTTP 200`)** in `2,253.7 ms` (**`44.4 req/sec`**) | `min = 8.09 ms`, `avg = 377.13 ms`, `p50 = 213.90 ms`, `p95 = 1,395.99 ms`, `max = 1,854.80 ms` | **`0` connection pool timeouts, `0` cross-tenant leaks, `0` errors** |

### 4.3 Engineering Fixes Applied for High-Concurrency Safety
During 25-goroutine stress testing, two real concurrency bottlenecks were uncovered and permanently fixed:
1. **Collision-Proof Document Numbering (`nextDocCode` in `pos_checkout.go` & `inventory_fifo.go`):**
   - *Root Cause:* Sequential `time.Now().UnixMilli()%100000` invoice/journal codes (`#513 %d`, `JE-POS-%d`) could collide when 25 goroutines committed inside the same millisecond, tripping `sales_invoices_business_id_invoice_number_key` or `journal_entries_business_id_entry_number_key`.
   - *Fix:* Replaced raw millisecond modulo formatting with `nextDocCode(prefix)` combining a process-wide monotonic `atomic.Uint64` counter and 6 hex characters of cryptographic UUID entropy.
2. **In-Transaction Settings Resolution (`SettingsResolver.WithQueries(qtx)` in `settings_resolver.go` & `pos_checkout.go`):**
   - *Root Cause:* When Redis was cold for a product-level tax key during a 25-goroutine checkout burst, `p.settings.ResolveDecimal` attempted to acquire a *second* connection from `pgxpool` while all connections were already held by outer `db.Begin(ctx)` checkout transactions—causing pool starvation.
   - *Fix:* Added `SettingsResolver.WithQueries(qtx)` and bound `settingsTx := p.settings.WithQueries(qtx)` inside `Checkout` so any cold PostgreSQL fallback runs directly on the active `pgx.Tx` transaction connection.

---

## 5. Security Architecture & 11-Point Empirical Audit

### 5.1 Multi-Layered Defense-in-Depth Summary
1. **Physical Database-per-Company Isolation:** Each company (`pos_tenant_kova_mobile`) resides in its own PostgreSQL database. Every request resolves the tenant pool via `TenantPoolMiddleware` using the signed `company_slug` and `business_id` in the JWT and verifies that every SQL query filters by `business_id`.
2. **Cryptographic JWT Scope & Live Session Validation:**
   - Staff tokens carry `scope: TENANT_USER` and are validated against the `user_sessions` table on every request so revoked sessions terminate immediately.
   - SuperAdmin tokens carry `scope: PLATFORM_ADMIN` and are strictly blocked from tenant endpoints (`401`), while tenant tokens are blocked from `/api/v1/admin/*` (`403`).
3. **Zero Floating-Point Financial Math:** All currency, tax (`18%` VAT, `2.5%` SSCL), and FIFO cost calculations use `NUMERIC(19,4)` in PostgreSQL and `shopspring/decimal` in Go.
4. **Compile-Time Parameterized SQL (`sqlc` + `pgx/v5`):** Zero string-concatenated SQL queries exist in application request handlers, neutralizing SQL injection vectors.

### 5.2 9-Tier Redis Lua Sliding-Window Rate Limiter (`limiter.go`)

| Policy Name | Max Requests | Window | Key Dimensions | Protected Endpoints |
| :--- | ---: | ---: | :--- | :--- |
| `auth_login` | `10` | `1 min` | Client IP + Account Email | `POST /api/v1/auth/login` (plus 15-min account lockout after 5 failed attempts) |
| `admin_login` | `8` | `1 min` | Client IP + Admin Email | `POST /api/v1/admin/login` |
| `auth_recovery` | `5` | `5 min` | Client IP + Account Email | `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password` |
| `pin_verify` | `5` | `5 min` | Business + User + Client IP | `POST /api/v1/auth/verify-pin` (6-digit Supervisor PIN override) |
| `public_discovery` | `60` | `1 min` | Client IP | `GET /api/v1/auth/discover`, `GET /api/v1/auth/company-portal` |
| `tenant_api` | `240` | `1 min` | Business + User | General authenticated ERP/POS REST endpoints |
| `pos_burst` | `90` | `1 min` | Business + User + Terminal | `POST /api/v1/pos/checkout`, `/pos/hold`, `/pos/return` |
| `analytics_heavy` | `45` | `1 min` | Business + User | `GET /api/v1/overview`, `/reports/summary`, `/accounting` |
| `ws_upgrade` | `20` | `1 min` | Client IP + Business | `GET /api/v1/ws` WebSocket connections |

### 5.3 11-Point Live Security & Database Trigger Verification Results

All `11` security and database-invariant probes in `cmd/verify-kova` passed with `0` failures:

| # | Security / Invariant Probe | Attack Vector / Test Action | Empirical Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **1** | **Cross-Scope JWT Boundary** | Present `PLATFORM_ADMIN` JWT on `/api/v1/overview` and `BusinessOwner` JWT on `/api/v1/admin/overview` | `admin_on_tenant = HTTP 401`, `owner_on_admin = HTTP 403` | **PASS** |
| **2** | **JWT HMAC Signature Tampering** | Mutate payload claims of a valid JWT without the server HMAC secret | Rejected immediately with `HTTP 401 Unauthorized` | **PASS** |
| **3** | **Unauthenticated Endpoint Rejection** | Request `/api/v1/inventory` with no `Authorization` header | Rejected immediately with `HTTP 401 Unauthorized` | **PASS** |
| **4** | **RBAC Least-Privilege Matrix (`Cashier`)** | Authenticate as `cashier@kovamobile.lk` and attempt to access Accounting GL, GRN Intake, Settings, and User RBAC | `accounting = 403`, `grn_create = 403`, `settings = 403`, `rbac_users = 403` | **PASS** |
| **5** | **SQL Injection Resilience (`sqlc` / `pgx`)** | Inject `' OR 1=1; DROP TABLE customers; --`, `' UNION SELECT null,null,null --`, and `KM-IP16PM-256' AND 1=CONVERT(int,(SELECT CURRENT_USER))--` into discovery & search endpoints | Handled safely as literal parameters (`HTTP 200`); `customers_before = 180`, `customers_after = 180` | **PASS** |
| **6** | **Supervisor 6-Digit PIN Override** | Submit invalid PIN `000000` followed by valid Manager PIN `123456` to `POST /api/v1/auth/verify-pin` | `wrong_pin = HTTP 401`, `valid_pin = HTTP 200` (`override_token` issued) | **PASS** |
| **7** | **Instant JWT Session Revocation** | Call `GET /api/v1/auth/me` (`200`), invoke `POST /api/v1/auth/logout` (`200`), then replay the exact same JWT on `GET /api/v1/auth/me` | Replayed token rejected with `HTTP 401` (`{"code":"SESSION_INVALID","error":"session revoked (user_logout)"}`) | **PASS** |
| **8** | **DB Trigger `trg_verify_journal_balance`** | Attempt to commit a `pgx.Tx` with `Debit = 1000.0000` and `Credit = 500.0000` | Rejected by PostgreSQL constraint trigger: `ERROR: Unbalanced double-entry journal ... SUM(debit)=1000.0000 <> SUM(credit)=500.0000 (SQLSTATE P0001)` | **PASS** |
| **9** | **DB Trigger `trg_prevent_locked_period_posting`** | Attempt to insert a backdated journal entry (`2023-02-15`) into locked fiscal period `FY2023-Q1` | Rejected by PostgreSQL trigger: `ERROR: Cannot post journal entry JE-TEST-LOCKED to locked fiscal period ... (SQLSTATE P0001)` | **PASS** |
| **10** | **DB Trigger `trg_immutable_stock_ledger_entries`** | Attempt `UPDATE stock_ledger_entries SET quantity_change = 9999` on an existing audit row | Rejected by PostgreSQL trigger: `ERROR: stock_ledger_entries is immutable and cannot be updated or deleted (SQLSTATE P0001)` | **PASS** |
| **11** | **Brute-Force Login Rate Limiter (`auth_login`)** | Fire rapid invalid login attempts from a test IP against `POST /api/v1/auth/login` | Throttled with `HTTP 429 Too Many Requests` (`triggered_on_attempt = 10`, `Retry-After = 60s`) | **PASS** |
