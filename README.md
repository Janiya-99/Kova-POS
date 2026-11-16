# KOVA POS

> **Effortless at the counter. Powerful behind the scenes.**

KOVA POS is a modern, cloud-native, offline-capable point-of-sale and double-entry accounting platform built with a **Go + Fiber v2 + PostgreSQL 16 + Redis 7.2** backend and a **React 19 + TypeScript + Vite + Dexie.js** frontend.

---

## Brand Overview

**KOVA POS** is designed to be the invisible powerhouse behind everyday commerce. Created with an **"all-terrain" philosophy**, KOVA is built to feel equally at home in a bustling, aesthetic specialty cafe, a fast-paced retail boutique, or a rugged, high-inventory hardware store.

- **Modern:** Built for lightning-fast counter throughput, automated low-stock replenishment workflows, real-time telemetry, and clean, zero-clutter interfaces.
- **Approachable:** Eliminates traditional POS clutter with a visual, intuitive 4-pane workflow that takes staff less than five minutes to learn.

### Why KOVA Fits Every Business

- **The Specialty Cafe (Fast & Fluid):** Instant modifier prompts, order channels (`Counter`, `Dine-In`, `Takeaway`, `Delivery`), table/KOT workflows, and tap-and-go checkout speed built for morning rushes and curated counters.
- **The Retail Shop (Connected & Smart):** Multi-variant SKUs (size, color, style matrices), customer profiles & loyalty tracking, gift/discount controls, held bills, and consolidated multi-branch reporting.
- **The Hardware Store (Robust & Heavy-Duty):** Manages large SKU catalogs with FIFO batch cost layers, multi-UOM conversions (piece/box/roll), fractional quantities (`0.50`, `2.25`), supplier purchase orders & GRN intake, offline IndexedDB queuing, barcode scanning, and industrial thermal ESC/POS printing.

### The Brand Voice & Persona

- **Core Promise:** *"Effortless at the counter. Powerful behind the scenes."*
- **Visual Identity:** High-contrast, clean, forward-leaning obsidian-and-emerald identity pairing crisp geometric precision (`K` emblem + `Kova POS` lockup) with soft, accessible curves and balanced cards.
- **Personality:** Reliable, energetic, adaptable, and helpful — engineered to be a dependable partner for business owners and counter teams alike.

---

## System Architecture

KOVA POS follows a **Multi-Tenant Clean / Hexagonal Architecture** paired with **Database-Per-Company Isolation** and an **Offline-First Edge POS** sync engine.

```mermaid
flowchart TB
    subgraph Client["Edge Browser & Counter Terminal"]
        UI["React 19 + TypeScript SPA (Tailwind v4, shadcn/ui, Zustand, TanStack Query)"]
        EdgeDB["Dexie.js IndexedDB (Catalog, FIFO Batches, Tax Rules, UUIDv7 Outbox)"]
        PrintBridge["ESC/POS Hardware Bridge (WebUSB, WebSerial, RawBT, A4 PDF)"]
        UI <--> EdgeDB
        UI --> PrintBridge
    end

    Proxy["Nginx Reverse Proxy / Vite Dev Proxy (/api/* HTTP + /ws WebSocket)"]
    Client -->|HTTPS / WSS| Proxy

    subgraph API["Go Backend (Fiber v2 - port 8080)"]
        MW["Middleware Pipeline (Rate Limiter, JWT Auth, Session Validator, RBAC + PIN Guard)"]
        Router["TenantManager (Lazy Pool Router: Master DB vs pos_tenant_slug)"]
        UseCases["Domain & Usecases (POS Checkout, FIFO, Tax, GL, 6-Level Settings, Print Studio)"]
        Worker["Asynq Background Worker (Auto-PO Low-Stock Evaluator)"]
        Hub["WebSocket Hub (/ws: HELD_BILL, SETTINGS, SESSION_REVOKED, LOW_STOCK)"]
        MW --> Router --> UseCases
        UseCases --> Worker
        UseCases --> Hub
    end

    Proxy --> MW

    subgraph Data["Data & Cache Layer"]
        MasterDB[("PostgreSQL 16 Master DB (enterprise_pos: Platform Control Plane & Registry)")]
        TenantDB[("PostgreSQL 16 Tenant DBs (pos_tenant_slug: 3NF Schema & Journal Trigger)")]
        Redis[("Redis 7.2 AOF (Settings Cache, Lua Rate Limiter, Asynq Queue)")]
    end

    Router --> MasterDB
    Router --> TenantDB
    MW --> Redis
    UseCases --> Redis
    Worker --> Redis
    Worker --> TenantDB
```

### Core Architectural Invariants

1. **Dual-Scope Database-Per-Company Topology:**
   - **Master Control Plane (`enterprise_pos`):** Houses Platform SuperAdmin identities, platform sessions, cross-tenant company provisioning records, and global audit logs — isolated behind `PlatformAdminMiddleware` (`PLATFORM_ADMIN` JWT scope only).
   - **Isolated Tenant Databases (`pos_tenant_<slug>`):** Each company receives its own physical PostgreSQL 16 database provisioned, migrated, and lazily pooled (`MaxConns = 10` per tenant) by [`TenantManager`](backend/internal/infrastructure/tenant/manager.go), with every business-scoped query filtered by `business_id` from verified JWT claims.
2. **6-Level Settings Inheritance Hierarchy:**
   Settings resolve dynamically from broadest fallback down to individual SKU, cached in Redis with a thread-safe in-memory TTL fallback and pushed live via WebSocket (`SETTINGS_UPDATED`):
   $$\text{System Default} \rightarrow \text{Business} \rightarrow \text{Branch / Warehouse} \rightarrow \text{Terminal} \rightarrow \text{Category} \rightarrow \text{Product}$$
3. **Zero Floating-Point Currency Math:**
   PostgreSQL stores monetary quantities as `NUMERIC(19,4)`, `sqlc` maps database numeric columns to `shopspring/decimal`, and the frontend handles decimal arithmetic as strings/decimal utilities to avoid IEEE-754 rounding drift.
4. **Immutable Double-Entry Accounting:**
   Every financial event (`POS Checkout`, `Refund`, `Void`, `GRN Approval`) executes inside a single `pgx/v5` ACID transaction and writes balanced `journal_entries` and `journal_lines`. A deferred PostgreSQL constraint trigger (`trg_verify_journal_balance`) enforces $\sum \text{debit} = \sum \text{credit}$ on commit.
5. **Warehouse FIFO Batch Depletion & Auto-PO Replenishment:**
   Checkouts lock active `inventory_batches` rows with `SELECT ... FOR UPDATE` (`received_at ASC, expiry_date ASC NULLS LAST, id ASC`), compute weighted FIFO COGS, record `stock_movements`, and trigger Asynq (`inventory:check_low_stock`) to draft purchase orders and supplier invoices when remaining stock falls at or below `reorder_point`.
6. **Offline-First Edge POS Sync:**
   Register catalogs, FIFO batches, tax rules, resolved settings, suspended bills, and print templates are cached locally in IndexedDB (`Dexie.js`). Offline sales enqueue to `sync_outbox` with `UUIDv7` keys and replay deterministically with `X-Idempotency-Key` headers once connectivity returns.
7. **Multi-Industry POS Profiles & Multi-Tier Tax Engine:**
   - Six switchable terminal profiles (`retail`, `restaurant`, `hardware`, `garage`, `mobile`, `stationery`) toggle dynamic 4-pane capabilities (table/KOT queues, fractional qty, multi-UOM, vehicle plate capture, parts-vs-labor split, serial/IMEI capture, size/color matrices, and bundle prompts).
   - Supports `EXCLUSIVE`, `INCLUSIVE`, and `COMPOUND` tax rules plus a built-in Sri Lankan IRD tax preset (**VAT 18%** + **SSCL 2.5%**).

---

## Tech Stack

### Backend (`backend/`)
| Layer | Technology / Library | Notes |
| :--- | :--- | :--- |
| Language & Runtime | Go `1.22` (`golang:1.23-alpine` build) | Compiled static Linux binary (`CGO_ENABLED=0`) |
| HTTP & WebSockets | Fiber `v2.52.5`, `@gofiber/contrib/websocket v1.3.2` | High-throughput `fasthttp` routing + tenant `/ws` hub |
| PostgreSQL Driver & Codegen | `pgx/v5 v5.7.1`, `sqlc v2` | Type-safe SQL queries + strict `shopspring/decimal` mapping |
| Financial Math | `shopspring/decimal v1.4.0` | Arbitrary-precision decimal currency & tax math |
| Caching, Queue & Pub/Sub | `go-redis/v9 v9.7.0`, `hibiken/asynq v0.24.1` | Settings cache, Lua rate limiting, background Low-Stock worker |
| Auth & Crypto | `golang-jwt/jwt/v5 v5.2.1`, `golang.org/x/crypto`, `google/uuid v1.6.0` | Signed JWTs, bcrypt hashes, `UUIDv7` session/idempotency keys |

### Frontend (`frontend/`)
| Layer | Technology / Library | Notes |
| :--- | :--- | :--- |
| Framework & Language | React `19.0`, TypeScript `~5.7.2`, Vite `6.1` | Fast SPA bundling with strict TypeScript checking (`tsc -b`) |
| Styling & UI Primitives | Tailwind CSS `v4.0.9`, `shadcn/ui`, Radix UI, `lucide-react` | Custom semantic theme tokens, crisp SVG iconography, accessible dialogs/tabs |
| State & Data Fetching | Zustand `v5.0.3`, TanStack React Query `v5.66` | Persisted auth/POS/i18n (`en`, `si`, `ta`) stores + reactive query invalidation |
| Offline Edge Storage | Dexie.js `v4.0.11` (`IndexedDB`), `uuid v11.1.0` | Offline catalog, FIFO snapshot cache, held bills, and `UUIDv7` `sync_outbox` |
| Data Viz, Dates & Feedback | Recharts `v2.15`, `react-day-picker v9.5` + `date-fns v4.1`, `Sonner`, `SweetAlert2` | Executive Bento charts, shadcn range calendar pickers, confirmation dialogs |
| Print Studio & Hardware | `@dnd-kit/core`, `react-rnd`, `jsPDF v4.2`, `qrcode v1.5` | Canva-style drag/resize canvas designer, A4 vector PDFs, ESC/POS (`58mm`/`76.2mm`/`80mm`) bridge |

### Infrastructure (`docker-compose.yml`, `frontend/nginx.conf`)
| Service | Image / Tool | Role |
| :--- | :--- | :--- |
| Database | `postgres:16-alpine` | Master Control DB (`enterprise_pos`) + dynamic isolated `pos_tenant_<slug>` DBs (13 versioned migrations) |
| Cache & Broker | `redis:7.2-alpine` (`--appendonly yes`) | Persistent AOF Redis for rate limits, 6-level settings cache, session validation cache, and Asynq jobs |
| API Container | Multi-stage Alpine (`backend/Dockerfile`) | Serves REST & WebSocket API on `:8080` with healthcheck (`/api/v1/health`) |
| Web Edge | `nginx` (`frontend/Dockerfile`, `frontend/nginx.conf`) | Serves immutable hashed assets, gzip compression, SPA routing, and proxies `/api/` + `/ws` to backend |

---

## Performance, Security & Reliability

### Performance Engineering
- **Sub-Millisecond Cache Hierarchy:** 6-level settings lookups short-circuit in Redis (`REDIS_CACHE`) or Go's in-process `sync.RWMutex` TTL cache (`MEMORY_CACHE`) before touching PostgreSQL.
- **Bounded Per-Tenant Connection Pooling:** Lazy initialization of `pgxpool` instances (`MaxConns = 10` per active tenant DB) prevents cold connection storms across idle tenants.
- **Async Offloading:** Post-checkout inventory threshold checks and Auto-PO drafting execute asynchronously via Asynq (`Concurrency: 4`) so register checkout latency stays independent of supplier PO generation.
- **Edge & Asset Optimization:** Nginx serves `/assets/` with `Cache-Control: public, max-age=31536000, immutable` + `gzip`, while Dexie.js serves catalog and tax lookups locally in IndexedDB and zero-CLS `1:1` skeletons eliminate layout shift during data loads.

### Security, Session Governance & Rate Limiting
- **Stateful Session Management (`user_sessions` & `platform_admin_sessions`):**
  Every tenant and platform session persists device metadata, IP address, `idle_expires_at` (`480m` default), `expires_at` (`24h` default), and `max_concurrent` (`5` default, evicting the oldest active session on overflow). Revoking a session in Settings or the Platform Admin Portal invalidates Redis/DB checks immediately and pushes `SESSION_REVOKED` over WebSocket.
- **Atomic Redis Lua Multi-Tier Rate Limiter (`backend/internal/infrastructure/ratelimit/limiter.go`):**
  Executes atomic `INCR + PEXPIRE` Lua scripts in Redis (with automatic thread-safe in-memory fallback and standard `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `X-RateLimit-Policy` headers):

  | Tier Policy | Default Limit | Window | Scope Key |
  | :--- | :--- | :--- | :--- |
  | `auth_login` | `10` | `1m` | Client IP |
  | `admin_login` | `8` | `1m` | Client IP |
  | `auth_recovery` | `5` | `5m` | Client IP |
  | `pin_verify` | `5` *(policy-configurable)* | `5m` | Business + User + IP |
  | `public_discovery` | `60` | `1m` | Client IP |
  | `tenant_api` | `240` *(policy-configurable)* | `1m` | Business + User |
  | `pos_burst` | `90` | `1m` | Business + User + Terminal |
  | `analytics_heavy` | `45` | `1m` | Business + User |
  | `ws_upgrade` | `20` | `1m` | Client IP |

- **Granular RBAC + 6-Digit Supervisor PIN Override:** Every endpoint verifies JWT permission claims (`pos:checkout`, `inventory:grn_approve`, `accounting:lock_period`, `security:sessions_manage`, etc.) or accepts a scoped `X-Supervisor-Override-Token` minted after 6-digit manager PIN verification.

---

## Repository Structure

```text
POS/
├── backend/
│   ├── cmd/api/main.go                    # Fiber HTTP/WS server, TenantManager & Asynq startup
│   ├── internal/
│   │   ├── config/                        # Env config loader (PORT, DATABASE_URL, REDIS_ADDR, secrets)
│   │   ├── delivery/http/                 # Router, REST handlers, security/session handlers, RBAC & rate-limit middlewares
│   │   ├── domain/                        # Domain structs, TenantContext, SessionPolicy
│   │   ├── infrastructure/
│   │   │   ├── db/                        # Master & per-tenant migration runner + DSN helpers
│   │   │   ├── ratelimit/                 # Atomic Redis Lua + in-memory multi-tier limiter & tests
│   │   │   ├── tenant/                    # Database-per-company pool & usecase router
│   │   │   └── ws/                        # Tenant-scoped WebSocket broadcast hub
│   │   ├── repository/sqlc/               # SQL query definitions & sqlc-generated pgx/v5 bindings
│   │   ├── usecase/                       # Auth, FIFO inventory, Tax engine, GL, Analytics, Print Studio, 6-level settings
│   │   └── worker/                        # Asynq low-stock Auto-PO background worker
│   ├── migrations/                        # 13 sequential up/down SQL migrations + demo seed
│   ├── Dockerfile
│   ├── go.mod
│   └── sqlc.yaml
├── frontend/
│   ├── public/favicon.svg                 # KOVA geometric K emblem
│   ├── src/
│   │   ├── components/
│   │   │   ├── brand/KovaLogo.tsx         # KovaMark & KovaLogo lockups
│   │   │   ├── dqnamo/                    # Tactile POS keypad, tickets, print & motion primitives
│   │   │   ├── layout/                    # FloatingSidebar, TopHeader, AppShell
│   │   │   ├── skeletons/                 # 1:1 zero-CLS page skeletons
│   │   │   └── ui/                        # shadcn/ui components & DateRangePicker
│   │   ├── features/                      # auth, admin, overview, pos, catalog, inventory, accounting, reports, print-studio, settings
│   │   ├── lib/                           # api client, dexie-db offline engine, escpos-bridge, decimal & currency helpers
│   │   ├── locales/                       # English (en), Sinhala (si), Tamil (ta) translations
│   │   └── store/                         # Zustand stores (auth, platformAdmin, pos, theme, i18n)
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── vite.config.ts
├── docs/                                  # System Design Document (sdd.md) & UI design context
├── UIUX/                                  # Design system specification
├── .env.example                           # Documented environment variable template (copy to .env)
├── .gitignore                             # Excludes .env, node_modules, dist, .vite, and agent files
└── docker-compose.yml                     # PostgreSQL 16 + Redis 7.2 + Go API + Nginx Frontend
```

---

## Project Setup Guide

### Prerequisites

- **Docker & Docker Compose v2** *(recommended for one-command stack startup)*
- Or for native host development:
  - **Go 1.22+** (built with `1.23` in Docker)
  - **Node.js 20+** and **npm**
  - **PostgreSQL 16+** & **Redis 7.2+** running locally (or via `docker compose up -d postgres redis`)
  - **sqlc v2** *(optional, only needed when editing SQL files under `backend/internal/repository/sqlc/queries/`)*

### Step 1: Clone & Configure Environment Variables (`.env`)

```bash
git clone https://github.com/Janiya-99/Kova-POS.git
cd Kova-POS
cp .env.example .env
```

`backend/internal/config/config.go` automatically loads `.env` (without overriding explicit shell/Docker environment variables), and `docker-compose.yml` substitutes variables from root `.env` automatically:

| Variable | Default / Example | Description |
| :--- | :--- | :--- |
| `PORT` | `8080` | Go Fiber HTTP & WebSocket server listen port |
| `CORS_ALLOW_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed browser origins for CORS |
| `JWT_SECRET` | *(change in production)* | HMAC signing secret for tenant & platform admin JWTs |
| `PIN_TOKEN_SECRET` | *(change in production)* | Signing secret for 6-digit supervisor override tokens |
| `POSTGRES_USER` | `pos_admin` | PostgreSQL superuser for Master & dynamically provisioned tenant DBs |
| `POSTGRES_PASSWORD` | `pos_secret` | PostgreSQL password |
| `POSTGRES_DB` | `enterprise_pos` | Master Control Plane database name |
| `DATABASE_URL` | `postgres://pos_admin:pos_secret@localhost:5432/enterprise_pos?sslmode=disable` | Master DB DSN for native host `go run ./cmd/api` |
| `DOCKER_DATABASE_URL` | `postgres://pos_admin:pos_secret@postgres:5432/enterprise_pos?sslmode=disable` | Master DB DSN used inside Docker Compose |
| `REDIS_ADDR` | `localhost:6379` | Redis address for native host development |
| `DOCKER_REDIS_ADDR` | `redis:6379` | Redis address used inside Docker Compose |
| `VITE_API_TARGET` | `http://localhost:8080` | Backend target used by Vite dev proxy (`/api` and `/ws`) |
| `APP_BASE_URL` | `http://localhost:5173` | Public frontend base URL embedded in password-reset email links |
| `SMTP_HOST` | *(optional / e.g. `smtp.gmail.com` or `localhost`)* | SMTP relay hostname for sending password reset OTP & direct reset link emails |
| `SMTP_PORT` | `587` | SMTP port (`465` implicit TLS, `587` STARTTLS, or `1025` for local Mailpit) |
| `SMTP_USER` | *(your SMTP username)* | SMTP authentication username (leave blank for unauthenticated local Mailpit) |
| `SMTP_PASSWORD` | *(your SMTP password / App Password)* | SMTP authentication password |
| `SMTP_FROM` | `"KOVA POS <no-reply@kovapos.local>"` | Email `From` display name & envelope sender address |

> **Security & Local Email Testing Note:** Never commit your `.env` file with real production secrets. `.env` is ignored in `.gitignore`, while `.env.example` provides safe templates. To test password reset emails locally without an external SMTP account, run `docker compose --profile dev-mail up -d mailpit` (sets SMTP on `localhost:1025` and web inbox at `http://localhost:8025`) with `SMTP_HOST=localhost` and `SMTP_PORT=1025` in `.env`.

### Step 2: Run the Application

#### Option A — Full Stack with Docker Compose

```bash
docker compose up --build
```

- **Frontend (Nginx):** `http://localhost:5173`
- **Backend API & Healthcheck:** `http://localhost:8080/api/v1/health`
- **PostgreSQL 16:** `localhost:5432`
- **Redis 7.2:** `localhost:6379`

Docker automatically runs `000001_init_3nf_schema.up.sql`, `000002_seed_demo_data.up.sql`, and applies all subsequent migrations (`000003`–`000013`) on backend startup, including provisioning the default isolated tenant DB (`pos_tenant_zona_retail`).

#### Option B — Local Host Development (Hot Reload)

1. Start PostgreSQL 16 and Redis 7.2 dependencies:
   ```bash
   docker compose up -d postgres redis
   ```
2. Start the Go API server (migrations run automatically on boot):
   ```bash
   cd backend
   go run ./cmd/api
   ```
3. In a second terminal, install frontend dependencies and start Vite:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Open `http://localhost:5173`.

### Step 3: Entry Routes & Seeded Demo Credentials

| Portal / Route | Default Account(s) | Notes |
| :--- | :--- | :--- |
| **Company Staff Login** (`/login` or `/c/zona-retail/login`) | `owner@zonaretail.com` · `manager@zonaretail.com` · `cashier@zonaretail.com` · `accountant@zonaretail.com` · `inventory@zonaretail.com` | Demo password: `Zona@2026!` · Supervisor 6-digit PIN: `123456` |
| **Platform SuperAdmin Control Plane** (`/admin/login`) | `admin@zonaplatform.com` | Demo password: `Zona@2026!` *(Manages isolated company DBs, global audit logs & root sessions)* |

---

## Build, Codegen & Test Verification

```bash
# Regenerate type-safe Go queries after editing SQL in backend/internal/repository/sqlc/queries/
sqlc generate -f backend/sqlc.yaml

# Backend compile & unit tests (Config, RBAC, Rate Limiter, Tax, FIFO, Accounting, Print Studio, Sessions)
go -C backend build ./...
go -C backend test -count=1 ./...

# Frontend strict TypeScript check + production bundle
npm --prefix frontend run build
```
