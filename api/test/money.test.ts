import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  applyDelta,
  assertMinor,
  formatGbp,
  multiplyMinor,
  parseGbp,
  sumMinor,
  toPayPalValue,
} from '../src/domain/money.js';

describe('parseGbp', () => {
  it.each([
    ['45.00', 4500],
    ['45', 4500],
    ['45.5', 4550],
    ['0.99', 99],
    ['0', 0],
    ['£45.00', 4500],
    ['  45.00  ', 4500],
    ['1,234.56', 123456],
    ['£1,234.56', 123456],
  ])('parses %s to %i pence', (input, expected) => {
    expect(parseGbp(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '45.000', '4.5.6', '-45.00', '£', '45p', 'NaN'])(
    'throws MoneyError on %s',
    (input) => {
      expect(() => parseGbp(input)).toThrow(MoneyError);
    },
  );

  it('never returns NaN for a bad input', () => {
    // A NaN here would become a "NaN" PayPal amount and a silent £0 order.
    expect(() => parseGbp('abc')).toThrow(MoneyError);
  });
});

describe('formatGbp', () => {
  it.each([
    [4500, '£45.00'],
    [99, '£0.99'],
    [0, '£0.00'],
    [123456, '£1,234.56'],
    [100000000, '£1,000,000.00'],
  ])('formats %i as %s', (minor, expected) => {
    expect(formatGbp(minor)).toBe(expected);
  });
});

describe('toPayPalValue', () => {
  it.each([
    [4500, '45.00'],
    [99, '0.99'],
    [0, '0.00'],
    [123456, '1234.56'],
  ])('renders %i as %s with no symbol or separators', (minor, expected) => {
    expect(toPayPalValue(minor)).toBe(expected);
  });

  it('round-trips through parseGbp', () => {
    expect(parseGbp(toPayPalValue(123456))).toBe(123456);
  });
});

describe('assertMinor', () => {
  it('accepts a non-negative integer', () => {
    expect(assertMinor(4500)).toBe(4500);
    expect(assertMinor(0)).toBe(0);
  });

  it.each([45.5, -1, NaN, Infinity])('rejects %s', (value) => {
    expect(() => assertMinor(value)).toThrow(MoneyError);
  });
});

describe('sumMinor', () => {
  it('sums a list', () => {
    expect(sumMinor([4500, 99, 1])).toBe(4600);
  });

  it('returns 0 for an empty list', () => {
    expect(sumMinor([])).toBe(0);
  });

  it('rejects a non-integer member', () => {
    expect(() => sumMinor([4500, 0.5])).toThrow(MoneyError);
  });
});

describe('multiplyMinor', () => {
  it('multiplies by a quantity', () => {
    expect(multiplyMinor(4500, 3)).toBe(13500);
  });

  it('allows a zero quantity', () => {
    expect(multiplyMinor(4500, 0)).toBe(0);
  });

  it.each([-1, 1.5, NaN])('rejects quantity %s', (qty) => {
    expect(() => multiplyMinor(4500, qty)).toThrow(MoneyError);
  });
});

describe('applyDelta', () => {
  it('adds a positive variant delta', () => {
    expect(applyDelta(4500, 500)).toBe(5000);
  });

  it('subtracts a negative variant delta', () => {
    expect(applyDelta(4500, -500)).toBe(4000);
  });

  it('allows a delta that lands exactly on zero', () => {
    expect(applyDelta(4500, -4500)).toBe(0);
  });

  it('rejects a delta that would make the price negative', () => {
    // Clamping to 0 would silently create a free order. Fail loudly instead.
    expect(() => applyDelta(4500, -4600)).toThrow(MoneyError);
  });
});
