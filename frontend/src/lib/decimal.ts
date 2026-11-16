export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'UP' | 'DOWN';

export type DecimalInput = string | number | null | undefined;

interface ScaledBigInt {
  coeff: bigint;
  scale: number;
}

const TEN = 10n;
const ZERO = 0n;

function pow10(exp: number): bigint {
  return exp <= 0 ? 1n : TEN ** BigInt(exp);
}

function parseScaled(input: DecimalInput): ScaledBigInt {
  if (input === null || input === undefined) {
    return { coeff: ZERO, scale: 0 };
  }
  const raw = typeof input === 'number' ? (Number.isFinite(input) ? String(input) : '0') : String(input);
  const trimmed = raw.trim().replace(/,/g, '');
  if (!trimmed) {
    return { coeff: ZERO, scale: 0 };
  }

  let normalized = trimmed;
  if (/[eE]/.test(normalized)) {
    const match = /^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(normalized);
    if (!match) return { coeff: ZERO, scale: 0 };
    const sign = match[1] === '-' ? '-' : '';
    const intPart = match[2];
    const fracPart = match[3] ?? '';
    const exp = Number.parseInt(match[4], 10);
    const digits = `${intPart}${fracPart}`;
    const newScale = fracPart.length - exp;
    if (newScale <= 0) {
      normalized = `${sign}${digits}${'0'.repeat(-newScale)}`;
    } else if (digits.length <= newScale) {
      normalized = `${sign}0.${'0'.repeat(newScale - digits.length)}${digits}`;
    } else {
      const splitAt = digits.length - newScale;
      normalized = `${sign}${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`;
    }
  }

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(normalized);
  if (!match) {
    return { coeff: ZERO, scale: 0 };
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const intPart = match[2] || '0';
  const fracPart = match[3] || '';
  const combined = `${intPart}${fracPart}`;
  if (!combined) {
    return { coeff: ZERO, scale: 0 };
  }

  const coeff = sign * BigInt(combined);
  return { coeff: coeff === ZERO ? ZERO : coeff, scale: fracPart.length };
}

function formatScaled(val: ScaledBigInt, minDecimals = 0): string {
  if (val.coeff === ZERO) {
    return minDecimals > 0 ? `0.${'0'.repeat(minDecimals)}` : '0';
  }
  const neg = val.coeff < ZERO;
  const abs = neg ? -val.coeff : val.coeff;
  const digits = abs.toString();

  let intPart = '0';
  let fracPart = '';

  if (val.scale <= 0) {
    intPart = `${digits}${'0'.repeat(-val.scale)}`;
  } else if (digits.length <= val.scale) {
    fracPart = `${'0'.repeat(val.scale - digits.length)}${digits}`;
  } else {
    const splitAt = digits.length - val.scale;
    intPart = digits.slice(0, splitAt);
    fracPart = digits.slice(splitAt);
  }

  // Trim trailing zeros beyond minDecimals
  while (fracPart.length > minDecimals && fracPart.endsWith('0')) {
    fracPart = fracPart.slice(0, -1);
  }
  while (fracPart.length < minDecimals) {
    fracPart += '0';
  }

  const prefix = neg ? '-' : '';
  return fracPart.length > 0 ? `${prefix}${intPart}.${fracPart}` : `${prefix}${intPart}`;
}

function alignPair(a: DecimalInput, b: DecimalInput): { ca: bigint; cb: bigint; scale: number } {
  const sa = parseScaled(a);
  const sb = parseScaled(b);
  const scale = Math.max(sa.scale, sb.scale);
  return {
    ca: sa.coeff * pow10(scale - sa.scale),
    cb: sb.coeff * pow10(scale - sb.scale),
    scale,
  };
}

function divideWithRounding(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator === ZERO) return ZERO;
  const neg = (numerator < ZERO) !== (denominator < ZERO);
  const numAbs = numerator < ZERO ? -numerator : numerator;
  const denAbs = denominator < ZERO ? -denominator : denominator;

  let q = numAbs / denAbs;
  const r = numAbs % denAbs;

  if (r > ZERO) {
    const twiceR = r * 2n;
    let roundUp = false;
    switch (mode) {
      case 'DOWN':
        roundUp = false;
        break;
      case 'UP':
        roundUp = true;
        break;
      case 'HALF_EVEN':
        if (twiceR > denAbs) roundUp = true;
        else if (twiceR === denAbs) roundUp = q % 2n !== ZERO;
        break;
      case 'HALF_UP':
      default:
        roundUp = twiceR >= denAbs;
        break;
    }
    if (roundUp) q += 1n;
  }

  return q === ZERO ? ZERO : neg ? -q : q;
}

/** Add two decimal values without IEEE-754 floating point arithmetic. */
export function addDecimal(a: DecimalInput, b: DecimalInput): string {
  const { ca, cb, scale } = alignPair(a, b);
  return formatScaled({ coeff: ca + cb, scale });
}

/** Subtract two decimal values without IEEE-754 floating point arithmetic. */
export function subDecimal(a: DecimalInput, b: DecimalInput): string {
  const { ca, cb, scale } = alignPair(a, b);
  return formatScaled({ coeff: ca - cb, scale });
}

/** Multiply two decimal values without IEEE-754 floating point arithmetic. */
export function mulDecimal(a: DecimalInput, b: DecimalInput): string {
  const sa = parseScaled(a);
  const sb = parseScaled(b);
  return formatScaled({ coeff: sa.coeff * sb.coeff, scale: sa.scale + sb.scale });
}

/** Divide two decimal values at a fixed scale using explicit rounding. */
export function divDecimal(
  a: DecimalInput,
  b: DecimalInput,
  scale = 4,
  mode: RoundingMode = 'HALF_UP',
): string {
  const sa = parseScaled(a);
  const sb = parseScaled(b);
  if (sb.coeff === ZERO) return formatScaled({ coeff: ZERO, scale }, 0);

  const shift = scale + sb.scale - sa.scale;
  let num = sa.coeff;
  let den = sb.coeff;
  if (shift >= 0) {
    num *= pow10(shift);
  } else {
    den *= pow10(-shift);
  }
  const rounded = divideWithRounding(num, den, mode);
  return formatScaled({ coeff: rounded, scale });
}

/** Round a decimal string to `decimals` places using the requested mode. */
export function roundDecimal(
  value: DecimalInput,
  decimals = 2,
  mode: RoundingMode = 'HALF_UP',
): string {
  const parsed = parseScaled(value);
  if (parsed.scale <= decimals) {
    return formatScaled(parsed, decimals);
  }
  const factor = pow10(parsed.scale - decimals);
  const rounded = divideWithRounding(parsed.coeff, factor, mode);
  return formatScaled({ coeff: rounded, scale: decimals }, decimals);
}

/** Convenience fixed 2-decimal HALF_UP formatter returning canonical string. */
export function roundHalfUp2(value: DecimalInput): string {
  return roundDecimal(value, 2, 'HALF_UP');
}

/** Format numeric value cleanly up to `maxDecimals` (trimming trailing zeros). */
export function normalizeDecimal(value: DecimalInput, minDecimals = 0): string {
  return formatScaled(parseScaled(value), minDecimals);
}

/** Compare two decimals (-1, 0, 1). */
export function cmpDecimal(a: DecimalInput, b: DecimalInput): -1 | 0 | 1 {
  const { ca, cb } = alignPair(a, b);
  if (ca < cb) return -1;
  if (ca > cb) return 1;
  return 0;
}

export function isZeroDecimal(a: DecimalInput): boolean {
  return parseScaled(a).coeff === ZERO;
}

export function isPositiveDecimal(a: DecimalInput): boolean {
  return parseScaled(a).coeff > ZERO;
}

export function isNegativeDecimal(a: DecimalInput): boolean {
  return parseScaled(a).coeff < ZERO;
}

export function maxDecimal(a: DecimalInput, b: DecimalInput): string {
  return cmpDecimal(a, b) >= 0 ? formatScaled(parseScaled(a)) : formatScaled(parseScaled(b));
}

export function minDecimal(a: DecimalInput, b: DecimalInput): string {
  return cmpDecimal(a, b) <= 0 ? formatScaled(parseScaled(a)) : formatScaled(parseScaled(b));
}

export function sumDecimals(values: DecimalInput[]): string {
  let acc = '0';
  for (const val of values) {
    acc = addDecimal(acc, val);
  }
  return acc;
}

/** Map backend/PostgreSQL tax rounding strings onto RoundingMode. */
export function normalizeRoundingMode(raw?: string | null): RoundingMode {
  switch ((raw || '').toUpperCase()) {
    case 'HALF_EVEN':
    case 'BANKERS':
      return 'HALF_EVEN';
    case 'UP':
    case 'CEIL':
      return 'UP';
    case 'DOWN':
    case 'TRUNCATE':
    case 'FLOOR':
      return 'DOWN';
    case 'HALF_UP':
    default:
      return 'HALF_UP';
  }
}

const CURRENCY_SYMBOL_CACHE = new Map<string, string>();

function getCurrencySymbol(currencyCode: string): string {
  const code = (currencyCode || 'USD').toUpperCase();
  const cached = CURRENCY_SYMBOL_CACHE.get(code);
  if (cached) return cached;
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const symbol = parts.find((p) => p.type === 'currency')?.value ?? `${code} `;
    CURRENCY_SYMBOL_CACHE.set(code, symbol);
    return symbol;
  } catch {
    return `${code} `;
  }
}

/** Format a decimal amount with currency symbol and comma grouping without converting to float. */
export function formatMoney(
  value: DecimalInput,
  currencyCode = 'USD',
  decimals = 2,
  mode: RoundingMode = 'HALF_UP',
): string {
  const fixed = roundDecimal(value, decimals, mode);
  const neg = fixed.startsWith('-');
  const unsigned = neg ? fixed.slice(1) : fixed;
  const [intPart, fracPart] = unsigned.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = getCurrencySymbol(currencyCode);
  const suffix = fracPart !== undefined ? `.${fracPart}` : '';
  return `${neg ? '-' : ''}${symbol}${grouped}${suffix}`;
}

/** Convert decimal quantity string into safe display qty (integer if whole, fractional up to 4dp otherwise). */
export function formatQuantity(value: DecimalInput): string {
  const parsed = parseScaled(value);
  return formatScaled(parsed, 0);
}

export interface ProductPriceFields {
  base_price?: DecimalInput;
  sale_price?: DecimalInput;
  discount_percent?: DecimalInput;
}

/**
 * Determine a catalog product's active promotional discount percentage without double-counting.
 */
export function getProductPromoPercent(product: ProductPriceFields): number {
  const explicit = normalizeDecimal(product.discount_percent ?? '0', 0);
  if (cmpDecimal(explicit, '0') > 0) {
    const clamped = cmpDecimal(explicit, '100') > 0 ? '100' : roundHalfUp2(explicit);
    return Number(clamped);
  }
  const base = product.base_price ?? '0';
  const sale = product.sale_price ?? '0';
  if (cmpDecimal(base, sale) > 0 && isPositiveDecimal(base)) {
    const diff = subDecimal(base, sale);
    const pct = divDecimal(mulDecimal(diff, '100'), base, 2, 'HALF_UP');
    return Math.max(0, Math.min(100, Number(pct)));
  }
  return 0;
}

/**
 * Return the pre-discount unit price for cart & checkout calculations when a promo discount applies.
 * Matches backend ResolveCatalogGrossUnitPrice 1:1 so POS never double-discounts sale_price.
 */
export function getProductGrossUnitPrice(product: ProductPriceFields): string {
  const promoPct = getProductPromoPercent(product);
  const base = product.base_price ?? '0';
  const sale = product.sale_price ?? '0';
  if (promoPct > 0 && cmpDecimal(base, sale) > 0) {
    return normalizeDecimal(base, 2);
  }
  return normalizeDecimal(sale, 2);
}

/**
 * Deterministic preview for bulk/single product discount assignment matching PostgreSQL & Go 1:1.
 */
export function previewProductDiscountPrice(
  product: ProductPriceFields,
  targetDiscountPct: DecimalInput,
): { listPrice: string; salePrice: string; discountPercent: string } {
  const rawPct = isNegativeDecimal(targetDiscountPct) ? '0' : String(targetDiscountPct || '0');
  const clampedPct = cmpDecimal(rawPct, '95') > 0 ? '95' : normalizeDecimal(rawPct, 2);
  const base = product.base_price ?? '0';
  const sale = product.sale_price ?? '0';
  const currentDisc = getProductPromoPercent(product);

  if (cmpDecimal(clampedPct, '0') > 0) {
    const listAnchor = currentDisc === 0 && cmpDecimal(sale, base) > 0 ? sale : base;
    const factorPct = subDecimal('100', clampedPct);
    const nextSale = roundHalfUp2(divDecimal(mulDecimal(listAnchor, factorPct), '100', 4, 'HALF_UP'));
    return {
      listPrice: roundHalfUp2(listAnchor),
      salePrice: nextSale,
      discountPercent: clampedPct,
    };
  }

  const restored =
    currentDisc > 0 || cmpDecimal(sale, base) < 0 ? roundHalfUp2(base) : roundHalfUp2(sale);
  return {
    listPrice: roundHalfUp2(base),
    salePrice: restored,
    discountPercent: '0.00',
  };
}


