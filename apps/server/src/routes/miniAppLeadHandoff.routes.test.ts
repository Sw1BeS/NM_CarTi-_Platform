import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  miniAppServiceMock,
  requestContractServiceMock,
  telegramOutboxMock,
  verifyInitDataMock,
  parseTelegramUserMock,
  startLeadSellWizardMock,
  b2bWhitelistServiceMock,
  emitPlatformEventMock,
  metaPixelTrackEventMock,
  vehicleTaxonomyServiceMock,
  prismaMock
} = vi.hoisted(() => ({
  miniAppServiceMock: {
    getConfig: vi.fn(),
    createRequest: vi.fn(),
    getRequestStatus: vi.fn(),
    listMyRequests: vi.fn()
  },
  requestContractServiceMock: {
    createPendingLeadIntent: vi.fn(),
    findKnownLeadContact: vi.fn(),
    finalizePendingLeadIntent: vi.fn(),
    clearPendingLeadIntent: vi.fn(),
    listAdminFitQueue: vi.fn(),
    updateAdminFitQueue: vi.fn(),
    shareAdminFitQueueContacts: vi.fn()
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  verifyInitDataMock: vi.fn(),
  parseTelegramUserMock: vi.fn(),
  startLeadSellWizardMock: vi.fn(),
  b2bWhitelistServiceMock: {
    ensureAccess: vi.fn()
  },
  emitPlatformEventMock: vi.fn(),
  metaPixelTrackEventMock: vi.fn(),
  vehicleTaxonomyServiceMock: {
    getTaxonomy: vi.fn()
  },
  prismaMock: {
    botConfig: {
      findFirst: vi.fn(),
      findUnique: vi.fn()
    },
    botSession: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    globalUser: {
      findFirst: vi.fn()
    },
    membership: {
      findFirst: vi.fn()
    },
    carListing: {
      findUnique: vi.fn(),
      findMany: vi.fn()
    },
    miniAppFavorite: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn()
    },
    showcase: {
      findMany: vi.fn()
    },
    partnerUser: {
      findFirst: vi.fn()
    },
    b2bRequest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn()
    },
    requestVariant: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn()
    },
    integrationEventLog: {
      create: vi.fn()
    },
    normalizationAlias: {
      findMany: vi.fn()
    }
  }
}));

vi.mock('../services/miniapp.service.js', () => ({
  miniAppService: miniAppServiceMock
}));

vi.mock('../services/requestContract.service.js', () => ({
  requestContractService: requestContractServiceMock
}));

vi.mock('../modules/Communication/telegram/messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: telegramOutboxMock
}));

vi.mock('../services/miniAppAuth.service.js', () => ({
  verifyMiniAppInitDataForScope: verifyInitDataMock
}));

vi.mock('../modules/Communication/telegram/core/telegramAuth.js', () => ({
  parseTelegramUser: parseTelegramUserMock,
  verifyTelegramInitData: vi.fn()
}));

vi.mock('../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../modules/Communication/telegram/routing/wizards/leadSellWizard.js', () => ({
  startLeadSellWizard: startLeadSellWizardMock
}));

vi.mock('../services/b2bWhitelist.service.js', () => ({
  b2bWhitelistService: b2bWhitelistServiceMock
}));

vi.mock('../modules/Communication/telegram/core/events/eventEmitter.js', () => ({
  emitPlatformEvent: emitPlatformEventMock
}));

vi.mock('../modules/Integrations/integration.service.js', () => ({
  IntegrationService: vi.fn().mockImplementation(() => ({
    metaPixelTrackEvent: metaPixelTrackEventMock
  }))
}));

vi.mock('../services/vehicleTaxonomy.service.js', () => ({
  vehicleTaxonomyService: vehicleTaxonomyServiceMock
}));

const buildApp = async () => {
  const { default: miniAppRoutes } = await import('./miniAppRoutes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/miniapp', miniAppRoutes);
  return app;
};

describe('MiniApp Lead handoff routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    miniAppServiceMock.getConfig.mockResolvedValue({
      companyId: 'company_1',
      botId: 'bot_1',
      publicSlug: 'cartie',
      template: 'CLIENT_LEAD'
    });
    verifyInitDataMock.mockResolvedValue({ ok: true, verifiedBotId: 'bot_1', matchedBy: 'bot' });
    parseTelegramUserMock.mockReturnValue({
      id: 1001,
      username: 'client_one',
      first_name: 'Ivan',
      last_name: 'Client'
    });
    prismaMock.botConfig.findFirst.mockResolvedValue({
      id: 'bot_1',
      token: 'telegram-token',
      companyId: 'company_1',
      adminChatId: '-100999',
      config: {
        defaultShowcaseSlug: 'cartie',
        botUsername: 'Cartie_Client_Bot'
      }
    });
    prismaMock.botConfig.findUnique.mockResolvedValue({ adminChatId: '-100999' });
    prismaMock.globalUser.findFirst.mockResolvedValue({ id: 'global_user_1' });
    prismaMock.membership.findFirst.mockResolvedValue({ id: 'membership_1' });
    prismaMock.botSession.findUnique.mockResolvedValue({
      id: 'session_1',
      botId: 'bot_1',
      chatId: '1001',
      state: 'CL_MENU',
      variables: {}
    });
    prismaMock.botSession.update.mockResolvedValue({
      id: 'session_1',
      botId: 'bot_1',
      chatId: '1001',
      state: 'CL_MENU',
      variables: {
        miniappBotFlow: {
          flow: 'SELL',
          slug: 'cartie'
        }
      }
    });
    prismaMock.botSession.create.mockResolvedValue({
      id: 'session_1',
      botId: 'bot_1',
      chatId: '1001',
      state: 'CL_MENU',
      variables: {}
    });
    requestContractServiceMock.createPendingLeadIntent.mockResolvedValue({
      companyId: 'company_1',
      botId: 'bot_1',
      chatId: '1001',
      title: 'Підбір авто з Mini App',
      intentType: 'REQUEST',
      isDuplicate: false
    });
    requestContractServiceMock.findKnownLeadContact.mockResolvedValue(null);
    requestContractServiceMock.listAdminFitQueue.mockResolvedValue([]);
    requestContractServiceMock.updateAdminFitQueue.mockResolvedValue({
      id: 'variant_1',
      fitQueueStatus: 'IN_PROGRESS',
      fitClosedAt: null
    });
    requestContractServiceMock.shareAdminFitQueueContacts.mockResolvedValue({
      id: 'variant_1',
      requestId: 'request_1',
      requestPublicId: 'CD-2026-000123',
      requestStatus: 'CONTACT_SHARED',
      requesterContact: '+380671234567',
      sellerContact: '+380501112233',
      sellerCompany: 'Dealer Seller'
    });
    requestContractServiceMock.finalizePendingLeadIntent.mockResolvedValue({
      intentType: 'REQUEST',
      title: 'Підбір авто з Mini App',
      phone: '+380635055252',
      isDuplicate: false,
      lead: { id: 'lead_1' },
      request: { id: 'request_1', publicId: 'REQ-1' },
      selectedCars: [],
      requestPresentation: {
        telegramText: '🎯 Ціна / умови: Mercedes-Benz S 500\n🚗 Mercedes-Benz S 500 2021 • $78,900 • В наявності • Львів'
      }
    });
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 10 });
    prismaMock.integrationEventLog.create.mockResolvedValue({});
    startLeadSellWizardMock.mockResolvedValue(undefined);
    b2bWhitelistServiceMock.ensureAccess.mockResolvedValue({
      allowed: false,
      accessRequest: {
        id: 'access_request_1',
        status: 'NEW'
      }
    });
    emitPlatformEventMock.mockResolvedValue(undefined);
    metaPixelTrackEventMock.mockResolvedValue({ success: true, eventId: 'event_1' });
    miniAppServiceMock.getRequestStatus.mockResolvedValue({
      id: 'request_1',
      publicId: 'REQ-1',
      status: 'NEW',
      title: 'Підбір авто',
      createdAt: new Date('2026-05-18T10:00:00.000Z')
    });
    miniAppServiceMock.listMyRequests.mockResolvedValue([
      {
        id: 'request_1',
        publicId: 'REQ-1',
        status: 'NEW',
        title: 'Підбір авто',
        type: 'BUY',
        createdAt: new Date('2026-05-18T10:00:00.000Z')
      }
    ]);
    vehicleTaxonomyServiceMock.getTaxonomy.mockResolvedValue({
      brands: [
        { id: 'bmw', label: 'BMW', aliases: [], models: [{ id: 'x5', label: 'X5', brandId: 'bmw', aliases: [] }] }
      ],
      bodyTypes: [{ id: 'suv', label: 'SUV' }],
      fuels: [{ id: 'diesel', label: 'Дизель' }],
      transmissions: [{ id: 'automatic', label: 'Автомат' }],
      drives: [{ id: 'awd', label: 'Повний' }],
      cities: [{ id: 'kyiv', label: 'Київ' }]
    });
    vi.unstubAllEnvs();
  });

  it('returns MiniApp vehicle taxonomy for searchable request forms', async () => {
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/vehicle-taxonomy')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.brands[0]).toMatchObject({
      id: 'bmw',
      label: 'BMW',
      models: [expect.objectContaining({ id: 'x5', label: 'X5', brandId: 'bmw' })]
    });
    expect(vehicleTaxonomyServiceMock.getTaxonomy).toHaveBeenCalledWith({ companyId: null });
  });

  it('creates a pending pick intent and asks for native Telegram contact', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/lead-intents')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        kind: 'PICK',
        criteria: {
          brand: 'BMW',
          model: 'X5',
          budgetMax: 55000
        },
        tracking: {
          submitId: 'submit_1',
          eventSourceUrl: 'https://cartie.test/p/app/cartie?utm_source=meta&tgWebAppData=secret#tgWebAppData=query_id%3D1%26user%3Dsecret%26hash%3Dsecret'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      contactRequested: true,
      contactActionRequired: true,
      closeMiniApp: true,
      openBotUrl: 'https://t.me/Cartie_Client_Bot'
    });
    expect(requestContractServiceMock.createPendingLeadIntent).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'cartie',
      intentType: 'REQUEST',
      tracking: expect.objectContaining({
        submitId: 'submit_1',
        eventSourceUrl: 'https://cartie.test/p/app/cartie?utm_source=meta',
        client_ip_address: expect.any(String)
      }),
      telegram: expect.objectContaining({
        userId: '1001',
        username: 'client_one',
        name: 'Ivan Client'
      }),
      payload: expect.objectContaining({
        kind: 'PICK',
        criteria: expect.objectContaining({ brand: 'BMW' })
      })
    }));
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      botId: 'bot_1',
      token: 'telegram-token',
      chatId: '1001',
      replyMarkup: expect.objectContaining({
        keyboard: [[expect.objectContaining({ request_contact: true })], [expect.any(Object)]],
        resize_keyboard: true,
        one_time_keyboard: true
      })
    }));
  });

  it('keeps the pending lead intent saved when Telegram contact keyboard send fails', async () => {
    telegramOutboxMock.sendMessage.mockRejectedValueOnce(new Error('Bad Request: chat not found'));
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/lead-intents')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        kind: 'PICK',
        criteria: {
          brand: 'BMW',
          model: 'X5',
          city: 'Львів'
        },
        tracking: { submitId: 'submit_contact_send_failed' }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      contactRequested: false,
      contactRequestFailed: true,
      closeMiniApp: false,
      openBotUrl: 'https://t.me/Cartie_Client_Bot'
    });
    expect(requestContractServiceMock.createPendingLeadIntent).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'cartie',
      intentType: 'REQUEST',
      tracking: expect.objectContaining({
        submitId: 'submit_contact_send_failed',
        client_ip_address: expect.any(String)
      })
    }));
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      botId: 'bot_1',
      chatId: '1001',
      replyMarkup: expect.objectContaining({
        keyboard: [[expect.objectContaining({ request_contact: true })], [expect.any(Object)]]
      })
    }));
  });

  it('does not send contact request when the same Telegram user already has a phone', async () => {
    parseTelegramUserMock.mockReturnValueOnce({
      id: 219480233,
      username: 'known_client',
      first_name: 'Known',
      last_name: 'Client'
    });
    requestContractServiceMock.findKnownLeadContact.mockResolvedValueOnce({
      phone: '+380635055252',
      leadId: 'lead_existing'
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/lead-intents')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        kind: 'PRICE_TERMS',
        carListingId: 'car_1',
        tracking: { submitId: 'submit_known_phone_219480233' }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      contactRequested: false,
      contactKnown: true,
      finalized: true,
      closeMiniApp: true
    });
    expect(requestContractServiceMock.findKnownLeadContact).toHaveBeenCalledWith({
      companyId: 'company_1',
      botId: 'bot_1',
      telegramUserId: '219480233'
    });
    expect(requestContractServiceMock.finalizePendingLeadIntent).toHaveBeenCalledWith(expect.objectContaining({
      botId: 'bot_1',
      companyId: 'company_1',
      telegramUserId: '219480233',
      phone: '+380635055252'
    }));
    expect(telegramOutboxMock.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      replyMarkup: expect.objectContaining({
        keyboard: expect.arrayContaining([
          expect.arrayContaining([expect.objectContaining({ request_contact: true })])
        ])
      })
    }));
  });

  it('sends an actionable admin notification with readable vehicle context for known-contact MiniApp leads', async () => {
    requestContractServiceMock.findKnownLeadContact.mockResolvedValueOnce({
      phone: '+380635055252',
      leadId: 'lead_existing'
    });
    requestContractServiceMock.finalizePendingLeadIntent.mockResolvedValueOnce({
      intentType: 'INTEREST',
      title: 'Mercedes-Benz S 500',
      phone: '+380635055252',
      isDuplicate: false,
      lead: { id: 'lead_1' },
      request: { id: 'request_1', publicId: 'REQ-1' },
      selectedCars: [],
      requestPresentation: {
        telegramText: '🎯 Ціна / умови: Mercedes-Benz S 500\n🚗 Mercedes-Benz S 500 2021 • $78,900 • 45 000 км • В наявності • Львів',
        selectedCars: [
          {
            id: 'car_1',
            title: 'Mercedes-Benz S 500',
            publicUrl: '/p/app/cartie?entry=inventory&carId=car_1'
          }
        ]
      }
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/lead-intents')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        kind: 'PRICE_TERMS',
        carListingId: 'car_1',
        tracking: { submitId: 'submit_admin_actions' }
      });

    expect(res.status).toBe(200);
    const adminMessage = telegramOutboxMock.sendMessage.mock.calls
      .map(([arg]) => arg)
      .find((arg) => arg.chatId === '-100999');

    expect(adminMessage).toEqual(expect.objectContaining({
      text: expect.stringContaining('Mercedes-Benz S 500')
    }));
    expect(adminMessage.text).toContain('Request ID: REQ-1');
    expect(adminMessage.replyMarkup).toEqual(expect.objectContaining({
      inline_keyboard: expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('CRM'), url: expect.stringContaining('/requests') })
        ]),
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining('авто'),
            url: 'https://cartie2.umanoff-analytics.space/p/app/cartie?entry=inventory&carId=car_1'
          })
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
  });

  it('does not send another native contact request for a duplicate pending submit', async () => {
    requestContractServiceMock.createPendingLeadIntent.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_1',
      chatId: '1001',
      title: 'Existing request',
      intentType: 'REQUEST',
      isDuplicate: true
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/lead-intents')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        kind: 'PICK',
        tracking: { submitId: 'submit_duplicate' }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      duplicate: true,
      contactRequested: false,
      closeMiniApp: true
    });
    expect(telegramOutboxMock.sendMessage).not.toHaveBeenCalled();
  });

  it('does not finalize or notify again for duplicate pending submit even when contact is known', async () => {
    requestContractServiceMock.createPendingLeadIntent.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_1',
      chatId: '1001',
      title: 'Existing request',
      intentType: 'REQUEST',
      isDuplicate: true
    });
    requestContractServiceMock.findKnownLeadContact.mockResolvedValueOnce({
      phone: '+380635055252',
      leadId: 'lead_existing'
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/lead-intents')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        kind: 'PICK',
        tracking: { submitId: 'submit_duplicate_known_contact' }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      duplicate: true,
      contactRequested: false,
      closeMiniApp: true
    });
    expect(requestContractServiceMock.findKnownLeadContact).not.toHaveBeenCalled();
    expect(requestContractServiceMock.finalizePendingLeadIntent).not.toHaveBeenCalled();
    expect(telegramOutboxMock.sendMessage).not.toHaveBeenCalled();
  });

  it('returns a stable auth code when initData is missing', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/lead-intents')
      .send({ slug: 'cartie', kind: 'PICK' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'TELEGRAM_INITDATA_REQUIRED'
    });
    expect(requestContractServiceMock.createPendingLeadIntent).not.toHaveBeenCalled();
  });

  it('rejects Lead intent submission for B2B MiniApp config', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_1',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B'
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/lead-intents')
      .send({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data',
        kind: 'PICK'
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'BOT_FLOW_UNAVAILABLE'
    });
    expect(requestContractServiceMock.createPendingLeadIntent).not.toHaveBeenCalled();
    expect(telegramOutboxMock.sendMessage).not.toHaveBeenCalled();
  });

  it('resolves contact handoff bot inside the MiniApp company scope', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/lead-intents')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        kind: 'PICK',
        tracking: { submitId: 'submit_scope' }
      });

    expect(res.status).toBe(200);
    expect(prismaMock.botConfig.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'bot_1',
        companyId: 'company_1',
        isEnabled: true
      })
    }));
  });

  it('starts the LeadBot sell wizard from bot-flows without creating a MiniApp request', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/bot-flows')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        flow: 'SELL'
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      flow: 'SELL',
      closeMiniApp: true
    });
    expect(startLeadSellWizardMock).toHaveBeenCalledWith(expect.objectContaining({
      bot: expect.objectContaining({ id: 'bot_1' }),
      session: expect.objectContaining({ id: 'session_1' }),
      chatId: '1001',
      userId: '1001',
      chatType: 'private'
    }));
    expect(requestContractServiceMock.createPendingLeadIntent).not.toHaveBeenCalled();
    expect(miniAppServiceMock.createRequest).not.toHaveBeenCalled();
  });

  it('rejects Lead-only bot-flows for B2B MiniApp configs', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/bot-flows')
      .send({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data',
        flow: 'SELL'
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'BOT_FLOW_UNAVAILABLE'
    });
    expect(startLeadSellWizardMock).not.toHaveBeenCalled();
    expect(verifyInitDataMock).not.toHaveBeenCalled();
  });

  it('rejects legacy MiniApp request writes for Lead configs', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/requests')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        requestType: 'BUY',
        tracking: { submitId: 'legacy_lead_submit' }
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'LEAD_WRONG_ENDPOINT'
    });
    expect(miniAppServiceMock.createRequest).not.toHaveBeenCalled();
  });

  it('rejects Lead request writes before initData validation on the legacy endpoint', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/requests')
      .send({
        slug: 'cartie',
        requestType: 'BUY'
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'LEAD_WRONG_ENDPOINT'
    });
    expect(verifyInitDataMock).not.toHaveBeenCalled();
    expect(miniAppServiceMock.createRequest).not.toHaveBeenCalled();
  });

  it('uses verified initData Telegram identity for B2B request writes', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    prismaMock.partnerUser.findFirst.mockResolvedValueOnce({
      partnerId: 'partner_1',
      role: 'OWNER',
      partner: {
        id: 'partner_1',
        name: 'Dealer One',
        partnerCode: 'D1',
        showcaseSlug: 'dealer-one'
      }
    });
    miniAppServiceMock.createRequest.mockResolvedValueOnce({
      id: 'request_1',
      publicId: 'CD-2026-000001',
      requesterPartnerId: 'partner_1'
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/requests')
      .send({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data',
        requestType: 'BUY',
        telegram: {
          userId: 'spoofed_user',
          username: 'spoofed'
        },
        tracking: { submitId: 'b2b_submit_1' }
      });

    expect(res.status).toBe(200);
    expect(miniAppServiceMock.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      telegram: {
        userId: '1001',
        username: 'client_one',
        name: 'Ivan Client'
      }
    }));
  });

  it('returns structured not-approved error for B2B request writes before creating request', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    prismaMock.partnerUser.findFirst.mockResolvedValueOnce(null);
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/requests')
      .send({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data',
        requestType: 'BUY',
        tracking: { submitId: 'b2b_submit_1' }
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'B2B_PARTNER_NOT_APPROVED',
      details: { reason: 'PARTNER_NOT_APPROVED' }
    });
    expect(miniAppServiceMock.createRequest).not.toHaveBeenCalled();
  });

  it('creates B2B SELL/add-car requests through MiniApp request path without starting Lead sell flow', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    prismaMock.partnerUser.findFirst.mockResolvedValueOnce({
      partnerId: 'partner_1',
      role: 'OWNER',
      partner: {
        id: 'partner_1',
        name: 'Dealer One',
        partnerCode: 'D1',
        showcaseSlug: 'dealer-one'
      }
    });
    miniAppServiceMock.createRequest.mockResolvedValueOnce({
      id: 'request_sell_1',
      publicId: 'CD-2026-000002',
      requesterPartnerId: 'partner_1',
      type: 'SELL'
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/requests')
      .send({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data',
        requestType: 'SELL',
        payload: {
          mode: 'B2B',
          criteria: {
            brand: 'BMW',
            model: 'X5',
            yearFrom: '2021'
          }
        },
        tracking: { submitId: 'b2b_sell_submit_1' }
      });

    expect(res.status).toBe(200);
    expect(miniAppServiceMock.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      requestType: 'SELL',
      telegram: {
        userId: '1001',
        username: 'client_one',
        name: 'Ivan Client'
      },
      payload: expect.objectContaining({
        mode: 'B2B',
        criteria: expect.objectContaining({
          brand: 'BMW',
          model: 'X5'
        })
      })
    }));
    expect(startLeadSellWizardMock).not.toHaveBeenCalled();
    expect(requestContractServiceMock.createPendingLeadIntent).not.toHaveBeenCalled();
  });

  it('returns pending B2B partner portal state without querying partner-owned data', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    prismaMock.partnerUser.findFirst.mockResolvedValueOnce(null);
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/b2b/me')
      .set('X-Telegram-Init-Data', 'signed-init-data')
      .query({
        slug: 'cardealer_lviv_bot',
        telegramUserId: 'spoofed_user'
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      approved: false,
      reason: 'PARTNER_NOT_APPROVED',
      user: {
        telegramUserId: '1001',
        username: 'client_one',
        name: 'Ivan Client'
      }
    });
    expect(prismaMock.partnerUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: 'company_1', telegramId: '1001' }
    }));
    expect(prismaMock.b2bRequest.findMany).not.toHaveBeenCalled();
    expect(prismaMock.requestVariant.findMany).not.toHaveBeenCalled();
    expect(prismaMock.b2bRequest.count).not.toHaveBeenCalled();
    expect(prismaMock.requestVariant.count).not.toHaveBeenCalled();
  });

  it('creates a B2B access request from pending MiniApp state and notifies admin chat', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    prismaMock.botConfig.findFirst.mockResolvedValueOnce({
      id: 'bot_b2b',
      token: 'telegram-token',
      companyId: 'company_1',
      adminChatId: '-100999',
      config: {
        botUsername: 'CarDealer_Lviv_Bot'
      }
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/b2b/access/request')
      .send({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data'
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      approved: false,
      accessRequest: {
        id: 'access_request_1',
        status: 'NEW'
      }
    });
    expect(b2bWhitelistServiceMock.ensureAccess).toHaveBeenCalledWith({
      tgUserId: '1001',
      username: 'client_one',
      fullName: 'Ivan Client'
    }, {
      companyId: 'company_1',
      botId: 'bot_b2b'
    }, expect.stringContaining('source=miniapp'));
    const adminMessage = telegramOutboxMock.sendMessage.mock.calls
      .map((call: any[]) => call[0])
      .find((payload: any) => payload.chatId === '-100999');
    expect(adminMessage).toEqual(expect.objectContaining({
      botId: 'bot_b2b',
      chatId: '-100999',
      text: expect.stringContaining('[B2B ACCESS]')
    }));
    expect(adminMessage.text).toContain('access_request_1');
    expect(adminMessage.replyMarkup.inline_keyboard[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining('Підтвердити'), callback_data: expect.stringMatching(/^v1:ba_ap:/) }),
      expect.objectContaining({ text: expect.stringContaining('Відхилити'), callback_data: expect.stringMatching(/^v1:ba_rj:/) })
    ]));
  });

  it('returns approved B2B partner summary and counts using verified Telegram identity', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    prismaMock.partnerUser.findFirst.mockResolvedValueOnce({
      partnerId: 'partner_1',
      role: 'OWNER',
      partner: {
        id: 'partner_1',
        name: 'Dealer One',
        partnerCode: 'D1',
        showcaseSlug: 'dealer-one'
      }
    });
    prismaMock.b2bRequest.count.mockResolvedValueOnce(2);
    prismaMock.requestVariant.count.mockResolvedValueOnce(5);
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/b2b/me')
      .set('X-Telegram-Init-Data', 'signed-init-data')
      .query({
        slug: 'cardealer_lviv_bot',
        telegramUserId: 'spoofed_user'
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      approved: true,
      user: {
        telegramUserId: '1001',
        username: 'client_one',
        name: 'Ivan Client'
      },
      partner: {
        id: 'partner_1',
        name: 'Dealer One',
        code: 'D1',
        showcaseSlug: 'dealer-one',
        role: 'OWNER'
      },
      stats: {
        ownRequests: 2,
        receivedVariants: 5
      }
    });
    expect(prismaMock.partnerUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: 'company_1', telegramId: '1001' }
    }));
    expect(prismaMock.b2bRequest.findMany).not.toHaveBeenCalled();
    expect(prismaMock.requestVariant.count).toHaveBeenCalledWith({
      where: {
        request: {
          companyId: 'company_1',
          requesterPartnerId: 'partner_1'
        }
      }
    });
  });

  it('rejects own B2B requests for non-B2B MiniApp config before partner data lookup', async () => {
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/b2b/requests/my')
      .query({
        slug: 'cartie',
        initData: 'signed-init-data'
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'B2B_PORTAL_UNAVAILABLE'
    });
    expect(verifyInitDataMock).not.toHaveBeenCalled();
    expect(prismaMock.partnerUser.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.b2bRequest.findMany).not.toHaveBeenCalled();
  });

  it('rejects received B2B variants for non-B2B MiniApp config before partner data lookup', async () => {
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/b2b/variants/received')
      .query({
        slug: 'cartie',
        initData: 'signed-init-data'
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'B2B_PORTAL_UNAVAILABLE'
    });
    expect(verifyInitDataMock).not.toHaveBeenCalled();
    expect(prismaMock.partnerUser.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.requestVariant.findMany).not.toHaveBeenCalled();
  });

  it('rejects B2B variant decisions for non-B2B MiniApp config before partner data lookup', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/b2b/variants/variant_1/decision')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        decision: 'FIT'
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'B2B_PORTAL_UNAVAILABLE'
    });
    expect(verifyInitDataMock).not.toHaveBeenCalled();
    expect(prismaMock.partnerUser.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.requestVariant.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.requestVariant.update).not.toHaveBeenCalled();
  });

  it('rejects B2B admin fit queue reads for non-B2B MiniApp config before admin lookup', async () => {
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/b2b/admin/fit-queue')
      .query({
        slug: 'cartie',
        initData: 'signed-init-data'
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'B2B_PORTAL_UNAVAILABLE'
    });
    expect(verifyInitDataMock).not.toHaveBeenCalled();
    expect(prismaMock.globalUser.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.membership.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.requestVariant.findMany).not.toHaveBeenCalled();
  });

  it('rejects B2B admin fit queue updates for non-B2B MiniApp config before admin lookup', async () => {
    const app = await buildApp();

    const res = await request(app)
      .patch('/api/miniapp/b2b/admin/fit-queue/variant_1')
      .send({
        slug: 'cartie',
        initData: 'signed-init-data',
        fitQueueStatus: 'CONTACTED'
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'B2B_PORTAL_UNAVAILABLE'
    });
    expect(verifyInitDataMock).not.toHaveBeenCalled();
    expect(prismaMock.globalUser.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.membership.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.requestVariant.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.requestVariant.update).not.toHaveBeenCalled();
  });

  it('returns MiniApp B2B admin fit queue without raw contacts', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    requestContractServiceMock.listAdminFitQueue.mockResolvedValueOnce([{
      id: 'variant_1',
      requestId: 'request_1',
      requestPublicId: 'CD-2026-000123',
      requestStatus: 'SHORTLIST',
      fitQueueStatus: 'NEW',
      sellerCompany: 'Dealer Seller',
      title: 'Hyundai IONIQ 5 2024',
      contactAvailable: true,
      requesterContactAvailable: true,
      sellerContactAvailable: true
    }]);
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/b2b/admin/fit-queue')
      .query({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data',
        status: 'new'
      });

    expect(res.status).toBe(200);
    expect(requestContractServiceMock.listAdminFitQueue).toHaveBeenCalledWith({
      companyId: 'company_1',
      status: 'NEW'
    });
    expect(res.body.items[0]).toMatchObject({
      id: 'variant_1',
      requestPublicId: 'CD-2026-000123',
      contactAvailable: true,
      requesterContactAvailable: true,
      sellerContactAvailable: true
    });
    expect(res.body.items[0]).not.toHaveProperty('contact');
    expect(JSON.stringify(res.body.items[0])).not.toContain('+380');
  });

  it('rejects unsupported MiniApp B2B admin fit queue status values', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    requestContractServiceMock.updateAdminFitQueue.mockRejectedValueOnce(new Error('Invalid fitQueueStatus'));
    const app = await buildApp();

    const res = await request(app)
      .patch('/api/miniapp/b2b/admin/fit-queue/variant_1')
      .send({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data',
        fitQueueStatus: 'CONTACTED'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid fitQueueStatus');
    expect(prismaMock.requestVariant.update).not.toHaveBeenCalled();
  });

  it('reveals MiniApp B2B fit queue contacts only through an explicit admin action', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/b2b/admin/fit-queue/variant_1/contact-share')
      .send({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data'
      });

    expect(res.status).toBe(200);
    expect(requestContractServiceMock.shareAdminFitQueueContacts).toHaveBeenCalledWith({
      companyId: 'company_1',
      variantId: 'variant_1'
    });
    expect(res.body.reveal).toMatchObject({
      requestPublicId: 'CD-2026-000123',
      requestStatus: 'CONTACT_SHARED',
      requesterContact: '+380671234567',
      sellerContact: '+380501112233'
    });
  });

  it('returns structured not-approved error for B2B own requests', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    prismaMock.partnerUser.findFirst.mockResolvedValueOnce(null);
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/b2b/requests/my')
      .query({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data'
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'B2B_PARTNER_NOT_APPROVED',
      details: { reason: 'PARTNER_NOT_APPROVED' }
    });
    expect(prismaMock.b2bRequest.findMany).not.toHaveBeenCalled();
  });

  it('lists active B2B network requests without exposing requester contacts', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    prismaMock.partnerUser.findFirst.mockResolvedValueOnce({
      partnerId: 'seller_partner_1',
      role: 'MANAGER',
      partner: {
        id: 'seller_partner_1',
        name: 'Dealer Seller',
        partnerCode: 'DS1',
        showcaseSlug: 'dealer-seller'
      }
    });
    prismaMock.b2bRequest.findMany.mockResolvedValueOnce([{
      id: 'request_1',
      publicId: 'CD-2026-000123',
      companyId: 'company_1',
      requesterPartnerId: 'requester_partner_1',
      title: 'Hyundai IONIQ 5 до 20000$',
      description: 'Потрібен IONIQ 5, contact +380671234567, requester@example.com',
      status: 'COLLECTING_VARIANTS',
      budgetMin: 12000,
      budgetMax: 20000,
      yearMin: 2022,
      yearMax: 2024,
      city: 'Lviv',
      payload: {
        phone: '+380671234567',
        request: {
          brand: 'Hyundai',
          model: 'IONIQ 5',
          email: 'requester@example.com',
          comment: 'Без контактів у network list'
        }
      },
      _count: { variants: 2 },
      createdAt: new Date('2026-05-18T10:00:00.000Z')
    }]);
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/b2b/requests/active')
      .set('X-Telegram-Init-Data', 'signed-init-data')
      .query({
        slug: 'cardealer_lviv_bot'
      });

    expect(res.status).toBe(200);
    expect(prismaMock.b2bRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'company_1',
        status: { in: ['PUBLISHED', 'COLLECTING_VARIANTS'] },
        requesterPartnerId: { not: null },
        NOT: { requesterPartnerId: 'seller_partner_1' }
      })
    }));
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: 'request_1',
      publicId: 'CD-2026-000123',
      title: 'Hyundai IONIQ 5 до 20000$',
      status: 'COLLECTING_VARIANTS',
      variantsCount: 2,
      budgetMax: 20000,
      yearMin: 2022,
      yearMax: 2024,
      city: 'Lviv',
      criteria: {
        request: {
          brand: 'Hyundai',
          model: 'IONIQ 5',
          comment: 'Без контактів у network list'
        }
      }
    });
    const serialized = JSON.stringify(res.body.items[0]);
    expect(serialized).not.toContain('+380671234567');
    expect(serialized).not.toContain('requester@example.com');
    expect(res.body.items[0]).not.toHaveProperty('contact');
  });

  it('does not expose contacts in approved B2B received variants', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    prismaMock.partnerUser.findFirst.mockResolvedValueOnce({
      partnerId: 'partner_1',
      role: 'AGENT',
      partner: {
        id: 'partner_1',
        name: 'Dealer One',
        partnerCode: 'D1',
        showcaseSlug: 'dealer-one'
      }
    });
    prismaMock.b2bRequest.findMany.mockResolvedValueOnce([{ id: 'request_1' }]);
    prismaMock.requestVariant.findMany.mockResolvedValueOnce([{
      id: 'variant_1',
      requestId: 'request_1',
      request: { publicId: 'REQ-1' },
      status: 'NEW',
      requesterDecision: null,
      title: 'BMW X5',
      price: 55000,
      year: 2022,
      mileage: 12000,
      location: 'Lviv',
      thumbnail: 'https://example.com/x5.jpg',
      mediaUrls: [
        'https://example.com/x5.jpg',
        'tg://resolve?domain=dealer_one',
        'https://wa.me/380501112233',
        'mailto:dealer@example.com',
        'tel:+380501112233',
        'https://cdn.example.com/redirect?to=https%3A%2F%2Ft.me%2Fdealer_one',
        'https://cdn.example.com/img.jpg?phone=%2B380501112233'
      ],
      specs: {
        brand: 'BMW',
        color: 'black',
        ownerContact: '+380501112233',
        phone: '+380501112233',
        email: 'dealer@example.com',
        nested: {
          safeNote: 'service history ok',
          whatsapp: 'https://wa.me/380501112233',
          contactPerson: {
            name: 'Dealer',
            phone: '+380501112233'
          },
          items: [
            { label: 'battery', value: '77 kWh' },
            { telegram: '@dealer_one', value: 'hidden contact' }
          ]
        }
      },
      contact: '+380501112233',
      createdAt: new Date('2026-05-18T10:00:00.000Z')
    }]);
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/b2b/variants/received')
      .query({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data'
      });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).not.toHaveProperty('contact');
    expect(res.body.items[0].mediaUrls).toEqual(['https://example.com/x5.jpg']);
    expect(res.body.items[0].specs).toEqual({
      brand: 'BMW',
      color: 'black',
      nested: {
        safeNote: 'service history ok',
        items: [
          { label: 'battery', value: '77 kWh' },
          { value: 'hidden contact' }
        ]
      }
    });
  });

  it('lets an approved B2B partner submit an offer without exposing contacts in the response', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    prismaMock.partnerUser.findFirst.mockResolvedValueOnce({
      partnerId: 'seller_partner_1',
      role: 'MANAGER',
      partner: {
        id: 'seller_partner_1',
        name: 'Dealer Seller',
        partnerCode: 'DS1',
        showcaseSlug: 'dealer-seller'
      }
    });
    prismaMock.b2bRequest.findFirst.mockResolvedValueOnce({
      id: 'request_1',
      publicId: 'CD-2026-000123',
      companyId: 'company_1',
      requesterPartnerId: 'requester_partner_1',
      title: 'Hyundai IONIQ 5 до 20000$'
    });
    prismaMock.requestVariant.findFirst.mockResolvedValueOnce(null);
    prismaMock.requestVariant.create.mockResolvedValueOnce({
      id: 'variant_1',
      requestId: 'request_1',
      request: { publicId: 'CD-2026-000123' },
      status: 'SUBMITTED',
      requesterDecision: 'PENDING',
      title: 'Hyundai IONIQ 5 2024',
      price: 16000,
      currency: 'USD',
      year: 2024,
      mileage: 17000,
      location: 'Lviv',
      thumbnail: 'https://cdn.example.com/ioniq.jpg',
      mediaUrls: ['https://cdn.example.com/ioniq.jpg'],
      specs: {
        condition: 'front damage',
        comment: 'Ready for inspection',
        phone: '+380501112233',
        source: 'miniapp_b2b_offer',
        submitId: 'submit_1'
      },
      contact: '+380501112233',
      companyName: 'Dealer Seller',
      sellerPartnerId: 'seller_partner_1',
      createdAt: new Date('2026-05-18T11:00:00.000Z')
    });
    prismaMock.botConfig.findFirst.mockResolvedValueOnce({
      id: 'bot_b2b',
      token: 'telegram-token',
      companyId: 'company_1',
      adminChatId: '-100999',
      config: {
        botUsername: 'CarDealer_Lviv_Bot'
      }
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/b2b/requests/CD-2026-000123/variants')
      .send({
        slug: 'cardealer_lviv_bot',
        initData: 'signed-init-data',
        title: 'Hyundai IONIQ 5 2024',
        price: 16000,
        currency: 'USD',
        year: 2024,
        mileage: 17000,
        location: 'Lviv',
        condition: 'front damage',
        comment: 'Ready for inspection',
        contact: '+380501112233',
        submitId: 'submit_1',
        mediaUrls: [
          'https://cdn.example.com/ioniq.jpg',
          'https://wa.me/380501112233'
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      duplicate: false,
      variant: {
        id: 'variant_1',
        requestId: 'request_1',
        requestPublicId: 'CD-2026-000123',
        title: 'Hyundai IONIQ 5 2024',
        status: 'SUBMITTED',
        price: 16000,
        year: 2024,
        mileage: 17000,
        location: 'Lviv',
        mediaUrls: ['https://cdn.example.com/ioniq.jpg'],
        specs: {
          condition: 'front damage',
          comment: 'Ready for inspection',
          source: 'miniapp_b2b_offer',
          submitId: 'submit_1'
        }
      }
    });
    expect(res.body.variant).not.toHaveProperty('contact');
    expect(res.body.variant.specs).not.toHaveProperty('phone');
    expect(prismaMock.b2bRequest.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 'company_1',
        OR: [{ id: 'CD-2026-000123' }, { publicId: 'CD-2026-000123' }]
      }
    });
    expect(prismaMock.requestVariant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: 'request_1',
        sellerPartnerId: 'seller_partner_1',
        companyName: 'Dealer Seller',
        contact: '+380501112233',
        source: 'MINIAPP_B2B_OFFER',
        status: 'SUBMITTED',
        thumbnail: 'https://cdn.example.com/ioniq.jpg',
        mediaUrls: ['https://cdn.example.com/ioniq.jpg'],
        specs: expect.objectContaining({
          source: 'miniapp_b2b_offer',
          submitId: 'submit_1',
          condition: 'front damage',
          comment: 'Ready for inspection',
          telegramUserId: '1001'
        })
      })
    });
    expect(emitPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company_1',
      botId: 'bot_b2b',
      eventType: 'miniapp.b2b.offer.created',
      userId: '1001',
      payload: expect.objectContaining({
        requestId: 'request_1',
        requestPublicId: 'CD-2026-000123',
        variantId: 'variant_1',
        sellerPartnerId: 'seller_partner_1'
      })
    }));
    const adminMessage = telegramOutboxMock.sendMessage.mock.calls
      .map((call: any[]) => call[0])
      .find((payload: any) => payload.chatId === '-100999');
    expect(adminMessage).toEqual(expect.objectContaining({
      botId: 'bot_b2b',
      chatId: '-100999',
      text: expect.stringContaining('[B2B OFFER]')
    }));
    expect(adminMessage.text).toContain('Request ID: CD-2026-000123');
    expect(adminMessage.text).toContain('Джерело: MiniApp B2B');
    expect(adminMessage.text).toContain('Партнер: Dealer Seller');
    expect(adminMessage.text).toContain('+380501112233');
    expect(adminMessage.replyMarkup).toEqual(expect.objectContaining({
      inline_keyboard: expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('Підтвердити'), callback_data: expect.stringMatching(/^v1:aa:/) }),
          expect.objectContaining({ text: expect.stringContaining('Відхилити'), callback_data: expect.stringMatching(/^v1:aa:/) })
        ]),
        expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('Надіслати'), callback_data: expect.stringMatching(/^v1:aa:/) }),
          expect.objectContaining({ text: expect.stringContaining('Деталі'), callback_data: expect.stringMatching(/^v1:aa:/) })
        ])
      ])
    }));
    const callbacks = adminMessage.replyMarkup.inline_keyboard
      .flat()
      .map((button: any) => button.callback_data)
      .filter(Boolean);
    expect(callbacks.every((value: string) => Buffer.byteLength(value, 'utf8') <= 64)).toBe(true);
    expect(callbacks.some((value: string) => value.includes('variant_1'))).toBe(false);
  });

  it('dispatches Meta CAPI for enabled MiniApp lead events with stable event id', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'true');
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/events')
      .set('x-forwarded-for', '203.0.113.10, 10.0.0.1')
      .set('user-agent', 'Cartie MiniApp Test')
      .send({
        slug: 'cartie',
        eventType: 'LeadSubmit',
        initData: 'signed-init-data',
        tgUserId: 'spoofed_user',
        carListingId: 'car_1',
        tracking: {
          submitId: 'lead_submit_1',
          eventId: 'meta_event_1',
          fbp: 'fb.1.123',
          fbc: 'fb.1.456',
          eventSourceUrl: 'https://cartie.test/p/app/cartie'
        },
        payload: {
          budgetMax: 55000,
          city: 'Львів',
          phone: '+380635055252',
          phone_raw: '+380635055253',
          full_name: 'Ivan Raw Client',
          telegram_user: { id: 1001, username: 'raw_user' },
          access_token: 'raw-access-token',
          nested: {
            email: 'client@example.com',
            initData: 'raw-init-data',
            telegram_init_data: 'raw-telegram-init-data'
          }
        }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      eventId: 'meta_event_1',
      meta: { enabled: true, eventName: 'Lead' }
    });
    expect(emitPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'miniapp.LeadSubmit',
      userId: '1001'
    }));
    expect(metaPixelTrackEventMock).toHaveBeenCalledWith('company_1', 'Lead', expect.objectContaining({
      eventId: 'meta_event_1',
      externalId: 'telegram:1001',
      fbp: 'fb.1.123',
      fbc: 'fb.1.456',
      eventSourceUrl: 'https://cartie.test/p/app/cartie',
      ip: '203.0.113.10',
      userAgent: 'Cartie MiniApp Test',
      contentIds: ['car_1'],
      customData: expect.objectContaining({
        source: 'miniapp',
        slug: 'cartie',
        miniapp_event: 'LeadSubmit',
        city: 'Львів',
        budgetMax: 55000
      })
    }));
    const platformPayload = emitPlatformEventMock.mock.calls[0][0].payload;
    const metaInput = metaPixelTrackEventMock.mock.calls[0][2];
    expect(JSON.stringify(platformPayload)).not.toContain('+380635055252');
    expect(JSON.stringify(platformPayload)).not.toContain('+380635055253');
    expect(JSON.stringify(platformPayload)).not.toContain('Ivan Raw Client');
    expect(JSON.stringify(platformPayload)).not.toContain('raw_user');
    expect(JSON.stringify(platformPayload)).not.toContain('raw-access-token');
    expect(JSON.stringify(platformPayload)).not.toContain('client@example.com');
    expect(JSON.stringify(platformPayload)).not.toContain('raw-init-data');
    expect(JSON.stringify(platformPayload)).not.toContain('raw-telegram-init-data');
    expect(JSON.stringify(metaInput.customData)).not.toContain('+380635055253');
    expect(JSON.stringify(metaInput.customData)).not.toContain('Ivan Raw Client');
    expect(JSON.stringify(metaInput.customData)).not.toContain('raw_user');
    expect(JSON.stringify(metaInput.customData)).not.toContain('raw-access-token');
  });

  it('stores MiniApp tracking event_id and tracking metadata when Meta CAPI is disabled', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/events')
      .send({
        slug: 'cartie',
        eventType: 'MiniAppOpen',
        initData: 'signed-init-data',
        tracking: {
          routeSource: 'telegram_menu',
          meta: {
            eventId: 'mini_open_1',
            fbclid: 'fbclid_1',
            fbp: 'fb.1.123',
            fbc: 'fb.1.456'
          },
          utm: {
            source: 'facebook',
            campaign: 'launch'
          }
        },
        payload: {
          screen: 'catalog'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      eventId: 'mini_open_1',
      meta: { enabled: false, eventName: 'PageView' }
    });
    expect(metaPixelTrackEventMock).not.toHaveBeenCalled();
    expect(emitPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'miniapp.MiniAppOpen',
      userId: '1001',
      payload: expect.objectContaining({
        eventId: 'mini_open_1',
        source: 'miniapp',
        tracking: expect.objectContaining({
          routeSource: 'telegram_menu',
          utm: {
            source: 'facebook',
            campaign: 'launch'
          }
        })
      })
    }));
  });

  it('maps B2B MiniApp tracking events to server-side Meta CAPI behind the feature flag', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'true');
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/events')
      .send({
        slug: 'cardealer_lviv_bot',
        eventType: 'B2BOfferSubmit',
        initData: 'signed-init-data',
        tracking: {
          meta: { eventId: 'b2b_offer_1' }
        },
        payload: {
          requestId: 'request_1',
          price: 55000
        }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      eventId: 'b2b_offer_1',
      meta: { enabled: true, eventName: 'SubmitApplication' }
    });
    expect(metaPixelTrackEventMock).toHaveBeenCalledWith('company_1', 'SubmitApplication', expect.objectContaining({
      eventId: 'b2b_offer_1',
      externalId: 'telegram:1001',
      customData: expect.objectContaining({
        source: 'miniapp',
        slug: 'cardealer_lviv_bot',
        miniapp_event: 'B2BOfferSubmit',
        requestId: 'request_1',
        price: 55000
      })
    }));
  });

  it('rejects MiniApp request status reads without initData instead of trusting query identity', async () => {
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/requests/status')
      .query({
        slug: 'cartie',
        requestId: 'REQ-1',
        telegramUserId: 'spoofed_user',
        phone: '+380635055252'
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'TELEGRAM_INITDATA_REQUIRED'
    });
    expect(verifyInitDataMock).not.toHaveBeenCalled();
    expect(miniAppServiceMock.getRequestStatus).not.toHaveBeenCalled();
  });

  it('uses verified initData Telegram identity for MiniApp request status reads', async () => {
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/requests/status')
      .set('X-Telegram-Init-Data', 'signed-init-data')
      .query({
        slug: 'cartie',
        requestId: 'REQ-1',
        telegramUserId: 'spoofed_user',
        phone: '+380635055252'
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      request: {
        id: 'request_1',
        publicId: 'REQ-1',
        status: 'NEW'
      }
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(verifyInitDataMock).toHaveBeenCalledWith('signed-init-data', {
      companyId: 'company_1',
      botId: 'bot_1'
    });
    expect(miniAppServiceMock.getRequestStatus).toHaveBeenCalledWith('cartie', {
      requestId: 'REQ-1',
      telegramUserId: '1001'
    });
  });

  it('rejects MiniApp request history reads without initData instead of trusting query identity', async () => {
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/requests/my')
      .query({
        slug: 'cartie',
        telegramUserId: 'spoofed_user'
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'TELEGRAM_INITDATA_REQUIRED'
    });
    expect(verifyInitDataMock).not.toHaveBeenCalled();
    expect(miniAppServiceMock.listMyRequests).not.toHaveBeenCalled();
  });

  it('uses verified initData Telegram identity for MiniApp request history reads', async () => {
    const app = await buildApp();

    const res = await request(app)
      .get('/api/miniapp/requests/my')
      .set('X-Telegram-Init-Data', 'signed-init-data')
      .query({
        slug: 'cartie',
        telegramUserId: 'spoofed_user',
        limit: 5
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      items: [
        {
          id: 'request_1',
          publicId: 'REQ-1',
          status: 'NEW',
          title: 'Підбір авто',
          type: 'BUY'
        }
      ]
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(verifyInitDataMock).toHaveBeenCalledWith('signed-init-data', {
      companyId: 'company_1',
      botId: 'bot_1'
    });
    expect(miniAppServiceMock.listMyRequests).toHaveBeenCalledWith('cartie', {
      telegramUserId: '1001',
      limit: 5
    });
  });

  it('rejects MiniApp events without initData instead of trusting client-supplied tgUserId', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'true');
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/events')
      .send({
        slug: 'cartie',
        eventType: 'LeadSubmit',
        tgUserId: 'spoofed_user',
        tracking: {
          meta: { eventId: 'meta_spoofed' }
        }
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'TELEGRAM_INITDATA_REQUIRED'
    });
    expect(emitPlatformEventMock).not.toHaveBeenCalled();
    expect(metaPixelTrackEventMock).not.toHaveBeenCalled();
  });

  it('allows read-only preview view events without initData but never trusts spoofed Telegram user ids', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'true');
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/events')
      .send({
        slug: 'cartie',
        eventType: 'ViewCar',
        visitorId: 'visitor_preview_1',
        tgUserId: 'spoofed_user',
        carListingId: 'car_1',
        tracking: {
          meta: {
            eventId: 'view_car_preview_1',
            fbp: 'fb.1.123',
            fbc: 'fb.1.456',
            eventSourceUrl: 'https://cartie.test/p/app/cartie?entry=inventory&carId=car_1&tgWebAppData=secret#tgWebAppData=query_id%3D1%26user%3Dsecret%26hash%3Dsecret'
          }
        },
        payload: {
          source: 'admin_preview',
          phone: '+380635055252'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      meta: { enabled: false, eventName: 'ViewContent' }
    });
    expect(emitPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'miniapp.ViewCar',
      userId: 'visitor_preview_1',
      payload: expect.objectContaining({
        tgUserId: undefined,
        visitorId: 'visitor_preview_1',
        carListingId: 'car_1'
      })
    }));
    expect(metaPixelTrackEventMock).not.toHaveBeenCalled();
    const platformPayload = emitPlatformEventMock.mock.calls[0][0].payload;
    expect(JSON.stringify(platformPayload)).not.toContain('spoofed_user');
    expect(JSON.stringify(platformPayload)).not.toContain('+380635055252');
    expect(JSON.stringify(platformPayload)).not.toContain('tgWebAppData');
  });

  it('allows LeadFormStart telemetry without initData for read-only preview sessions', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/events')
      .send({
        slug: 'cartie',
        eventType: 'LeadFormStart',
        visitorId: 'visitor_request_start_1',
        view: 'REQUEST',
        tracking: {
          meta: {
            eventId: 'lead_form_start_preview_1'
          }
        },
        payload: {
          source: 'preview_request'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      eventId: 'lead_form_start_preview_1',
      meta: { enabled: false, eventName: 'SubmitApplication' }
    });
    expect(emitPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'miniapp.LeadFormStart',
      userId: 'visitor_request_start_1',
      payload: expect.objectContaining({
        visitorId: 'visitor_request_start_1',
        tgUserId: undefined,
        view: 'REQUEST'
      })
    }));
    expect(metaPixelTrackEventMock).not.toHaveBeenCalled();
  });

  it('allows launch diagnostics without initData and strips sensitive launch payload fields', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/events')
      .send({
        slug: 'cartie',
        eventType: 'miniapp_launch_diagnostics',
        visitorId: 'visitor_launch_1',
        tgUserId: 'spoofed_user',
        payload: {
          path: '/p/app/cartie',
          hasBridge: true,
          hasInitData: false,
          phone: '+380635055252',
          initData: 'raw-init-data',
          user: {
            id: 1001,
            phone: '+380635055252',
            email: 'client@example.com'
          }
        }
      });

    expect(res.status).toBe(200);
    expect(emitPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'miniapp.miniapp_launch_diagnostics',
      userId: 'visitor_launch_1',
      payload: expect.objectContaining({
        tgUserId: undefined,
        visitorId: 'visitor_launch_1',
        payload: expect.objectContaining({
          path: '/p/app/cartie',
          hasBridge: true,
          hasInitData: false
        })
      })
    }));
    const platformPayload = emitPlatformEventMock.mock.calls[0][0].payload;
    expect(JSON.stringify(platformPayload)).not.toContain('spoofed_user');
    expect(JSON.stringify(platformPayload)).not.toContain('+380635055252');
    expect(JSON.stringify(platformPayload)).not.toContain('client@example.com');
    expect(JSON.stringify(platformPayload)).not.toContain('raw-init-data');
  });

  it('allows invalid initData write diagnostics without initData but not real lead submit events', async () => {
    const app = await buildApp();

    const diagnostics = await request(app)
      .post('/api/miniapp/events')
      .send({
        slug: 'cartie',
        eventType: 'write_rejected_invalid_initdata',
        visitorId: 'visitor_invalid_1',
        payload: { code: 'TELEGRAM_INITDATA_INVALID', flow: 'PICK' }
      });

    expect(diagnostics.status).toBe(200);
    expect(emitPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'miniapp.write_rejected_invalid_initdata',
      userId: 'visitor_invalid_1'
    }));

    emitPlatformEventMock.mockClear();
    const leadSubmit = await request(app)
      .post('/api/miniapp/events')
      .send({
        slug: 'cartie',
        eventType: 'LeadSubmit',
        visitorId: 'visitor_invalid_1'
      });

    expect(leadSubmit.status).toBe(400);
    expect(leadSubmit.body).toMatchObject({
      code: 'TELEGRAM_INITDATA_REQUIRED'
    });
    expect(emitPlatformEventMock).not.toHaveBeenCalled();
  });

  it('allows visitor favorite telemetry without initData because favorites support visitorId', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'true');
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/events')
      .send({
        slug: 'cartie',
        eventType: 'favorite_added',
        visitorId: 'visitor_fav_1',
        carListingId: 'car_1',
        payload: {
          source: 'preview_favorite'
        }
      });

    expect(res.status).toBe(200);
    expect(emitPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'miniapp.favorite_added',
      userId: 'visitor_fav_1',
      payload: expect.objectContaining({
        tgUserId: undefined,
        visitorId: 'visitor_fav_1',
        carListingId: 'car_1'
      })
    }));
    expect(metaPixelTrackEventMock).not.toHaveBeenCalled();
  });
});
