import { useAuthStore } from '@/store/authStore';

const formatterCache = new Map<string, Intl.NumberFormat>();

function getCachedFormatter(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}::${currency}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

/**
 * Normalizes a raw ISO 4217 currency code or JSON-quoted setting string.
 */
export function normalizeCurrencyCode(raw?: string | null): string {
  const cleaned = String(raw || '')
    .replace(/^"|"$/g, '')
    .trim()
    .toUpperCase();
  if (/^[A-Z]{3}$/.test(cleaned)) {
    return cleaned;
  }
  return '';
}

/**
 * Resolves the active base currency from the 6-level resolved settings map
 * (Business level key: `accounting.base_currency`), falling back to the
 * active tenant context and pre-login public branding.
 */
export function getResolvedBaseCurrency(): string {
  const state = useAuthStore.getState();
  const fromResolved = normalizeCurrencyCode(state.resolvedSettings?.['accounting.base_currency']);
  if (fromResolved) return fromResolved;

  const fromContext = normalizeCurrencyCode(state.context?.base_currency);
  if (fromContext) return fromContext;

  const fromPublic = normalizeCurrencyCode(state.publicBranding?.base_currency);
  if (fromPublic) return fromPublic;

  return 'USD';
}

/**
 * Formats a numeric or decimal-string monetary value using Intl.NumberFormat
 * against the active 6-level resolved base_currency setting.
 */
export function formatCurrency(
  amount: string | number | null | undefined,
  currencyCodeOverride?: string,
  locale = 'en-US'
): string {
  const currency =
    normalizeCurrencyCode(currencyCodeOverride) || getResolvedBaseCurrency();
  const numeric =
    typeof amount === 'number'
      ? amount
      : Number.parseFloat(String(amount ?? '0').trim() || '0');
  const safeValue = Number.isFinite(numeric) ? numeric : 0;

  try {
    return getCachedFormatter(locale, currency).format(safeValue);
  } catch {
    return getCachedFormatter('en-US', 'USD').format(safeValue);
  }
}

/**
 * Extracts the narrow display symbol (e.g., "$", "Rs", "€") for thermal ESC/POS
 * printers, inputs, and compact badges via Intl.NumberFormat.
 */
export function getCurrencySymbol(currencyOrSymbol?: string, locale = 'en-US'): string {
  const raw = String(currencyOrSymbol || '').trim();
  if (raw && !/^[A-Za-z]{3}$/.test(raw) && !/^"[A-Za-z]{3}"$/.test(raw)) {
    return raw;
  }
  const currency = normalizeCurrencyCode(raw) || getResolvedBaseCurrency();
  try {
    const parts = getCachedFormatter(locale, currency).formatToParts(0);
    const sym = parts.find((p) => p.type === 'currency')?.value;
    if (sym) {
      return sym.length > 1 && !sym.endsWith(' ') ? `${sym} ` : sym;
    }
  } catch {
    // Fallback below
  }
  return `${currency} `;
}

export function formatMetricNumber(val: string | number | null | undefined, locale = 'en-US'): string {
  const numeric =
    typeof val === 'number'
      ? val
      : Number.parseFloat(String(val ?? '0').trim() || '0');
  if (!Number.isFinite(numeric)) return '0';
  return new Intl.NumberFormat(locale).format(numeric);
}

