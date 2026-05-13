import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  telegramOutboxMock,
  scenarioEngineMock,
  quotaServiceMock
} = vi.hoisted(() => ({
  prismaMock: {
    botSession: {
      update: vi.fn()
    }
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  scenarioEngineMock: {
    handleUpdate: vi.fn(),
    startScenario: vi.fn()
  },
  quotaServiceMock: {
    consume: vi.fn()
  }
}));

vi.mock('../../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: telegramOutboxMock
}));

vi.mock('../../bots/scenario.engine.js', () => ({
  ScenarioEngine: scenarioEngineMock
}));

vi.mock('../../../../services/quota.service.js', () => ({
  quotaService: quotaServiceMock
}));

describe('dynamic bot menu MiniApp compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scenarioEngineMock.handleUpdate.mockResolvedValue(false);
    quotaServiceMock.consume.mockResolvedValue({ allowed: true });
    prismaMock.botSession.update.mockImplementation(async ({ data }: any) => ({
      id: 'session_1',
      state: data.state,
      variables: data.variables,
      lastActive: data.lastActive
    }));
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 10 });
  });

  it('renders platform LINK buttons pointing at MiniApp as Telegram web_app buttons', async () => {
    const { routeMessage } = await import('./routeMessage.js');

    const ctx: any = {
      bot: {
        id: 'bot_custom',
        token: 'token',
        name: 'CarTié Custom Bot',
        template: 'CUSTOM',
        config: {
          publicBaseUrl: 'https://cartie.test',
          defaultShowcaseSlug: 'cartie',
          miniAppConfig: { showcaseSlug: 'cartie' },
          menuConfig: {
            welcomeMessage: 'Меню',
            buttons: [
              {
                id: 'miniapp_request',
                label: 'Підібрати авто',
                type: 'LINK',
                value: 'https://old.example/p/app/old_slug?entry=request&type=BUY',
                row: 0,
                col: 0
              }
            ]
          }
        }
      },
      companyId: 'company_1',
      chatId: '1001',
      userId: '1001',
      chatType: 'private',
      update: {
        message: {
          text: '/start',
          chat: { id: 1001, type: 'private' },
          from: { id: 1001, first_name: 'Client' }
        }
      },
      session: {
        id: 'session_1',
        state: 'MENU',
        variables: {}
      }
    };

    const handled = await routeMessage(ctx);

    expect(handled).toBe(true);
    const menuCall = telegramOutboxMock.sendMessage.mock.calls.map(([payload]) => payload)[0];
    const button = menuCall.replyMarkup.keyboard[0][0];
    expect(button.text).toBe('Підібрати авто');
    expect(button.web_app?.url).toContain('/p/app/cartie');
    expect(button.web_app?.url).toContain('entry=request');
    expect(button.web_app?.url).toContain('type=BUY');
  });
});
