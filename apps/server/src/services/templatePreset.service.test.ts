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
    expect(byId.get('btn_sell')?.type).toBe('WEB_APP');
    expect(byId.get('btn_sell')?.value).toContain('type=SELL');
    expect(byId.get('btn_support')?.type).toBe('WEB_APP');
    expect(byId.get('btn_support')?.value).toContain('entry=support');
    expect(byId.has('btn_status')).toBe(false);
    expect(prisma.scenario.updateMany).toHaveBeenCalled();
  });
});
