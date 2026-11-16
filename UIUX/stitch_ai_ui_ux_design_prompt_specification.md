# Stitch UI/UX Specification — Enterprise Multi-Business POS & ERP (Zona Pro Edition)

Use this file directly inside **Stitch** (or as your AI Frontend Design Context / `.cursorrules`) to generate cohesive, high-craft screens and React + Tailwind + `shadcn/ui` components that match the **Zona Pro** reference aesthetic and tactile **dqnamo.com** interaction model.

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
2. **NO HALF-CARDS (Strict Bento Grid Alignment):**
   * Every card in the 12-column Bento grid must stretch vertically (`h-full flex flex-col justify-between`) so the bottom edges of the left 8-column workspace and right 4-column KPI stack align flush.
   * Never allow a card to clip mid-content; use internal scroll containers with top/bottom gradient fade masks (`ScrollFadeList`).
3. **NO DIM BACKGROUNDS:**
   * Keep the main canvas bright `#F5F6FA`.
   * Dropdowns, Select menus, and Calendar date pickers must float cleanly on `#FFFFFF` surfaces with soft shadows (`shadow-xl border border-[#DBD3F5]/50`) and **zero** dark full-screen backdrop overlays.
   * Side Drawers (`Sheet`) and `SweetAlert2` modals must use a subtle glass blur (`bg-[#222026]/20 backdrop-blur-[2px]`) rather than a heavy black dim screen.
4. **1:1 COMPONENT-MATCHED SKELETON LOADING (`CLS = 0`):**
   * Never use generic full-page spinners. Every Bento card, chart, table, and POS product grid must have an exact structural `<Skeleton />` twin (`bg-[#DBD3F5]/35 animate-pulse`) matching the exact pixel height, `rounded-[24px]` radius, and internal layout of the loaded state.

---

## 3. Mandatory Component Primitives (`shadcn/ui` + `21st.dev` + `dqnamo.com` + `SweetAlert2`)

* **Navigation Dock:** Fixed left floating vertical pill (`w-[68px] bg-[#222026] rounded-[28px]`) with top 8-point white star logo, middle `#2C2A32` rounded pill holding 6 module icons (active icon uses `bg-white text-[#222026] rounded-[14px]`), bottom Settings/Help icons, and detached bottom Logout square.
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

## 4. Copy-Paste Prompts for Stitch (Screen-by-Screen Generation)

### Screen 1 Prompt: Executive Overview Bento Dashboard (Exact Reference UI)
```text
Create a high-craft tablet/desktop retail ERP & POS "Overview" dashboard using the Zona Pro design system on a #F5F6FA background with zero top banners and zero half-cards.

1. Left Floating Sidebar: A vertical #222026 pill dock (width 68px, border-radius 28px) with a white 8-point asterisk logo at the top, a #2C2A32 inner pill containing 6 icons (Overview active with white rounded-14px background, Orders with a #877FC1 badge "3", Products t-shirt icon, Transactions icon, Delivery truck icon, Users icon), bottom Help & Settings gear icons, and a detached bottom Logout icon box.

2. Top Header: Left side has "Overview" (30px bold #222026) and subtitle "Detailed information about your store" (14px muted grey). Right side has a circular white Search icon button, a circular Notification Bell button with a green badge "2", and a circular User Avatar dropdown trigger.

3. Main 12-Column Bento Grid (All cards flush height, rounded-24px):
   - Left 8 Columns:
     a) "Sales Analytics" white card: Header has "Men" (#DBD3F5 dot) and "Women" (#877FC1 dot) legend and a rounded pill dropdown "This year v" opening a Shadcn Calendar Popover. Body has a 12-month vertical bar chart (Jan-Dec) where each bar has a solid rounded bottom segment (#DBD3F5 for inactive, #877FC1 for active "Jul") and a diagonal lavender hatched top segment. Above "Jul", render a floating #222026 dark tooltip card showing "July, 14", "Sold 104", "Return 0".
     b) Middle Row (split 3 cols / 5 cols):
        - "Top sales by country" white card (3 cols): Donut chart in #222026, #877FC1, and #DBD3F5 with floating white bordered pill labels ("40%", "19%", "21%") on the ring and legend dots ("USA", "Australia", "Korea").
        - "Last activity" white card (5 cols): Scrollable list with soft top/bottom fade showing 4 recent POS orders (Alia Bonner - Paid in green, Kobi Potts - Refund in red, Austin Camacho - Paid, Millie Tran - Paid), order IDs (#513 003), amounts ($311.00), and overlapping circular product thumbnails ending with a #DBD3F5 "+5" badge.
     c) Bottom Row: "Product sales" white table card (8 cols): Clean table with columns Item (product thumbnail + name like "Sleeved cardigan"), Stock (118, 328), Old price ($55.00), Sale (5%, 8%, 15% in green), New price ($52.25), and Items sold (294).

   - Right 4 Columns (Stacked flush to match left column height):
     a) "Total Customers" dark card (#222026 background, white text): Shows "1.226" with green "+79%" badge, "683 users last month", and a horizontal split bar where the left 40% is a white diagonal hatch pattern and the right 60% is a solid white rounded bar ("o Men" / "• Women").
     b) "Total Revenue" gradient card (lavender #7F78B8 to warm sand #DFC8B8 mesh gradient, white text): Shows "$12.000" ("-10%"), "$ 15.650 last month", and 8 vertical white pill bars where bar "16" is #222026 with a floating dark pill tooltip "$1210,6" and a horizontal dashed line.
     c) "Total Orders" warm cream card (#F9EFEA): Shows "$15.210" ("+51%"), "$ 12,000 last month", and a smooth #222026 curved sparkline from "1 Jul" to "25 Jul". Directly beneath, place a full-width #222026 pill button "Export statistics" with an upload icon.
```

### Screen 2 Prompt: Offline-First Edge POS Terminal & Tactile Checkout
```text
Create an Offline-First Edge POS Terminal screen in the Zona Pro design system (#F5F6FA canvas, #222026 floating left sidebar, #877FC1 and #DBD3F5 accents, zero banners, zero half-cards).

1. Top Header: Title "POS Terminal #01 — Main Branch", live online/offline sync status pill ("Synced • 0 Pending in Outbox" with green dot), Barcode Scanner active indicator, and Cashier Avatar with Role badge ("Cashier") and "Held Bills (3)" button.
2. Left 8 Columns (Catalog & Fast Entry):
   - Horizontal category pill bar ("All Items" active in #222026, "Outerwear", "Knitwear", "Linen", "Accessories" in white pills) + instant SKU/Barcode search input.
   - 4x3 Bento Product Grid: White rounded-20px cards with product image, title ("Sleeved cardigan"), SKU code, FIFO batch stock badge ("118 in stock" in #DBD3F5 pill, or amber "Low: 4 left"), and bold tabular price "$52.25".
3. Right 4 Columns (Live Cart & Tactile Keypad — full height):
   - White rounded-24px Cart Card: Customer selector dropdown at top ("Alia Bonner • Loyalty VIP"), scrollable cart items inside a ScrollFadeList with +/- tactile steppers, inline discount badge ("-5%"), and FIFO batch cost tag.
   - Multi-tier Tax & Totals breakdown: Subtotal, Compound/Exclusive Tax breakdown, Discount, and Grand Total "$311.00".
   - Tactile 3D Keypad & Action Bar (dqnamo style): Compressible 3D numeric keys (0-9, 00, Backspace), quick tender pills ("Exact Cash", "$50", "$100", "Split Card/Cash"), a press-and-hold "Void Bill" button (HoldToConfirm), and a full-width #222026 DynamicButton "Charge $311.00".
```

### Screen 3 Prompt: POS Receipt Printer Completion Modal & Held Bills Drawer
```text
Create two interactive overlay views for the Zona Pro POS Terminal using a light glass blur (backdrop-blur-[2px] bg-[#222026]/20, no heavy dark background):

1. Right Slide-Over Shadcn Drawer ("Suspended / Held Bills"):
   - Displays 3 held transactions rendered as perforated physical tickets (dqnamo Ticket style with semi-circular side notches and dashed tear lines).
   - Each ticket shows Hold Timestamp ("Held 4 mins ago by Terminal #02"), Customer Name, item count, total "$311.00", and two buttons: "Recall to Cart" (#222026 pill) and "Void Held Bill" (HoldToConfirm).

2. Center Checkout Completion & Thermal Receipt Printer Modal:
   - Renders a realistic top thermal printer slot (dqnamo ReceiptPrinter component) feeding out an 80mm paper receipt with store header, itemized tax audit table, FIFO batch references, barcode/QR code, and "PAID $311.00".
   - Below the paper receipt: Hardware status pills ("WebUSB 80mm Connected", "Cash Drawer Kicked") and action buttons: "Print Copy (ESC/POS)", "Send WhatsApp/Email", and "New Sale (Enter)".
```

### Screen 4 Prompt: Multi-Tenant RBAC Login, Branch Switcher & Supervisor PIN Modal
```text
Create the Authentication & RBAC Security views in the Zona Pro aesthetic (#F5F6FA background, #877FC1, #DBD3F5, #222026):

1. Split Bento Card Login Screen:
   - Left Card (#222026 dark obsidian card): Brand asterisk mark, "Enterprise Multi-Business POS", live terminal telemetry, and encrypted ScrambleText terminal pairing code.
   - Right Card (#FFFFFF rounded-24px): Business Tenant selector dropdown, Email/Staff ID input, Password input, Role indicator, and #222026 "Sign In to Terminal" DynamicButton.

2. Supervisor 6-Digit PIN Override Modal (Triggered when a Cashier clicks Refund, Void, or Price Override):
   - Compact rounded-24px white card with a #DBD3F5 security badge ("Manager Approval Required for `pos:void_bill`"), 6 circular PIN dot indicators, a 3x4 grid of compressible 3D TactileButtons (0-9, Clear, Verify), and a reason selector dropdown ("Customer Changed Mind", "Damaged Batch", "Pricing Error").
```

### Screen 5 Prompt: 6-Level Settings Inheritance Tree & FIFO GRN Drawer
```text
Create the Enterprise Back-Office Settings & FIFO Inventory Management screen in the Zona Pro design system:

1. 6-Level Settings Inheritance Explorer (Main 8-Col Card):
   - Visual horizontal breadcrumb scope bar: [1. System Default] -> [2. Business: Zona Retail Ltd] -> [3. Branch: Colombo Flagship] -> [4. Terminal #01] -> [5. Category: Knitwear] -> [6. SKU: Sleeved Cardigan].
   - Settings table showing Parameter Name (e.g., "Allow Negative FIFO Stock", "Thermal Paper Width", "Default Tax Group", "Price Rounding Mode"), Effective Resolved Value, Inherited From Scope badge (in #DBD3F5 or #877FC1), and an inline Switch/Select override control with a "Reset to Inherited" action.

2. Right 4-Col Slide-Over GRN (Goods Received Note) & FIFO Batch Drawer:
   - Supplier selector dropdown, PO reference selector, Shadcn Calendar Popover for Batch Expiry Date, MagneticDropZone for dragging supplier invoice PDFs, batch unit cost & quantity inputs, automatic Double-Entry GL preview ("DR Inventory Asset $1,200.00 / CR Accounts Payable $1,200.00"), and a #222026 "Approve GRN & Post FIFO Batch" button that triggers a Zona Pro styled SweetAlert2 confirmation dialog.
```

---

## 5. 1:1 Skeleton Loading Specification Matrix (`CLS = 0`)

Every generated screen must include its paired Skeleton state using `bg-[#DBD3F5]/35 animate-pulse`:

| Target Component | Skeleton Twin Component | Structural Geometry Rules |
| :--- | :--- | :--- |
| `SalesAnalyticsCard` | `<SalesAnalyticsSkeleton />` | Exact `h-[340px] rounded-[24px] bg-white p-6`, header title/pill shimmer blocks + 12 vertical rounded bar shimmer columns matching the exact monthly bar widths (`w-7 rounded-[10px]`). |
| `TotalCustomersCard` | `<TotalCustomersSkeleton />` | Exact `h-[210px] rounded-[24px] bg-[#222026] p-6`, white/15 shimmer blocks for the `1.226` metric and the `h-9` split 40%/60% horizontal bar. |
| `TotalRevenueCard` | `<TotalRevenueSkeleton />` | Exact `h-[230px] rounded-[24px]` gradient surface with white/20 shimmer blocks for the `$12.000` metric and 8 vertical mini-bars. |
| `LastActivityCard` | `<LastActivitySkeleton />` | Exact `h-[260px] rounded-[24px] bg-white p-6` with 4 rows containing a `w-10 h-10 rounded-full` avatar shimmer, 2 stacked text lines, and 3 overlapping `w-7 h-7 rounded-full` product pill shimmers. |
| `ProductSalesTableCard` | `<ProductSalesTableSkeleton />` | Exact `rounded-[24px] bg-white p-6` with 1 header row and 3 data rows (`h-14` each) containing `w-10 h-10 rounded-xl` thumbnail shimmers and 5 tabular column shimmers. |
| `POSProductGrid` | `<POSGridSkeleton />` | 12 `rounded-[20px] bg-white p-4 h-[220px]` cards with aspect-square image shimmer, title line, FIFO badge pill shimmer, and price block. |