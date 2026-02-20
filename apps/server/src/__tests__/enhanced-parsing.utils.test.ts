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

  it('extracts key specs from mixed UA/RU text', () => {
    const parsed = parseCarData('Audi Q7 2021\nПробіг: 118 тис км\nПальне: дизель\nКПП: автомат\nПривід: повний');
    expect(parsed.title).toContain('Audi Q7');
    expect(parsed.mileage).toBe(118000);
    expect(parsed.fuel).toBe('diesel');
    expect(parsed.transmission).toBe('automatic');
    expect(parsed.drive).toBe('awd');
  });

  it('keeps model clean when first line contains extra descriptors', () => {
    const parsed = parseCarData('Audi e-tron 2021, Blue color. Perfect condition.');
    expect(parsed.brand).toBe('Audi');
    expect(parsed.model).toBe('e-tron');
  });
});
