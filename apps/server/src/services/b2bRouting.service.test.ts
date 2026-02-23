import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessageMock = vi.fn();
const findPartnerCompanyMock = vi.fn();
const findBotConfigMock = vi.fn();

vi.mock('./prisma.js', () => ({
  prisma: {
    partnerCompany: {
      findUnique: findPartnerCompanyMock
    },
    botConfig: {
      findUnique: findBotConfigMock
    }
  }
}));

vi.mock('../modules/Communication/telegram/messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: {
    sendMessage: sendMessageMock
  }
}));

describe('b2bRouting.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMessageMock.mockResolvedValue({ ok: true });
  });

  it('routes to partner group and central queue via relay bot', async () => {
    findPartnerCompanyMock.mockResolvedValueOnce({
      id: 'partner_1',
      name: 'Dealer Lviv',
      adminGroupChatId: '-1003702407477'
    });

    findBotConfigMock.mockImplementation(async ({ where }: any) => {
      if (where.id === 'b2b_bot') {
        return {
          id: 'b2b_bot',
          token: 'b2b_token',
          companyId: 'cmp_1',
          isEnabled: true,
          config: {
            b2b: {
              centralQueueChatId: '-1003785260526',
              centralRelayBotId: 'relay_bot'
            }
          }
        };
      }
      if (where.id === 'relay_bot') {
        return {
          id: 'relay_bot',
          token: 'relay_token',
          companyId: 'cmp_1',
          isEnabled: true
        };
      }
      return null;
    });

    const { b2bRoutingService } = await import('./b2bRouting.service.js');
    await b2bRoutingService.notifyQueues({
      companyId: 'cmp_1',
      sourceBotId: 'b2b_bot',
      sourceBotToken: 'b2b_token',
      requesterPartnerId: 'partner_1',
      text: 'request.created'
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(2);

    const first = sendMessageMock.mock.calls[0][0];
    const second = sendMessageMock.mock.calls[1][0];

    expect([first.chatId, second.chatId]).toContain('-1003702407477');
    expect([first.chatId, second.chatId]).toContain('-1003785260526');
    expect([first.botId, second.botId]).toContain('relay_bot');
  });

  it('sends only central queue when partner group is missing', async () => {
    findPartnerCompanyMock.mockResolvedValueOnce({
      id: 'partner_2',
      name: 'No Group Partner',
      adminGroupChatId: null
    });

    findBotConfigMock.mockImplementation(async ({ where }: any) => {
      if (where.id === 'b2b_bot') {
        return {
          id: 'b2b_bot',
          token: 'b2b_token',
          companyId: 'cmp_1',
          isEnabled: true,
          config: {
            b2b: {
              centralQueueChatId: '-1003785260526',
              centralRelayBotId: 'relay_bot'
            }
          }
        };
      }
      if (where.id === 'relay_bot') {
        return {
          id: 'relay_bot',
          token: 'relay_token',
          companyId: 'cmp_1',
          isEnabled: true
        };
      }
      return null;
    });

    const { b2bRoutingService } = await import('./b2bRouting.service.js');
    await b2bRoutingService.notifyQueues({
      companyId: 'cmp_1',
      sourceBotId: 'b2b_bot',
      sourceBotToken: 'b2b_token',
      requesterPartnerId: 'partner_2',
      text: 'variant.fit_marked'
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock.mock.calls[0][0].chatId).toBe('-1003785260526');
    expect(sendMessageMock.mock.calls[0][0].botId).toBe('relay_bot');
  });
});
