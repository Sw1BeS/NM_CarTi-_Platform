import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPrisma,
  resolvePublicSlugMock,
  createOrMergeLeadMock,
  platformEventsEmitMock
} = vi.hoisted(() => ({
  mockPrisma: {
    miniAppFavorite: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn()
    },
    carListing: {
      findUnique: vi.fn(),
      findMany: vi.fn()
    },
    botConfig: {
      findFirst: vi.fn(),
      findUnique: vi.fn()
    },
    b2bRequest: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn()
    },
    partnerUser: {
      findFirst: vi.fn()
    }
  },
  resolvePublicSlugMock: vi.fn(),
  createOrMergeLeadMock: vi.fn(),
  platformEventsEmitMock: vi.fn()
}));

vi.mock('./prisma.js', () => ({
  prisma: mockPrisma
}));

vi.mock('./publicSlug.service.js', () => ({
  resolvePublicSlug: resolvePublicSlugMock
}));

vi.mock('../modules/Communication/telegram/core/leadService.js', () => ({
  createOrMergeLead: createOrMergeLeadMock
}));

vi.mock('./platform-events.js', () => ({
  platformEvents: {
    emit: platformEventsEmitMock
  },
  EVENTS: {
    MINIAPP_REQUEST_CREATED: 'miniapp.request.created',
    MINIAPP_FAVORITE_ADDED: 'miniapp.favorite.added',
    MINIAPP_FAVORITE_REMOVED: 'miniapp.favorite.removed'
  }
}));

vi.mock('../modules/Marketing/showcase/showcase.service.js', () => ({
  ShowcaseService: class ShowcaseService {}
}));

import { miniAppService } from './miniapp.service.js';

describe('miniapp.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePublicSlugMock.mockResolvedValue({
      companyId: 'cmp_1',
      botId: 'bot_b2b',
      slug: 'cardealer_lviv_bot',
      source: 'bot'
    });
    mockPrisma.botConfig.findUnique.mockResolvedValue({
      id: 'bot_b2b',
      template: 'B2B',
      config: { miniAppConfig: { surfaceMode: 'B2B' } }
    });
    mockPrisma.carListing.findMany.mockResolvedValue([
      {
        id: 'car_1',
        title: 'Porsche 911 Carrera S',
        price: 120000,
        currency: 'USD',
        year: 2021,
        mileage: 22000,
        location: 'Львів',
        thumbnail: 'https://cdn.example/911.jpg',
        mediaUrls: ['https://cdn.example/911.jpg'],
        mediaItems: null,
        specs: { fuel: 'petrol', transmission: 'automatic' },
        status: 'AVAILABLE'
      }
    ]);
    mockPrisma.b2bRequest.findFirst.mockResolvedValue(null);
    mockPrisma.b2bRequest.findMany.mockResolvedValue([]);
    mockPrisma.partnerUser.findFirst.mockResolvedValue({
      id: 'partner_user_1',
      telegramId: '2001',
      role: 'OWNER',
      partnerId: 'partner_1',
      partner: { id: 'partner_1', name: 'Dealer One' }
    });
    mockPrisma.b2bRequest.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: 'req_1',
      publicId: data.publicId || 'REQ-1',
      status: data.status || 'DRAFT',
      createdAt: new Date('2026-05-12T00:00:00Z'),
      updatedAt: new Date('2026-05-12T00:00:00Z'),
      variants: []
    }));
  });

  it('creates B2B MiniApp requests with partner ownership and readable vehicle snapshot without Lead duplication', async () => {
    const request = await miniAppService.createRequest({
      slug: 'cardealer_lviv_bot',
      requestType: 'BUY',
      carListingIds: ['car_1'],
      comment: 'Потрібна швидка відповідь',
      tracking: { submitId: 'submit_1' },
      telegram: {
        userId: '2001',
        username: 'dealer_owner',
        name: 'Dealer Owner'
      }
    });

    expect(mockPrisma.partnerUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        telegramId: '2001',
        companyId: 'cmp_1'
      }
    }));
    expect(createOrMergeLeadMock).not.toHaveBeenCalled();
    expect(mockPrisma.b2bRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'cmp_1',
        botId: 'bot_b2b',
        requesterPartnerId: 'partner_1',
        OR: expect.arrayContaining([
          { payload: { path: ['idempotencyKey'], equals: 'miniapp-submit:cmp_1:bot_b2b:2001:submit_1' } },
          { payload: { path: ['tracking', 'submitId'], equals: 'submit_1' } }
        ])
      })
    }));
    expect(mockPrisma.b2bRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        requesterPartnerId: 'partner_1',
        payload: expect.objectContaining({
          requesterPartner: expect.objectContaining({
            id: 'partner_1',
            name: 'Dealer One'
          }),
          selectedCars: [
            expect.objectContaining({
              id: 'car_1',
              title: 'Porsche 911 Carrera S',
              priceLabel: '$120,000'
            })
          ],
          requestSummary: expect.stringContaining('Porsche 911 Carrera S')
        })
      })
    }));
    expect(request.requesterPartnerId).toBe('partner_1');
    expect(request.payload.requestSummary).toContain('Porsche 911 Carrera S');
  });

  it('returns a recent B2B MiniApp request for the same selected cars when submitId is missing', async () => {
    const existingRequest = {
      id: 'req_existing',
      publicId: 'REQ-EXISTING',
      title: 'Запит: Porsche 911 Carrera S',
      type: 'BUY',
      chatId: '2001',
      botId: 'bot_b2b',
      requesterPartnerId: 'partner_1',
      status: 'DRAFT',
      payload: {
        source: 'miniapp',
        requestType: 'BUY',
        request: {
          carListingIds: ['car_1']
        }
      },
      createdAt: new Date('2026-05-12T00:00:00Z'),
      updatedAt: new Date('2026-05-12T00:00:00Z'),
      variants: []
    };
    mockPrisma.b2bRequest.findMany.mockResolvedValueOnce([existingRequest]);

    const request = await miniAppService.createRequest({
      slug: 'cardealer_lviv_bot',
      requestType: 'BUY',
      carListingIds: ['car_1'],
      telegram: {
        userId: '2001',
        username: 'dealer_owner',
        name: 'Dealer Owner'
      }
    });

    expect(request.id).toBe('req_existing');
    expect(mockPrisma.b2bRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'cmp_1',
        botId: 'bot_b2b',
        chatId: '2001',
        requesterPartnerId: 'partner_1',
        type: 'BUY',
        createdAt: expect.objectContaining({ gte: expect.any(Date) })
      }),
      orderBy: { createdAt: 'desc' }
    }));
    expect(mockPrisma.b2bRequest.create).not.toHaveBeenCalled();
  });

  it('creates B2B SELL/add-car requests without creating a Lead', async () => {
    const request = await miniAppService.createRequest({
      slug: 'cardealer_lviv_bot',
      requestType: 'SELL',
      title: 'B2B продаж авто: BMW X5',
      comment: 'Авто партнера для продажу',
      payload: {
        requestType: 'SELL',
        criteria: {
          brands: [{ id: 'bmw', label: 'BMW' }],
          models: [{ brandId: 'bmw', id: 'x5', label: 'X5' }],
          yearFrom: 2021,
          mileage: '80 000 км'
        }
      },
      tracking: { submitId: 'sell_submit_1' },
      telegram: {
        userId: '2001',
        username: 'dealer_owner',
        name: 'Dealer Owner'
      }
    });

    expect(createOrMergeLeadMock).not.toHaveBeenCalled();
    expect(mockPrisma.b2bRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'SELL',
        leadId: undefined,
        requesterPartnerId: 'partner_1',
        payload: expect.objectContaining({
          requestType: 'SELL',
          requesterPartner: expect.objectContaining({ id: 'partner_1' }),
          requestPresentation: expect.objectContaining({
            customerIntent: 'SELL'
          })
        })
      })
    }));
    expect(request.payload.requestType).toBe('SELL');
    expect(request.leadId).toBeUndefined();
  });

  it('lists Lead MiniApp request history by Telegram identity without exposing raw contact payload', async () => {
    mockPrisma.b2bRequest.findMany.mockResolvedValueOnce([
      {
        id: 'req_1',
        publicId: 'RQ-1',
        title: 'Підбір авто',
        status: 'NEW',
        type: 'BUY',
        chatId: '1001',
        companyId: 'cmp_1',
        payload: {
          source: 'miniapp_intent',
          phone: '+380635055252',
          telegram: {
            userId: '1001'
          },
          request: {
            intentType: 'REQUEST',
            phone: '+380635055252'
          }
        },
        createdAt: new Date('2026-05-18T10:00:00.000Z'),
        updatedAt: new Date('2026-05-18T10:15:00.000Z')
      }
    ]);

    const history = await miniAppService.listMyRequests('cartie', {
      telegramUserId: '1001',
      limit: 5
    });

    expect(mockPrisma.b2bRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'cmp_1',
        OR: expect.arrayContaining([
          { chatId: '1001' },
          { lead: { is: { userTgId: '1001' } } },
          { payload: { path: ['telegram', 'userId'], equals: '1001' } }
        ])
      }),
      orderBy: { createdAt: 'desc' },
      take: 5
    }));
    expect(history).toEqual([
      expect.objectContaining({
        id: 'req_1',
        publicId: 'RQ-1',
        title: 'Підбір авто',
        status: 'NEW',
        type: 'BUY',
        source: 'miniapp_intent',
        intentType: 'REQUEST'
      })
    ]);
    expect(JSON.stringify(history)).not.toContain('+380635055252');
    expect(JSON.stringify(history)).not.toContain('payload');
  });
});
