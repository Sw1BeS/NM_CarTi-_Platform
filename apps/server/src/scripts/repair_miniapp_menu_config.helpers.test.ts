import { describe, expect, it } from 'vitest';
import { repairMenuButtons } from './repair_miniapp_menu_config.helpers.js';

describe('repair_miniapp_menu_config helpers', () => {
  it('repairs stale MiniApp menu links against the canonical default base', () => {
    const previousMiniAppUrl = process.env.MINIAPP_URL;
    delete process.env.MINIAPP_URL;

    try {
      const result = repairMenuButtons({
        id: 'bot_1',
        name: 'Cartie',
        config: {
          miniAppConfig: {
            url: 'https://stale.example/p/app/old_slug',
            showcaseSlug: 'cartie'
          },
          menuConfig: {
            buttons: [
              {
                id: 'btn_transit',
                label: 'Transit',
                type: 'WEB_APP',
                value: 'https://t.me/cartie_bot/app?startapp=view_transit&utm_source=menu',
                row: 0,
                col: 0
              }
            ]
          }
        }
      });

      const [button] = result.menuConfig.buttons;
      const url = new URL(button.value);
      expect(url.origin).toBe('https://cartie2.umanoff-analytics.space');
      expect(url.pathname).toBe('/p/app/cartie');
      expect(url.searchParams.get('entry')).toBe('inventory');
      expect(url.searchParams.get('status')).toBe('PENDING');
      expect(url.searchParams.get('utm_source')).toBe('menu');
    } finally {
      if (previousMiniAppUrl === undefined) {
        delete process.env.MINIAPP_URL;
      } else {
        process.env.MINIAPP_URL = previousMiniAppUrl;
      }
    }
  });
});
