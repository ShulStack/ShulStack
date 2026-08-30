/**
 * Money is represented everywhere as integer minor units (cents for USD).
 * Floats never touch stored amounts; parsing and formatting are string-based.
 */

const CURRENCY_DECIMALS: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

export function assertMinorUnits(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money must be a safe integer in minor units, got ${value}`);
  }
}

/** Format integer minor units as a localized currency string. */
export function formatMoney(minorUnits: number, currency = "USD", locale = "en-US"): string {
  assertMinorUnits(minorUnits);
  const decimals = currencyDecimals(currency);
  const major = minorUnits / 10 ** decimals;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(major);
}

const AMOUNT_PATTERN = /^([-+]?)(\d+)(?:\.(\d+))?$/;

/**
 * Parse a human-entered amount ("1,234.56", "$10", "-3.2") into integer minor
 * units. Throws on malformed input or more decimal places than the currency
 * supports.
 */
export function parseMoney(input: string, currency = "USD"): number {
  // Drop a currency-symbol prefix while keeping the sign, wherever the sign
  // sits relative to the symbol ("-$18.00" and "$-18.00" both parse).
  const cleaned = input.replace(/[,\s]/g, "").replace(/^([-+]?)[^\d+-]+/, "$1");
  const match = AMOUNT_PATTERN.exec(cleaned);
  if (match === null) {
    throw new RangeError(`Not a valid amount: ${JSON.stringify(input)}`);
  }
  const [, sign, wholePart, fractionPart = ""] = match;
  const decimals = currencyDecimals(currency);
  if (fractionPart.length > decimals) {
    throw new RangeError(`${currency} supports at most ${decimals} decimal places: ${input}`);
  }
  const minor =
    BigInt(wholePart) * BigInt(10 ** decimals) + BigInt(fractionPart.padEnd(decimals, "0") || "0");
  const signed = sign === "-" ? -minor : minor;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Amount out of range: ${input}`);
  }
  return Number(signed);
}
