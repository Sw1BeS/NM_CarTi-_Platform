import { describe, expect, it } from 'vitest';
import { NormalizationService } from './normalization.service.js';

describe('NormalizationService.extractPrice', () => {
  it('parses USD variants including у.е.', () => {
    expect(NormalizationService.extractPrice('20 000 у.е.')).toEqual({ amount: 20000, currency: 'USD' });
    expect(NormalizationService.extractPrice('$15,500')).toEqual({ amount: 15500, currency: 'USD' });
  });

  it('parses EUR and UAH markers', () => {
    expect(NormalizationService.extractPrice('18 750 €')).toEqual({ amount: 18750, currency: 'EUR' });
    expect(NormalizationService.extractPrice('550 000 грн')).toEqual({ amount: 550000, currency: 'UAH' });
  });

  it('parses compact suffixes', () => {
    expect(NormalizationService.extractPrice('12.5k usd')).toEqual({ amount: 12500, currency: 'USD' });
    expect(NormalizationService.extractPrice('9,7 тис грн')).toEqual({ amount: 9700, currency: 'UAH' });
  });

  it('supports object shape with amount and currency', () => {
    expect(NormalizationService.extractPrice({ amount: '21000', currency: 'EUR' })).toEqual({ amount: 21000, currency: 'EUR' });
    expect(NormalizationService.extractPrice({ value: '13 000', curr: '$' })).toEqual({ amount: 13000, currency: 'USD' });
  });
});
