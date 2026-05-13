import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  telegramOutboxMock,
  b2bWhitelistServiceMock,
  quotaServiceMock,
  publicIdServiceMock,
  startB2BVariantWizardMock
} = vi.hoisted(() => ({
  prismaMock: {
    botSession: {
      update: vi.fn()
    },
    partnerUser: {
      findFirst: vi.fn()
    },
    b2bRequest: {
      create: vi.fn(),
      update: vi.fn()
    },
    integrationEventLog: {
      create: vi.fn()
    },
    messageLog: {
      create: vi.fn()
    },
    channelPost: {
      create: vi.fn()
    },
    botConfig: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    partnerCompany: {
      findUnique: vi.fn()
    }
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  b2bWhitelistServiceMock: {
    isEnforced: vi.fn(),
    resolveParticipant: vi.fn()
  },
  quotaServiceMock: {
    consume: vi.fn()
  },
  publicIdServiceMock: {
    nextB2bRequestId: vi.fn()
  },
  startB2BVariantWizardMock: vi.fn()
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

vi.mock('../../../../services/quota.service.js', () => ({
  quotaService: quotaServiceMock
}));

vi.mock('../../../../services/publicId.service.js', () => ({
  publicIdService: publicIdServiceMock
}));

vi.mock('./wizards/b2bVariantWizard.js', () => ({
  startB2BVariantWizard: startB2BVariantWizardMock
}));

describe('B2B registered menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    b2bWhitelistServiceMock.isEnforced.mockReturnValue(false);
    quotaServiceMock.consume.mockResolvedValue({ allowed: true });
    prismaMock.botSession.update.mockImplementation(async ({ data }: any) => ({
      id: 'session_1',
      state: data.state,
      variables: data.variables,
      lastActive: data.lastActive
    }));
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 10 });
    publicIdServiceMock.nextB2bRequestId.mockResolvedValue('CD-2026-000777');
    prismaMock.b2bRequest.create.mockImplementation(async ({ data }: any) => ({
      id: 'request_1',
      publicId: data.publicId,
      title: data.title,
      yearMin: data.yearMin,
      yearMax: data.yearMax,
      budgetMin: data.budgetMin,
      budgetMax: data.budgetMax,
      description: data.description,
      payload: data.payload
    }));
    prismaMock.b2bRequest.update.mockResolvedValue({});
    prismaMock.integrationEventLog.create.mockResolvedValue({});
    prismaMock.messageLog.create.mockResolvedValue({});
    prismaMock.channelPost.create.mockResolvedValue({});
    prismaMock.partnerCompany.findUnique.mockResolvedValue(null);
    prismaMock.botConfig.findUnique.mockImplementation(async ({ where }: any) => {
      if (where?.id === 'bot_b2b') {
        return {
          id: 'bot_b2b',
          token: 'token',
          companyId: 'company_1',
          isEnabled: true,
          config: { username: 'CarDealer_Lviv_Bot' }
        };
      }
      return null;
    });
    prismaMock.botConfig.update.mockResolvedValue({});
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

  it('routes legacy channel deep links request_PUBLIC_ID to the B2B variant wizard', async () => {
    const { routeMessage } = await import('./routeMessage.js');

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
      chatId: '1001',
      userId: '1001',
      chatType: 'private',
      update: {
        message: {
          text: '/start request_REQ-MMU49LAQRWD9',
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

    const handled = await routeMessage(ctx);

    expect(handled).toBe(true);
    expect(startB2BVariantWizardMock).toHaveBeenCalledWith(ctx, 'REQ-MMU49LAQRWD9');
  }, 10000);

  it('routes b2bv_PUBLIC_ID channel deep links to the B2B variant wizard', async () => {
    const { routeMessage } = await import('./routeMessage.js');

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
      chatId: '1001',
      userId: '1001',
      chatType: 'private',
      update: {
        message: {
          text: '/start b2bv_CD-2026-000123',
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

    const handled = await routeMessage(ctx);

    expect(handled).toBe(true);
    expect(startB2BVariantWizardMock).toHaveBeenCalledWith(ctx, 'CD-2026-000123');
  }, 10000);

  it('publishes legacy finalized B2B requests with the Є авто deep-link action', async () => {
    const { finalizeB2BRequest } = await import('./routeMessage.js');

    const ctx: any = {
      bot: {
        id: 'bot_b2b',
        token: 'token',
        name: 'CarDealer Lviv',
        template: 'B2B',
        channelId: '-100123',
        config: {
          username: 'CarDealer_Lviv_Bot',
          publicBaseUrl: 'https://cartie.test',
          defaultShowcaseSlug: 'cardealer_lviv_bot',
          miniAppConfig: { showcaseSlug: 'cardealer_lviv_bot' }
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
        state: 'B2B_CREATE',
        variables: {
          b2bFlow: {
            title: 'BMW X5',
            yearMin: 2020,
            yearMax: 2024,
            budgetMax: 70000,
            mileageMax: 120000,
            fuel: 'Дизель',
            description: 'Потрібен доглянутий',
            contact: '+380635055252',
            companyName: 'Dealer One'
          }
        }
      }
    };

    await finalizeB2BRequest(ctx);

    const channelCall = telegramOutboxMock.sendMessage.mock.calls
      .map(([payload]) => payload)
      .find((payload: any) => payload.chatId === '-100123');
    expect(channelCall?.replyMarkup?.inline_keyboard?.[0]?.[0]).toEqual({
      text: 'Є авто',
      url: 'https://t.me/CarDealer_Lviv_Bot?start=b2bv_CD-2026-000777'
    });
  }, 10000);
});
