import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionTokens } from '../../core/utils/callbackUtils.js';

const {
  prismaMock,
  telegramOutboxMock,
  b2bWhitelistServiceMock
} = vi.hoisted(() => ({
  prismaMock: {
    botSession: {
      update: vi.fn(),
      upsert: vi.fn()
    },
    requestVariant: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    b2bRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn()
    },
    partnerUser: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    }
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  b2bWhitelistServiceMock: {
    resolveParticipant: vi.fn()
  }
}));

vi.mock('../../../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../../messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: telegramOutboxMock
}));

vi.mock('../../../../../services/b2bWhitelist.service.js', () => ({
  b2bWhitelistService: b2bWhitelistServiceMock
}));

describe('b2bVariantWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 10 });
    prismaMock.requestVariant.findUnique.mockResolvedValue({
      id: 'variant_1',
      title: 'BMW X5 варіант',
      price: 62000,
      contact: '+380501112233',
      companyName: 'Seller Dealer',
      sellerPartner: { name: 'Seller Dealer', contact: '+380501112233' },
      request: {
        id: 'request_1',
        publicId: 'CD-2026-000123',
        payload: {
          request: {
            contact: '+380635055252',
            phone: '+380635055252',
            companyName: 'Requester Dealer'
          }
        }
      }
    });
    prismaMock.requestVariant.update.mockResolvedValue({
      id: 'variant_1',
      requesterDecision: 'FIT',
      status: 'APPROVED',
      fitQueueStatus: 'NEW'
    });
    b2bWhitelistServiceMock.resolveParticipant.mockResolvedValue({
      allowed: true,
      partnerUser: { id: 'partner_user_1' },
      partnerCompany: { id: 'requester_partner_1', name: 'Requester Dealer' }
    });
  });

  it('handles requester FIT callback without an active variant draft and sends admin full contacts', async () => {
    const { handleB2BVariantCallback } = await import('./b2bVariantWizard.js');
    const ctx: any = {
      bot: {
        id: 'bot_b2b',
        token: 'token',
        adminChatId: '-100999'
      },
      companyId: 'company_1',
      chatId: '1001',
      userId: '1001',
      chatType: 'private',
      update: {
        callback_query: {
          from: {
            id: 1001,
            first_name: 'Requester',
            username: 'requester_one'
          }
        }
      },
      session: {
        id: 'session_1',
        state: 'B2B_MENU',
        variables: {}
      }
    };

    const handled = await handleB2BVariantCallback(ctx, ActionTokens.BV_FIT, 'variant_1');

    expect(handled).toBe(true);
    expect(prismaMock.requestVariant.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'variant_1' },
      data: expect.objectContaining({
        requesterDecision: 'FIT',
        status: 'APPROVED',
        fitQueueStatus: 'NEW'
      })
    }));
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      text: expect.stringContaining('Контакт автора: +380635055252')
    }));
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999',
      text: expect.stringContaining('Контакт продавця: +380501112233')
    }));
  });

  it('rejects FIT callback from a different partner and does not reveal contacts', async () => {
    prismaMock.requestVariant.findUnique.mockResolvedValueOnce({
      id: 'variant_1',
      title: 'BMW X5 варіант',
      price: 62000,
      contact: '+380501112233',
      sellerPartner: { name: 'Seller Dealer', contact: '+380501112233' },
      request: {
        id: 'request_1',
        publicId: 'CD-2026-000123',
        requesterPartnerId: 'requester_partner_1',
        payload: {
          request: {
            contact: '+380635055252'
          }
        }
      }
    });
    b2bWhitelistServiceMock.resolveParticipant.mockResolvedValueOnce({
      allowed: true,
      partnerUser: { id: 'partner_user_2' },
      partnerCompany: { id: 'other_partner_2', name: 'Other Dealer' }
    });
    const { handleB2BVariantCallback } = await import('./b2bVariantWizard.js');

    const handled = await handleB2BVariantCallback({
      bot: { id: 'bot_b2b', token: 'token', adminChatId: '-100999' },
      companyId: 'company_1',
      chatId: '2002',
      userId: '2002',
      chatType: 'private',
      update: {
        callback_query: {
          from: { id: 2002, first_name: 'Other', username: 'other_dealer' }
        }
      },
      session: {
        id: 'session_2',
        state: 'B2B_MENU',
        variables: {}
      }
    } as any, ActionTokens.BV_FIT, 'variant_1');

    expect(handled).toBe(true);
    expect(prismaMock.requestVariant.update).not.toHaveBeenCalled();
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '2002',
      text: expect.stringMatching(/автор|доступ|варіант/i)
    }));
    expect(telegramOutboxMock.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100999'
    }));
  });
});
