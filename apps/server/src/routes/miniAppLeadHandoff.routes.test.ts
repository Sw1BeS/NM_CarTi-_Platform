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
  prismaMock
} = vi.hoisted(() => ({
  miniAppServiceMock: {
    getConfig: vi.fn()
  },
  requestContractServiceMock: {
    createPendingLeadIntent: vi.fn(),
    clearPendingLeadIntent: vi.fn()
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  verifyInitDataMock: vi.fn(),
  parseTelegramUserMock: vi.fn(),
  startLeadSellWizardMock: vi.fn(),
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
      config: { defaultShowcaseSlug: 'cartie' }
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
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 10 });
    startLeadSellWizardMock.mockResolvedValue(undefined);
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
});
