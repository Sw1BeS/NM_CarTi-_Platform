import { prisma } from './prisma.js';
import { telegramOutbox } from '../modules/Communication/telegram/messaging/outbox/telegramOutbox.js';

const DEFAULT_CENTRAL_QUEUE_CHAT_ID = '-1003785260526';
const DEFAULT_CENTRAL_RELAY_BOT_ID = 'cmlz1iy8500x9swgppukznbui';

export type NotifyB2bQueuesInput = {
  companyId?: string | null;
  sourceBotId: string;
  sourceBotToken: string;
  sourceBotAdminChatId?: string | null;
  requesterPartnerId?: string | null;
  text: string;
  replyMarkup?: any;
  includeSourceAdminFallback?: boolean;
};

const normalizeChat = (chatId?: string | null) => {
  const value = String(chatId || '').trim();
  return value || null;
};

const withPartnerPrefix = (partnerName: string | null | undefined, text: string) => {
  const safeName = String(partnerName || 'невідомий партнер').trim();
  return `🏢 Партнер: ${safeName}\n\n${text}`;
};

const resolveCentralTarget = async (params: {
  sourceBotId: string;
  companyId?: string | null;
}) => {
  const sourceBot = await prisma.botConfig.findUnique({
    where: { id: params.sourceBotId },
    select: {
      id: true,
      config: true,
      companyId: true,
      isEnabled: true,
      token: true
    }
  });

  if (!sourceBot?.token) {
    return null;
  }

  const b2bCfg = (((sourceBot.config as any) || {}).b2b || {}) as Record<string, any>;
  const centralQueueChatId = normalizeChat(String(b2bCfg.centralQueueChatId || DEFAULT_CENTRAL_QUEUE_CHAT_ID));
  const relayBotId = String(b2bCfg.centralRelayBotId || DEFAULT_CENTRAL_RELAY_BOT_ID).trim() || DEFAULT_CENTRAL_RELAY_BOT_ID;

  if (!centralQueueChatId) return null;

  const relayBot = await prisma.botConfig.findUnique({
    where: { id: relayBotId },
    select: {
      id: true,
      token: true,
      companyId: true,
      isEnabled: true
    }
  });

  if (relayBot?.token && relayBot.isEnabled) {
    return {
      botId: relayBot.id,
      token: relayBot.token,
      companyId: relayBot.companyId || params.companyId || sourceBot.companyId,
      chatId: centralQueueChatId
    };
  }

  return {
    botId: sourceBot.id,
    token: sourceBot.token,
    companyId: sourceBot.companyId || params.companyId,
    chatId: centralQueueChatId
  };
};

class B2bRoutingService {
  async notifyQueues(input: NotifyB2bQueuesInput) {
    const partner = input.requesterPartnerId
      ? await prisma.partnerCompany.findUnique({
        where: { id: input.requesterPartnerId },
        select: { id: true, name: true, adminGroupChatId: true }
      })
      : null;

    const partnerChatId = normalizeChat(partner?.adminGroupChatId);
    const centralTarget = await resolveCentralTarget({
      sourceBotId: input.sourceBotId,
      companyId: input.companyId || null
    });

    const targets: Array<{ botId: string; token: string; companyId?: string | null; chatId: string; text: string }> = [];

    if (partnerChatId) {
      targets.push({
        botId: input.sourceBotId,
        token: input.sourceBotToken,
        companyId: input.companyId || null,
        chatId: partnerChatId,
        text: input.text
      });
    }

    if (centralTarget) {
      targets.push({
        botId: centralTarget.botId,
        token: centralTarget.token,
        companyId: centralTarget.companyId,
        chatId: centralTarget.chatId,
        text: withPartnerPrefix(partner?.name, input.text)
      });
    }

    if (input.includeSourceAdminFallback && !partnerChatId) {
      const fallbackChatId = normalizeChat(input.sourceBotAdminChatId);
      if (fallbackChatId) {
        targets.push({
          botId: input.sourceBotId,
          token: input.sourceBotToken,
          companyId: input.companyId || null,
          chatId: fallbackChatId,
          text: input.text
        });
      }
    }

    const sent = new Set<string>();
    let totalSent = 0;
    for (const target of targets) {
      const key = `${target.botId}:${target.chatId}`;
      if (sent.has(key)) continue;
      sent.add(key);

      await telegramOutbox.sendMessage({
        botId: target.botId,
        token: target.token,
        chatId: target.chatId,
        text: target.text,
        replyMarkup: input.replyMarkup,
        companyId: target.companyId || input.companyId || null
      }).catch(() => null);
      totalSent += 1;
    }

    return {
      totalSent,
      partnerChatId,
      centralChatId: centralTarget?.chatId || null,
      partnerName: partner?.name || null
    };
  }
}

export const b2bRoutingService = new B2bRoutingService();
