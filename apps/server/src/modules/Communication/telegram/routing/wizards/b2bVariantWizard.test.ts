import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionTokens } from '../../core/utils/callbackUtils.js';

const {
  prismaMock,
  telegramOutboxMock
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
  }
}));

vi.mock('../../../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../../messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: telegramOutboxMock
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
});
