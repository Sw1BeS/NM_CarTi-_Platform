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
      update: vi.fn()
    },
    leadActivity: {
      create: vi.fn()
    },
    integrationEventLog: {
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
    prismaMock.leadActivity.create.mockResolvedValue({});
    prismaMock.integrationEventLog.upsert.mockResolvedValue({});
    telegramOutboxMock.answerCallback.mockResolvedValue({});
    telegramOutboxMock.editMessageText.mockResolvedValue({});
  });

  const buildCtx = (text = '🟢 [LEAD] MiniApp запит\nRequest ID: REQ-1') => ({
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
        data: 'lead_CONTACTED_lead_1',
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

  it('marks lead contacted with timeline and idempotent integration log', async () => {
    const { routeCallback } = await import('./routeCallback.js');

    const handled = await routeCallback(buildCtx());

    expect(handled).toBe(true);
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
  });

  it('does not append duplicate status lines when admin presses the same action again', async () => {
    const { routeCallback } = await import('./routeCallback.js');

    await routeCallback(buildCtx('🟢 [LEAD] MiniApp запит\n\n✅ CONTACTED'));

    expect(telegramOutboxMock.editMessageText).toHaveBeenCalledWith(expect.objectContaining({
      text: '🟢 [LEAD] MiniApp запит\n\n✅ CONTACTED'
    }));
  });
});
