import { describe, expect, it, vi } from 'vitest';
import {
  readRuntimeTelegramInitData,
  readTelegramLaunchValue,
  resolveTelegramLaunchContext
} from '../../../web/src/pages/public/miniapp/telegramLaunch.ts';

const encodedInitData = (telegramUserId = 1001) => new URLSearchParams({
  query_id: 'query_1',
  user: JSON.stringify({ id: telegramUserId, first_name: 'Ivan', username: 'client_one' }),
  auth_date: '1779070000',
  hash: 'hash_1'
}).toString();

describe('Telegram MiniApp launch context helper', () => {
  it('reads Telegram launch params from location.search', () => {
    const initData = encodedInitData();
    const search = `?tgWebAppData=${encodeURIComponent(initData)}&tgWebAppStartParam=view_request`;

    expect(readTelegramLaunchValue('tgWebAppData', { search })).toBe(initData);
    expect(readTelegramLaunchValue('tgWebAppStartParam', { search })).toBe('view_request');
  });

  it('reads Telegram launch params from plain and encoded location.hash', () => {
    const initData = encodedInitData(2002);
    const hash = `#${encodeURIComponent(`?tgWebAppData=${encodeURIComponent(initData)}&startapp=view_stock`)}`;

    expect(readTelegramLaunchValue('tgWebAppData', { hash })).toBe(initData);
    expect(readTelegramLaunchValue('startapp', { hash })).toBe('view_stock');
  });

  it('prefers Telegram bridge initData over URL fallback and keeps bridge start_param source', async () => {
    const bridgeInitData = encodedInitData(3003);
    const urlInitData = encodedInitData(4004);
    const ready = vi.fn();
    const expand = vi.fn();
    const enableClosingConfirmation = vi.fn();

    const context = await resolveTelegramLaunchContext({
      attempts: 1,
      delayMs: 0,
      windowRef: {
        location: {
          search: `?tgWebAppData=${encodeURIComponent(urlInitData)}&start_param=url_request`
        },
        navigator: { userAgent: 'Telegram iOS' },
        Telegram: {
          WebApp: {
            initData: bridgeInitData,
            initDataUnsafe: {
              start_param: 'bridge_request',
              user: { id: 3003, first_name: 'Bridge' }
            },
            platform: 'ios',
            version: '7.10',
            ready,
            expand,
            enableClosingConfirmation
          }
        }
      },
      documentRef: { referrer: 'https://t.me/cartie_client_bot' }
    });

    expect(context).toMatchObject({
      initData: bridgeInitData,
      startParam: 'bridge_request',
      startParamSource: 'bridge',
      isTelegramContext: true,
      hasBridge: true,
      platform: 'ios',
      version: '7.10',
      user: { id: 3003, first_name: 'Bridge' }
    });
    expect(ready).toHaveBeenCalledTimes(1);
    expect(expand).toHaveBeenCalledTimes(1);
    expect(enableClosingConfirmation).toHaveBeenCalledTimes(1);
  });

  it('detects Telegram context without signed initData instead of treating it as a browser launch', async () => {
    const context = await resolveTelegramLaunchContext({
      attempts: 1,
      delayMs: 0,
      windowRef: {
        location: { search: '?tgWebAppStartParam=view_request&tgWebAppPlatform=ios' },
        navigator: { userAgent: 'Telegram iOS' },
        Telegram: {
          WebApp: {
            initData: '',
            initDataUnsafe: {},
            platform: 'ios',
            version: '7.10'
          }
        }
      }
    });

    expect(context.isTelegramContext).toBe(true);
    expect(context.hasBridge).toBe(true);
    expect(context.initData).toBeUndefined();
    expect(context.startParam).toBe('view_request');
    expect(context.startParamSource).toBe('tgWebAppStartParam');
  });

  it('does not treat the public telegram-web-app.js stub as Telegram context by itself', async () => {
    const context = await resolveTelegramLaunchContext({
      attempts: 1,
      delayMs: 0,
      windowRef: {
        location: { search: '?entry=request&type=BUY' },
        navigator: { userAgent: 'Mozilla/5.0 Chrome Safari' },
        Telegram: {
          WebApp: {
            initData: '',
            initDataUnsafe: {},
            platform: 'unknown',
            version: '6.0'
          }
        }
      },
      documentRef: { referrer: '' }
    });

    expect(context.isTelegramContext).toBe(false);
    expect(context.hasBridge).toBe(true);
    expect(context.initData).toBeUndefined();
    expect(context.platform).toBe('web');
  });

  it('returns runtime initData from bridge before launch fallback', () => {
    const bridgeInitData = encodedInitData(5005);
    const fallbackInitData = encodedInitData(6006);

    expect(readRuntimeTelegramInitData({
      location: { hash: `#tgWebAppData=${encodeURIComponent(fallbackInitData)}` },
      Telegram: { WebApp: { initData: bridgeInitData } }
    })).toBe(bridgeInitData);
  });
});
