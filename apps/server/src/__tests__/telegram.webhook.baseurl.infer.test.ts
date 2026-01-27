import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { signJwt } from '../config/jwt.js';

const { setWebhookForBotMock, restartBotMock } = vi.hoisted(() => {
  return {
    setWebhookForBotMock: vi.fn(),
    restartBotMock: vi.fn()
  };
});

const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      $connect: vi.fn(),
      workspace: {
        findMany: vi.fn(),
        count: vi.fn()
      },
      globalUser: {
        findUnique: vi.fn(),
        findFirst: vi.fn()
      },
      membership: {
        findFirst: vi.fn()
      },
      botConfig: {
        findUnique: vi.fn()
      },
      systemLog: {
        create: vi.fn()
      }
    }
  };
});

vi.mock('../services/prisma.js', () => ({
  prisma: mockPrisma
}));

vi.mock('../modules/Communication/telegram/core/telegramAdmin.service.js', () => ({
  setWebhookForBot: setWebhookForBotMock,
  deleteWebhookForBot: vi.fn()
}));

vi.mock('../modules/Communication/bots/bot.service.js', () => ({
  botManager: {
    restartBot: restartBotMock,
    startAll: vi.fn(),
    stopAll: vi.fn(),
    getStatus: vi.fn(() => ({ activeCount: 0, activeBotIds: [] }))
  }
}));

// Import app AFTER mocks
import { app } from '../index.js';

describe('Telegram Webhook Setup Base URL Inference', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.botConfig.findUnique.mockResolvedValue({
      companyId: 'ws-1'
    } as any);

    setWebhookForBotMock.mockResolvedValue({
      webhookUrl: 'https://example.com/api/telegram/webhook/bot-1',
      secretToken: 'secret'
    });

    restartBotMock.mockResolvedValue(undefined);
  });

  it('infers publicBaseUrl from x-forwarded headers when not provided', async () => {
    const token = signJwt({
      userId: 'admin-1',
      globalUserId: 'admin-1',
      role: 'ADMIN',
      companyId: 'ws-1',
      workspaceId: 'ws-1'
    });

    const res = await request(app)
      .post('/api/bots/bot-1/webhook')
      .set('Authorization', `Bearer ${token}`)
      .set('x-forwarded-proto', 'https')
      .set('x-forwarded-host', 'example.com')
      .send({});

    expect(res.status).toBe(200);
    expect(setWebhookForBotMock).toHaveBeenCalledTimes(1);

    const [, opts] = setWebhookForBotMock.mock.calls[0];
    expect(opts.publicBaseUrl).toBe('https://example.com');
    expect(restartBotMock).toHaveBeenCalledWith('bot-1');
  });
});
