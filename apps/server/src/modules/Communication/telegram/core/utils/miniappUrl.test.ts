import { describe, expect, it } from 'vitest';
import { buildMiniAppEntryUrl, buildMiniAppUrl } from './miniappUrl.js';

const bot = {
  config: {
    miniAppConfig: { url: 'https://example.com/p/app/cartie?theme=dark' },
    defaultShowcaseSlug: 'cartie'
  }
} as any;

describe('miniappUrl', () => {
  it('preserves MiniApp deep-link params when building runtime button URLs', () => {
    const url = new URL(buildMiniAppUrl(bot, {
      entry: 'request',
      type: 'SELL',
      status: 'PENDING',
      carId: 'car-123'
    }));

    expect(url.pathname).toBe('/p/app/cartie');
    expect(url.searchParams.get('theme')).toBe('dark');
    expect(url.searchParams.get('entry')).toBe('request');
    expect(url.searchParams.get('type')).toBe('SELL');
    expect(url.searchParams.get('status')).toBe('PENDING');
    expect(url.searchParams.get('carId')).toBe('car-123');
  });

  it('normalizes transit entry helper to inventory with PENDING status', () => {
    const url = new URL(buildMiniAppEntryUrl(bot, 'in_transit'));

    expect(url.searchParams.get('entry')).toBe('inventory');
    expect(url.searchParams.get('status')).toBe('PENDING');
  });
});
