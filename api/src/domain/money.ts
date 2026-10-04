/** An amount in GBP minor units (pence). Always a non-negative integer. */
export type Minor = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Optional £, optional comma thousands separators, 0 or 2 decimal places. */
const GBP_PATTERN = /^£?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/;

export function assertMinor(value: number): Minor {
  if (!Number.isInteger(value) || value < 0) {
    throw new MoneyError(`Expected a non-negative integer of pence, got ${value}`);
  }
  return value;
}

export function parseGbp(input: string): Minor {
  const trimmed = input.trim();
  const match = GBP_PATTERN.exec(trimmed);
  if (!match) {
    throw new MoneyError(`Not a GBP amount: "${input}"`);
  }
  const pounds = Number(match[1]!.replaceAll(',', ''));
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return assertMinor(pounds * 100 + Number(fraction));
}

export function toPayPalValue(minor: Minor): string {
  assertMinor(minor);
  return (minor / 100).toFixed(2);
}

export function formatGbp(minor: Minor): string {
  assertMinor(minor);
  const [pounds, pence] = toPayPalValue(minor).split('.') as [string, string];
  const grouped = pounds.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `£${grouped}.${pence}`;
}

export function sumMinor(values: Minor[]): Minor {
  return values.reduce<Minor>((total, value) => total + assertMinor(value), 0);
}

export function multiplyMinor(minor: Minor, qty: number): Minor {
  assertMinor(minor);
  if (!Number.isInteger(qty) || qty < 0) {
    throw new MoneyError(`Quantity must be a non-negative integer, got ${qty}`);
  }
  return minor * qty;
}

export function applyDelta(base: Minor, delta: number): Minor {
  assertMinor(base);
  if (!Number.isInteger(delta)) {
    throw new MoneyError(`Variant delta must be an integer of pence, got ${delta}`);
  }
  const result = base + delta;
  if (result < 0) {
    throw new MoneyError(
      `Variant delta ${delta} would take a ${base}p price negative`,
    );
  }
  return result;
}
