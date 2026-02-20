import { describe, expect, it } from 'vitest';
import { MessageParser } from './mtproto.utils.js';

describe('MessageParser.parse', () => {
  it('parses USD price with comma thousands and mileage with unit', () => {
    const parsed = MessageParser.parse('Audi A6 2020\n$28,500\n120000 km');
    expect(parsed.price).toBe(28500);
    expect(parsed.currency).toBe('USD');
    expect(parsed.year).toBe(2020);
    expect(parsed.mileage).toBe(120000);
  });

  it('maps у.е. to USD and parses thousand mileage suffix', () => {
    const parsed = MessageParser.parse('BMW X5 2019\nЦена 23 500 у.е.\nПробег 120 тыс км');
    expect(parsed.price).toBe(23500);
    expect(parsed.currency).toBe('USD');
    expect(parsed.year).toBe(2019);
    expect(parsed.mileage).toBe(120000);
  });

  it('parses dotted thousand separator as full amount', () => {
    const parsed = MessageParser.parse('Mercedes-Benz GLE 2018\nЦена: 19.500 USD');
    expect(parsed.price).toBe(19500);
    expect(parsed.currency).toBe('USD');
    expect(parsed.year).toBe(2018);
  });
});
