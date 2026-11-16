import { useCallback } from 'react';
import {
  formatCurrency,
  getCurrencySymbol,
  normalizeCurrencyCode,
} from '@/lib/currency';
import { useAuthStore } from '@/store/authStore';

/**
 * Reactively subscribes components (including keep-alive routes) to the tenant's
 * 6-level resolved `accounting.base_currency` setting so currency symbols and formatting
 * update immediately across Overview, POS Cart, GL Ledgers, and ERP views.
 */
export function useCurrency() {
  const resolvedSettingCurrency = useAuthStore(
    (s) => s.resolvedSettings?.['accounting.base_currency']
  );
  const contextCurrency = useAuthStore((s) => s.context?.base_currency);
  const publicCurrency = useAuthStore((s) => s.publicBranding?.base_currency);

  const currencyCode =
    normalizeCurrencyCode(resolvedSettingCurrency) ||
    normalizeCurrencyCode(contextCurrency) ||
    normalizeCurrencyCode(publicCurrency) ||
    'USD';

  const currencySymbol = getCurrencySymbol(currencyCode);

  const money = useCallback(
    (val: string | number | null | undefined, overrideCode?: string) =>
      formatCurrency(val, overrideCode || currencyCode),
    [currencyCode]
  );

  return {
    currencyCode,
    currencySymbol,
    formatMoney: money,
    formatCurrency: money,
  };
}
