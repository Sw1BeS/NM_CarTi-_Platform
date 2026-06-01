import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  telegramOutboxMock,
  scenarioEngineMock,
  b2bWhitelistServiceMock,
  requestContractServiceMock,
  quotaServiceMock,
  emitPlatformEventMock
} = vi.hoisted(() => ({
  prismaMock: {
    botSession: {
      update: vi.fn()
    },
    integrationEventLog: {
      create: vi.fn()
    },
    partnerUser: {
      findFirst: vi.fn()
    }
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  scenarioEngineMock: {
    handleUpdate: vi.fn(),
    startScenario: vi.fn()
  },
  b2bWhitelistServiceMock: {
    isEnforced: vi.fn(),
    resolveParticipant: vi.fn()
  },
  requestContractServiceMock: {
    finalizePendingLeadIntent: vi.fn()
  },
  quotaServiceMock: {
    consume: vi.fn()
  },
  emitPlatformEventMock: vi.fn()
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

vi.mock('../../../../services/b2bWhitelist.service.js', () => ({
  b2bWhitelistService: b2bWhitelistServiceMock
}));

vi.mock('../../../../services/requestContract.service.js', () => ({
  requestContractService: requestContractServiceMock
}));

vi.mock('../../../../services/quota.service.js', () => ({
  quotaService: quotaServiceMock
}));

vi.mock('../core/events/eventEmitter.js', () => ({
  emitPlatformEvent: emitPlatformEventMock
}));

describe('CLIENT_LEAD bot menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    b2bWhitelistServiceMock.isEnforced.mockReturnValue(false);
    quotaServiceMock.consume.mockResolvedValue({ allowed: true });
    emitPlatformEventMock.mockResolvedValue(undefined);
    requestContractServiceMock.finalizePendingLeadIntent.mockResolvedValue({
      intentType: 'INTEREST',
      title: 'Mercedes-Benz S 500',
      phone: '+380635055252',
      isDuplicate: false,
      lead: { id: 'lead_1' },
      request: { id: 'request_1', publicId: 'REQ-1' },
      selectedCars: [],
      requestPresentation: {
        telegramText: '🎯 Ціна / умови: Mercedes-Benz S 500\n🚗 Mercedes-Benz S 500 2021 • $78,900 • В наявності • Львів'
      }
    });
    prismaMock.botSession.update.mockImplementation(async ({ data }: any) => ({
      id: 'session_1',
      state: data.state,
      variables: data.variables,
      lastActive: data.lastActive
    }));
    prismaMock.integrationEventLog.create.mockResolvedValue({});
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 10 });
  });

  it('routes CLIENT_LEAD /start to the fixed runtime menu while repairing stored MiniApp menu URLs', async () => {
    const { routeMessage } = await import('./routeMessage.js');

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
          },
          menuConfig: {
            welcomeMessage: 'Stored platform menu',
            buttons: [
              {
                id: 'stored_pick',
                label: 'Stored pick',
                type: 'WEB_APP',
                value: 'https://old.example/p/app/old_slug?entry=request&type=BUY',
                row: 0,
                col: 0
              },
              {
                id: 'stored_transit',
                label: 'Stored transit',
                type: 'LINK',
                value: 'https://t.me/cartie_bot/app?startapp=view_transit&utm_source=menu',
                row: 0,
                col: 1
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
        state: 'CL_MENU',
        variables: {}
      }
    };

    const handled = await routeMessage(ctx);

    expect(handled).toBe(true);
    expect(scenarioEngineMock.handleUpdate).not.toHaveBeenCalled();

    const calls = telegramOutboxMock.sendMessage.mock.calls.map(([payload]) => payload);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).not.toBe('Stored platform menu');
    expect(calls[0].replyMarkup.keyboard).toHaveLength(3);
    expect(calls[0].replyMarkup.keyboard.map((row: any[]) => row.length)).toEqual([2, 2, 2]);

    const runtimeButtons = calls[0].replyMarkup.keyboard.flat();
    expect(runtimeButtons.every((button: any) => !button.web_app)).toBe(true);

    const storedButtons = ctx.bot.config.menuConfig.buttons;
    expect(storedButtons).toEqual([
      expect.objectContaining({
        id: 'stored_pick',
        value: expect.stringContaining('https://cartie.test/p/app/cartie')
      }),
      expect.objectContaining({
        id: 'stored_transit',
        value: expect.stringContaining('https://cartie.test/p/app/cartie')
      })
    ]);
    expect(storedButtons[0].value).toContain('entry=request');
    expect(storedButtons[0].value).toContain('type=BUY');
    expect(storedButtons[1].value).toContain('entry=inventory');
    expect(storedButtons[1].value).toContain('availabilityState=IN_TRANSIT');
    expect(storedButtons[1].value).toContain('utm_source=menu');
  }, 10000);

  it('sends one welcome message with a persistent reply keyboard of canonical MiniApp buttons', async () => {
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
    expect(flatButtons.every((button: any) => !button.web_app)).toBe(true);
  }, 10000);

  it('turns stock text menu clicks into inline MiniApp launch buttons with scoped entry filters', async () => {
    const { routeMessage } = await import('./routeMessage.js');

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
            url: 'https://cartie.test/p/app/cartie?v=stale',
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
          text: '🚘 Авто в наявності',
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

    const handled = await routeMessage(ctx);

    expect(handled).toBe(true);
    const calls = telegramOutboxMock.sendMessage.mock.calls.map(([payload]) => payload);
    expect(calls).toHaveLength(1);
    expect(calls[0].replyMarkup).not.toHaveProperty('keyboard');
    const launchButton = calls[0].replyMarkup.inline_keyboard[0][0];
    expect(launchButton.text).toContain('Авто в наявності');
    const url = new URL(launchButton.web_app.url);
    expect(url.origin + url.pathname).toBe('https://cartie.test/p/app/cartie');
    expect(url.searchParams.get('entry')).toBe('inventory');
    expect(url.searchParams.get('status')).toBe('AVAILABLE');
    expect(url.searchParams.get('availabilityState')).toBe('IN_STOCK');
    expect(url.searchParams.has('v')).toBe(false);
  }, 10000);

  it('turns manager contact menu clicks into inline MiniApp contact launches', async () => {
    const { routeMessage } = await import('./routeMessage.js');

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
          text: '👤 Звʼязатися з менеджером',
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

    const handled = await routeMessage(ctx);

    expect(handled).toBe(true);
    const calls = telegramOutboxMock.sendMessage.mock.calls.map(([payload]) => payload);
    expect(calls).toHaveLength(1);
    const launchButton = calls[0].replyMarkup.inline_keyboard[0][0];
    expect(launchButton.text).toContain('менеджером');
    const url = new URL(launchButton.web_app.url);
    expect(url.origin + url.pathname).toBe('https://cartie.test/p/app/cartie');
    expect(url.searchParams.get('entry')).toBe('contacts');
  }, 10000);

  it('sends actionable admin buttons when MiniApp lead is finalized after native contact share', async () => {
    const { routeMessage } = await import('./routeMessage.js');

    const ctx: any = {
      bot: {
        id: 'bot_lead',
        token: 'token',
        name: 'Cartie Client Bot',
        template: 'CLIENT_LEAD',
        companyId: 'company_1',
        adminChatId: '-100999',
        config: {
          publicBaseUrl: 'https://cartie.test',
          defaultShowcaseSlug: 'cartie'
        }
      },
      companyId: 'company_1',
      chatId: '1001',
      userId: '1001',
      chatType: 'private',
      update: {
        message: {
          chat: { id: 1001, type: 'private' },
          from: { id: 1001, first_name: 'Ivan', last_name: 'Client', username: 'client_one' },
          contact: { user_id: 1001, phone_number: '+380635055252' }
        }
      },
      session: {
        id: 'session_1',
        state: 'CL_MINIAPP_CONTACT',
        variables: {
          miniappPendingIntent: {
            title: 'Mercedes-Benz S 500'
          }
        }
      }
    };

    await routeMessage(ctx);

    const adminMessage = telegramOutboxMock.sendMessage.mock.calls
      .map(([payload]) => payload)
      .find((payload) => payload.chatId === '-100999');

    expect(adminMessage.text).toContain('Mercedes-Benz S 500');
    expect(adminMessage.text).toContain('Request ID: REQ-1');
    expect(adminMessage.replyMarkup).toEqual(expect.objectContaining({
      inline_keyboard: expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('CRM'), url: expect.stringContaining('/requests') })
        ]),
        expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('контакт'), callback_data: expect.stringMatching(/^v1:aa:/) })
        ])
      ])
    }));
    const contactButton = adminMessage.replyMarkup.inline_keyboard
      .flat()
      .find((button: any) => String(button.text || '').includes('контакт'));
    expect(Buffer.byteLength(contactButton.callback_data, 'utf8')).toBeLessThanOrEqual(64);
    expect(contactButton.callback_data).not.toContain('lead_1');
    expect(emitPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company_1',
      botId: 'bot_lead',
      eventType: 'miniapp.ContactShare',
      userId: '1001',
      chatId: '1001',
      payload: expect.objectContaining({
        source: 'telegram_contact_keyboard',
        leadId: 'lead_1',
        requestId: 'request_1',
        requestPublicId: 'REQ-1',
        hasPhone: true
      })
    }));
    expect(JSON.stringify(emitPlatformEventMock.mock.calls)).not.toContain('+380635055252');
  }, 10000);

  it('re-prompts with native contact keyboard when shared contact belongs to another Telegram user', async () => {
    const { routeMessage } = await import('./routeMessage.js');

    const ctx: any = {
      bot: {
        id: 'bot_lead',
        token: 'token',
        name: 'Cartie Client Bot',
        template: 'CLIENT_LEAD',
        companyId: 'company_1',
        config: {
          publicBaseUrl: 'https://cartie.test',
          defaultShowcaseSlug: 'cartie'
        }
      },
      companyId: 'company_1',
      chatId: '1001',
      userId: '1001',
      chatType: 'private',
      update: {
        message: {
          chat: { id: 1001, type: 'private' },
          from: { id: 1001, first_name: 'Ivan', last_name: 'Client', username: 'client_one' },
          contact: { user_id: 2002, phone_number: '+380635055252' }
        }
      },
      session: {
        id: 'session_1',
        state: 'CL_MINIAPP_CONTACT',
        variables: {
          miniappPendingIntent: {
            title: 'Mercedes-Benz S 500'
          }
        }
      }
    };

    const handled = await routeMessage(ctx);

    expect(handled).toBe(true);
    expect(requestContractServiceMock.finalizePendingLeadIntent).not.toHaveBeenCalled();
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '1001',
      text: expect.stringContaining('своїм контактом'),
      replyMarkup: expect.objectContaining({
        keyboard: [[expect.objectContaining({ request_contact: true })], [expect.any(Object)]],
        resize_keyboard: true,
        one_time_keyboard: true
      })
    }));
  }, 10000);
});
