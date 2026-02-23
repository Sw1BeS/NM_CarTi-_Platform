import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendMessageMock,
  isB2BBotMock,
  resolveParticipantMock,
  approveNewPartnerRequestMock,
  buildBestEffortInviteLinkMock
} = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  isB2BBotMock: vi.fn(),
  resolveParticipantMock: vi.fn(),
  approveNewPartnerRequestMock: vi.fn(),
  buildBestEffortInviteLinkMock: vi.fn()
}));

vi.mock('../adapters/telegram.adapter.js', () => ({
  sendMessage: sendMessageMock
}));

vi.mock('../../../../../services/b2bRegistration.service.js', () => ({
  b2bRegistrationService: {
    isB2BBot: isB2BBotMock,
    resolveParticipant: resolveParticipantMock,
    approveNewPartnerRequest: approveNewPartnerRequestMock,
    rejectAccessRequest: vi.fn(),
    getAccessRequestById: vi.fn(),
    registerAgentByPartnerCode: vi.fn(),
    createNewPartnerRequest: vi.fn()
  }
}));

vi.mock('../../../telegram/core/telegramInvite.service.js', () => ({
  telegramInviteService: {
    buildBestEffortInviteLink: buildBestEffortInviteLinkMock
  }
}));

import {
  ensureB2BRegistrationGate,
  handleB2BRegistrationCallback
} from './b2b-registration.actions.js';

describe('b2b-registration actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMessageMock.mockResolvedValue({ ok: true });
  });

  it('blocks unregistered users from B2B flows (request/variant/inventory)', async () => {
    isB2BBotMock.mockReturnValue(true);
    resolveParticipantMock.mockResolvedValue({
      allowed: false,
      partnerCompany: null,
      partnerUser: null
    });

    const vars: Record<string, any> = { __telegramUserId: '1001' };
    const blocked = await ensureB2BRegistrationGate({
      bot: {
        id: 'bot_b2b',
        token: 'token',
        companyId: 'cmp_1',
        adminChatId: '9000',
        config: { presetTemplate: 'B2B' }
      } as any,
      chatId: '1001',
      userId: '1001',
      vars,
      reason: 'Створити запит'
    });

    expect(blocked).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      '1001',
      expect.stringContaining('потрібна реєстрація'),
      expect.anything()
    );
  });

  it('approve callback includes partnerCode and invite link for owner', async () => {
    approveNewPartnerRequestMock.mockResolvedValue({
      accessRequest: {
        id: 'ar_1',
        tgUserId: '1002'
      },
      payload: {
        chatId: '1002',
        company: { name: 'Dealer One' },
        applicant: { firstName: 'Іван', lastName: 'Власник', contact: '+380671111111' }
      },
      partnerCompany: {
        id: 'pc_1',
        name: 'Dealer One',
        partnerCode: 'P-ABCDEFGH'
      },
      partnerUser: {
        id: 'pu_1',
        name: 'Іван Власник',
        role: 'OWNER'
      }
    });
    buildBestEffortInviteLinkMock.mockResolvedValue('https://t.me/+invite-link');

    const handled = await handleB2BRegistrationCallback({
      bot: {
        id: 'bot_b2b',
        token: 'token',
        companyId: 'cmp_1',
        adminChatId: '9000',
        channelId: '-100123456',
        config: { presetTemplate: 'B2B' }
      } as any,
      chatId: '9000',
      userId: '9000',
      vars: {},
      callbackData: 'B2BREG:APPROVE:ar_1'
    });

    expect(handled).toBe(true);
    expect(buildBestEffortInviteLinkMock).toHaveBeenCalled();

    const ownerMessageCall = sendMessageMock.mock.calls.find((call) => call[1] === '1002');
    expect(ownerMessageCall).toBeTruthy();
    expect(String(ownerMessageCall?.[2] || '')).toContain('Код партнера: P-ABCDEFGH');
    expect(String(ownerMessageCall?.[2] || '')).toContain('https://t.me/+invite-link');
  });
});
