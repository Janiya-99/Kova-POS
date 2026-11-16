# Stitch UI/UX Specification — Enterprise Multi-Business POS & ERP (Zona Pro Edition)

> Synced from `/home/janith/Projects/POS/UIUX/stitch_ai_ui_ux_design_prompt_specification.md` and extended with the project's Symmetrical & Responsive Layout Contract (`@.agents/skills/ui-ux-design/SKILL.md`).

---

## 1. Brand Aesthetic & Design Tokens (`Zona Pro`)

* **Design Persona:** High-contrast Editorial Retail Analytics & Tactile Hardware POS. Soft lavender data visualizations and pure white Bento cards floating on a cool alabaster canvas, anchored by deep obsidian charcoal chrome and physical compressible controls.
* **Primary Font Family:** `Zona Pro` (Fallback: `Plus Jakarta Sans`, `Inter`). Use `tabular-nums` on all currency, stock counts, percentages, and invoice IDs.
* **Color Palette:**
  * **Primary Brand Accent (`Lavender Purple`):** `#877FC1` (Active bar chart columns, active badges, focus rings, primary highlights)
  * **Secondary Soft Tint (`Pale Lavender`):** `#DBD3F5` (Inactive chart columns, diagonal hatch bar patterns, `+5` pill counters, subtle borders, skeleton shimmer base)
  * **Obsidian Charcoal (`Dark Chrome & Contrast Card`):** `#222026` (Left floating pill sidebar, "Total Customers" contrast card, chart floating tooltips, primary pill CTA buttons)
  * **Sidebar Inner Pill Surface:** `#2C2A32` (Container behind inactive navigation icons inside the `#222026` dock)
  * **App Canvas Background:** `#F5F6FA` (Crisp light grey-lavender viewport background)
  * **Bento Card Surface:** `#FFFFFF` (`rounded-[24px]`, zero heavy borders, subtle ambient elevation `shadow-[0_4px_24px_rgba(34,32,38,0.04)]`)
  * **Revenue Mesh Gradient Surface:** `linear-gradient(135deg, #7F78B8 0%, #A9A3CC 52%, #DFC8B8 100%)`
  * **Orders Warm Sand Surface:** `#F9EFEA`
  * **Semantic Status:** Paid / Positive Trend `#22C55E` (`+79%`, `5%`), Refund / Negative Trend `#EF4444` (`-10%`)

---

## 2. Four Non-Negotiable UI/UX Guardrails

1. **BANNERS GET SKIPPED (Zero Banners Rule):**
   * Never generate top promotional banners, welcome hero ribbons, announcement strips, or dismissible alert bars.
   * Every screen starts immediately with the clean Header Bar: Page Title + Subtitle on the left, and circular Search / Notification Bell / User Avatar controls on the right.
2. **NO HALF-CARDS (Strict Bento Grid Alignment & Symmetry):**
   * Every card in the 12-column Bento grid must stretch vertically (`h-full flex flex-col justify-between`) so the bottom edges of the left 8-column workspace and right 4-column KPI stack align flush.
   * Never allow a card to clip mid-content; use internal scroll containers with top/bottom gradient fade masks (`ScrollFadeList`).
3. **NO DIM BACKGROUNDS:**
   * Keep the main canvas bright `#F5F6FA`.
   * Dropdowns, Select menus, and Calendar date pickers must float cleanly on `#FFFFFF` surfaces with soft shadows (`shadow-xl border border-[#DBD3F5]/50`) and **zero** dark full-screen backdrop overlays.
   * Side Drawers (`Sheet`) and `SweetAlert2` modals must use a subtle glass blur (`bg-[#222026]/20 backdrop-blur-[2px]`) rather than a heavy black dim screen.
4. **1:1 COMPONENT-MATCHED SKELETON LOADING (`CLS = 0`):**
   * Never use generic full-page spinners. Every Bento card, chart, table, and POS product grid must have an exact structural `<Skeleton />` twin (`bg-[#DBD3F5]/35 animate-pulse`) matching the exact pixel height, `rounded-[24px]` radius, responsive tracks, and internal layout of the loaded state.

---

## 3. Mandatory Component Primitives (`shadcn/ui` + `21st.dev` + `dqnamo.com` + `SweetAlert2`)

* **Navigation Dock:**
  * Desktop/Tablet (`md+`): Fixed left floating vertical pill (`w-[68px] bg-[#222026] rounded-[28px]`) with top 8-point white star logo, middle `#2C2A32` rounded pill holding 6 module icons (active icon uses `bg-white text-[#222026] rounded-[14px]`), bottom Settings/Help icons, and detached bottom Logout square.
  * Mobile (`< md`): Floating bottom `#222026` horizontal pill dock (`rounded-[24px]`) with `>= 44px` touch targets + overflow `Sheet` drawer so zero navigation is clipped.
* **Dropdowns & Filters:** `shadcn/ui` `DropdownMenu`, `Select`, and `Command` styled with `rounded-full` trigger pills (`This year v`) and `rounded-[18px]` floating menus.
* **Calendars:** `shadcn/ui` `Calendar` inside `Popover` with `#877FC1` active day selection and `#DBD3F5]/40` range highlights.
* **Drawers:** `shadcn/ui` `Sheet` (right slide-over) and `Drawer` for Held Bills, GRN Stock Intake, Invoice GL Drill-down, and 6-Level Settings Overrides.
* **Toasts:** `shadcn/ui` `Sonner` styled as `#222026` dark floating pills with `#877FC1` status accents.
* **Confirmations (`SweetAlert2`):** Custom Zona Pro theme (`rounded-[24px]` white card, `#222026` confirm pill button, `#F5F6FA` cancel pill button) paired with **dqnamo's `Hold to Confirm`** button for destructive actions (Void Bill, Refund, Lock Fiscal Period, Approve GRN).
* **Tactile Hardware Primitives (`dqnamo.com/kitchen` & `21st.dev/@dqnamo`):**
  * `TactileButton`: Compressible 3D physical keys for POS numpad and quick cash tenders.
  * `DynamicButton`: Smoothly width-animating primary CTA (`Export statistics`, `Charge $311.00`).
  * `ReceiptPrinter`: Animated physical thermal receipt dispenser rendered on POS checkout completion.
  * `PerforatedTicket`: Notched ticket cards for Suspended/Held POS bills.
  * `ScrollFadeList`: Soft top/bottom overflow fade list for `Last activity` and POS Cart items.
  * `MagneticDropZone`: Magnetic file upload zone for CSV catalog imports and supplier GRN invoices.

---

## 4. Screen Specifications (Screens 1–5) & Responsive Symmetry

1. **Screen 1: Executive Overview Bento Dashboard (`/overview`)** — Symmetrical 12-col desktop grid (`8 col + 4 col` flush bottom), balanced 3-up KPI row + 2-up mid row on tablet (`md:`), clean single-column stack on mobile (`< md`).
2. **Screen 2: Offline-First Edge POS Terminal (`/pos`)** — Left 8-col Catalog Grid (`grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4`) + Right 4-col Cart & Tactile Keypad (`lg+`), collapsing into a sticky bottom Cart bar + slide-over Cart/Keypad `Sheet` on mobile/narrow tablets.
3. **Screen 3: Held Bills Drawer & Receipt Printer Modal** — Right `Sheet` (`PerforatedTicket` list) & Center Receipt Modal (`ReceiptPrinter` + ESC/POS status pills).
4. **Screen 4: Multi-Tenant Login (`/login`) & Supervisor PIN Modal** — Symmetrical `lg:grid-cols-2` equal-height split Bento cards (`#222026` telemetry card + `#FFFFFF` sign-in card) + 3x4 `TactileButton` PIN pad.
5. **Screen 5: Inventory/FIFO GRN (`/inventory`), General Ledger (`/accounting`), and 6-Level Settings Inheritance (`/settings`)** — Balanced ERP Bento workspaces with responsive table-to-card adaptation on `< md` viewports and right slide-over `Sheet` drawers.

---

## 5. 1:1 Skeleton Loading Specification Matrix (`CLS = 0`)

| Target Component | Skeleton Twin Component | Structural Geometry Rules |
| :--- | :--- | :--- |
| `SalesAnalyticsCard` | `<SalesAnalyticsSkeleton />` | Exact `h-[340px] rounded-[24px] bg-white p-6`, header title/pill shimmer blocks + 12 vertical rounded bar shimmer columns matching the exact monthly bar widths (`w-7 rounded-[10px]`). |
| `TotalCustomersCard` | `<TotalCustomersSkeleton />` | Exact `h-[210px] rounded-[24px] bg-[#222026] p-6`, white/15 shimmer blocks for the `1.226` metric and the `h-9` split 40%/60% horizontal bar. |
| `TotalRevenueCard` | `<TotalRevenueSkeleton />` | Exact `h-[230px] rounded-[24px]` gradient surface with white/20 shimmer blocks for the `$12.000` metric and 8 vertical mini-bars. |
| `LastActivityCard` | `<LastActivitySkeleton />` | Exact `h-[260px] rounded-[24px] bg-white p-6` with 4 rows containing a `w-10 h-10 rounded-full` avatar shimmer, 2 stacked text lines, and 3 overlapping `w-7 h-7 rounded-full` product pill shimmers. |
| `ProductSalesTableCard` | `<ProductSalesTableSkeleton />` | Exact `rounded-[24px] bg-white p-6` with 1 header row and 3 data rows (`h-14` each) containing `w-10 h-10 rounded-xl` thumbnail shimmers and 5 tabular column shimmers. |
| `POSProductGrid` | `<POSGridSkeleton />` | 12 `rounded-[20px] bg-white p-4 h-[220px]` cards with aspect-square image shimmer, title line, FIFO badge pill shimmer, and price block. |

