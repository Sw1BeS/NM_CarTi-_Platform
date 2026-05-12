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

describe('CLIENT_LEAD bot menu', () => {
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

  it('sends one welcome message with a persistent reply keyboard of MiniApp section buttons', async () => {
    const { showMenu } = await import('./routeMessage.js');

    const ctx: any = {
      bot: {
        id: 'bot_lead',
        token: 'token',
        name: 'Cartie Client Bot',
        template: 'CLIENT_LEAD',
        config: {
          publicBaseUrl: 'https://cartie.test',
          defaultShowcaseSlug: 'cartie',
          miniAppConfig: {
            url: 'https://cartie.test/p/app/cartie',
            showcaseSlug: 'cartie'
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
          from: { id: 1001, first_name: 'Client' }
        }
      },
      session: {
        id: 'session_1',
        state: 'CL_MENU',
        variables: {}
      }
    };

    await showMenu(ctx, 'UK', 'CLIENT_LEAD');

    const calls = telegramOutboxMock.sendMessage.mock.calls.map(([payload]) => payload);
    expect(calls).toHaveLength(1);
    expect(calls[0].chatId).toBe('1001');
    expect(calls[0].text).toContain('CarTié');
    expect(calls[0].replyMarkup).toHaveProperty('keyboard');
    expect(calls[0].replyMarkup).not.toHaveProperty('inline_keyboard');
    expect(calls[0].replyMarkup.resize_keyboard).toBe(true);
    expect(calls[0].replyMarkup.is_persistent).toBe(true);

    const flatButtons = calls[0].replyMarkup.keyboard.flat();
    expect(flatButtons.every((button: any) => button.web_app?.url?.includes('/p/app/cartie'))).toBe(true);
    expect(flatButtons.some((button: any) => button.web_app?.url?.includes('entry=request') && button.web_app.url.includes('type=BUY'))).toBe(true);
    expect(flatButtons.some((button: any) => button.web_app?.url?.includes('entry=request') && button.web_app.url.includes('type=SELL'))).toBe(true);
    expect(flatButtons.some((button: any) => button.web_app?.url?.includes('entry=contacts'))).toBe(true);
  }, 10000);
});
