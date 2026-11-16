import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  formatCurrency,
  formatMetricNumber,
  getCurrencySymbol,
  getResolvedBaseCurrency,
} from '@/lib/currency';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { getCurrencySymbol, formatMetricNumber, getResolvedBaseCurrency };

export function formatMoney(val: string | number | null | undefined, currency?: string): string {
  return formatCurrency(val, currency);
}
