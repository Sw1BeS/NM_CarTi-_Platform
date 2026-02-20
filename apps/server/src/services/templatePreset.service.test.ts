import { describe, expect, it } from 'vitest';
import { getTemplatePresetStatus } from './templatePreset.service.js';

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
});
