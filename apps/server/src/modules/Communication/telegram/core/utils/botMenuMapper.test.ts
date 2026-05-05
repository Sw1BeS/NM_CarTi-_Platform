import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CLIENT_LEAD_MENU_BUTTONS,
  mapBotActionToMiniAppUrl,
  buildMenuButtonKeyboard,
  getPrimaryMenuButton,
  type BotMenuAction,
} from './botMenuMapper.js';

describe('botMenuMapper', () => {
  const mockBot: any = {
    id: 'bot_test',
    token: 'REDACTED',
    config: {
      miniAppConfig: {
        url: 'https://cartie2.umanoff-analytics.space/p/app/cartie',
      },
      defaultShowcaseSlug: 'cartie',
    },
  };

  describe('DEFAULT_CLIENT_LEAD_MENU_BUTTONS', () => {
    it('contains 8 buttons', () => {
      expect(DEFAULT_CLIENT_LEAD_MENU_BUTTONS).toHaveLength(8);
    });

    it('all buttons have web_app type', () => {
      DEFAULT_CLIENT_LEAD_MENU_BUTTONS.forEach((button) => {
        expect(button.type).toBe('web_app');
      });
    });

    it('all required actions are present', () => {
      const actions = DEFAULT_CLIENT_LEAD_MENU_BUTTONS.map((b) => b.action);
      const requiredActions: BotMenuAction[] = [
        'view_inventory',
        'view_transit',
        'view_request',
        'view_favorites',
        'view_status',
        'sell_car',
        'support',
        'about',
      ];
      requiredActions.forEach((action) => {
        expect(actions).toContain(action);
      });
    });

    it('button IDs are unique', () => {
      const ids = DEFAULT_CLIENT_LEAD_MENU_BUTTONS.map((b) => b.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('buildMenuButtonKeyboard', () => {
    it('returns Telegram reply keyboard rows', () => {
      const keyboard = buildMenuButtonKeyboard(mockBot, DEFAULT_CLIENT_LEAD_MENU_BUTTONS);
      expect(Array.isArray(keyboard)).toBe(true);
      expect(keyboard.length).toBeGreaterThan(0);
      keyboard.forEach((row) => {
        expect(Array.isArray(row)).toBe(true);
      });
    });

    it('each button has web_app.url', () => {
      const keyboard = buildMenuButtonKeyboard(mockBot, DEFAULT_CLIENT_LEAD_MENU_BUTTONS);
      keyboard.forEach((row) => {
        row.forEach((button: any) => {
          expect(button.web_app).toBeDefined();
          expect(button.web_app.url).toBeDefined();
          expect(typeof button.web_app.url).toBe('string');
        });
      });
    });

    it('each URL contains /p/app/cartie', () => {
      const keyboard = buildMenuButtonKeyboard(mockBot, DEFAULT_CLIENT_LEAD_MENU_BUTTONS);
      keyboard.forEach((row) => {
        row.forEach((button: any) => {
          expect(button.web_app.url).toContain('/p/app/cartie');
        });
      });
    });

    it('URLs have correct entry params', () => {
      const keyboard = buildMenuButtonKeyboard(mockBot, DEFAULT_CLIENT_LEAD_MENU_BUTTONS);
      const buttonMap = new Map(
        DEFAULT_CLIENT_LEAD_MENU_BUTTONS.map((b) => [b.action, b.label])
      );

      keyboard.forEach((row) => {
        row.forEach((button: any) => {
          const url = button.web_app.url;
          const label = button.text;
          const action = Array.from(buttonMap.entries()).find(
            ([_, lbl]) => lbl === label
          )?.[0] as BotMenuAction;

          if (action === 'view_inventory') {
            expect(url).toContain('entry=inventory');
            expect(url).toContain('status=AVAILABLE');
          } else if (action === 'view_transit') {
            expect(url).toContain('entry=inventory');
            expect(url).toContain('status=PENDING');
          } else if (action === 'view_request') {
            expect(url).toContain('entry=request');
          } else if (action === 'view_favorites') {
            expect(url).toContain('entry=favorites');
          } else if (action === 'view_status') {
            expect(url).toContain('entry=status');
          } else if (action === 'sell_car') {
            expect(url).toContain('entry=request');
            expect(url).toContain('type=SELL');
          } else if (action === 'support') {
            expect(url).toContain('entry=support');
          } else if (action === 'about') {
            expect(url).toContain('entry=about');
          }
        });
      });
    });
  });

  describe('mapBotActionToMiniAppUrl', () => {
    it('generates correct URL for view_inventory', () => {
      const url = mapBotActionToMiniAppUrl(mockBot, 'view_inventory');
      expect(url).toContain('/p/app/cartie');
      expect(url).toContain('entry=inventory');
      expect(url).toContain('status=AVAILABLE');
    });

    it('generates correct URL for view_transit', () => {
      const url = mapBotActionToMiniAppUrl(mockBot, 'view_transit');
      expect(url).toContain('/p/app/cartie');
      expect(url).toContain('entry=inventory');
      expect(url).toContain('status=PENDING');
    });

    it('generates correct URL for view_request', () => {
      const url = mapBotActionToMiniAppUrl(mockBot, 'view_request');
      expect(url).toContain('/p/app/cartie');
      expect(url).toContain('entry=request');
    });

    it('generates correct URL for view_favorites', () => {
      const url = mapBotActionToMiniAppUrl(mockBot, 'view_favorites');
      expect(url).toContain('/p/app/cartie');
      expect(url).toContain('entry=favorites');
    });

    it('generates correct URL for view_status', () => {
      const url = mapBotActionToMiniAppUrl(mockBot, 'view_status');
      expect(url).toContain('/p/app/cartie');
      expect(url).toContain('entry=status');
    });

    it('generates correct URL for sell_car', () => {
      const url = mapBotActionToMiniAppUrl(mockBot, 'sell_car');
      expect(url).toContain('/p/app/cartie');
      expect(url).toContain('entry=request');
      expect(url).toContain('type=SELL');
    });

    it('generates correct URL for support', () => {
      const url = mapBotActionToMiniAppUrl(mockBot, 'support');
      expect(url).toContain('/p/app/cartie');
      expect(url).toContain('entry=support');
    });

    it('generates correct URL for about', () => {
      const url = mapBotActionToMiniAppUrl(mockBot, 'about');
      expect(url).toContain('/p/app/cartie');
      expect(url).toContain('entry=about');
    });
  });

  describe('getPrimaryMenuButton', () => {
    it('returns inventory button as primary', () => {
      const primary = getPrimaryMenuButton(DEFAULT_CLIENT_LEAD_MENU_BUTTONS);
      expect(primary.action).toBe('view_inventory');
      expect(primary.label).toContain('Каталог');
    });

    it('returns first button if inventory not found', () => {
      const buttonsWithoutInventory = DEFAULT_CLIENT_LEAD_MENU_BUTTONS.filter(
        (b) => b.action !== 'view_inventory'
      );
      const primary = getPrimaryMenuButton(buttonsWithoutInventory);
      expect(primary).toBeDefined();
      expect(buttonsWithoutInventory).toContain(primary);
    });
  });
});
