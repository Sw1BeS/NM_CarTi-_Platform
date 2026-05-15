import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessageMock = vi.fn();
const findPartnerCompanyMock = vi.fn();
const findBotConfigMock = vi.fn();
const telegramSenderMock = vi.hoisted(() => ({
  getChat: vi.fn(),
  getMe: vi.fn(),
  getChatMember: vi.fn()
}));

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

vi.mock('../modules/Communication/telegram/messaging/telegramSender.js', () => ({
  TelegramSender: telegramSenderMock
}));

describe('b2bRouting.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMessageMock.mockResolvedValue({ ok: true });
    telegramSenderMock.getChat.mockResolvedValue({ type: 'supergroup' });
    telegramSenderMock.getMe.mockResolvedValue({ id: 777000, username: 'relay_bot' });
    telegramSenderMock.getChatMember.mockResolvedValue({ status: 'administrator' });
  });

  it('routes to partner group and central queue via relay bot with isolated message payloads', async () => {
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
      text: 'request.created.default',
      partnerText: 'partner.redacted +380635055252 dealer@example.com',
      centralText: 'central.with.contact'
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(2);

    const sent = sendMessageMock.mock.calls.map((call: any[]) => call[0]);
    const partnerMsg = sent.find((item: any) => item.chatId === '-1003702407477');
    const centralMsg = sent.find((item: any) => item.chatId === '-1003785260526');

    expect(partnerMsg).toBeTruthy();
    expect(centralMsg).toBeTruthy();
    expect(centralMsg.botId).toBe('relay_bot');
    expect(partnerMsg.text).toContain('partner.redacted');
    expect(partnerMsg.text).not.toContain('+380635055252');
    expect(partnerMsg.text).not.toContain('dealer@example.com');
    expect(centralMsg.text).toContain('🏢 Партнер: Dealer Lviv');
    expect(centralMsg.text).toContain('central.with.contact');
  });

  it('skips queue targets when Telegram chat validation fails', async () => {
    findPartnerCompanyMock.mockResolvedValueOnce({
      id: 'partner_invalid',
      name: 'Private Target',
      adminGroupChatId: '12345'
    });
    findBotConfigMock.mockImplementation(async ({ where }: any) => {
      if (where.id === 'b2b_bot') {
        return {
          id: 'b2b_bot',
          token: 'b2b_token',
          companyId: 'cmp_1',
          isEnabled: true,
          config: { b2b: { centralQueueChatId: '67890' } }
        };
      }
      return null;
    });
    telegramSenderMock.getChat.mockResolvedValue({ type: 'private' });

    const { b2bRoutingService } = await import('./b2bRouting.service.js');
    const result = await b2bRoutingService.notifyQueues({
      companyId: 'cmp_1',
      sourceBotId: 'b2b_bot',
      sourceBotToken: 'b2b_token',
      requesterPartnerId: 'partner_invalid',
      text: 'default'
    });

    expect(result.totalSent).toBe(0);
    expect(sendMessageMock).not.toHaveBeenCalled();
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

  it('uses source admin fallback text when partner queue is missing and fallback is enabled', async () => {
    findPartnerCompanyMock.mockResolvedValueOnce({
      id: 'partner_3',
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
      sourceBotAdminChatId: '-1009991112223',
      requesterPartnerId: 'partner_3',
      text: 'default',
      sourceAdminText: 'admin.only',
      includeSourceAdminFallback: true
    });

    const sent = sendMessageMock.mock.calls.map((call: any[]) => call[0]);
    expect(sent.length).toBe(2);
    const fallback = sent.find((item: any) => item.chatId === '-1009991112223');
    expect(fallback).toBeTruthy();
    expect(fallback.text).toBe('admin.only');
  });
});
