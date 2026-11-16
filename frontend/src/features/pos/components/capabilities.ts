export type IndustryLayoutMode =
  | 'retail'
  | 'restaurant'
  | 'hardware'
  | 'garage'
  | 'mobile'
  | 'stationery';

export type OrderChannel =
  | 'COUNTER'
  | 'DINE_IN'
  | 'TAKEAWAY'
  | 'DELIVERY'
  | 'QUOTATION'
  | 'JOB_CARD';

export interface IndustryPresetMeta {
  mode: IndustryLayoutMode;
  label: string;
  tagline: string;
  defaultChannel: OrderChannel;
  outgoingTitle: string;
  outgoingEmptyText: string;
  defaultShowOutgoingPane: boolean;
  features: {
    enableTables: boolean;
    enableKot: boolean;
    allowFractionalQty: boolean;
    multiUomToggle: boolean;
    requireVehiclePlate: boolean;
    splitLaborParts: boolean;
    matrixVariants: boolean;
    requireSerialImei: boolean;
    enableBundles: boolean;
  };
}

export const INDUSTRY_PRESETS: Record<IndustryLayoutMode, IndustryPresetMeta> = {
  retail: {
    mode: 'retail',
    label: 'Fashion & Retail',
    tagline: 'Size & color variants, hold bills, fast scan',
    defaultChannel: 'COUNTER',
    outgoingTitle: 'Held Bills',
    outgoingEmptyText: 'No suspended bills on hold.',
    defaultShowOutgoingPane: true,
    features: {
      enableTables: false,
      enableKot: false,
      allowFractionalQty: false,
      multiUomToggle: false,
      requireVehiclePlate: false,
      splitLaborParts: false,
      matrixVariants: true,
      requireSerialImei: false,
      enableBundles: false,
    },
  },
  restaurant: {
    mode: 'restaurant',
    label: 'Restaurant & F&B',
    tagline: 'Dining tables, modifiers, live KOT queue',
    defaultChannel: 'DINE_IN',
    outgoingTitle: 'Kitchen KOT & Tables',
    outgoingEmptyText: 'No active tables or KOT tickets in kitchen.',
    defaultShowOutgoingPane: true,
    features: {
      enableTables: true,
      enableKot: true,
      allowFractionalQty: false,
      multiUomToggle: false,
      requireVehiclePlate: false,
      splitLaborParts: false,
      matrixVariants: false,
      requireSerialImei: false,
      enableBundles: false,
    },
  },
  hardware: {
    mode: 'hardware',
    label: 'Hardware & Building',
    tagline: 'Fractional qty, multi-UOM, ProForma quotes',
    defaultChannel: 'COUNTER',
    outgoingTitle: 'Saved Quotes & Holds',
    outgoingEmptyText: 'No saved quotations or held estimates.',
    defaultShowOutgoingPane: true,
    features: {
      enableTables: false,
      enableKot: false,
      allowFractionalQty: true,
      multiUomToggle: true,
      requireVehiclePlate: false,
      splitLaborParts: false,
      matrixVariants: false,
      requireSerialImei: false,
      enableBundles: false,
    },
  },
  garage: {
    mode: 'garage',
    label: 'Auto Service & Garage',
    tagline: 'Vehicle plate, service bays, Parts vs Labor',
    defaultChannel: 'JOB_CARD',
    outgoingTitle: 'Active Service Bays',
    outgoingEmptyText: 'No open vehicle job cards in bays.',
    defaultShowOutgoingPane: true,
    features: {
      enableTables: false,
      enableKot: true,
      allowFractionalQty: true,
      multiUomToggle: false,
      requireVehiclePlate: true,
      splitLaborParts: true,
      matrixVariants: false,
      requireSerialImei: false,
      enableBundles: false,
    },
  },
  mobile: {
    mode: 'mobile',
    label: 'Mobile & Electronics',
    tagline: 'Mandatory IMEI / Serial capture & warranty',
    defaultChannel: 'COUNTER',
    outgoingTitle: 'Held Bills',
    outgoingEmptyText: 'No suspended electronics bills.',
    defaultShowOutgoingPane: true,
    features: {
      enableTables: false,
      enableKot: false,
      allowFractionalQty: false,
      multiUomToggle: false,
      requireVehiclePlate: false,
      splitLaborParts: false,
      matrixVariants: false,
      requireSerialImei: true,
      enableBundles: false,
    },
  },
  stationery: {
    mode: 'stationery',
    label: 'Stationery & High-Velocity',
    tagline: 'Expanded 7-col product grid & pack bundles',
    defaultChannel: 'COUNTER',
    outgoingTitle: 'Held Bills',
    outgoingEmptyText: 'No held stationery bills.',
    defaultShowOutgoingPane: false,
    features: {
      enableTables: false,
      enableKot: false,
      allowFractionalQty: false,
      multiUomToggle: true,
      requireVehiclePlate: false,
      splitLaborParts: false,
      matrixVariants: false,
      requireSerialImei: false,
      enableBundles: true,
    },
  },
};

export const INDUSTRY_MODE_LIST: IndustryPresetMeta[] = [
  INDUSTRY_PRESETS.retail,
  INDUSTRY_PRESETS.restaurant,
  INDUSTRY_PRESETS.hardware,
  INDUSTRY_PRESETS.garage,
  INDUSTRY_PRESETS.mobile,
  INDUSTRY_PRESETS.stationery,
];

export interface POSCapabilities {
  layoutMode: IndustryLayoutMode;
  preset: IndustryPresetMeta;
  fullscreenOnLoad: boolean;
  showCategoriesPane: boolean;
  showOutgoingOrdersPane: boolean;
  footerQuickEditSidebar: boolean;
  enableTables: boolean;
  enableKot: boolean;
  allowFractionalQty: boolean;
  multiUomToggle: boolean;
  requireVehiclePlate: boolean;
  splitLaborParts: boolean;
  matrixVariants: boolean;
  requireSerialImei: boolean;
  enableBundles: boolean;
}

export function normalizeIndustryMode(raw?: string | null): IndustryLayoutMode {
  const candidate = (raw || '').trim().toLowerCase();
  if (candidate in INDUSTRY_PRESETS) {
    return candidate as IndustryLayoutMode;
  }
  return 'retail';
}

function readBoolSetting(
  settings: Record<string, string>,
  key: string,
  fallback: boolean,
): boolean {
  const raw = settings[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

/**
 * Resolve every POS layout and industry feature toggle uniformly from the
 * 6-level inherited settings dictionary and business profile fallback.
 */
export function resolvePOSCapabilities(
  settings: Record<string, string>,
  fallbackIndustry?: string | null,
): POSCapabilities {
  const mode = normalizeIndustryMode(settings['pos.ui.layout_mode'] ?? fallbackIndustry);
  const preset = INDUSTRY_PRESETS[mode];

  return {
    layoutMode: mode,
    preset,
    fullscreenOnLoad: readBoolSetting(settings, 'pos.layout.fullscreen_on_load', true),
    showCategoriesPane: readBoolSetting(settings, 'pos.layout.show_categories_pane', true),
    showOutgoingOrdersPane: readBoolSetting(
      settings,
      'pos.layout.show_outgoing_orders_pane',
      preset.defaultShowOutgoingPane,
    ),
    footerQuickEditSidebar: readBoolSetting(settings, 'pos.layout.footer_quick_edit_sidebar', true),
    enableTables: readBoolSetting(settings, 'pos.features.enable_tables', preset.features.enableTables),
    enableKot: readBoolSetting(settings, 'pos.features.enable_kot', preset.features.enableKot),
    allowFractionalQty: readBoolSetting(
      settings,
      'pos.features.allow_fractional_qty',
      preset.features.allowFractionalQty,
    ),
    multiUomToggle: readBoolSetting(settings, 'pos.features.multi_uom_toggle', preset.features.multiUomToggle),
    requireVehiclePlate: readBoolSetting(
      settings,
      'pos.features.require_vehicle_plate',
      preset.features.requireVehiclePlate,
    ),
    splitLaborParts: readBoolSetting(
      settings,
      'pos.features.split_labor_parts',
      preset.features.splitLaborParts,
    ),
    matrixVariants: readBoolSetting(settings, 'pos.features.matrix_variants', preset.features.matrixVariants),
    requireSerialImei: readBoolSetting(
      settings,
      'pos.features.require_serial_imei',
      preset.features.requireSerialImei,
    ),
    enableBundles: readBoolSetting(settings, 'pos.features.enable_bundles', preset.features.enableBundles),
  };
}

/**
 * Industry-exclusive setting keys. Shared ERP settings (tax, receipts, discounts,
 * drawer behavior, security PIN) are intentionally omitted so they remain visible
 * across every business vertical.
 */
export const INDUSTRY_SETTING_OWNERS: Record<string, IndustryLayoutMode[]> = {
  'pos.features.enable_tables': ['restaurant'],
  'pos.features.enable_kot': ['restaurant', 'garage'],
  'pos.features.allow_fractional_qty': ['hardware', 'garage'],
  'pos.features.multi_uom_toggle': ['hardware', 'stationery'],
  'pos.features.require_vehicle_plate': ['garage'],
  'pos.features.split_labor_parts': ['garage'],
  'pos.features.matrix_variants': ['retail'],
  'pos.features.require_serial_imei': ['mobile'],
  'pos.features.enable_bundles': ['stationery'],
};

/**
 * Returns true if the setting key applies to the tenant's assigned business vertical.
 */
export function isSettingRelevantForIndustry(
  settingKey: string,
  industryMode: IndustryLayoutMode,
): boolean {
  const owners = INDUSTRY_SETTING_OWNERS[settingKey];
  if (!owners || owners.length === 0) {
    return true;
  }
  return owners.includes(industryMode);
}

export interface IndustryBlueprintMeta {
  defaultBranchName: string;
  defaultBranchCode: string;
  thermalPaperWidth: string;
  approvalsSummary: string;
  departments: string[];
  designations: Array<{ title: string; maxDiscountPct: number }>;
  categories: string[];
  brands: string[];
  settingsSummary: string[];
}

export const INDUSTRY_BLUEPRINTS: Record<IndustryLayoutMode, IndustryBlueprintMeta> = {
  retail: {
    defaultBranchName: 'Main Boutique',
    defaultBranchCode: 'SHOP-01',
    thermalPaperWidth: '80mm',
    approvalsSummary: 'Fast GRN & Direct PO',
    departments: ['Executive & Ownership', 'Floor Styling & POS', 'Merchandising & Finance'],
    designations: [
      { title: 'Brand Owner', maxDiscountPct: 100 },
      { title: 'Store Manager', maxDiscountPct: 35 },
      { title: 'Floor Stylist / Advisor', maxDiscountPct: 15 },
      { title: 'POS Sales Cashier', maxDiscountPct: 10 },
      { title: 'Senior Accountant', maxDiscountPct: 15 },
      { title: 'Inventory Controller', maxDiscountPct: 5 },
    ],
    categories: ['Core Collection', 'Accessories'],
    brands: ['Nike', 'Adidas', 'Zara', 'Uniqlo', "Levi's", 'Ray-Ban'],
    settingsSummary: ['Size & Color Matrix Variants', 'Held Bills', '80mm Receipt', 'Max Cashier Disc 15%'],
  },
  restaurant: {
    defaultBranchName: 'Main Dining Room',
    defaultBranchCode: 'DINE-01',
    thermalPaperWidth: '80mm',
    approvalsSummary: 'Instant Kitchen Pantry Intake',
    departments: ['Ownership & Management', 'Culinary & Kitchen Line', 'Dining Room & Front-of-House', 'Pantry, Costing & Accounts'],
    designations: [
      { title: 'Restaurant Proprietor', maxDiscountPct: 100 },
      { title: 'Floor & Shift Manager', maxDiscountPct: 30 },
      { title: 'Head Chef / KOT Lead', maxDiscountPct: 15 },
      { title: 'Waiter / Table Server', maxDiscountPct: 10 },
      { title: 'Counter & Takeaway Cashier', maxDiscountPct: 10 },
      { title: 'Senior Accountant', maxDiscountPct: 15 },
      { title: 'Pantry & Supply Controller', maxDiscountPct: 5 },
    ],
    categories: ['Main Kitchen', 'Beverages & Bar', 'Desserts & Pastry'],
    brands: ['Chef Signature', 'Lavazza', 'Dilmah', 'San Pellegrino', 'Valrhona'],
    settingsSummary: ['Dining Tables Enabled', 'Live Kitchen KOT Queue', '80mm KOT Ticket', '2x Loyalty Points'],
  },
  hardware: {
    defaultBranchName: 'Central Hardware Yard',
    defaultBranchCode: 'YARD-01',
    thermalPaperWidth: '80mm',
    approvalsSummary: 'Manager Approval on PO & GRN',
    departments: ['Proprietorship', 'Trade & Contractor Desk', 'Timber, Dispatch & Warehouse', 'Finance & Costing'],
    designations: [
      { title: 'Hardware Proprietor', maxDiscountPct: 100 },
      { title: 'Yard & Branch Manager', maxDiscountPct: 35 },
      { title: 'Contractor Account Rep', maxDiscountPct: 20 },
      { title: 'Counter & Scale Cashier', maxDiscountPct: 10 },
      { title: 'Senior Accountant', maxDiscountPct: 15 },
      { title: 'Warehouse Stock Controller', maxDiscountPct: 5 },
    ],
    categories: ['Building Materials', 'Power Tools & Fasteners'],
    brands: ['Bosch', 'Makita', 'DeWalt', 'Dulux', '3M', 'Hilti'],
    settingsSummary: ['Fractional Decimal Qty', 'Multi-UOM Switching', 'PO + GRN Approvals', 'Max Contractor Disc 20%'],
  },
  garage: {
    defaultBranchName: 'Main Service Bays',
    defaultBranchCode: 'BAY-01',
    thermalPaperWidth: '80mm',
    approvalsSummary: 'PO Approval Required',
    departments: ['Workshop Management', 'Service Bays & Diagnostics', 'Spare Parts & Service Counter', 'Billing & Accounting'],
    designations: [
      { title: 'Workshop Owner', maxDiscountPct: 100 },
      { title: 'Service Advisor', maxDiscountPct: 25 },
      { title: 'Lead Mechanic / Technician', maxDiscountPct: 10 },
      { title: 'Billing & Parts Cashier', maxDiscountPct: 10 },
      { title: 'Senior Accountant', maxDiscountPct: 15 },
      { title: 'Spare Parts Controller', maxDiscountPct: 5 },
    ],
    categories: ['Service & Labor', 'Spare Parts & Fluids'],
    brands: ['Toyota Genuine', 'Mobil 1', 'Brembo', 'Michelin', 'Bosch Auto', 'Castrol'],
    settingsSummary: ['Mandatory Vehicle Plate', 'Split Parts vs Labor', 'Bay Job Cards', 'Fractional Fluid Qty'],
  },
  mobile: {
    defaultBranchName: 'Flagship Device Lounge',
    defaultBranchCode: 'TECH-01',
    thermalPaperWidth: '80mm',
    approvalsSummary: 'Strict Serialized PO & GRN Approval',
    departments: ['Executive & Warranty', 'Device Sales & Activation', 'Diagnostics & Repairs', 'Serialized Inventory & Audit'],
    designations: [
      { title: 'Store Director', maxDiscountPct: 100 },
      { title: 'Store & Warranty Manager', maxDiscountPct: 25 },
      { title: 'Device & IMEI Specialist', maxDiscountPct: 15 },
      { title: 'Sales Associate', maxDiscountPct: 10 },
      { title: 'Senior Accountant', maxDiscountPct: 15 },
      { title: 'Serialized Stock Controller', maxDiscountPct: 5 },
    ],
    categories: ['Smartphones & Devices', 'Accessories & Chargers'],
    brands: ['Apple', 'OPPO', 'Infinix', 'Soundcore', 'Samsung', 'Google', 'Xiaomi', 'Anker'],
    settingsSummary: ['Mandatory IMEI / Serial', 'PO + GRN Audit Lock', 'Warranty Terms', '80mm Warranty Slip'],
  },
  stationery: {
    defaultBranchName: 'Express Flagship Counter',
    defaultBranchCode: 'FAST-01',
    thermalPaperWidth: '58mm',
    approvalsSummary: 'High-Velocity Fast Intake',
    departments: ['Management', 'Express Checkout Lane', 'Bulk Packs & Supply'],
    designations: [
      { title: 'Business Proprietor', maxDiscountPct: 100 },
      { title: 'Floor Supervisor', maxDiscountPct: 25 },
      { title: 'Express Lane Cashier', maxDiscountPct: 10 },
      { title: 'Senior Accountant', maxDiscountPct: 15 },
      { title: 'Pack & Supply Controller', maxDiscountPct: 5 },
    ],
    categories: ['Paper & Notebooks', 'Office Supplies'],
    brands: ['Faber-Castell', 'Casio', 'Moleskine', 'HP', 'PaperOne', 'Logitech'],
    settingsSummary: ['7-Col Expanded Grid', 'Pack Bundles & Multi-UOM', '58mm Compact Receipt', '2x Loyalty Points'],
  },
};

