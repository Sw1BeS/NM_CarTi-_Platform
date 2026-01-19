import { prisma } from '../../../services/prisma.js';
import { TelegramSender } from '../../../services/telegramSender.js';
import { emitPlatformEvent, summarizeText } from '../events/eventEmitter.js';

type OutboxContext = {
  botId: string;
  token: string;
  chatId: string;
  companyId?: string | null;
  userId?: string | null;
};

type SendMessageParams = OutboxContext & {
  text: string;
  replyMarkup?: any;
  payload?: Record<string, any>;
};

type SendPhotoParams = OutboxContext & {
  photo: string;
  caption: string;
  replyMarkup?: any;
  payload?: Record<string, any>;
};

type EditMessageParams = OutboxContext & {
  messageId: number;
  text: string;
  replyMarkup?: any;
  payload?: Record<string, any>;
};

type SendMediaGroupParams = OutboxContext & {
  media: any[];
  payload?: Record<string, any>;
};

const logOutgoing = async (botId: string, chatId: string, text: string, messageId?: number | null, payload?: any) => {
  try {
    await prisma.$executeRaw`
      INSERT INTO "BotMessage" (id, "botId", "chatId", direction, text, "messageId", payload, "createdAt")
      VALUES (
        gen_random_uuid()::text,
        ${String(botId)},
        ${String(chatId)},
        'OUTGOING',
        ${String(text)},
        ${messageId ?? null},
        ${JSON.stringify(payload || {})}::jsonb,
        NOW()
      )
    `;
  } catch (e) {
    console.error('[TelegramOutbox] Failed to log outgoing message:', e);
  }
};

class TelegramOutbox {
  async sendMessage(params: SendMessageParams) {
    const { botId, token, chatId, text, replyMarkup, payload, companyId, userId } = params;
    const result = await TelegramSender.sendMessage(token, chatId, text, replyMarkup);
    const messageId = (result as any)?.message_id ?? null;
    await logOutgoing(botId, chatId, text, messageId, { markup: replyMarkup, ...(payload || {}) });
    await emitPlatformEvent({
      companyId,
      botId,
      eventType: 'tg.message.outgoing',
      userId,
      chatId,
      payload: {
        messageId,
        text: summarizeText(text)
      }
    });
    return result;
  }

  async sendPhoto(params: SendPhotoParams) {
    const { botId, token, chatId, photo, caption, replyMarkup, payload, companyId, userId } = params;
    const result = await TelegramSender.sendPhoto(token, chatId, photo, caption, replyMarkup);
    const messageId = (result as any)?.message_id ?? null;
    await logOutgoing(botId, chatId, caption, messageId, { markup: replyMarkup, photo, ...(payload || {}) });
    await emitPlatformEvent({
      companyId,
      botId,
      eventType: 'tg.message.outgoing',
      userId,
      chatId,
      payload: {
        messageId,
        text: summarizeText(caption),
        media: 'photo'
      }
    });
    return result;
  }

  async sendMediaGroup(params: SendMediaGroupParams) {
    const { botId, token, chatId, media, payload, companyId, userId } = params;
    const result = await TelegramSender.sendMediaGroup(token, chatId, media);
    const messages = Array.isArray(result) ? result : [];
    for (const msg of messages) {
      const caption = (msg as any)?.caption || '';
      const messageId = (msg as any)?.message_id ?? null;
      await logOutgoing(botId, chatId, caption || '[media_group]', messageId, { media, ...(payload || {}) });
    }
    await emitPlatformEvent({
      companyId,
      botId,
      eventType: 'tg.message.outgoing',
      userId,
      chatId,
      payload: {
        messageId: messages.map((m: any) => m?.message_id).filter(Boolean),
        text: undefined,
        media: 'group'
      }
    });
    return result;
  }

  async editMessageText(params: EditMessageParams) {
    const { botId, token, chatId, messageId, text, replyMarkup, payload, companyId, userId } = params;
    const result = await TelegramSender.editMessageText(token, chatId, messageId, text, replyMarkup);
    await logOutgoing(botId, chatId, text, messageId, { markup: replyMarkup, edit: true, ...(payload || {}) });
    await emitPlatformEvent({
      companyId,
      botId,
      eventType: 'tg.message.outgoing',
      userId,
      chatId,
      payload: {
        messageId,
        text: summarizeText(text),
        edit: true
      }
    });
    return result;
  }

  async sendChatAction(params: OutboxContext & { action: string }) {
    const { token, chatId, action } = params;
    return TelegramSender.sendChatAction(token, chatId, action);
  }

  async answerCallback(params: { token: string; callbackId: string; text?: string }) {
    const { token, callbackId, text } = params;
    return TelegramSender.answerCallback(token, callbackId, text);
  }
}

export const telegramOutbox = new TelegramOutbox();
