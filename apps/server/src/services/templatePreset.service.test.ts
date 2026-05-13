import { describe, expect, it, vi } from 'vitest';
import { applyTemplatePreset, getTemplatePresetStatus } from './templatePreset.service.js';
import { prisma } from './prisma.js';

vi.mock('./prisma.js', () => ({
  prisma: {
    scenario: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(async ({ where }: any) => ({
        id: `scenario_${where.triggerCommand}`,
        isActive: true,
        status: 'PUBLISHED'
      })),
      update: vi.fn(),
      create: vi.fn()
    }
  }
}));

describe('templatePreset.service', () => {
  it('returns partial for B2B when scenario pack is missing', async () => {
    const status = await getTemplatePresetStatus({
      template: 'B2B',
      companyId: 'company_test',
      channelId: '-100123',
      adminChatId: '12345',
      config: {
        menuConfig: {
          buttons: [
            { id: 'btn_b2b_req', label: 'Request', type: 'SCENARIO', value: 'scenario_request', row: 0, col: 0 },
            { id: 'btn_b2b_help', label: 'Help', type: 'SCENARIO', value: 'scenario_help', row: 1, col: 0 },
            { id: 'm', label: 'Menu', type: 'TEXT', value: '/menu', row: 1, col: 0 }
          ]
        },
        miniAppConfig: {
          isEnabled: true,
          url: 'https://example.com/p/app/cartie',
          actions: [],
          navItems: [{ id: 'n1', label: 'Home', actionType: 'VIEW', value: 'HOME' }]
        }
      } as any
    });

    expect(status).toBe('partial');
  });

  it('returns missing for B2B when menu and miniapp are absent', async () => {
    const status = await getTemplatePresetStatus({
      template: 'B2B',
      companyId: 'company_test',
      config: {} as any
    });

    expect(status).toBe('missing');
  });

  it('keeps CLIENT_LEAD MiniApp menu buttons as deep links when patching existing config', async () => {
    const result = await applyTemplatePreset({
      template: 'CLIENT_LEAD',
      companyId: 'company_test',
      botId: 'bot_test',
      defaultShowcaseSlug: 'cartie',
      config: {
        publicBaseUrl: 'https://example.com',
        menuConfig: {
          welcomeMessage: 'Custom welcome',
          buttons: [
            { id: 'btn_pick', label: 'Pick', type: 'WEB_APP', value: 'https://old.example/p/app/cartie', row: 0, col: 0 },
            { id: 'btn_stock', label: 'Stock', type: 'WEB_APP', value: 'https://old.example/p/app/cartie', row: 1, col: 0 },
            { id: 'btn_transit', label: 'Transit', type: 'WEB_APP', value: 'https://old.example/p/app/cartie', row: 1, col: 1 },
            { id: 'btn_sell', label: 'Sell', type: 'SCENARIO', value: 'scenario_sell', row: 2, col: 0 },
            { id: 'btn_support', label: 'Support', type: 'SCENARIO', value: 'scenario_support', row: 2, col: 1 },
            { id: 'btn_status', label: 'Status', type: 'CALLBACK', value: 'open_miniapp_status', row: 3, col: 0 } as any
          ]
        },
        miniAppConfig: {
          isEnabled: true,
          title: 'Existing',
          welcomeText: 'Existing',
          primaryColor: '#111111',
          layout: 'GRID',
          actions: [{ id: 'act_pick', label: 'Pick', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' }],
          navItems: [{ id: 'nav_home', label: 'Home', icon: 'Home', actionType: 'VIEW', value: 'HOME' }],
          url: 'https://old.example/p/app/cartie',
          showcaseSlug: 'cartie'
        }
      } as any
    });

    const buttons = result.config.menuConfig?.buttons || [];
    const byId = new Map(buttons.map(button => [button.id, button]));

    expect(byId.get('btn_pick')?.value).toContain('entry=request');
    expect(byId.get('btn_pick')?.value).toContain('type=BUY');
    expect(byId.get('btn_stock')?.value).toContain('entry=inventory');
    expect(byId.get('btn_stock')?.value).toContain('status=AVAILABLE');
    expect(byId.get('btn_transit')?.value).toContain('entry=inventory');
    expect(byId.get('btn_transit')?.value).toContain('status=PENDING');
    expect(byId.get('btn_sell')?.type).toBe('SCENARIO');
    expect(byId.get('btn_sell')?.value).toBe('scenario_sell');
    expect(byId.get('btn_support')?.type).toBe('WEB_APP');
    expect(byId.get('btn_support')?.value).toContain('entry=support');
    expect(byId.has('btn_status')).toBe(false);
    expect(result.config.miniAppConfig?.navItems?.map(item => item.value)).toEqual([
      'HOME',
      'INVENTORY',
      'REQUEST',
      'CONTACTS',
      'PROFILE'
    ]);
    expect(prisma.scenario.updateMany).toHaveBeenCalled();
  });

  it('replaces legacy CLIENT_LEAD MiniApp nav/actions instead of accumulating old items', async () => {
    const result = await applyTemplatePreset({
      template: 'CLIENT_LEAD',
      companyId: 'company_test',
      botId: 'bot_test',
      defaultShowcaseSlug: 'cartie',
      config: {
        publicBaseUrl: 'https://example.com',
        menuConfig: {
          welcomeMessage: 'Custom welcome',
          buttons: []
        },
        miniAppConfig: {
          isEnabled: true,
          title: 'Existing',
          welcomeText: 'Existing',
          primaryColor: '#111111',
          layout: 'GRID',
          actions: [
            { id: 'act_request_old', label: 'Підбір', icon: 'Sparkles', actionType: 'VIEW', value: 'REQUEST' },
            { id: 'act_transit_old', label: 'Авто в дорозі', icon: 'Truck', actionType: 'VIEW', value: 'INVENTORY_TRANSIT' },
            { id: 'act_support_old', label: 'Підтримка', icon: 'MessageCircle', actionType: 'VIEW', value: 'SUPPORT' }
          ],
          navItems: [
            { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
            { id: 'nav_inventory', label: 'Каталог', icon: 'Car', actionType: 'VIEW', value: 'INVENTORY' },
            { id: 'nav_request_old', label: 'Підбір', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
            { id: 'nav_favorites_old', label: 'Обране', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
            { id: 'nav_support_old', label: 'Підтримка', icon: 'MessageCircle', actionType: 'VIEW', value: 'SUPPORT' }
          ],
          url: 'https://old.example/p/app/cartie',
          showcaseSlug: 'cartie'
        }
      } as any
    });

    expect(result.config.miniAppConfig?.actions.map(item => item.id)).toEqual([
      'act_stock',
      'act_pick',
      'act_transit',
      'act_contacts'
    ]);
    expect(result.config.miniAppConfig?.navItems?.map(item => item.value)).toEqual([
      'HOME',
      'INVENTORY',
      'REQUEST',
      'CONTACTS',
      'PROFILE'
    ]);
  });

  it('seeds official CarTié contacts for CLIENT_LEAD MiniApp config', async () => {
    const result = await applyTemplatePreset({
      template: 'CLIENT_LEAD',
      companyId: 'company_test',
      botId: 'bot_test',
      defaultShowcaseSlug: 'cartie',
      config: {
        publicBaseUrl: 'https://example.com',
        menuConfig: { welcomeMessage: 'Custom welcome', buttons: [] },
        miniAppConfig: {
          isEnabled: true,
          title: 'Existing',
          welcomeText: 'Existing',
          primaryColor: '#111111',
          layout: 'GRID',
          actions: [],
          navItems: [],
          url: 'https://old.example/p/app/cartie',
          showcaseSlug: 'cartie'
        }
      } as any
    });

    expect(result.config.miniAppConfig?.contacts).toMatchObject({
      telegramChannel: 'https://t.me/cartieimport',
      telegramBot: 'https://t.me/yura_cartie',
      instagram: 'https://www.instagram.com/cartie.import/',
      website: 'https://cartie.adsquiz.io/',
      phone: '+38 (063) 505-52-52',
      address: 'м. Львів, Кільцева дорога 1, 79000'
    });
    expect(result.config.miniAppConfig?.contacts?.links).toEqual(expect.arrayContaining([
      { label: 'Авто в наявності', url: 'https://t.me/CarTie_Showroom' },
      { label: 'TikTok', url: 'https://www.tiktok.com/@cartie.import' },
      { label: 'YouTube', url: 'https://www.youtube.com/@cartie_avto' },
      { label: 'Локація', url: 'https://maps.app.goo.gl/n6MACQaVP9cEoNDo7?g_st=ipc' }
    ]));
  });

  it('repairs B2B preset menu buttons to MiniApp section web_app URLs', async () => {
    const result = await applyTemplatePreset({
      template: 'B2B',
      companyId: 'company_test',
      botId: 'bot_b2b',
      defaultShowcaseSlug: 'cardealer_lviv_bot',
      config: {
        publicBaseUrl: 'https://example.com',
        menuConfig: {
          welcomeMessage: 'CarDealer Lviv B2B',
          buttons: [
            { id: 'btn_b2b_inv_my', label: '🚘 Мій інвентар', type: 'SCENARIO', value: 'old_inventory', row: 0, col: 0 },
            { id: 'btn_b2b_inv_add', label: '➕ Додати авто', type: 'SCENARIO', value: 'old_add', row: 0, col: 1 },
            { id: 'btn_b2b_inv_price', label: '💲 Змінити ціну', type: 'SCENARIO', value: 'old_price', row: 1, col: 0 },
            { id: 'btn_b2b_inv_sold', label: '✅ Позначити продано', type: 'SCENARIO', value: 'old_sold', row: 1, col: 1 },
            { id: 'btn_b2b_help', label: 'ℹ️ Інформація / Правила', type: 'SCENARIO', value: 'old_help', row: 2, col: 0 }
          ]
        },
        miniAppConfig: {
          isEnabled: true,
          title: 'Existing B2B',
          welcomeText: 'Existing',
          primaryColor: '#111111',
          layout: 'GRID',
          actions: [],
          navItems: [],
          url: 'https://old.example/p/app/cardealer_lviv_bot',
          showcaseSlug: 'cardealer_lviv_bot'
        }
      } as any
    });

    const buttons = result.config.menuConfig?.buttons || [];
    expect(buttons.map(button => button.id)).toEqual([
      'btn_b2b_req',
      'btn_b2b_inv_my',
      'btn_b2b_app',
      'btn_b2b_help',
      'btn_b2b_menu'
    ]);
    expect(buttons.every(button => button.type === 'WEB_APP')).toBe(true);
    expect(buttons.map(button => new URL(button.value).pathname)).toEqual([
      '/p/app/cardealer_lviv_bot',
      '/p/app/cardealer_lviv_bot',
      '/p/app/cardealer_lviv_bot',
      '/p/app/cardealer_lviv_bot',
      '/p/app/cardealer_lviv_bot'
    ]);
    expect(buttons.some(button => button.value.includes('entry=request'))).toBe(true);
    expect(buttons.some(button => button.value.includes('entry=inventory'))).toBe(true);
    expect(buttons.some(button => button.value.includes('entry=status'))).toBe(true);
    expect(buttons.some(button => button.value.includes('entry=support'))).toBe(true);
    expect(buttons.some(button => button.value.includes('entry=profile'))).toBe(true);
  });
});
