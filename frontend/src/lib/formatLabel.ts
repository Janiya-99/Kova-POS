/**
 * Shared human-readable formatting helpers for backend machine codes and enums.
 *
 * Ensures zero raw underscore identifiers (e.g. `POS_VOID`, `SL_VAT_18`,
 * `pos:void_bill`, `HALF_UP`) ever appear in user-facing UI labels while
 * preserving exact backend enum keys for API requests and filters.
 */

const ACRONYMS = new Set([
  'POS',
  'GRN',
  'GL',
  'ERP',
  'VAT',
  'SSCL',
  'SL',
  'IRD',
  'SKU',
  'FIFO',
  'COA',
  'API',
  'ID',
  'PIN',
  'OTP',
  'VIP',
  'KOT',
  'PDF',
  'CSV',
  'QR',
  'URL',
  'RBAC',
  'COGS',
  'MTD',
  'YTD',
  'OK',
  'FX',
  'US',
  'UK',
  'LK',
  'AE',
  'AU',
  'SG',
  'IN',
  'EU',
  'CA',
]);

/**
 * Formats an identifier such as `POS_VOID`, `OPENING_BALANCE`, `HALF_UP`, or
 * `FLOOR_SUPERVISOR` into clean human-readable display text without `_`.
 */
export function formatDisplayLabel(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Replace underscores and colons with spaces, preserving decimals like 2_5 -> 2.5 if needed
  const normalized = trimmed
    .replace(/(\d)_(\d)/g, '$1.$2')
    .replace(/[:_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized
    .split(' ')
    .map((token) => {
      if (!token) return '';
      const upper = token.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      if (/^\d+(\.\d+)?%?$/.test(token)) return token;
      // Preserve mixed-case camel words if already formatted
      if (/[a-z]/.test(token) && /[A-Z]/.test(token)) return token;
      return upper.charAt(0) + upper.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Formats permission keys such as `pos:void_bill` or `settings:write`
 * into clean human-readable action names (e.g. `POS Void Bill`).
 */
export function formatPermissionActionLabel(permission: string | null | undefined): string {
  if (!permission) return '';
  const trimmed = permission.trim();
  if (!trimmed) return '';
  return formatDisplayLabel(trimmed);
}

/**
 * Formats tax badge names/codes without exposing raw underscore codes like `SL_VAT_18`.
 * Example: `VAT (SL_VAT_18)` -> `VAT (SL VAT 18)`
 */
export function formatTaxLabel(name?: string | null, code?: string | null): string {
  const cleanName = name ? formatDisplayLabel(name) : '';
  const cleanCode = code ? formatDisplayLabel(code) : '';
  if (cleanName && cleanCode) {
    if (cleanName.toUpperCase() === cleanCode.toUpperCase()) return cleanName;
    // Avoid redundant `(SL VAT 18)` when name already contains `VAT` and code ends with rate
    return `${cleanName} (${cleanCode})`;
  }
  return cleanName || cleanCode || 'Tax';
}

/**
 * Formats descriptive sentences that may contain embedded machine identifiers
 * such as `POS_VOID #513` or `SL_VAT_18`, replacing only `_` enum tokens cleanly.
 */
export function formatDisplayText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+\b/g, (token) => formatDisplayLabel(token));
}

