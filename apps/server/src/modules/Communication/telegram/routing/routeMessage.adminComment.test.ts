import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  telegramOutboxMock,
  scenarioEngineMock,
  quotaServiceMock,
  b2bWhitelistServiceMock,
  requestContractServiceMock,
  emitPlatformEventMock
} = vi.hoisted(() => ({
  prismaMock: {
    botSession: {
      update: vi.fn()
    },
    b2bRequest: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    messageLog: {
      create: vi.fn()
    },
    integrationEventLog: {
      upsert: vi.fn()
    },
    partnerUser: {
      findFirst: vi.fn()
    }
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  scenarioEngineMock: {
    handleUpdate: vi.fn()
  },
  quotaServiceMock: {
    consume: vi.fn()
  },
  b2bWhitelistServiceMock: {
    isEnforced: vi.fn(),
    resolveParticipant: vi.fn()
  },
  requestContractServiceMock: {
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

vi.mock('../../bots/scenario.engine.js', () => ({
  ScenarioEngine: scenarioEngineMock
}));

vi.mock('../../../../services/quota.service.js', () => ({
  quotaService: quotaServiceMock
}));

vi.mock('../../../../services/b2bWhitelist.service.js', () => ({
  b2bWhitelistService: b2bWhitelistServiceMock
}));

vi.mock('../../../../services/requestContract.service.js', () => ({
  requestContractService: requestContractServiceMock
}));

vi.mock('../core/events/eventEmitter.js', () => ({
  emitPlatformEvent: emitPlatformEventMock
}));

describe('Telegram admin request comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scenarioEngineMock.handleUpdate.mockResolvedValue(false);
    quotaServiceMock.consume.mockResolvedValue({ allowed: true });
    b2bWhitelistServiceMock.isEnforced.mockReturnValue(false);
    requestContractServiceMock.finalizePendingLeadIntent.mockResolvedValue(null);
    emitPlatformEventMock.mockResolvedValue(undefined);
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 80 });
    prismaMock.b2bRequest.findUnique.mockResolvedValue({
      id: 'request_1',
      publicId: 'REQ-1',
      companyId: 'company_1',
      botId: 'bot_lead',
      internalNotes: 'Existing note'
    });
    prismaMock.b2bRequest.update.mockResolvedValue({});
    prismaMock.messageLog.create.mockResolvedValue({});
    prismaMock.integrationEventLog.upsert.mockResolvedValue({});
    prismaMock.botSession.update.mockResolvedValue({});
  });

  const buildCtx = () => ({
    bot: {
      id: 'bot_lead',
      token: 'token',
      name: 'Cartie Client Bot',
      template: 'CLIENT_LEAD',
      adminChatId: '-100999'
    },
    companyId: 'company_1',
    chatId: '-100999',
    userId: '7001',
    chatType: 'supergroup',
    update: {
      message: {
        text: 'Клієнт просить передзвонити після 16:00',
        message_id: 77,
        chat: { id: -100999, type: 'supergroup' },
        from: { id: 7001, first_name: 'Manager', username: 'manager_one' },
        reply_to_message: {
          message_id: 55,
          text: 'Додайте коментар'
        }
      }
    },
    session: {
      id: 'session_admin',
      state: 'CL_MENU',
      variables: {
        adminCommentDraft: {
          requestId: 'request_1',
          companyId: 'company_1',
          botId: 'bot_lead',
          chatId: '-100999',
          promptMessageId: 55,
          adminTgUserId: '7001',
          adminUsername: 'manager_one',
          createdAt: new Date().toISOString()
        }
      },
      lastActive: new Date()
    }
  } as any);

  it('stores a ForceReply admin comment on the request and clears pending state', async () => {
    const { routeMessage } = await import('./routeMessage.js');

    const handled = await routeMessage(buildCtx());

    expect(handled).toBe(true);
    expect(prismaMock.b2bRequest.findUnique).toHaveBeenCalledWith({
      where: { id: 'request_1' },
      select: { id: true, companyId: true, botId: true, publicId: true, internalNotes: true }
    });
    expect(prismaMock.b2bRequest.update).toHaveBeenCalledWith({
      where: { id: 'request_1' },
      data: {
        internalNotes: expect.stringContaining('Клієнт просить передзвонити після 16:00')
      }
    });
    expect(prismaMock.b2bRequest.update.mock.calls[0][0].data.internalNotes).toContain('Existing note');
    expect(prismaMock.b2bRequest.update.mock.calls[0][0].data.internalNotes).toContain('@manager_one');
    expect(prismaMock.messageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: 'request_1',
        botId: 'bot_lead',
        chatId: '-100999',
        direction: 'INCOMING',
        text: expect.stringContaining('[ADMIN COMMENT]')
      })
    });
    expect(prismaMock.integrationEventLog.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: 'telegram:request-comment:request_1:77' },
      create: expect.objectContaining({
        companyId: 'company_1',
        integration: 'telegram',
        action: 'request.comment_added',
        status: 'SUCCESS',
        entityType: 'request',
        entityId: 'request_1'
      }),
      update: expect.objectContaining({
        status: 'SUCCESS'
      })
    });
    expect(prismaMock.botSession.update).toHaveBeenCalledWith({
      where: { id: 'session_admin' },
      data: expect.objectContaining({
        state: 'CL_MENU',
        variables: expect.objectContaining({
          adminCommentDraft: null
        })
      })
    });
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      text: expect.stringContaining('Коментар додано')
    }));
  });
});
