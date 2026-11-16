export const MULTI_BRANCH_ROLE_CODES = ['SuperAdmin', 'BusinessOwner'] as const;

/**
 * Returns true strictly for SuperAdmin and BusinessOwner roles.
 * All operational branch roles (Cashier, BranchManager, Accountant, InventoryController, custom)
 * are single-branch pinned on both frontend and backend.
 */
export function isMultiBranchRole(roleCode?: string | null): boolean {
  const code = (roleCode || '').trim();
  return code === 'SuperAdmin' || code === 'BusinessOwner';
}

export interface CountryChoice {
  code: string;
  name: string;
}

export const BRANCH_COUNTRY_OPTIONS: CountryChoice[] = [
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'US', name: 'USA' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'KR', name: 'Korea' },
  { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
];

export function resolveCountryNameFromCode(countryCode?: string): string {
  const clean = (countryCode || '').trim().toUpperCase();
  if (clean === 'UK') return 'United Kingdom';
  const match = BRANCH_COUNTRY_OPTIONS.find((item) => item.code === clean);
  return match ? match.name : clean || 'Sri Lanka';
}

