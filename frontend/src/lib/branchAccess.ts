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
  if (!seg || seg.toLowerCase() === 'unisex' || seg.toLowerCase() === 'general') {
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

