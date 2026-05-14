import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  telegramOutboxMock,
  quotaServiceMock,
  b2bWhitelistServiceMock,
  telegramSenderMock
} = vi.hoisted(() => ({
  telegramOutboxMock: {
    answerCallback: vi.fn(),
    sendMessage: vi.fn(),
    editMessageText: vi.fn()
  },
  quotaServiceMock: {
    consume: vi.fn()
  },
  b2bWhitelistServiceMock: {
    reviewAccessRequest: vi.fn()
  },
  telegramSenderMock: {
    getChatMember: vi.fn()
  }
}));

vi.mock('../messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: telegramOutboxMock
}));

vi.mock('../messaging/telegramSender.js', () => ({
  TelegramSender: telegramSenderMock
}));

vi.mock('../../bots/scenario.engine.js', () => ({
  ScenarioEngine: { handleUpdate: vi.fn().mockResolvedValue(false) }
}));

vi.mock('../../../../services/quota.service.js', () => ({
  quotaService: quotaServiceMock
}));

vi.mock('../../../../services/b2bWhitelist.service.js', () => ({
  b2bWhitelistService: b2bWhitelistServiceMock
}));

vi.mock('../../../../services/b2bRouting.service.js', () => ({
  b2bRoutingService: { notifyQueues: vi.fn() }
}));

vi.mock('../../../../services/prisma.js', () => ({
  prisma: {
    botSession: { update: vi.fn() },
    carListing: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    channelPost: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    integrationEventLog: { upsert: vi.fn(), create: vi.fn() },
    lead: { update: vi.fn() },
    leadActivity: { create: vi.fn() }
  }
}));

describe('B2B access callback authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaServiceMock.consume.mockResolvedValue({ allowed: true });
    telegramOutboxMock.answerCallback.mockResolvedValue({});
    telegramOutboxMock.sendMessage.mockResolvedValue({});
    telegramOutboxMock.editMessageText.mockResolvedValue({});
    b2bWhitelistServiceMock.reviewAccessRequest.mockResolvedValue({
      accessRequest: { tgUserId: '9001' }
    });
  });

  const buildCtx = (actorId = 7001) => ({
    bot: {
      id: 'bot_b2b',
      token: 'token',
      name: 'CarDealer Lviv B2B Bot',
      template: 'B2B',
      adminChatId: '-100999',
      config: {}
    },
    companyId: 'company_1',
    chatId: '-100999',
    userId: String(actorId),
    chatType: 'supergroup',
    session: {
      id: 'session_1',
      state: 'START',
      variables: {}
    },
    update: {
      callback_query: {
        id: 'callback_1',
        data: 'v1:ba_ap:access_1',
        from: { id: actorId, first_name: 'Manager', username: 'manager_one' },
        message: {
          chat: { id: -100999, type: 'supergroup' },
          message_id: 44,
          text: '🟡 [B2B REG] Новий запит на доступ'
        }
      }
    }
  } as any);

  it('rejects B2B access approval when callback actor is not admin in configured admin chat', async () => {
    telegramSenderMock.getChatMember.mockResolvedValue({ status: 'member' });
    const { routeCallback } = await import('./routeCallback.js');

    const handled = await routeCallback(buildCtx());

    expect(handled).toBe(true);
    expect(b2bWhitelistServiceMock.reviewAccessRequest).not.toHaveBeenCalled();
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      text: expect.stringMatching(/адмін|доступ|прав/i)
    }));
  });

  it('allows B2B access approval for admin in configured admin chat', async () => {
    telegramSenderMock.getChatMember.mockResolvedValue({ status: 'administrator' });
    const { routeCallback } = await import('./routeCallback.js');

    const handled = await routeCallback(buildCtx());

    expect(handled).toBe(true);
    expect(b2bWhitelistServiceMock.reviewAccessRequest).toHaveBeenCalledWith({
      accessRequestId: 'access_1',
      decision: 'APPROVE',
      reviewedBy: '7001'
    });
    expect(telegramOutboxMock.editMessageText).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      messageId: 44,
      text: expect.stringContaining('✅ ПІДТВЕРДЖЕНО')
    }));
  });
});
