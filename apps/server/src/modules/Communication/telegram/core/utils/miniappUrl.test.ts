import { describe, expect, it } from 'vitest';
import { buildMiniAppEntryUrl, buildMiniAppUrl, normalizeMiniAppButtonUrl } from './miniappUrl.js';

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

  it('replaces stale build tags while preserving navigation params', () => {
    const previousBuildSha = process.env.BUILD_SHA;
    process.env.BUILD_SHA = 'fresh_sha';

    try {
      const url = new URL(buildMiniAppUrl({
        config: {
          miniAppConfig: { url: 'https://example.com/p/app/cartie?v=old_sha&entry=favorites' },
          defaultShowcaseSlug: 'cartie'
        }
      } as any, {
        entry: 'inventory',
        status: 'AVAILABLE'
      }));

      expect(url.searchParams.get('v')).toBe('fresh_sha');
      expect(url.searchParams.get('entry')).toBe('inventory');
      expect(url.searchParams.get('status')).toBe('AVAILABLE');
    } finally {
      if (previousBuildSha === undefined) {
        delete process.env.BUILD_SHA;
      } else {
        process.env.BUILD_SHA = previousBuildSha;
      }
    }
  });

  it('replaces stale path slugs with the configured showcase slug', () => {
    const url = new URL(buildMiniAppUrl({
      config: {
        miniAppConfig: { url: 'https://example.com/p/app/cardealer_lviv_bot?entry=favorites' },
        defaultShowcaseSlug: 'cartie'
      }
    } as any, {
      entry: 'request',
      type: 'BUY'
    }));

    expect(url.pathname).toBe('/p/app/cartie');
    expect(url.searchParams.get('entry')).toBe('request');
    expect(url.searchParams.get('type')).toBe('BUY');
  });

  it('normalizes stale platform button URLs while preserving write params', () => {
    const url = new URL(normalizeMiniAppButtonUrl(bot, 'https://old.example/p/app/old_slug?entry=request&type=BUY&carId=car_1'));

    expect(url.origin).toBe('https://example.com');
    expect(url.pathname).toBe('/p/app/cartie');
    expect(url.searchParams.get('theme')).toBe('dark');
    expect(url.searchParams.get('entry')).toBe('request');
    expect(url.searchParams.get('type')).toBe('BUY');
    expect(url.searchParams.get('carId')).toBe('car_1');
  });

  it('normalizes Telegram startapp aliases into configured MiniApp URLs', () => {
    const url = new URL(normalizeMiniAppButtonUrl(bot, 'https://t.me/cartie_bot/app?startapp=view_transit'));

    expect(url.origin).toBe('https://example.com');
    expect(url.pathname).toBe('/p/app/cartie');
    expect(url.searchParams.get('entry')).toBe('inventory');
    expect(url.searchParams.get('status')).toBe('PENDING');
  });
});
