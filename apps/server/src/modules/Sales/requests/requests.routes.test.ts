import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  telegramOutboxMock
} = vi.hoisted(() => ({
  prismaMock: {
    b2bRequest: {
      findUnique: vi.fn()
    },
    leadActivity: {
      findMany: vi.fn()
    },
    botConfig: {
      findUnique: vi.fn(),
      findFirst: vi.fn()
    },
    channelPost: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn()
    },
    messageLog: {
      create: vi.fn(),
      findMany: vi.fn()
    },
    requestVariant: {
      findMany: vi.fn()
    },
    integrationEventLog: {
      findMany: vi.fn()
    }
  },
  telegramOutboxMock: {
    sendMessage: vi.fn(),
    editMessageText: vi.fn()
  }
}));

vi.mock('../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../../../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 'user_1',
      role: 'MANAGER',
      companyId: 'company_1',
      workspaceId: 'company_1'
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next()
}));

vi.mock('../../Communication/telegram/messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: telegramOutboxMock
}));

const buildApp = async () => {
  const { default: requestsRoutes } = await import('./requests.routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/requests', requestsRoutes);
  return app;
};

describe('requests channel publishing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.b2bRequest.findUnique.mockResolvedValue({
      id: 'request_1',
      publicId: 'CD-2026-000777',
      companyId: 'company_1',
      title: 'BMW X5',
      description: 'Потрібен доглянутий',
      budgetMax: 70000,
      payload: {
        request: {
          companyName: 'Dealer One',
          contact: '+380635055252'
        }
      }
    });
    prismaMock.botConfig.findUnique.mockResolvedValue({
      id: 'bot_b2b',
      token: 'telegram-token',
      companyId: 'company_1',
      channelId: '-100123',
      config: {
        username: 'CarDealer_Lviv_Bot'
      }
    });
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 42 });
    prismaMock.channelPost.create.mockResolvedValue({
      id: 'channel_post_1',
      requestId: 'request_1',
      messageId: 42
    });
    prismaMock.channelPost.findFirst.mockResolvedValue({
      id: 'channel_post_1',
      requestId: 'request_1',
      botId: 'bot_b2b',
      channelId: '-100123',
      messageId: 42,
      payload: {
        text: 'BMW X5'
      }
    });
    prismaMock.channelPost.update.mockResolvedValue({
      id: 'channel_post_1',
      requestId: 'request_1',
      messageId: 42,
      payload: {
        text: 'BMW X5'
      }
    });
    prismaMock.messageLog.create.mockResolvedValue({ id: 'message_1' });
    prismaMock.messageLog.findMany.mockResolvedValue([]);
    prismaMock.requestVariant.findMany.mockResolvedValue([]);
    prismaMock.leadActivity.findMany.mockResolvedValue([]);
    prismaMock.integrationEventLog.findMany.mockResolvedValue([]);
    telegramOutboxMock.editMessageText.mockResolvedValue({ ok: true });
  });

  it('publishes B2B request channel actions as explicit b2bv private bot deep links', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/requests/request_1/publish-channel')
      .send({
        botId: 'bot_b2b',
        channelId: '-100123'
      });

    expect(res.status).toBe(200);
    const payload = telegramOutboxMock.sendMessage.mock.calls[0]?.[0];
    expect(payload.replyMarkup.inline_keyboard[0]).toEqual([
      {
        text: '🚗 Є авто',
        url: 'https://t.me/CarDealer_Lviv_Bot?start=b2bv_CD-2026-000777'
      },
      {
        text: 'Відкрити в боті',
        url: 'https://t.me/CarDealer_Lviv_Bot?start=b2bv_CD-2026-000777'
      }
    ]);
    expect(payload.text).not.toContain('+380635055252');
  });

  it('redacts admin-supplied channel publish text before sending and storing it', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/requests/request_1/publish-channel')
      .send({
        botId: 'bot_b2b',
        channelId: '-100123',
        text: 'BMW X5 терміново, телефон +380671112233, Telegram @dealer_one, email client@example.com <b>VIP</b>'
      });

    expect(res.status).toBe(200);
    const payload = telegramOutboxMock.sendMessage.mock.calls[0]?.[0];
    expect(payload.text).toContain('BMW X5');
    expect(payload.text).not.toContain('+380671112233');
    expect(payload.text).not.toContain('@dealer_one');
    expect(payload.text).not.toContain('client@example.com');
    expect(payload.text).not.toContain('<b>VIP</b>');
    expect(payload.text).toContain('&lt;b&gt;VIP&lt;/b&gt;');
    expect(prismaMock.channelPost.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          text: expect.not.stringContaining('client@example.com')
        })
      })
    }));
    expect(prismaMock.messageLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        text: expect.not.stringContaining('@dealer_one')
      })
    }));
  });

  it('redacts admin-supplied channel update text before editing and storing it', async () => {
    const app = await buildApp();

    const res = await request(app)
      .put('/api/requests/request_1/channel-post')
      .send({
        channelId: '-100123',
        text: 'Оновлено: пишіть +380671112233, @dealer_one або client@example.com <i>now</i>'
      });

    expect(res.status).toBe(200);
    const payload = telegramOutboxMock.editMessageText.mock.calls[0]?.[0];
    expect(payload.text).toContain('Оновлено');
    expect(payload.text).not.toContain('+380671112233');
    expect(payload.text).not.toContain('@dealer_one');
    expect(payload.text).not.toContain('client@example.com');
    expect(payload.text).not.toContain('<i>now</i>');
    expect(payload.text).toContain('&lt;i&gt;now&lt;/i&gt;');
    expect(prismaMock.channelPost.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          text: expect.not.stringContaining('client@example.com')
        })
      })
    }));
    expect(prismaMock.messageLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        text: expect.not.stringContaining('@dealer_one')
      })
    }));
  });

  it('does not leak internal request ids into B2B channel deep links when publicId is missing', async () => {
    prismaMock.b2bRequest.findUnique.mockResolvedValueOnce({
      id: 'request_1',
      publicId: null,
      companyId: 'company_1',
      title: 'BMW X5',
      payload: {}
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/requests/request_1/publish-channel')
      .send({
        botId: 'bot_b2b',
        channelId: '-100123'
      });

    expect(res.status).toBe(200);
    const payload = telegramOutboxMock.sendMessage.mock.calls[0]?.[0];
    expect(JSON.stringify(payload.replyMarkup || {})).not.toContain('request_1');
    expect(payload.replyMarkup).toBeUndefined();
  });

  it('sanitizes default channel card text before publishing', async () => {
    prismaMock.b2bRequest.findUnique.mockResolvedValueOnce({
      id: 'request_1',
      publicId: 'CD-2026-000777',
      companyId: 'company_1',
      title: 'BMW <b>X5</b> client@example.com',
      city: 'Львів <i>центр</i>',
      description: 'Пишіть +380671112233 або @dealer_one',
      budgetMax: 70000,
      payload: {
        request: {
          fuel: 'diesel <script>x</script>',
          companyName: 'Dealer One'
        }
      }
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/requests/request_1/publish-channel')
      .send({
        botId: 'bot_b2b',
        channelId: '-100123'
      });

    expect(res.status).toBe(200);
    const payload = telegramOutboxMock.sendMessage.mock.calls[0]?.[0];
    expect(payload.text).not.toContain('client@example.com');
    expect(payload.text).not.toContain('+380671112233');
    expect(payload.text).not.toContain('@dealer_one');
    expect(payload.text).not.toContain('<b>X5</b>');
    expect(payload.text).not.toContain('<i>центр</i>');
    expect(payload.text).not.toContain('<script>x</script>');
    expect(payload.text).toContain('&lt;b&gt;X5&lt;/b&gt;');
    expect(payload.text).toContain('&lt;i&gt;центр&lt;/i&gt;');
    expect(payload.text).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('returns request timeline scoped to the authenticated company', async () => {
    const timelineRequest = {
      id: 'request_1',
      publicId: 'CD-2026-000777',
      companyId: 'company_1',
      leadId: 'lead_1',
      status: 'COLLECTING_VARIANTS',
      createdAt: new Date('2026-05-12T10:00:00Z')
    };
    prismaMock.b2bRequest.findUnique
      .mockResolvedValueOnce(timelineRequest)
      .mockResolvedValueOnce(timelineRequest);
    prismaMock.messageLog.findMany.mockResolvedValueOnce([
      {
        id: 'message_1',
        requestId: 'request_1',
        variantId: null,
        direction: 'INCOMING',
        text: 'Client message',
        payload: { token: 'secret-token' },
        createdAt: new Date('2026-05-12T10:01:00Z')
      }
    ]);

    const app = await buildApp();

    const res = await request(app)
      .get('/api/requests/request_1/timeline')
      .send();

    expect(res.status).toBe(200);
    expect(prismaMock.b2bRequest.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'request_1' }
    }));
    expect(res.body.items.map((item: any) => item.type)).toEqual([
      'REQUEST_CREATED',
      'MESSAGE_INCOMING'
    ]);
    expect(res.body.items[1].payload.meta.token).toBe('[REDACTED]');
  });
});
