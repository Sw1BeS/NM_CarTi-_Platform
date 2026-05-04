import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionTokens } from '../../core/utils/callbackUtils.js';

const {
  leadCreateMock,
  accessRequestCreateMock,
  sendMessageMock
} = vi.hoisted(() => ({
  leadCreateMock: vi.fn(async () => ({ id: 'lead_test_1' })),
  accessRequestCreateMock: vi.fn(async () => ({ id: 'acc_req_1' })),
  sendMessageMock: vi.fn(async () => ({ message_id: 10 }))
}));

vi.mock('../../../../../services/prisma.js', () => ({
  prisma: {
    lead: { create: leadCreateMock },
    b2bAccessRequest: { create: accessRequestCreateMock }
  }
}));

vi.mock('../../messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: {
    sendMessage: sendMessageMock
  }
}));

vi.mock('../../../../../services/publicId.service.js', () => ({
  publicIdService: {
    nextB2bRequestId: vi.fn(async () => 'CD-TEST-1')
  }
}));

import {
  buildTestPanel,
  resolveScenarioFromPanelState,
  runTestScenario
} from './adminTestScenarios.js';

const buildCtx = (template: 'CLIENT_LEAD' | 'B2B' = 'CLIENT_LEAD') => ({
  receivedAt: new Date(),
  companyId: 'comp_1',
  chatId: '-100123',
  bot: {
    id: 'bot_1',
    token: 'token',
    template,
    adminChatId: '-100123',
    companyId: 'comp_1'
  }
}) as any;

const actor = {
  tgUserId: '219480233',
  username: 'r_umanoff',
  displayName: 'Test Admin'
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('admin test panel definitions', () => {
  it('builds lead panel by template', () => {
    const panel = buildTestPanel('CLIENT_LEAD');
    expect(panel.items.map((it) => it.code)).toEqual(['lead_buy', 'lead_sell', 'support']);
  });

  it('builds b2b panel by template', () => {
    const panel = buildTestPanel('B2B');
    expect(panel.items.map((it) => it.code)).toContain('b2b_reg_new');
    expect(panel.items.map((it) => it.code)).toContain('b2b_fit');
  });
});

describe('resolveScenarioFromPanelState', () => {
  it('rejects stale panel payload', () => {
    const result = resolveScenarioFromPanelState(null, 0, '-100123');
    expect(result.ok).toBe(false);
  });

  it('returns scenario code for valid panel state/index', () => {
    const result = resolveScenarioFromPanelState({
      chatId: '-100123',
      items: ['lead_sell']
    }, 0, '-100123');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toBe('lead_sell');
    }
  });
});

describe('runTestScenario', () => {
  it('creates lead SELL test with payload flags and admin action buttons', async () => {
    const result = await runTestScenario(buildCtx('CLIENT_LEAD'), 'lead_sell', actor);
    expect(result.ok).toBe(true);
    expect(leadCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          test: true,
          testScenario: 'lead_sell',
          createdByAdminTgId: actor.tgUserId,
          sellDraft: expect.any(Object)
        })
      })
    }));

    const sendPayload = sendMessageMock.mock.calls[0]?.[0];
    expect(sendPayload?.replyMarkup?.inline_keyboard?.[0]?.[0]?.callback_data).toContain(ActionTokens.LS_SAVE);
    expect(sendPayload?.replyMarkup?.inline_keyboard?.[1]?.[0]?.callback_data).toContain(ActionTokens.LS_PUB_CARTIE);
  });

  it('creates B2B REG NEW request with test payload and approve/reject buttons', async () => {
    const result = await runTestScenario(buildCtx('B2B'), 'b2b_reg_new', actor);
    expect(result.ok).toBe(true);
    expect(accessRequestCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          kind: 'NEW_PARTNER',
          test: true,
          testScenario: 'b2b_reg_new',
          createdByAdminTgId: actor.tgUserId
        })
      })
    }));

    const sendPayload = sendMessageMock.mock.calls[0]?.[0];
    expect(sendPayload?.replyMarkup?.inline_keyboard?.[0]?.[0]?.callback_data).toContain(ActionTokens.BR_APPROVE);
    expect(sendPayload?.replyMarkup?.inline_keyboard?.[0]?.[1]?.callback_data).toContain(ActionTokens.BR_REJECT);
  });
});
