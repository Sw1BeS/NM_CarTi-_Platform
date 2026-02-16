import { describe, expect, it } from 'vitest';
import { getTemplatePresetStatus } from './templatePreset.service.js';

describe('templatePreset.service', () => {
  it('returns ready for B2B when menu, miniapp, channel and admin are present', async () => {
    const status = await getTemplatePresetStatus({
      template: 'B2B',
      companyId: 'company_test',
      channelId: '-100123',
      adminChatId: '12345',
      config: {
        menuConfig: {
          buttons: [
            { id: 'r', label: 'Request', type: 'TEXT', value: '/request', row: 0, col: 0 },
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

    expect(status).toBe('ready');
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
