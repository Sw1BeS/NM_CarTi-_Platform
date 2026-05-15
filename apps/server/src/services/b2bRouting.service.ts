import { prisma } from './prisma.js';
import { telegramOutbox } from '../modules/Communication/telegram/messaging/outbox/telegramOutbox.js';
import { TelegramSender } from '../modules/Communication/telegram/messaging/telegramSender.js';

const DEFAULT_CENTRAL_QUEUE_CHAT_ID = '-1003785260526';
const DEFAULT_CENTRAL_RELAY_BOT_ID = 'cmlz1iy8500x9swgppukznbui';

export type NotifyB2bQueuesInput = {
  companyId?: string | null;
  sourceBotId: string;
  sourceBotToken: string;
  sourceBotAdminChatId?: string | null;
  requesterPartnerId?: string | null;
  text: string;
  partnerText?: string;
  centralText?: string;
  sourceAdminText?: string;
  replyMarkup?: any;
  includeSourceAdminFallback?: boolean;
  allowPartnerContactDisclosure?: boolean;
};

const QUEUE_CHAT_TYPES = new Set(['group', 'supergroup']);
const BOT_MEMBER_STATUSES = new Set(['administrator', 'creator', 'member']);

const normalizeChat = (chatId?: string | null) => {
  const value = String(chatId || '').trim();
  return value || null;
};

const withPartnerPrefix = (partnerName: string | null | undefined, text: string) => {
  const safeName = String(partnerName || 'невідомий партнер').trim();
  return `🏢 Партнер: ${safeName}\n\n${text}`;
};

const redactContactText = (text: string) => String(text || '')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contact hidden]')
  .replace(/(?:\+?\d[\s().-]*){9,16}/g, '[contact hidden]');

const validateQueueTarget = async (target: { token: string; chatId: string }) => {
  try {
    const chat = await TelegramSender.getChat(target.token, target.chatId);
    const chatType = String((chat as any)?.type || '').toLowerCase();
    if (!QUEUE_CHAT_TYPES.has(chatType)) return false;

    const me = await TelegramSender.getMe(target.token);
    const botUserId = (me as any)?.id;
    if (!botUserId) return false;

    const member = await TelegramSender.getChatMember(target.token, target.chatId, botUserId);
    const status = String((member as any)?.status || '').toLowerCase();
    return BOT_MEMBER_STATUSES.has(status);
  } catch {
    return false;
  }
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
    const partnerText = input.allowPartnerContactDisclosure
      ? (input.partnerText || input.text)
      : redactContactText(input.partnerText || input.text);
    const centralBaseText = input.centralText || input.text;
    const sourceAdminText = input.sourceAdminText || input.text;

    if (partnerChatId) {
      targets.push({
        botId: input.sourceBotId,
        token: input.sourceBotToken,
        companyId: input.companyId || null,
        chatId: partnerChatId,
        text: partnerText
      });
    }

    if (centralTarget) {
      targets.push({
        botId: centralTarget.botId,
        token: centralTarget.token,
        companyId: centralTarget.companyId,
        chatId: centralTarget.chatId,
        text: withPartnerPrefix(partner?.name, centralBaseText)
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
          text: sourceAdminText
        });
      }
    }

    const sent = new Set<string>();
    let totalSent = 0;
    for (const target of targets) {
      const key = `${target.botId}:${target.chatId}`;
      if (sent.has(key)) continue;
      sent.add(key);

      const validTarget = await validateQueueTarget(target);
      if (!validTarget) continue;

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
