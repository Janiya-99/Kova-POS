import type { TenantContext } from '@/store/authStore';

export const MULTI_BRANCH_ROLE_CODES = ['SuperAdmin', 'BusinessOwner'] as const;

/**
 * Returns true for SuperAdmin and BusinessOwner roles (company-wide roles by default).
 */
export function isMultiBranchRole(roleCode?: string | null): boolean {
  const code = (roleCode || '').trim();
  return code === 'SuperAdmin' || code === 'BusinessOwner';
}

/**
 * Returns true if the user has full company-wide all-branch access.
 */
export function hasAllBranchesAccess(context?: TenantContext | null): boolean {
  if (!context) return false;
  return isMultiBranchRole(context.role_code) || Boolean(context.all_branches_access);
}

/**
 * Returns true if the user can switch or view across multiple branches
 * (either via BusinessOwner/SuperAdmin role, all_branches_access flag, or >1 assigned branches).
 */
export function hasMultiBranchAccess(
  context?: TenantContext | null,
  branchesCount?: number
): boolean {
  if (!context) return false;
  if (hasAllBranchesAccess(context)) return true;
  if ((context.allowed_branch_ids?.length ?? 0) > 1) return true;
  if ((branchesCount ?? 0) > 1) return true;
  return false;
}

export interface CountryChoice {
  code: string;
  name: string;
}

export const BRANCH_COUNTRY_OPTIONS: CountryChoice[] = [
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'US', name: 'USA' },
  { code: 'CN', name: 'China' },
  { code: 'KR', name: 'South Korea' },
  { code: 'JP', name: 'Japan' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'AU', name: 'Australia' },
  { code: 'SE', name: 'Sweden' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'CA', name: 'Canada' },
];

export function resolveCountryNameFromCode(countryCode?: string): string {
  const clean = (countryCode || '').trim().toUpperCase();
  if (clean === 'UK') return 'United Kingdom';
  const match = BRANCH_COUNTRY_OPTIONS.find((item) => item.code === clean);
  return match ? match.name : clean || 'Sri Lanka';
}

export interface IndustrySegmentOption {
  value: string;
  label: string;
  badgeVariant: 'lavender' | 'positive' | 'accent' | 'default' | 'outline';
}

/**
 * Returns the industry-specific category segments for the active business vertical.
 */
export function getIndustryCategorySegments(industryProfile?: string | null): {
  segmentLabel: string;
  allFilterLabel: string;
  defaultSegment: string;
  options: IndustrySegmentOption[];
} {
  const mode = (industryProfile || 'retail').trim().toLowerCase();
  switch (mode) {
    case 'mobile':
      return {
        segmentLabel: 'Device & Tech Segment',
        allFilterLabel: 'All Tech Segments',
        defaultSegment: 'Devices & Handsets',
        options: [
          { value: 'Devices & Handsets', label: 'Devices & Handsets', badgeVariant: 'lavender' },
          { value: 'Audio & Wearables', label: 'Audio & Wearables', badgeVariant: 'accent' },
          { value: 'Power & Accessories', label: 'Power & Accessories', badgeVariant: 'positive' },
          { value: 'Networking & Services', label: 'Networking & Services', badgeVariant: 'outline' },
        ],
      };
    case 'restaurant':
      return {
        segmentLabel: 'Menu Station Segment',
        allFilterLabel: 'All Menu Stations',
        defaultSegment: 'Kitchen & Mains',
        options: [
          { value: 'Kitchen & Mains', label: 'Kitchen & Mains', badgeVariant: 'lavender' },
          { value: 'Beverages & Barista', label: 'Beverages & Barista', badgeVariant: 'accent' },
          { value: 'Bakery & Desserts', label: 'Bakery & Desserts', badgeVariant: 'positive' },
          { value: 'Combos & Catering', label: 'Combos & Catering', badgeVariant: 'outline' },
        ],
      };
    case 'hardware':
      return {
        segmentLabel: 'Trade & Dept Segment',
        allFilterLabel: 'All Trade Segments',
        defaultSegment: 'Power & Hand Tools',
        options: [
          { value: 'Power & Hand Tools', label: 'Power & Hand Tools', badgeVariant: 'lavender' },
          { value: 'Building Materials', label: 'Building Materials', badgeVariant: 'accent' },
          { value: 'Electrical & Plumbing', label: 'Electrical & Plumbing', badgeVariant: 'positive' },
          { value: 'Safety & Hardware', label: 'Safety & Hardware', badgeVariant: 'outline' },
        ],
      };
    case 'garage':
      return {
        segmentLabel: 'Workshop Segment',
        allFilterLabel: 'All Workshop Segments',
        defaultSegment: 'OEM & Aftermarket Parts',
        options: [
          { value: 'OEM & Aftermarket Parts', label: 'OEM & Aftermarket Parts', badgeVariant: 'lavender' },
          { value: 'Oils, Fluids & Filters', label: 'Oils, Fluids & Filters', badgeVariant: 'accent' },
          { value: 'Tires & Batteries', label: 'Tires & Batteries', badgeVariant: 'positive' },
          { value: 'Service & Diagnostics', label: 'Service & Diagnostics', badgeVariant: 'outline' },
        ],
      };
    case 'stationery':
      return {
        segmentLabel: 'Supply Segment',
        allFilterLabel: 'All Supply Segments',
        defaultSegment: 'Paper & Notebooks',
        options: [
          { value: 'Paper & Notebooks', label: 'Paper & Notebooks', badgeVariant: 'lavender' },
          { value: 'Pens & Writing', label: 'Pens & Writing', badgeVariant: 'accent' },
          { value: 'Art & School Supplies', label: 'Art & School Supplies', badgeVariant: 'positive' },
          { value: 'Desk Tech & Printing', label: 'Desk Tech & Printing', badgeVariant: 'outline' },
        ],
      };
    default:
      return {
        segmentLabel: 'Apparel Segment',
        allFilterLabel: 'All Segments',
        defaultSegment: 'Unisex',
        options: [
          { value: 'Unisex', label: 'Unisex', badgeVariant: 'outline' },
          { value: 'Men', label: 'Men', badgeVariant: 'accent' },
          { value: 'Women', label: 'Women', badgeVariant: 'lavender' },
          { value: 'Accessories', label: 'Accessories', badgeVariant: 'positive' },
        ],
      };
  }
}

/**
 * Maps legacy 'Unisex' category segments on non-retail verticals to their proper industry segment label.
 */
export function resolveCategorySegmentDisplay(
  rawSegment: string | undefined,
  categorySlug: string | undefined,
  industryProfile?: string | null
): string {
  const seg = (rawSegment || '').trim();
  const mode = (industryProfile || 'retail').trim().toLowerCase();
  if (mode === 'retail') {
    return seg || 'Unisex';
  }
  if (
    !seg ||
    seg.toLowerCase() === 'unisex' ||
    seg.toLowerCase() === 'general' ||
    seg.toLowerCase() === 'men' ||
    seg.toLowerCase() === 'women'
  ) {
    const slug = (categorySlug || '').toLowerCase();
    if (mode === 'mobile') {
      if (slug.includes('phone') || slug.includes('tablet') || slug.includes('fold')) {
        return 'Devices & Handsets';
      }
      if (slug.includes('audio') || slug.includes('watch') || slug.includes('wear') || slug.includes('anc')) {
        return 'Audio & Wearables';
      }
      if (slug.includes('power') || slug.includes('charg') || slug.includes('case') || slug.includes('armor') || slug.includes('access')) {
        return 'Power & Accessories';
      }
      if (slug.includes('network') || slug.includes('storage') || slug.includes('service') || slug.includes('repair')) {
        return 'Networking & Services';
      }
      return 'Devices & Handsets';
    }
    return getIndustryCategorySegments(mode).defaultSegment;
  }
  return seg;
}

/**
 * Resolves the active business vertical reliably across JWT context, resolved settings, and cached companies.
 */
export function resolveEffectiveIndustryProfile(
  context?: TenantContext | null,
  resolvedSettings?: Record<string, string>,
  businesses?: Array<{ id?: string; business_id?: string; industry_profile?: string }>
): string {
  const fromSetting = (resolvedSettings?.['pos.ui.layout_mode'] || '').trim().toLowerCase();
  const fromCtx = (context?.industry_profile || '').trim().toLowerCase();
  const fromBiz = (
    businesses?.find((b) => (b.business_id || b.id) === context?.business_id)?.industry_profile || ''
  )
    .trim()
    .toLowerCase();
  return fromSetting || fromCtx || fromBiz || 'retail';
}

export function getIndustryCategoryPlaceholders(industryProfile?: string | null): {
  namePlaceholder: string;
  slugPlaceholder: string;
} {
  const mode = (industryProfile || 'retail').trim().toLowerCase();
  switch (mode) {
    case 'mobile':
      return { namePlaceholder: 'e.g., Flagship Smartphones', slugPlaceholder: 'flagship-smartphones' };
    case 'restaurant':
      return { namePlaceholder: 'e.g., Wood-Fired Pizzas', slugPlaceholder: 'wood-fired-pizzas' };
    case 'hardware':
      return { namePlaceholder: 'e.g., Cordless Power Tools', slugPlaceholder: 'cordless-power-tools' };
    case 'garage':
      return { namePlaceholder: 'e.g., Synthetic Motor Oils', slugPlaceholder: 'synthetic-motor-oils' };
    case 'stationery':
      return { namePlaceholder: 'e.g., Gel Pens & Notebooks', slugPlaceholder: 'gel-pens-notebooks' };
    default:
      return { namePlaceholder: 'e.g., Knitwear', slugPlaceholder: 'knitwear' };
  }
}

export interface IndustryReturnPresetConfig {
  mode: string;
  inventoryTabLabel: string;
  inventoryActionLabel: string;
  posButtonLabel: string;
  posModalTitle: string;
  posModalDescription: string;
  captureSerialLabel: string | null;
  allowFractional: boolean;
  highlightWastageFirst: boolean;
  customerReturnReasons: string[];
  damageReasons: string[];
  wastageReasons: string[];
  expiryReasons: string[];
  supplierReturnReasons: string[];
  defaultDispositionByType: Record<
    'DAMAGE' | 'WASTAGE' | 'EXPIRY_WRITEOFF' | 'SUPPLIER_RETURN',
    'WRITE_OFF_SCRAP' | 'QUARANTINE_DAMAGED' | 'RETURN_TO_SUPPLIER'
  >;
}

/**
 * Provides vertical-adapted classification, terminology, and reason presets for
 * Returns, Damages, Wastages, Expiry Write-Offs, and Supplier RMA/RTV across Inventory & POS.
 */
export function getIndustryReturnAndWastagePresets(
  industryProfile?: string | null
): IndustryReturnPresetConfig {
  const mode = (industryProfile || 'retail').trim().toLowerCase();
  switch (mode) {
    case 'mobile':
      return {
        mode: 'mobile',
        inventoryTabLabel: 'Returns, DOA & E-Waste',
        inventoryActionLabel: 'Record Damage / Wastage / RMA',
        posButtonLabel: 'Returns / DOA',
        posModalTitle: 'Customer Return, DOA & Warranty Exchange',
        posModalDescription:
          'Process full or partial returns, capture device IMEI/serial, and route items to Sellable FIFO, DOA Quarantine, or Scrap Write-Off.',
        captureSerialLabel: 'IMEI / Device Serial #',
        allowFractional: false,
        highlightWastageFirst: false,
        customerReturnReasons: [
          'DOA / Factory Hardware Defect',
          'Warranty Claim Replacement',
          'Screen / Display Fault',
          'Battery / Charging Issue',
          'Unopened Box Exchange',
          'Carrier / Software Lock Issue',
        ],
        damageReasons: [
          'DOA / Transit Screen Crack',
          'Water / Moisture / ESD Damage in Store',
          'Dropped Display / Demo Unit Damage',
          'Crushed Sealed Retail Packaging',
        ],
        wastageReasons: [
          'Battery Swell / E-Waste Write-Off',
          'Demo Unit / Cable Wear Write-Off',
          'Faulty Tempered Glass Installation Wastage',
        ],
        expiryReasons: [
          'Outdated Accessories / Pre-Paid SIM Expiry',
          'Lithium Cell Shelf-Life Expiry',
        ],
        supplierReturnReasons: [
          'RMA Return to Authorized Distributor',
          'DOA Sealed Unit Factory Replacement',
          'Batch Firmware Defect Recall',
        ],
        defaultDispositionByType: {
          DAMAGE: 'QUARANTINE_DAMAGED',
          WASTAGE: 'WRITE_OFF_SCRAP',
          EXPIRY_WRITEOFF: 'WRITE_OFF_SCRAP',
          SUPPLIER_RETURN: 'RETURN_TO_SUPPLIER',
        },
      };
    case 'restaurant':
      return {
        mode: 'restaurant',
        inventoryTabLabel: 'Voids, Spoilage & Wastage',
        inventoryActionLabel: 'Log Kitchen Wastage / Spoilage',
        posButtonLabel: 'Refund / Remake',
        posModalTitle: 'Order Refund, Kitchen Remake & Food Wastage',
        posModalDescription:
          'Issue guest refunds and automatically log perishable food write-offs vs sealed beverage restocks in Inventory & GL.',
        captureSerialLabel: null,
        allowFractional: true,
        highlightWastageFirst: true,
        customerReturnReasons: [
          'Order Remake / Kitchen Error',
          'Cold or Incorrect Dish Served',
          'Customer Allergy / Cancellation',
          'Delivery Spill / Missing Modifier',
          'Sealed Beverage Return',
        ],
        damageReasons: [
          'Plating Spillage / Glassware Breakage',
          'Chilled Storage Crushed Packaging',
          'Damaged Delivery Container Stock',
        ],
        wastageReasons: [
          'Kitchen Prep / Burn Wastage',
          'Expired Perishable / Spoilage',
          'End-of-Day Unsold Bakery Write-Off',
          'Cold-Chain Temperature Breach',
        ],
        expiryReasons: [
          'Expired Dairy / Fresh Produce Spoilage',
          'Past Use-By Sauce / Pantry Stock',
        ],
        supplierReturnReasons: [
          'Rejected Fresh Produce Delivery (RTV)',
          'Faulty / Leaking Keg or Beverage Crate',
        ],
        defaultDispositionByType: {
          DAMAGE: 'WRITE_OFF_SCRAP',
          WASTAGE: 'WRITE_OFF_SCRAP',
          EXPIRY_WRITEOFF: 'WRITE_OFF_SCRAP',
          SUPPLIER_RETURN: 'RETURN_TO_SUPPLIER',
        },
      };
    case 'hardware':
      return {
        mode: 'hardware',
        inventoryTabLabel: 'Returns, Yard Damage & Scrap',
        inventoryActionLabel: 'Record Yard Damage / Cut-Scrap',
        posButtonLabel: 'Returns / Claims',
        posModalTitle: 'Contractor Return, Warranty & Cut-Scrap Claim',
        posModalDescription:
          'Return unopened site materials to FIFO yard stock or quarantine/write off damaged bags, broken tiles, or faulty power tools.',
        captureSerialLabel: 'Tool Serial / Batch Code',
        allowFractional: true,
        highlightWastageFirst: true,
        customerReturnReasons: [
          'Project Over-Order Return (Unopened)',
          'Wrong Spec / Pipe Thread / Dimension',
          'Faulty Power Tool Warranty Claim',
          'Tinted Paint Mix Discrepancy',
        ],
        damageReasons: [
          'Damaged Tile / Sanitaryware Breakage',
          'Forklift Puncture / Yard Handling Damage',
          'Rust / Outdoor Weather Exposure Damage',
        ],
        wastageReasons: [
          'Broken Bag / Cement Moisture Spoilage',
          'Timber / Steel / Cable Cut-Scrap Offcut Wastage',
          'Spilled Solvent / Adhesive Wastage',
        ],
        expiryReasons: [
          'Expired Epoxy / Cured Cement Bag Write-Off',
          'Paint Base Shelf-Life Expiry',
        ],
        supplierReturnReasons: [
          'Faulty Tool Distributor RMA Claim',
          'Defective Pallet / Carton Return to Vendor',
        ],
        defaultDispositionByType: {
          DAMAGE: 'WRITE_OFF_SCRAP',
          WASTAGE: 'WRITE_OFF_SCRAP',
          EXPIRY_WRITEOFF: 'WRITE_OFF_SCRAP',
          SUPPLIER_RETURN: 'RETURN_TO_SUPPLIER',
        },
      };
    case 'garage':
      return {
        mode: 'garage',
        inventoryTabLabel: 'Core Returns, Faults & Fluids',
        inventoryActionLabel: 'Log Part Damage / Fluid Wastage',
        posButtonLabel: 'Part Return / Core',
        posModalTitle: 'Warranty Part Return, Core Exchange & Fluid Claim',
        posModalDescription:
          'Process wrong-fitment OEM parts back into FIFO bin stock or log faulty cores, bay damage, and spilled fluids.',
        captureSerialLabel: 'OEM Part Serial / Vehicle Plate',
        allowFractional: true,
        highlightWastageFirst: false,
        customerReturnReasons: [
          'Wrong OEM Part Fitment',
          'Warranty Part Failure / Claim',
          'Core Return Credit (Battery / Alternator)',
          'Customer Cancelled Bay Repair',
        ],
        damageReasons: [
          'Damaged Gasket / Filter in Transit',
          'Scratch / Thread Damage During Bay Fitment',
          'Cracked Brake Rotor / Lamp Housing',
        ],
        wastageReasons: [
          'Engine Oil / Coolant Spill & Evaporation',
          'Workshop Brake Cleaner / Grease Wastage',
          'Contaminated Hydraulic Fluid Write-Off',
        ],
        expiryReasons: [
          'Expired Sealant / Tire Patch Compound',
          'Aged Lead-Acid Battery Sulphation',
        ],
        supplierReturnReasons: [
          'Defective Core Return to Distributor (RMA)',
          'Warranty Replacement Claim to OEM Vendor',
        ],
        defaultDispositionByType: {
          DAMAGE: 'QUARANTINE_DAMAGED',
          WASTAGE: 'WRITE_OFF_SCRAP',
          EXPIRY_WRITEOFF: 'WRITE_OFF_SCRAP',
          SUPPLIER_RETURN: 'RETURN_TO_SUPPLIER',
        },
      };
    case 'stationery':
      return {
        mode: 'stationery',
        inventoryTabLabel: 'Returns, Ink Expiry & Damages',
        inventoryActionLabel: 'Record Damage / Ink Wastage',
        posButtonLabel: 'Returns / Exchange',
        posModalTitle: 'Pack Return, Defective Instrument & Wastage',
        posModalDescription:
          'Process sealed ream/box returns to FIFO shelves or write off water-damaged paper, dried ink, or defective calculators.',
        captureSerialLabel: 'Device Serial / Batch Lot',
        allowFractional: false,
        highlightWastageFirst: false,
        customerReturnReasons: [
          'Pack / Ream Exchange (Unopened)',
          'Defective Calculator / Instrument',
          'School Booklist Substitution',
          'Wrong Ink / Toner Cartridge Model',
        ],
        damageReasons: [
          'Humidity / Water-Damaged Paper Reams',
          'Torn Blister / Crushed Box Write-Off',
          'Bent Binder / Display Shelf Damage',
        ],
        wastageReasons: [
          'Print & Binding Misprint Spoilage Wastage',
          'Opened Sample / Test Marker Dry-Out',
        ],
        expiryReasons: [
          'Dried Ink / Expired Printer Toner Write-Off',
          'Expired Adhesive / Correction Fluid',
        ],
        supplierReturnReasons: [
          'Vendor Damaged Carton Return (RTV)',
          'Factory Misprinted Batch Return to Publisher',
        ],
        defaultDispositionByType: {
          DAMAGE: 'WRITE_OFF_SCRAP',
          WASTAGE: 'WRITE_OFF_SCRAP',
          EXPIRY_WRITEOFF: 'WRITE_OFF_SCRAP',
          SUPPLIER_RETURN: 'RETURN_TO_SUPPLIER',
        },
      };
    default:
      return {
        mode: 'retail',
        inventoryTabLabel: 'Returns, Defects & RTV',
        inventoryActionLabel: 'Record Defect / Shrinkage / RTV',
        posButtonLabel: 'Returns / Exchange',
        posModalTitle: 'Customer Return, Size Exchange & Defect Claim',
        posModalDescription:
          'Process clean returns back into sellable FIFO inventory or route stained/defective garments to Quarantine or RTV.',
        captureSerialLabel: null,
        allowFractional: false,
        highlightWastageFirst: false,
        customerReturnReasons: [
          'Size / Fit Exchange',
          'Color / Style Preference Return',
          'Apparel Stitching / Zipper Defect',
          'Gift Receipt Return',
          'Wrong Item Packed',
        ],
        damageReasons: [
          'Soiled / Fitting Room Makeup Stain',
          'Torn Seam / Missing Button Defect',
          'Display Sun-Fade / Hanger Damage',
        ],
        wastageReasons: [
          'Seasonal Shrinkage Write-Off',
          'Unrecoverable Fabric Pull / Tear',
        ],
        expiryReasons: ['Seasonal Promotional Stock Write-Down'],
        supplierReturnReasons: [
          'Return to Vendor (RTV) Manufacturing Claim',
          'Incorrect Size Assortment Carton Return',
        ],
        defaultDispositionByType: {
          DAMAGE: 'QUARANTINE_DAMAGED',
          WASTAGE: 'WRITE_OFF_SCRAP',
          EXPIRY_WRITEOFF: 'WRITE_OFF_SCRAP',
          SUPPLIER_RETURN: 'RETURN_TO_SUPPLIER',
        },
      };
  }
}

