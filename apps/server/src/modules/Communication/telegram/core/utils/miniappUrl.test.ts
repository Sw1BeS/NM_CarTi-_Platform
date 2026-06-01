import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildMiniAppEntryUrl, buildMiniAppTelegramLaunchUrl, buildMiniAppUrl, normalizeMiniAppButtonUrl } from './miniappUrl.js';

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(() => 'cached_sha\n')
}));

vi.mock('node:child_process', () => ({
  execSync: execSyncMock
}));

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

  it('builds bare Telegram launch URLs without query params for signed MiniApp sessions', () => {
    const previousBuildSha = process.env.BUILD_SHA;
    process.env.BUILD_SHA = 'fresh_sha';

    try {
      const url = new URL(buildMiniAppTelegramLaunchUrl({
        config: {
          miniAppConfig: { url: 'https://example.com/p/app/cartie?v=old_sha&theme=dark&entry=inventory' },
          defaultShowcaseSlug: 'cartie'
        }
      } as any));

      expect(url.origin).toBe('https://example.com');
      expect(url.pathname).toBe('/p/app/cartie');
      expect(url.search).toBe('');
    } finally {
      if (previousBuildSha === undefined) {
        delete process.env.BUILD_SHA;
      } else {
        process.env.BUILD_SHA = previousBuildSha;
      }
    }
  });

  it('normalizes transit entry helper to inventory with explicit availability state', () => {
    const url = new URL(buildMiniAppEntryUrl(bot, 'in_transit'));

    expect(url.searchParams.get('entry')).toBe('inventory');
    expect(url.searchParams.get('status')).toBe('PENDING');
    expect(url.searchParams.get('availabilityState')).toBe('IN_TRANSIT');
  });

  it('normalizes inventory entry helper to in-stock availability state', () => {
    const url = new URL(buildMiniAppEntryUrl(bot, 'inventory'));

    expect(url.searchParams.get('entry')).toBe('inventory');
    expect(url.searchParams.get('status')).toBe('AVAILABLE');
    expect(url.searchParams.get('availabilityState')).toBe('IN_STOCK');
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
    const url = new URL(normalizeMiniAppButtonUrl(bot, 'https://old.example/p/app/old_slug?v=old_build&entry=request&type=BUY&status=PENDING&carId=car_1'));

    expect(url.origin).toBe('https://example.com');
    expect(url.pathname).toBe('/p/app/cartie');
    expect(url.searchParams.get('theme')).toBe('dark');
    expect(url.searchParams.get('entry')).toBe('request');
    expect(url.searchParams.get('type')).toBe('BUY');
    expect(url.searchParams.get('status')).toBe('PENDING');
    expect(url.searchParams.get('carId')).toBe('car_1');
    expect(url.searchParams.get('v')).not.toBe('old_build');
  });

  it('normalizes Telegram startapp aliases into configured MiniApp URLs', () => {
    const url = new URL(normalizeMiniAppButtonUrl(bot, 'https://t.me/cartie_bot/app?startapp=view_transit'));

    expect(url.origin).toBe('https://example.com');
    expect(url.pathname).toBe('/p/app/cartie');
    expect(url.searchParams.get('entry')).toBe('inventory');
    expect(url.searchParams.get('status')).toBe('PENDING');
    expect(url.searchParams.get('availabilityState')).toBe('IN_TRANSIT');
  });

  it('caches fallback git build SHA lookup across repeated URL builds', async () => {
    const previousBuildSha = process.env.BUILD_SHA;
    delete process.env.BUILD_SHA;
    execSyncMock.mockClear();
    const readFileSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('missing BUILD_SHA');
    });

    try {
      vi.resetModules();
      const { buildMiniAppUrl: buildFreshMiniAppUrl } = await import('./miniappUrl.js');

      const first = new URL(buildFreshMiniAppUrl(bot));
      const second = new URL(buildFreshMiniAppUrl(bot, { entry: 'inventory' }));

      expect(first.searchParams.get('v')).toBe('cached_sha');
      expect(second.searchParams.get('v')).toBe('cached_sha');
      expect(execSyncMock).toHaveBeenCalledTimes(1);
    } finally {
      readFileSpy.mockRestore();
      if (previousBuildSha === undefined) {
        delete process.env.BUILD_SHA;
      } else {
        process.env.BUILD_SHA = previousBuildSha;
      }
    }
  });
});
