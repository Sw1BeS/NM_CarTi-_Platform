import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadStatus } from '@prisma/client';

const {
  prismaMock,
  telegramOutboxMock,
  scenarioEngineMock,
  quotaServiceMock
} = vi.hoisted(() => ({
  prismaMock: {
    botSession: {
      update: vi.fn()
    },
    lead: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    leadActivity: {
      create: vi.fn()
    },
    integrationEventLog: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn()
    }
  },
  telegramOutboxMock: {
    answerCallback: vi.fn(),
    sendMessage: vi.fn(),
    editMessageText: vi.fn()
  },
  scenarioEngineMock: {
    handleUpdate: vi.fn()
  },
  quotaServiceMock: {
    consume: vi.fn()
  }
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

describe('lead admin callback actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scenarioEngineMock.handleUpdate.mockResolvedValue(false);
    quotaServiceMock.consume.mockResolvedValue({ allowed: true });
    prismaMock.lead.update.mockResolvedValue({
      id: 'lead_1',
      companyId: 'company_1',
      status: LeadStatus.CONTACTED
    });
    prismaMock.lead.findUnique.mockResolvedValue({
      id: 'lead_1',
      companyId: 'company_1',
      botId: 'bot_lead'
    });
    prismaMock.leadActivity.create.mockResolvedValue({});
    prismaMock.integrationEventLog.upsert.mockResolvedValue({});
    prismaMock.integrationEventLog.findUnique.mockResolvedValue({
      id: 'event_token_1',
      companyId: 'company_1',
      integration: 'telegram',
      action: 'admin.action_token_created',
      status: 'PENDING',
      entityType: 'lead',
      entityId: 'lead_1',
      idempotencyKey: 'telegram:admin-action-token:tok_abc123',
      meta: {
        action: 'lead.CONTACTED',
        targetType: 'lead',
        targetId: 'lead_1',
        botId: 'bot_lead',
        companyId: 'company_1',
        requestId: 'request_1'
      }
    });
    prismaMock.integrationEventLog.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.integrationEventLog.update.mockResolvedValue({});
    telegramOutboxMock.answerCallback.mockResolvedValue({});
    telegramOutboxMock.editMessageText.mockResolvedValue({});
  });

  const buildCtx = (
    text = '🟢 [LEAD] MiniApp запит\nRequest ID: REQ-1',
    data = 'lead_CONTACTED_lead_1'
  ) => ({
    bot: {
      id: 'bot_lead',
      token: 'token',
      name: 'Cartie Client Bot',
      template: 'CLIENT_LEAD'
    },
    companyId: 'company_1',
    chatId: '-100999',
    userId: '7001',
    chatType: 'supergroup',
    update: {
      callback_query: {
        id: 'callback_1',
        data,
        from: { id: 7001, first_name: 'Manager', username: 'manager_one' },
        message: {
          chat: { id: -100999, type: 'supergroup' },
          message_id: 44,
          text,
          reply_markup: { inline_keyboard: [] }
        }
      }
    },
    session: {
      id: 'session_admin',
      state: 'CL_MENU',
      variables: {}
    }
  } as any);

  it('resolves tokenized lead contacted action with timeline and idempotent integration log', async () => {
    const { routeCallback } = await import('./routeCallback.js');

    const handled = await routeCallback(buildCtx('🟢 [LEAD] MiniApp запит\nRequest ID: REQ-1', 'v1:aa:tok_abc123'));

    expect(handled).toBe(true);
    expect(prismaMock.integrationEventLog.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'telegram:admin-action-token:tok_abc123' }
    });
    expect(prismaMock.integrationEventLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'event_token_1', status: 'PENDING' },
      data: expect.objectContaining({
        status: 'PROCESSING',
        meta: expect.objectContaining({
          action: 'lead.CONTACTED',
          targetType: 'lead',
          targetId: 'lead_1',
          botId: 'bot_lead',
          companyId: 'company_1',
          claimed: true,
          claimedBy: expect.objectContaining({
            adminTgUserId: '7001',
            callbackId: 'callback_1'
          })
        })
      })
    });
    expect(prismaMock.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead_1' },
      data: { status: LeadStatus.CONTACTED }
    });
    expect(prismaMock.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead_1',
        type: 'ADMIN_STATUS_CHANGED',
        payload: expect.objectContaining({
          status: LeadStatus.CONTACTED,
          botId: 'bot_lead',
          adminTgUserId: '7001'
        })
      })
    });
    expect(prismaMock.integrationEventLog.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: 'telegram:lead-status:lead_1:CONTACTED:44' },
      create: expect.objectContaining({
        companyId: 'company_1',
        integration: 'telegram',
        action: 'lead.status_changed',
        status: 'SUCCESS',
        entityType: 'lead',
        entityId: 'lead_1',
        idempotencyKey: 'telegram:lead-status:lead_1:CONTACTED:44'
      }),
      update: expect.objectContaining({
        status: 'SUCCESS'
      })
    });
    expect(telegramOutboxMock.editMessageText).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      messageId: 44,
      text: expect.stringContaining('✅ CONTACTED')
    }));
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: '✅ CONTACTED'
    }));
    expect(prismaMock.integrationEventLog.update).toHaveBeenCalledWith({
      where: { id: 'event_token_1' },
      data: expect.objectContaining({
        status: 'SUCCESS',
        meta: expect.objectContaining({
          consumed: true,
          consumedBy: expect.objectContaining({
            adminTgUserId: '7001',
            callbackId: 'callback_1'
          })
        })
      })
    });
    expect(prismaMock.integrationEventLog.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(prismaMock.lead.update.mock.invocationCallOrder[0]);
    expect(prismaMock.integrationEventLog.update.mock.invocationCallOrder[0])
      .toBeLessThan(prismaMock.lead.update.mock.invocationCallOrder[0]);
  });

  it('rejects a token scoped to a different bot or company without updating the lead', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    prismaMock.integrationEventLog.findUnique.mockResolvedValueOnce({
      id: 'event_token_other',
      companyId: 'company_other',
      integration: 'telegram',
      action: 'admin.action_token_created',
      status: 'PENDING',
      entityType: 'lead',
      entityId: 'lead_1',
      idempotencyKey: 'telegram:admin-action-token:tok_other',
      meta: {
        action: 'lead.CONTACTED',
        targetType: 'lead',
        targetId: 'lead_1',
        botId: 'bot_other',
        companyId: 'company_other'
      }
    });

    const handled = await routeCallback(buildCtx('🟢 [LEAD] MiniApp запит', 'v1:aa:tok_other'));

    expect(handled).toBe(true);
    expect(prismaMock.integrationEventLog.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: 'Action unavailable'
    }));
  });

  it('rejects an already claimed token without updating the lead or appending activity', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    prismaMock.integrationEventLog.updateMany.mockResolvedValueOnce({ count: 0 });

    const handled = await routeCallback(buildCtx('🟢 [LEAD] MiniApp запит', 'v1:aa:tok_abc123'));

    expect(handled).toBe(true);
    expect(prismaMock.integrationEventLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'event_token_1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'PROCESSING' })
    });
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
    expect(telegramOutboxMock.editMessageText).not.toHaveBeenCalled();
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: 'Action already processed'
    }));
  });

  it('keeps a finalized token consumed when the accepted lead status update fails', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    prismaMock.lead.update.mockRejectedValueOnce(new Error('database unavailable'));

    const handled = await routeCallback(buildCtx('🟢 [LEAD] MiniApp запит', 'v1:aa:tok_abc123'));

    expect(handled).toBe(true);
    expect(prismaMock.integrationEventLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'event_token_1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'PROCESSING' })
    });
    expect(prismaMock.integrationEventLog.update).toHaveBeenCalledWith({
      where: { id: 'event_token_1' },
      data: expect.objectContaining({
        status: 'SUCCESS',
        meta: expect.objectContaining({
          consumed: true,
          consumedBy: expect.objectContaining({
            adminTgUserId: '7001',
            callbackId: 'callback_1'
          })
        })
      })
    });
    expect(prismaMock.integrationEventLog.update.mock.invocationCallOrder[0])
      .toBeLessThan(prismaMock.lead.update.mock.invocationCallOrder[0]);
    expect(prismaMock.integrationEventLog.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_token_1', status: 'PROCESSING' }
    }));
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: 'Action accepted, but lead update failed.'
    }));
  });

  it('releases a claimed token and skips user-visible success side effects when the consumed mark fails', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    prismaMock.integrationEventLog.update.mockRejectedValueOnce(new Error('database unavailable'));

    const handled = await routeCallback(buildCtx('🟢 [LEAD] MiniApp запит\nRequest ID: REQ-1', 'v1:aa:tok_abc123'));

    expect(handled).toBe(true);
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
    expect(prismaMock.integrationEventLog.upsert).not.toHaveBeenCalled();
    expect(telegramOutboxMock.editMessageText).not.toHaveBeenCalled();
    expect(prismaMock.integrationEventLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'event_token_1', status: 'PROCESSING' },
      data: expect.objectContaining({
        status: 'PENDING',
        meta: expect.objectContaining({
          action: 'lead.CONTACTED',
          targetType: 'lead',
          targetId: 'lead_1',
          botId: 'bot_lead',
          companyId: 'company_1',
          lastError: expect.objectContaining({
            message: 'Admin action token finalization failed'
          })
        })
      })
    });
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: 'Action failed. Please retry.'
    }));
  });

  it('does not append duplicate activity or status line for a repeated legacy lead callback', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    const text = '🟢 [LEAD] MiniApp запит\nRequest ID: REQ-1\n\n✅ CONTACTED';
    prismaMock.integrationEventLog.findUnique.mockResolvedValueOnce({
      id: 'event_status_1',
      companyId: 'company_1',
      integration: 'telegram',
      action: 'lead.status_changed',
      status: 'SUCCESS',
      entityType: 'lead',
      entityId: 'lead_1',
      idempotencyKey: 'telegram:lead-status:lead_1:CONTACTED:44',
      meta: { status: 'CONTACTED' }
    });

    const handled = await routeCallback(buildCtx(text, 'lead_CONTACTED_lead_1'));

    expect(handled).toBe(true);
    expect(prismaMock.integrationEventLog.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'telegram:lead-status:lead_1:CONTACTED:44' }
    });
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
    expect(telegramOutboxMock.editMessageText).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      messageId: 44,
      text
    }));
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: '✅ CONTACTED'
    }));
  });

  it('keeps legacy lead contacted callback support', async () => {
    const { routeCallback } = await import('./routeCallback.js');

    const handled = await routeCallback(buildCtx('🟢 [LEAD] MiniApp запит\nRequest ID: REQ-1', 'lead_CONTACTED_lead_1'));

    expect(handled).toBe(true);
    expect(prismaMock.integrationEventLog.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'telegram:lead-status:lead_1:CONTACTED:44' }
    });
    expect(prismaMock.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead_1' },
      data: { status: LeadStatus.CONTACTED }
    });
  });

  it('ignores unsupported legacy lead status callbacks without updating the lead', async () => {
    const { routeCallback } = await import('./routeCallback.js');

    const handled = await routeCallback(buildCtx('🟢 [LEAD] MiniApp запит\nRequest ID: REQ-1', 'lead_LOST_lead_1'));

    expect(handled).toBe(false);
    expect(prismaMock.lead.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
    expect(prismaMock.integrationEventLog.upsert).not.toHaveBeenCalled();
    expect(telegramOutboxMock.editMessageText).not.toHaveBeenCalled();
  });

  it('rejects a legacy lead callback from the wrong company without updating status or activity', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    prismaMock.lead.findUnique.mockResolvedValueOnce({
      id: 'lead_1',
      companyId: 'company_other',
      botId: 'bot_lead'
    });

    const handled = await routeCallback(buildCtx('🟢 [LEAD] MiniApp запит\nRequest ID: REQ-1', 'lead_CONTACTED_lead_1'));

    expect(handled).toBe(true);
    expect(prismaMock.lead.findUnique).toHaveBeenCalledWith({
      where: { id: 'lead_1' },
      select: { id: true, companyId: true, botId: true }
    });
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
    expect(prismaMock.integrationEventLog.upsert).not.toHaveBeenCalled();
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: 'Action unavailable'
    }));
  });
});
