import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  telegramOutboxMock,
  b2bWhitelistServiceMock
} = vi.hoisted(() => ({
  prismaMock: {
    botSession: {
      update: vi.fn()
    },
    partnerUser: {
      findFirst: vi.fn()
    }
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  b2bWhitelistServiceMock: {
    isEnforced: vi.fn(),
    resolveParticipant: vi.fn()
  }
}));

vi.mock('../../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: telegramOutboxMock
}));

vi.mock('../../../../services/b2bWhitelist.service.js', () => ({
  b2bWhitelistService: b2bWhitelistServiceMock
}));

describe('B2B registered menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    b2bWhitelistServiceMock.isEnforced.mockReturnValue(false);
    prismaMock.botSession.update.mockImplementation(async ({ data }: any) => ({
      id: 'session_1',
      state: data.state,
      variables: data.variables,
      lastActive: data.lastActive
    }));
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 10 });
  });

  it('sends a registered B2B persistent reply menu whose buttons open MiniApp sections', async () => {
    const { showMenu } = await import('./routeMessage.js');

    const ctx: any = {
      bot: {
        id: 'bot_b2b',
        token: 'token',
        name: 'CarDealer Lviv',
        template: 'B2B',
        config: {
          publicBaseUrl: 'https://cartie.test',
          defaultShowcaseSlug: 'cardealer_lviv_bot',
          miniAppConfig: {
            baseUrl: 'https://cartie.test/p/app/old_slug',
            showcaseSlug: 'cardealer_lviv_bot'
          }
        }
      },
      companyId: 'company_1',
      chatId: '1001',
      userId: '1001',
      chatType: 'private',
      update: {
        message: {
          chat: { id: 1001, type: 'private' },
          from: { id: 1001, first_name: 'Dealer' }
        }
      },
      session: {
        id: 'session_1',
        state: 'B2B_MENU',
        variables: {
          b2bPartnerId: 'partner_1',
          b2bPartnerName: 'Dealer One'
        }
      }
    };

    await showMenu(ctx, 'UK', 'B2B');

    const calls = telegramOutboxMock.sendMessage.mock.calls.map(([payload]) => payload);
    expect(calls).toHaveLength(1);
    expect(calls[0].chatId).toBe('1001');
    expect(calls[0].replyMarkup).toHaveProperty('keyboard');
    expect(calls[0].replyMarkup).not.toHaveProperty('inline_keyboard');
    expect(calls[0].replyMarkup.resize_keyboard).toBe(true);
    expect(calls[0].replyMarkup.is_persistent).toBe(true);

    const flatButtons = calls[0].replyMarkup.keyboard.flat();
    expect(flatButtons.every((button: any) => button.web_app?.url?.includes('/p/app/cardealer_lviv_bot'))).toBe(true);
    expect(flatButtons.some((button: any) => button.web_app?.url?.includes('entry=request'))).toBe(true);
    expect(flatButtons.some((button: any) => button.web_app?.url?.includes('entry=inventory'))).toBe(true);
    expect(flatButtons.some((button: any) => button.web_app?.url?.includes('entry=status'))).toBe(true);
    expect(flatButtons.some((button: any) => button.web_app?.url?.includes('entry=support'))).toBe(true);
  }, 10000);

  it('also clears stale reply keyboards for unregistered B2B users', async () => {
    const { showMenu } = await import('./routeMessage.js');
    prismaMock.partnerUser.findFirst.mockResolvedValueOnce(null);

    const ctx: any = {
      bot: {
        id: 'bot_b2b',
        token: 'token',
        name: 'CarDealer Lviv',
        template: 'B2B',
        config: {
          publicBaseUrl: 'https://cartie.test',
          defaultShowcaseSlug: 'cardealer_lviv_bot',
          miniAppConfig: { showcaseSlug: 'cardealer_lviv_bot' }
        }
      },
      companyId: 'company_1',
      chatId: '1002',
      userId: '1002',
      chatType: 'private',
      update: {
        message: {
          chat: { id: 1002, type: 'private' },
          from: { id: 1002, first_name: 'Guest' }
        }
      },
      session: {
        id: 'session_2',
        state: 'B2B_MENU',
        variables: {}
      }
    };

    await showMenu(ctx, 'UK', 'B2B');

    const calls = telegramOutboxMock.sendMessage.mock.calls.map(([payload]) => payload);
    expect(calls[0]).toMatchObject({
      chatId: '1002',
      replyMarkup: { remove_keyboard: true }
    });
    expect(calls[1].replyMarkup).toHaveProperty('inline_keyboard');
    expect(calls.some((call: any) => call.replyMarkup?.keyboard)).toBe(false);
  }, 10000);
});
