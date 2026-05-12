import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionTokens } from '../../core/utils/callbackUtils.js';

const {
  prismaMock,
  telegramOutboxMock,
  quotaServiceMock,
  publicIdServiceMock
} = vi.hoisted(() => ({
  prismaMock: {
    botSession: {
      update: vi.fn()
    },
    b2bRequest: {
      create: vi.fn()
    },
    partnerUser: {
      findFirst: vi.fn()
    },
    botConfig: {
      update: vi.fn()
    }
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  quotaServiceMock: {
    consume: vi.fn()
  },
  publicIdServiceMock: {
    nextB2bRequestId: vi.fn()
  }
}));

vi.mock('../../../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../../../../../services/quota.service.js', () => ({
  quotaService: quotaServiceMock
}));

vi.mock('../../../../../services/publicId.service.js', () => ({
  publicIdService: publicIdServiceMock
}));

vi.mock('../../messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: telegramOutboxMock
}));

describe('b2bRequestWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaServiceMock.consume.mockResolvedValue({ allowed: true });
    publicIdServiceMock.nextB2bRequestId.mockResolvedValue('CD-2026-000123');
    prismaMock.botSession.update.mockImplementation(async ({ data }: any) => ({
      id: 'session_1',
      state: data.state,
      variables: data.variables,
      lastActive: data.lastActive
    }));
    prismaMock.b2bRequest.create.mockImplementation(async ({ data }: any) => ({
      id: 'request_1',
      publicId: data.publicId,
      title: data.title,
      payload: data.payload,
      yearMin: data.yearMin,
      yearMax: data.yearMax,
      budgetMax: data.budgetMax,
      description: data.description
    }));
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 10 });
  });

  it('publishes B2B requests with a CD public id used by channel deep links', async () => {
    const { handleB2BReqCallback } = await import('./b2bRequestWizard.js');
    const ctx: any = {
      bot: {
        id: 'bot_b2b',
        token: 'token',
        channelId: '-100123',
        adminChatId: '-100999',
        config: { botUsername: 'CarDealer_Lviv_Bot' }
      },
      companyId: 'company_1',
      chatId: '1001',
      userId: '1001',
      chatType: 'private',
      update: {
        callback_query: {
          from: {
            id: 1001,
            first_name: 'Dealer',
            username: 'dealer_one'
          }
        }
      },
      session: {
        id: 'session_1',
        state: 'BQ_REVIEW',
        variables: {
          b2bPartnerId: 'partner_1',
          b2bPartnerName: 'Dealer One',
          b2bRequestDraft: {
            step: 9,
            data: {
              brand: 'BMW',
              model: 'X5',
              yearMin: 2020,
              yearMax: 2024,
              budgetMax: 70000,
              mileageMax: 120000,
              fuel: 'Дизель',
              note: 'Потрібен доглянутий',
              contact: '+380635055252'
            },
            history: []
          }
        }
      }
    };

    const handled = await handleB2BReqCallback(ctx, ActionTokens.BQ_PUB);

    expect(handled).toBe(true);
    expect(publicIdServiceMock.nextB2bRequestId).toHaveBeenCalledWith('CD');
    expect(prismaMock.b2bRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        publicId: 'CD-2026-000123',
        requesterPartnerId: 'partner_1',
        title: 'BMW X5'
      })
    }));
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '-100123',
      replyMarkup: expect.objectContaining({
        inline_keyboard: [[
          expect.objectContaining({ text: 'Є авто', callback_data: 'v1:bv_send:CD-2026-000123' }),
          expect.objectContaining({ text: 'Відкрити в боті', url: 'https://t.me/CarDealer_Lviv_Bot?start=b2bv_CD-2026-000123' })
        ]]
      })
    }));
  });
});
