import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadStatus } from '@prisma/client';

const {
  prismaMock,
  telegramOutboxMock,
  scenarioEngineMock,
  quotaServiceMock,
  telegramSenderMock,
  b2bVariantCallbackMock,
  requestContractServiceMock,
  enqueueSalesDriveRequestSyncMock,
  processSalesDriveRequestSyncQueueMock
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
    b2bRequest: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    requestVariant: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    messageLog: {
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
  },
  telegramSenderMock: {
    getChatMember: vi.fn()
  },
  b2bVariantCallbackMock: vi.fn(),
  requestContractServiceMock: {
    shareAdminFitQueueContacts: vi.fn()
  },
  enqueueSalesDriveRequestSyncMock: vi.fn(),
  processSalesDriveRequestSyncQueueMock: vi.fn()
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

vi.mock('../messaging/telegramSender.js', () => ({
  TelegramSender: telegramSenderMock
}));

vi.mock('./wizards/b2bVariantWizard.js', () => ({
  handleB2BVariantCallback: b2bVariantCallbackMock
}));

vi.mock('../../../../services/requestContract.service.js', () => ({
  requestContractService: requestContractServiceMock
}));

vi.mock('../../../../modules/Integrations/salesdrive/salesdriveSync.service.js', () => ({
  enqueueSalesDriveRequestSync: enqueueSalesDriveRequestSyncMock,
  processSalesDriveRequestSyncQueue: processSalesDriveRequestSyncQueueMock
}));

vi.mock('./wizards/b2bRegistrationWizard.js', () => ({
  handleB2BRegCallback: vi.fn()
}));

vi.mock('./wizards/b2bRequestWizard.js', () => ({
  handleB2BReqCallback: vi.fn()
}));

describe('lead admin callback actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scenarioEngineMock.handleUpdate.mockResolvedValue(false);
    quotaServiceMock.consume.mockResolvedValue({ allowed: true });
    telegramSenderMock.getChatMember.mockResolvedValue({ status: 'administrator' });
    b2bVariantCallbackMock.mockResolvedValue(false);
    requestContractServiceMock.shareAdminFitQueueContacts.mockResolvedValue({
      id: 'variant_1',
      requestId: 'request_1',
      requestPublicId: 'CD-2026-000123',
      requestStatus: 'CONTACT_SHARED',
      fitQueueStatus: 'NEW',
      sellerCompany: 'Dealer Seller',
      requesterContact: '+380671234567',
      sellerContact: '+380501112233'
    });
    enqueueSalesDriveRequestSyncMock.mockResolvedValue({ queued: true, reason: 'QUEUED' });
    processSalesDriveRequestSyncQueueMock.mockResolvedValue({ processed: 1, sent: 1, failed: 0 });
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
    prismaMock.b2bRequest.findUnique.mockResolvedValue({
      id: 'request_1',
      companyId: 'company_1',
      botId: 'bot_lead',
      assignedTo: null
    });
    prismaMock.b2bRequest.update.mockResolvedValue({
      id: 'request_1',
      companyId: 'company_1',
      botId: 'bot_lead',
      assignedTo: 'tg:7001'
    });
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
    prismaMock.integrationEventLog.upsert.mockResolvedValue({});
    prismaMock.messageLog.create.mockResolvedValue({});
    telegramOutboxMock.answerCallback.mockResolvedValue({});
    telegramOutboxMock.sendMessage.mockResolvedValue({});
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

  it('runs tokenized SalesDrive request sync action from the admin chat', async () => {
    prismaMock.integrationEventLog.findUnique.mockResolvedValueOnce({
      id: 'event_token_sync',
      companyId: 'company_1',
      integration: 'telegram',
      action: 'admin.action_token_created',
      status: 'PENDING',
      entityType: 'request',
      entityId: 'request_1',
      idempotencyKey: 'telegram:admin-action-token:tok_salesdrive',
      meta: {
        action: 'salesdrive.REQUEST_SYNC',
        targetType: 'request',
        targetId: 'request_1',
        botId: 'bot_lead',
        companyId: 'company_1',
        requestId: 'request_1'
      }
    });
    const { routeCallback } = await import('./routeCallback.js');

    const handled = await routeCallback(buildCtx(
      '🟢 [LEAD] MiniApp запит\nRequest ID: REQ-1',
      'v1:aa:tok_salesdrive'
    ));

    expect(handled).toBe(true);
    expect(prismaMock.integrationEventLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'event_token_sync', status: 'PENDING' },
      data: expect.objectContaining({
        status: 'PROCESSING',
        meta: expect.objectContaining({
          action: 'salesdrive.REQUEST_SYNC',
          targetType: 'request',
          targetId: 'request_1'
        })
      })
    });
    expect(enqueueSalesDriveRequestSyncMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company_1',
      botId: 'bot_lead',
      requestId: 'request_1',
      source: 'telegram_admin_action'
    }));
    expect(processSalesDriveRequestSyncQueueMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company_1',
      requestId: 'request_1',
      limit: 1
    }));
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
    expect(prismaMock.integrationEventLog.update).toHaveBeenCalledWith({
      where: { id: 'event_token_sync' },
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
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: 'SalesDrive sync: sent 1'
    }));
  });

  it('assigns a request to the Telegram admin from a tokenized admin chat action', async () => {
    prismaMock.integrationEventLog.findUnique.mockResolvedValueOnce({
      id: 'event_token_assign',
      companyId: 'company_1',
      integration: 'telegram',
      action: 'admin.action_token_created',
      status: 'PENDING',
      entityType: 'request',
      entityId: 'request_1',
      idempotencyKey: 'telegram:admin-action-token:tok_abc123',
      meta: {
        action: 'request.ASSIGN_TO_ME',
        targetType: 'request',
        targetId: 'request_1',
        botId: 'bot_lead',
        companyId: 'company_1',
        requestId: 'request_1'
      }
    });
    const { routeCallback } = await import('./routeCallback.js');

    const handled = await routeCallback(buildCtx('🟢 [LEAD] MiniApp запит\nRequest ID: REQ-1', 'v1:aa:tok_abc123'));

    expect(handled).toBe(true);
    expect(prismaMock.integrationEventLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'event_token_assign', status: 'PENDING' },
      data: expect.objectContaining({
        status: 'PROCESSING',
        meta: expect.objectContaining({
          action: 'request.ASSIGN_TO_ME',
          targetType: 'request',
          targetId: 'request_1',
          claimedBy: expect.objectContaining({
            adminTgUserId: '7001',
            callbackId: 'callback_1'
          })
        })
      })
    });
    expect(prismaMock.b2bRequest.findUnique).toHaveBeenCalledWith({
      where: { id: 'request_1' },
      select: { id: true, companyId: true, botId: true, assignedTo: true }
    });
    expect(prismaMock.b2bRequest.update).toHaveBeenCalledWith({
      where: { id: 'request_1' },
      data: { assignedTo: 'tg:7001' }
    });
    expect(prismaMock.integrationEventLog.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: 'telegram:request-assign:request_1:44' },
      create: expect.objectContaining({
        companyId: 'company_1',
        integration: 'telegram',
        action: 'request.assigned',
        status: 'SUCCESS',
        entityType: 'request',
        entityId: 'request_1',
        idempotencyKey: 'telegram:request-assign:request_1:44',
        meta: expect.objectContaining({
          assignedTo: 'tg:7001',
          adminUsername: 'manager_one'
        })
      }),
      update: expect.objectContaining({
        status: 'SUCCESS'
      })
    });
    expect(telegramOutboxMock.editMessageText).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      messageId: 44,
      text: expect.stringContaining('👤 ASSIGNED: @manager_one')
    }));
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: '✅ Assigned to you'
    }));
    expect(prismaMock.integrationEventLog.update).toHaveBeenCalledWith({
      where: { id: 'event_token_assign' },
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

  it('handles tokenized B2B variant approve action from the configured admin chat', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    prismaMock.integrationEventLog.findUnique.mockResolvedValueOnce({
      id: 'event_token_b2b',
      companyId: 'company_1',
      integration: 'telegram',
      action: 'admin.action_token_created',
      status: 'PENDING',
      entityType: 'request_variant',
      entityId: 'variant_1',
      idempotencyKey: 'telegram:admin-action-token:tok_b2b',
      meta: {
        action: 'b2bVariant.APPROVE',
        targetType: 'request_variant',
        targetId: 'variant_1',
        botId: 'bot_b2b',
        companyId: 'company_1',
        requestId: 'request_1'
      }
    });
    prismaMock.requestVariant.findUnique.mockResolvedValueOnce({
      id: 'variant_1',
      requestId: 'request_1',
      status: 'SUBMITTED',
      statusHistory: [{ status: 'SUBMITTED', at: '2026-05-18T10:00:00.000Z' }],
      title: 'Hyundai IONIQ 5 2024',
      price: 16000,
      currency: 'USD',
      companyName: 'Dealer Seller',
      contact: '+380501112233',
      request: {
        id: 'request_1',
        publicId: 'CD-2026-000123',
        companyId: 'company_1',
        chatId: '2002'
      },
      sellerPartner: { name: 'Dealer Seller' }
    });
    prismaMock.requestVariant.update.mockResolvedValueOnce({
      id: 'variant_1',
      status: 'APPROVED'
    });

    const handled = await routeCallback({
      ...buildCtx('🟣 [B2B OFFER]\nRequest ID: CD-2026-000123', 'v1:aa:tok_b2b'),
      bot: {
        id: 'bot_b2b',
        token: 'token',
        name: 'B2B',
        template: 'B2B',
        adminChatId: '-100999'
      },
      session: {
        id: 'session_admin',
        state: 'B2B_MENU',
        variables: {}
      }
    } as any);

    expect(handled).toBe(true);
    expect(telegramSenderMock.getChatMember).toHaveBeenCalledWith('token', '-100999', '7001');
    expect(prismaMock.requestVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant_1' },
      data: expect.objectContaining({
        status: 'APPROVED',
        statusHistory: expect.arrayContaining([
          expect.objectContaining({ status: 'APPROVED', by: '7001' })
        ])
      })
    });
    expect(prismaMock.messageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: 'request_1',
        variantId: 'variant_1',
        botId: 'bot_b2b',
        chatId: '-100999',
        direction: 'OUTGOING',
        text: 'Manager action: APPROVE'
      })
    });
    expect(prismaMock.integrationEventLog.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'telegram:b2b-variant-admin:variant_1:APPROVE:44' },
      create: expect.objectContaining({
        integration: 'telegram',
        action: 'b2b.variant.admin_action',
        status: 'SUCCESS',
        entityType: 'request_variant',
        entityId: 'variant_1'
      })
    }));
    expect(telegramOutboxMock.editMessageText).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      messageId: 44,
      text: expect.stringContaining('✅ APPROVED')
    }));
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: '✅ APPROVED'
    }));
  });

  it('sends a tokenized B2B variant to the requester without revealing seller contact', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    prismaMock.integrationEventLog.findUnique.mockResolvedValueOnce({
      id: 'event_token_b2b_send',
      companyId: 'company_1',
      integration: 'telegram',
      action: 'admin.action_token_created',
      status: 'PENDING',
      entityType: 'request_variant',
      entityId: 'variant_1',
      idempotencyKey: 'telegram:admin-action-token:tok_b2b_send',
      meta: {
        action: 'b2bVariant.SEND_TO_CLIENT',
        targetType: 'request_variant',
        targetId: 'variant_1',
        botId: 'bot_b2b',
        companyId: 'company_1',
        requestId: 'request_1'
      }
    });
    prismaMock.requestVariant.findUnique.mockResolvedValueOnce({
      id: 'variant_1',
      requestId: 'request_1',
      status: 'APPROVED',
      title: 'Hyundai IONIQ 5 2024',
      price: 16000,
      currency: 'USD',
      contact: '+380501112233',
      companyName: 'Dealer Seller',
      specs: { contact: '+380501112233', condition: 'front damage' },
      request: {
        id: 'request_1',
        publicId: 'CD-2026-000123',
        companyId: 'company_1',
        chatId: '2002',
        title: 'Hyundai IONIQ 5 до 20000$'
      },
      sellerPartner: { name: 'Dealer Seller' }
    });
    prismaMock.requestVariant.update.mockResolvedValueOnce({
      id: 'variant_1',
      status: 'SENT_TO_CLIENT'
    });

    const handled = await routeCallback({
      ...buildCtx('🟣 [B2B OFFER]\nRequest ID: CD-2026-000123', 'v1:aa:tok_b2b_send'),
      bot: {
        id: 'bot_b2b',
        token: 'token',
        name: 'B2B',
        template: 'B2B',
        adminChatId: '-100999'
      },
      session: {
        id: 'session_admin',
        state: 'B2B_MENU',
        variables: {}
      }
    } as any);

    expect(handled).toBe(true);
    const requesterMessage = telegramOutboxMock.sendMessage.mock.calls
      .map((call: any[]) => call[0])
      .find((payload: any) => payload.chatId === '2002');
    expect(requesterMessage).toEqual(expect.objectContaining({
      chatId: '2002',
      text: expect.stringContaining('Новий варіант')
    }));
    expect(requesterMessage.text).not.toContain('+380501112233');
    expect(requesterMessage.replyMarkup.inline_keyboard[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining('Підходить'), callback_data: expect.stringMatching(/^v1:bv_fit:/) }),
      expect.objectContaining({ text: expect.stringContaining('Не підходить'), callback_data: expect.stringMatching(/^v1:bv_nfit:/) })
    ]));
    expect(prismaMock.requestVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant_1' },
      data: expect.objectContaining({
        status: 'SENT_TO_CLIENT'
      })
    });
  });

  it('reveals B2B fit contacts only through a tokenized admin action', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    prismaMock.integrationEventLog.findUnique.mockResolvedValueOnce({
      id: 'event_token_b2b_reveal',
      companyId: 'company_1',
      integration: 'telegram',
      action: 'admin.action_token_created',
      status: 'PENDING',
      entityType: 'request_variant',
      entityId: 'variant_1',
      idempotencyKey: 'telegram:admin-action-token:tok_b2b_reveal',
      meta: {
        action: 'b2bVariant.REVEAL_CONTACT',
        targetType: 'request_variant',
        targetId: 'variant_1',
        botId: 'bot_b2b',
        companyId: 'company_1',
        requestId: 'request_1'
      }
    });

    const handled = await routeCallback({
      ...buildCtx('🟣 [B2B OFFER]\nRequest ID: CD-2026-000123', 'v1:aa:tok_b2b_reveal'),
      bot: {
        id: 'bot_b2b',
        token: 'token',
        name: 'B2B',
        template: 'B2B',
        adminChatId: '-100999'
      },
      session: {
        id: 'session_admin',
        state: 'B2B_MENU',
        variables: {}
      }
    } as any);

    expect(handled).toBe(true);
    expect(requestContractServiceMock.shareAdminFitQueueContacts).toHaveBeenCalledWith({
      companyId: 'company_1',
      variantId: 'variant_1'
    });
    expect(prismaMock.requestVariant.update).not.toHaveBeenCalled();
    const adminRevealMessage = telegramOutboxMock.sendMessage.mock.calls
      .map((call: any[]) => call[0])
      .find((payload: any) => payload.chatId === '-100999' && String(payload.text || '').includes('Контакти відкрито'));
    expect(adminRevealMessage).toEqual(expect.objectContaining({
      botId: 'bot_b2b',
      chatId: '-100999',
      text: expect.stringContaining('CD-2026-000123')
    }));
    expect(adminRevealMessage.text).toContain('+380671234567');
    expect(adminRevealMessage.text).toContain('+380501112233');
    expect(prismaMock.integrationEventLog.update).toHaveBeenCalledWith({
      where: { id: 'event_token_b2b_reveal' },
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
    expect(telegramOutboxMock.editMessageText).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      messageId: 44,
      text: expect.stringContaining('✅ CONTACT_SHARED')
    }));
    expect(telegramOutboxMock.answerCallback).toHaveBeenCalledWith(expect.objectContaining({
      callbackId: 'callback_1',
      text: 'Contacts shared'
    }));
  });

  it('keeps legacy B2BVAR requester callbacks routed to the B2B variant wizard', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    b2bVariantCallbackMock.mockResolvedValueOnce(true);

    const handled = await routeCallback({
      ...buildCtx('🚗 Новий варіант', 'B2BVAR:variant_1:FIT'),
      bot: {
        id: 'bot_b2b',
        token: 'token',
        name: 'B2B',
        template: 'B2B',
        adminChatId: '-100999'
      },
      chatId: '2002',
      chatType: 'private',
      update: {
        callback_query: {
          id: 'callback_legacy_fit',
          data: 'B2BVAR:variant_1:FIT',
          from: { id: 2002, first_name: 'Requester', username: 'requester_one' },
          message: {
            chat: { id: 2002, type: 'private' },
            message_id: 77,
            text: '🚗 Новий варіант',
            reply_markup: { inline_keyboard: [] }
          }
        }
      },
      session: {
        id: 'session_b2b_requester',
        state: 'B2B_MENU',
        variables: {}
      }
    } as any);

    expect(handled).toBe(true);
    expect(b2bVariantCallbackMock).toHaveBeenCalledWith(expect.any(Object), 'bv_fit', 'variant_1');
  });

  it('keeps legacy VARIANT admin approve callbacks with admin access and idempotent logs', async () => {
    const { routeCallback } = await import('./routeCallback.js');
    prismaMock.integrationEventLog.findUnique.mockResolvedValueOnce(null);
    prismaMock.requestVariant.findUnique.mockResolvedValueOnce({
      id: 'variant_1',
      requestId: 'request_1',
      status: 'SUBMITTED',
      statusHistory: [{ status: 'SUBMITTED', at: '2026-05-18T10:00:00.000Z' }],
      title: 'Hyundai IONIQ 5 2024',
      request: {
        id: 'request_1',
        publicId: 'CD-2026-000123',
        companyId: 'company_1',
        chatId: '2002'
      },
      sellerPartner: { name: 'Dealer Seller' }
    });
    prismaMock.requestVariant.update.mockResolvedValueOnce({
      id: 'variant_1',
      status: 'APPROVED'
    });

    const handled = await routeCallback({
      ...buildCtx('🟣 [B2B OFFER]\nRequest ID: CD-2026-000123', 'VARIANT:variant_1:APPROVE'),
      bot: {
        id: 'bot_b2b',
        token: 'token',
        name: 'B2B',
        template: 'B2B',
        adminChatId: '-100999'
      },
      session: {
        id: 'session_admin',
        state: 'B2B_MENU',
        variables: {}
      }
    } as any);

    expect(handled).toBe(true);
    expect(telegramSenderMock.getChatMember).toHaveBeenCalledWith('token', '-100999', '7001');
    expect(prismaMock.requestVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant_1' },
      data: expect.objectContaining({
        status: 'APPROVED',
        statusHistory: expect.arrayContaining([
          expect.objectContaining({ status: 'APPROVED', by: '7001' })
        ])
      })
    });
    expect(prismaMock.integrationEventLog.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'telegram:b2b-variant-admin-legacy:variant_1:APPROVE:44' },
      create: expect.objectContaining({
        action: 'b2b.variant.admin_action.legacy',
        entityType: 'request_variant',
        entityId: 'variant_1'
      })
    }));
    expect(telegramOutboxMock.editMessageText).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      messageId: 44,
      text: expect.stringContaining('✅ APPROVED')
    }));
  });
});
