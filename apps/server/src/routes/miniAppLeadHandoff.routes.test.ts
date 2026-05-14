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
  emitPlatformEventMock,
  metaPixelTrackEventMock,
  prismaMock
} = vi.hoisted(() => ({
  miniAppServiceMock: {
    getConfig: vi.fn(),
    createRequest: vi.fn()
  },
  requestContractServiceMock: {
    createPendingLeadIntent: vi.fn(),
    findKnownLeadContact: vi.fn(),
    finalizePendingLeadIntent: vi.fn(),
    clearPendingLeadIntent: vi.fn()
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  verifyInitDataMock: vi.fn(),
  parseTelegramUserMock: vi.fn(),
  startLeadSellWizardMock: vi.fn(),
  emitPlatformEventMock: vi.fn(),
  metaPixelTrackEventMock: vi.fn(),
  prismaMock: {
    botConfig: {
      findFirst: vi.fn()
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
      findFirst: vi.fn()
    },
    requestVariant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
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

vi.mock('../modules/Communication/telegram/core/events/eventEmitter.js', () => ({
  emitPlatformEvent: emitPlatformEventMock
}));

vi.mock('../modules/Integrations/integration.service.js', () => ({
  IntegrationService: vi.fn().mockImplementation(() => ({
    metaPixelTrackEvent: metaPixelTrackEventMock
  }))
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
    startLeadSellWizardMock.mockResolvedValue(undefined);
    emitPlatformEventMock.mockResolvedValue(undefined);
    metaPixelTrackEventMock.mockResolvedValue({ success: true, eventId: 'event_1' });
    vi.unstubAllEnvs();
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
        tracking: { submitId: 'submit_1' }
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      contactRequested: true,
      closeMiniApp: true
    });
    expect(requestContractServiceMock.createPendingLeadIntent).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'cartie',
      intentType: 'REQUEST',
      tracking: { submitId: 'submit_1' },
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
      tracking: { submitId: 'submit_contact_send_failed' }
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
          expect.objectContaining({ text: expect.stringContaining('контакт'), callback_data: 'lead_CONTACTED_lead_1' })
        ])
      ])
    }));
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

  it('uses verified initData Telegram identity for B2B request writes', async () => {
    miniAppServiceMock.getConfig.mockResolvedValueOnce({
      companyId: 'company_1',
      botId: 'bot_b2b',
      publicSlug: 'cardealer_lviv_bot',
      template: 'B2B',
      miniapp: { surfaceMode: 'B2B' }
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

  it('dispatches Meta CAPI for enabled MiniApp lead events with stable event id', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'true');
    const app = await buildApp();

    const res = await request(app)
      .post('/api/miniapp/events')
      .send({
        slug: 'cartie',
        eventType: 'LeadSubmit',
        initData: 'signed-init-data',
        tgUserId: 'spoofed_user',
        carListingId: 'car_1',
        tracking: {
          submitId: 'lead_submit_1',
          meta: {
            eventId: 'meta_event_1',
            fbp: 'fb.1.123',
            fbc: 'fb.1.456',
            eventSourceUrl: 'https://cartie.test/p/app/cartie'
          }
        },
        payload: {
          budgetMax: 55000,
          city: 'Львів',
          phone: '+380635055252',
          nested: {
            email: 'client@example.com',
            initData: 'raw-init-data'
          }
        }
      });

    expect(res.status).toBe(200);
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
    expect(JSON.stringify(platformPayload)).not.toContain('+380635055252');
    expect(JSON.stringify(platformPayload)).not.toContain('client@example.com');
    expect(JSON.stringify(platformPayload)).not.toContain('raw-init-data');
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
            eventSourceUrl: 'https://cartie.test/p/app/cartie?entry=inventory&carId=car_1'
          }
        },
        payload: {
          source: 'admin_preview',
          phone: '+380635055252'
        }
      });

    expect(res.status).toBe(200);
    expect(emitPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'miniapp.ViewCar',
      userId: 'visitor_preview_1',
      payload: expect.objectContaining({
        tgUserId: undefined,
        visitorId: 'visitor_preview_1',
        carListingId: 'car_1'
      })
    }));
    expect(metaPixelTrackEventMock).toHaveBeenCalledWith('company_1', 'ViewContent', expect.objectContaining({
      eventId: 'view_car_preview_1',
      externalId: 'visitor:visitor_preview_1',
      contentIds: ['car_1'],
      customData: expect.objectContaining({
        source: 'miniapp',
        slug: 'cartie',
        miniapp_event: 'ViewCar',
        carListingId: 'car_1'
      })
    }));
    const platformPayload = emitPlatformEventMock.mock.calls[0][0].payload;
    expect(JSON.stringify(platformPayload)).not.toContain('spoofed_user');
    expect(JSON.stringify(platformPayload)).not.toContain('+380635055252');
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
