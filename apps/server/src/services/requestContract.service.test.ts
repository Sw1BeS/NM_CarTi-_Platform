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
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    lead: {
      findFirst: vi.fn()
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
    mockPrisma.b2bRequest.findFirst.mockResolvedValue(null);
    mockPrisma.b2bRequest.findMany.mockResolvedValue([]);
    mockPrisma.lead.findFirst.mockResolvedValue(null);
  });

  it('stores pending lead intent in bot session', async () => {
    mockPrisma.botSession.findUnique.mockResolvedValue(null);
    mockPrisma.carListing.findMany.mockResolvedValue([{ id: 'car_1', title: 'BMW X5', price: 50000, currency: 'USD', year: 2022, mediaUrls: [], mediaItems: null, specs: {}, status: 'AVAILABLE' }]);

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
	              title: 'BMW X5',
	              payload: expect.objectContaining({
	                selectedCars: [
	                  expect.objectContaining({
	                    id: 'car_1',
	                    title: 'BMW X5',
	                    priceLabel: '$50,000'
	                  })
	                ],
	                requestSummary: expect.stringContaining('BMW X5')
	              })
	            })
        })
      })
    }));
  });

  it('uses backend vehicle presentation instead of polluted MiniApp title for pending car intent', async () => {
    mockPrisma.botSession.findUnique.mockResolvedValue(null);
    mockPrisma.carListing.findMany.mockResolvedValue([{
      id: 'car_1',
      title: 'Перевірений VIN-код',
      price: 25000,
      currency: 'USD',
      year: 2017,
      mediaUrls: [],
      mediaItems: null,
      specs: {
        brand: 'Tesla',
        model: 'Model X',
        rawText: 'Tesla Model X 2017'
      },
      status: 'AVAILABLE'
    }]);

    await requestContractService.createPendingLeadIntent({
      slug: 'cartie',
      intentType: 'INTEREST',
      title: 'Перевірений VIN-код',
      carListingIds: ['car_1'],
      tracking: { submitId: 'submit_clean_title' },
      telegram: { userId: '1001', username: 'client_one', name: 'Client One' }
    });

    expect(mockPrisma.botSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        variables: expect.objectContaining({
          miniappPendingIntent: expect.objectContaining({
            title: 'Tesla Model X 2017',
            payload: expect.objectContaining({
              selectedCars: [
                expect.objectContaining({
                  title: 'Tesla Model X 2017'
                })
              ],
              requestSummary: expect.stringContaining('Tesla Model X 2017')
            })
          })
        })
      })
    }));
  });

  it('does not rewrite a pending contact handoff for a duplicate submitId', async () => {
    mockPrisma.botSession.findUnique.mockResolvedValue({
      id: 'sess_1',
      state: 'CL_MINIAPP_CONTACT',
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

  it('finds the latest known phone for a Telegram lead identity', async () => {
    mockPrisma.lead.findFirst.mockResolvedValueOnce({
      id: 'lead_known',
      phone: '+380635055252',
      updatedAt: new Date()
    });

    const result = await requestContractService.findKnownLeadContact({
      companyId: 'cmp_1',
      botId: 'bot_1',
      telegramUserId: '1001'
    });

    expect(mockPrisma.lead.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'cmp_1',
        botId: 'bot_1',
        phone: { not: null },
        OR: expect.arrayContaining([
          { userTgId: '1001' },
          { payload: { path: ['telegramUserId'], equals: '1001' } },
          { payload: { path: ['telegram', 'userId'], equals: '1001' } }
        ])
      }),
      orderBy: { updatedAt: 'desc' }
    }));
    expect(result).toEqual({
      leadId: 'lead_known',
      phone: '+380635055252'
    });
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
      {
        id: 'car_1',
        title: 'BMW X5 xDrive40i',
        year: 2022,
        price: 55000,
        currency: 'USD',
        mileage: 41000,
        location: 'Львів',
        thumbnail: 'https://cdn.example/car.jpg',
        mediaUrls: ['https://cdn.example/car.jpg'],
        mediaItems: null,
        specs: { fuel: 'diesel', drive: 'awd' },
        status: 'AVAILABLE'
      }
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
      createRequest: true,
      payload: expect.objectContaining({
        selectedCars: [
          expect.objectContaining({
            id: 'car_1',
            title: 'BMW X5 xDrive40i',
            priceLabel: '$55,000',
            statusLabel: 'В наявності',
            publicUrl: '/p/app/cartie?entry=inventory&carId=car_1&preview=admin_chat'
          })
        ],
        requestSummary: expect.stringContaining('BMW X5 xDrive40i'),
        requestPresentation: expect.objectContaining({
          vehicleLines: [expect.stringContaining('BMW X5 xDrive40i')]
        })
      })
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
    expect(result.selectedCars[0]).toEqual(expect.objectContaining({
      id: 'car_1',
      title: 'BMW X5 xDrive40i',
      priceLabel: '$55,000'
    }));
  });

  it('finalizes old polluted pending MiniApp title using selected car presentation', async () => {
    mockPrisma.botSession.findUnique.mockResolvedValue({
      id: 'sess_1',
      variables: {
        miniappPendingIntent: {
          version: 1,
          intentType: 'INTEREST',
          slug: 'cartie',
          title: 'Перевірений VIN-код',
          carIds: ['car_1'],
          payload: {
            selectedCars: [
              {
                id: 'car_1',
                title: 'Tesla Model X 2017',
                priceLabel: '$25,000',
                statusLabel: 'В наявності',
                mediaUrls: []
              }
            ]
          },
          tracking: { submitId: 'submit_polluted_legacy' },
          createdAt: new Date().toISOString()
        }
      }
    });
    mockPrisma.carListing.findMany.mockResolvedValue([]);

    await requestContractService.finalizePendingLeadIntent({
      botId: 'bot_1',
      companyId: 'cmp_1',
      telegramUserId: '1001',
      phone: '+380671234567',
      displayName: 'Client One',
      telegramUsername: 'client_one',
      telegramName: 'Client One'
    });

    expect(createOrMergeLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      request: 'Tesla Model X 2017',
      requestData: expect.objectContaining({
        title: 'Tesla Model X 2017'
      }),
      payload: expect.objectContaining({
        request: expect.objectContaining({
          title: 'Tesla Model X 2017'
        })
      })
    }), {});
  });

  it('returns an existing finalized MiniApp request for the same submitId instead of creating a duplicate', async () => {
    mockPrisma.botSession.findUnique.mockResolvedValue({
      id: 'sess_1',
      variables: {
        miniappPendingIntent: {
          version: 1,
          intentType: 'REQUEST',
          slug: 'cartie',
          title: 'Підбір авто',
          tracking: { submitId: 'submit_finalized' },
          createdAt: new Date().toISOString()
        }
      }
    });
    mockPrisma.b2bRequest.findFirst.mockResolvedValueOnce({
      id: 'request_existing',
      publicId: 'REQ-EXISTING',
      title: 'Підбір авто',
      payload: {
        idempotencyKey: 'miniapp-submit:cmp_1:bot_1:1001:submit_finalized',
        tracking: { submitId: 'submit_finalized' }
      },
      description: 'Existing request',
      status: 'COLLECTING_VARIANTS'
    });

    const result = await requestContractService.finalizePendingLeadIntent({
      botId: 'bot_1',
      companyId: 'cmp_1',
      telegramUserId: '1001',
      phone: '+380671234567',
      displayName: 'Client One',
      telegramUsername: 'client_one',
      telegramName: 'Client One'
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.request.publicId).toBe('REQ-EXISTING');
    expect(createOrMergeLeadMock).not.toHaveBeenCalled();
    expect(mockPrisma.b2bRequest.create).not.toHaveBeenCalled();
    expect(mockPrisma.botSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sess_1' },
      data: expect.objectContaining({
        state: 'CL_MENU',
        variables: expect.objectContaining({
          miniappPendingIntent: null
        })
      })
    }));
  });

  it('returns a recent finalized MiniApp request for the same selected cars when submitId is missing', async () => {
    mockPrisma.botSession.findUnique.mockResolvedValue({
      id: 'sess_1',
      variables: {
        miniappPendingIntent: {
          version: 1,
          intentType: 'REQUEST',
          slug: 'cartie',
          title: 'Підбір авто',
          carIds: ['car_1', 'car_2'],
          createdAt: new Date().toISOString()
        }
      }
    });
    mockPrisma.carListing.findMany.mockResolvedValue([
      { id: 'car_1', title: 'BMW X5', mediaUrls: [], mediaItems: null, specs: {}, status: 'AVAILABLE' },
      { id: 'car_2', title: 'Audi Q7', mediaUrls: [], mediaItems: null, specs: {}, status: 'AVAILABLE' }
    ]);
    mockPrisma.b2bRequest.findMany.mockResolvedValueOnce([{
      id: 'request_existing_cars',
      publicId: 'REQ-CARS',
      title: 'Підбір авто',
      type: 'BUY',
      chatId: '1001',
      botId: 'bot_1',
      payload: {
        source: 'miniapp_intent',
        request: {
          carListingIds: ['car_2', 'car_1']
        }
      },
      description: 'Existing request',
      status: 'COLLECTING_VARIANTS'
    }]);

    const result = await requestContractService.finalizePendingLeadIntent({
      botId: 'bot_1',
      companyId: 'cmp_1',
      telegramUserId: '1001',
      phone: '+380671234567',
      displayName: 'Client One',
      telegramUsername: 'client_one',
      telegramName: 'Client One'
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.request.publicId).toBe('REQ-CARS');
    expect(createOrMergeLeadMock).not.toHaveBeenCalled();
    expect(mockPrisma.b2bRequest.create).not.toHaveBeenCalled();
    expect(mockPrisma.b2bRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'cmp_1',
        botId: 'bot_1',
        chatId: '1001',
        type: 'BUY',
        createdAt: expect.objectContaining({ gte: expect.any(Date) })
      }),
      orderBy: { createdAt: 'desc' }
    }));
  });

  it('falls back to recent selected-car duplicate search when submitId has no exact match', async () => {
    mockPrisma.botSession.findUnique.mockResolvedValue({
      id: 'sess_1',
      variables: {
        miniappPendingIntent: {
          version: 1,
          intentType: 'REQUEST',
          slug: 'cartie',
          title: 'Підбір авто',
          carIds: ['car_1'],
          tracking: { submitId: 'submit_new_but_same_car' },
          createdAt: new Date().toISOString()
        }
      }
    });
    mockPrisma.carListing.findMany.mockResolvedValue([
      { id: 'car_1', title: 'BMW X5', mediaUrls: [], mediaItems: null, specs: {}, status: 'AVAILABLE' }
    ]);
    mockPrisma.b2bRequest.findFirst.mockResolvedValueOnce(null);
    mockPrisma.b2bRequest.findMany.mockResolvedValueOnce([{
      id: 'request_existing_same_car',
      publicId: 'REQ-SAME-CAR',
      title: 'Підбір авто',
      type: 'BUY',
      chatId: '1001',
      botId: 'bot_1',
      payload: {
        source: 'miniapp_intent',
        request: {
          carListingIds: ['car_1']
        }
      },
      description: 'Existing request',
      status: 'COLLECTING_VARIANTS'
    }]);

    const result = await requestContractService.finalizePendingLeadIntent({
      botId: 'bot_1',
      companyId: 'cmp_1',
      telegramUserId: '1001',
      phone: '+380671234567',
      displayName: 'Client One'
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.request.publicId).toBe('REQ-SAME-CAR');
    expect(createOrMergeLeadMock).not.toHaveBeenCalled();
    expect(mockPrisma.b2bRequest.create).not.toHaveBeenCalled();
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
