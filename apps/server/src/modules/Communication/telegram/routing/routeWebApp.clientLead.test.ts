import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  telegramOutboxMock,
  requestContractServiceMock,
  emitPlatformEventMock
} = vi.hoisted(() => ({
  prismaMock: {
    carListing: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn()
    },
    miniAppFavorite: {
      findFirst: vi.fn(),
      delete: vi.fn(),
      create: vi.fn()
    }
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  requestContractServiceMock: {
    createPendingLeadIntent: vi.fn(),
    findKnownLeadContact: vi.fn(),
    finalizePendingLeadIntent: vi.fn()
  },
  emitPlatformEventMock: vi.fn()
}));

vi.mock('../../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: telegramOutboxMock
}));

vi.mock('../../../../services/requestContract.service.js', () => ({
  requestContractService: requestContractServiceMock
}));

vi.mock('../core/events/eventEmitter.js', () => ({
  emitPlatformEvent: emitPlatformEventMock
}));

vi.mock('../../../../services/leadAdminNotification.js', () => ({
  buildLeadAdminActionMarkupAsync: vi.fn(),
  buildLeadAdminNotificationText: vi.fn()
}));

describe('CLIENT_LEAD routeWebApp keyboard bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.carListing.findMany.mockResolvedValue([
      {
        id: 'car_1',
        title: 'Mercedes-Benz S 500',
        price: 78900,
        currency: 'USD',
        year: 2021,
        mileage: 32000,
        location: 'Lviv',
        thumbnail: null,
        mediaUrls: [],
        mediaItems: [],
        specs: {},
        status: 'AVAILABLE'
      }
    ]);
    requestContractServiceMock.createPendingLeadIntent.mockResolvedValue({
      companyId: 'company_1',
      botId: 'bot_lead',
      chatId: '1001',
      title: 'Mercedes-Benz S 500',
      intentType: 'INTEREST',
      carIds: ['car_1'],
      isDuplicate: false
    });
    requestContractServiceMock.findKnownLeadContact.mockResolvedValue(null);
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 10 });
    emitPlatformEventMock.mockResolvedValue(undefined);
  });

  it('creates a pending lead intent from reply-keyboard web_app_data and asks for Telegram contact', async () => {
    const { routeWebApp } = await import('./routeWebApp.js');
    const ctx: any = {
      bot: {
        id: 'bot_lead',
        token: 'token',
        template: 'CLIENT_LEAD',
        companyId: 'company_1',
        config: {
          defaultShowcaseSlug: 'cartie'
        }
      },
      companyId: 'company_1',
      chatId: '1001',
      userId: '1001',
      chatType: 'private',
      update: {
        message: {
          web_app_data: {
            data: JSON.stringify({
              v: 1,
              type: 'interest_click',
              carIds: ['car_1'],
              fields: {
                title: 'Mercedes-Benz S 500',
                lang: 'UK'
              },
              meta: {
                submitId: 'submit_1',
                source: 'miniapp_keyboard_bridge'
              }
            })
          },
          chat: { id: 1001, type: 'private' },
          from: { id: 1001, first_name: 'Client', username: 'client_ua' }
        }
      },
      session: {
        id: 'session_1',
        state: 'CL_MENU',
        variables: {}
      }
    };

    const handled = await routeWebApp(ctx);

    expect(handled).toBe(true);
    expect(requestContractServiceMock.createPendingLeadIntent).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'cartie',
      intentType: 'INTEREST',
      title: 'Mercedes-Benz S 500',
      carListingId: 'car_1',
      carListingIds: ['car_1'],
      tracking: expect.objectContaining({
        submitId: 'submit_1',
        source: 'miniapp_keyboard_bridge'
      }),
      telegram: {
        userId: '1001',
        username: 'client_ua',
        name: 'Client'
      }
    }));
    expect(requestContractServiceMock.findKnownLeadContact).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company_1',
      botId: 'bot_lead',
      telegramUserId: '1001'
    }));
    const messages = telegramOutboxMock.sendMessage.mock.calls.map(([payload]) => payload);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain('Mercedes-Benz S 500');
    expect(messages[0].replyMarkup.keyboard[0][0]).toMatchObject({
      text: '📱 Поділитися контактом',
      request_contact: true
    });
  }, 10000);
});
