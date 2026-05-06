import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPrisma,
  createOrMergeLeadMock,
  resolvePublicSlugMock,
  platformEventsEmitMock
} = vi.hoisted(() => ({
  mockPrisma: {
    botConfig: {
      findFirst: vi.fn(),
      findUnique: vi.fn()
    },
    botSession: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    carListing: {
      findMany: vi.fn()
    },
    integrationEventLog: {
      create: vi.fn()
    },
    b2bRequest: {
      update: vi.fn(),
      create: vi.fn()
    },
    requestVariant: {
      findUnique: vi.fn()
    }
  },
  createOrMergeLeadMock: vi.fn(),
  resolvePublicSlugMock: vi.fn(),
  platformEventsEmitMock: vi.fn()
}));

vi.mock('./prisma.js', () => ({
  prisma: mockPrisma
}));

vi.mock('../modules/Communication/telegram/core/leadService.js', () => ({
  createOrMergeLead: createOrMergeLeadMock
}));

vi.mock('./platform-events.js', () => ({
  platformEvents: {
    emit: platformEventsEmitMock
  },
  EVENTS: {
    MINIAPP_REQUEST_CREATED: 'miniapp.request.created'
  }
}));

vi.mock('./publicSlug.service.js', () => ({
  resolvePublicSlug: resolvePublicSlugMock
}));

import { requestContractService } from './requestContract.service.js';

describe('requestContract.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePublicSlugMock.mockResolvedValue({
      companyId: 'cmp_1',
      botId: 'bot_1',
      slug: 'cartie',
      source: 'bot',
      compatibility: null
    });
    mockPrisma.integrationEventLog.create.mockResolvedValue({ id: 'log_1' });
    mockPrisma.carListing.findMany.mockResolvedValue([]);
    mockPrisma.botConfig.findUnique.mockResolvedValue({ id: 'bot_1', config: {} });
    createOrMergeLeadMock.mockResolvedValue({
      isDuplicate: false,
      lead: { id: 'lead_1' },
      request: { id: 'req_1', publicId: 'REQ-1', payload: null, description: null }
    });
    mockPrisma.b2bRequest.update.mockResolvedValue({
      id: 'req_1',
      publicId: 'REQ-1',
      payload: {},
      description: 'Інтерес зафіксовано з Mini App.',
      status: 'COLLECTING_VARIANTS'
    });
    mockPrisma.b2bRequest.create.mockResolvedValue({
      id: 'req_1',
      publicId: 'REQ-1',
      payload: {},
      description: 'Інтерес зафіксовано з Mini App.',
      status: 'COLLECTING_VARIANTS'
    });
  });

  it('stores pending lead intent in bot session', async () => {
    mockPrisma.botSession.findUnique.mockResolvedValue(null);
    mockPrisma.carListing.findMany.mockResolvedValue([{ id: 'car_1', title: 'BMW X5' }]);

    const result = await requestContractService.createPendingLeadIntent({
      slug: 'cartie',
      intentType: 'INTEREST',
      title: 'BMW X5',
      carListingIds: ['car_1'],
      tracking: { utm_source: 'telegram' },
      telegram: { userId: '1001', username: 'client_one', name: 'Client One' }
    });

    expect(result.botId).toBe('bot_1');
    expect(mockPrisma.botSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        state: 'CL_MINIAPP_CONTACT',
        chatId: '1001',
        variables: expect.objectContaining({
          miniappPendingIntent: expect.objectContaining({
            intentType: 'INTEREST',
            title: 'BMW X5'
          })
        })
      })
    }));
  });

  it('deduplicates pending lead intents by tracking submitId', async () => {
    mockPrisma.botSession.findUnique.mockResolvedValue({
      id: 'sess_1',
      variables: {
        miniappPendingIntent: {
          version: 1,
          intentType: 'REQUEST',
          slug: 'cartie',
          title: 'Existing request',
          tracking: { submitId: 'submit_1' },
          createdAt: new Date().toISOString()
        }
      }
    });

    const result = await requestContractService.createPendingLeadIntent({
      slug: 'cartie',
      intentType: 'REQUEST',
      title: 'New request',
      tracking: { submitId: 'submit_1' },
      telegram: { userId: '1001', username: 'client_one', name: 'Client One' }
    });

    expect(result.isDuplicate).toBe(true);
    expect(mockPrisma.botSession.update).not.toHaveBeenCalled();
    expect(mockPrisma.botSession.create).not.toHaveBeenCalled();
  });

  it('finalizes pending lead intent through lead/request creation and clears session state', async () => {
    mockPrisma.botSession.findUnique.mockResolvedValue({
      id: 'sess_1',
      variables: {
        miniappPendingIntent: {
          version: 1,
          intentType: 'INTEREST',
          slug: 'cartie',
          title: 'BMW X5',
          carIds: ['car_1'],
          tracking: { utm_source: 'telegram' },
          createdAt: new Date().toISOString()
        }
      }
    });
    mockPrisma.carListing.findMany.mockResolvedValue([
      { id: 'car_1', title: 'BMW X5', year: 2022, price: 55000, currency: 'USD' }
    ]);

    const result = await requestContractService.finalizePendingLeadIntent({
      botId: 'bot_1',
      companyId: 'cmp_1',
      telegramUserId: '1001',
      phone: '+380671234567',
      displayName: 'Client One',
      telegramUsername: 'client_one',
      telegramName: 'Client One'
    });

    expect(createOrMergeLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      botId: 'bot_1',
      companyId: 'cmp_1',
      phone: '+380671234567',
      createRequest: true
    }), {});
    expect(mockPrisma.botSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sess_1' },
      data: expect.objectContaining({
        state: 'CL_MENU',
        variables: expect.objectContaining({
          miniappPendingIntent: null
        })
      })
    }));
    expect(result.request.publicId).toBe('REQ-1');
  });

  it('reveals fit queue contacts only through explicit admin action and sets CONTACT_SHARED', async () => {
    mockPrisma.requestVariant.findUnique.mockResolvedValue({
      id: 'variant_1',
      requestId: 'req_1',
      fitQueueStatus: 'NEW',
      contact: '+380501112233',
      companyName: 'Seller Co',
      sellerPartner: { name: 'Seller Co' },
      request: {
        id: 'req_1',
        companyId: 'cmp_1',
        publicId: 'REQ-1',
        status: 'SHORTLIST',
        payload: {
          request: {
            phone: '+380671234567'
          }
        }
      }
    });
    mockPrisma.b2bRequest.update.mockResolvedValue({
      id: 'req_1',
      publicId: 'REQ-1',
      status: 'CONTACT_SHARED',
      payload: {}
    });

    const result = await requestContractService.shareAdminFitQueueContacts({
      companyId: 'cmp_1',
      variantId: 'variant_1'
    });

    expect(mockPrisma.b2bRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'req_1' },
      data: expect.objectContaining({ status: 'CONTACT_SHARED' })
    }));
    expect(result.requesterContact).toBe('+380671234567');
    expect(result.sellerContact).toBe('+380501112233');
    expect(result.requestStatus).toBe('CONTACT_SHARED');
  });
});
