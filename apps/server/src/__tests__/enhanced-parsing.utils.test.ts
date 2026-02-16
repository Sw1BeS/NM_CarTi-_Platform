import { describe, expect, it } from 'vitest';
import { normalizeNumber, parseCarData } from '../services/enhanced-parsing.utils.js';

describe('enhanced parsing utils', () => {
  it('parses dot-separated thousands as integer', () => {
    expect(normalizeNumber('10.000')).toBe(10000);
    expect(normalizeNumber('12.500')).toBe(12500);
  });

  it('parses price with у.е. marker as USD', () => {
    const parsed = parseCarData('BMW X5\nЦена: 12 500 у.е.\n2019');
    expect(parsed.price).toBe(12500);
    expect(parsed.currency).toBe('USD');
  });
});
