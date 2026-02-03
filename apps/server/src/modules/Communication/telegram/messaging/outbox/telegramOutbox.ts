import { prisma } from '../../../../../services/prisma.js';
import { TelegramSender } from '../telegramSender.js';
import { emitPlatformEvent, summarizeText } from '../../core/events/eventEmitter.js';
import { logger } from '../../../../../utils/logger.js';
import { logIntegrationEvent } from '../../../../../services/integrationEventLog.service.js';

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

type SendFileParams = OutboxContext & {
  file: string;
  caption?: string;
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
    logger.error('[TelegramOutbox] Failed to log outgoing message:', e);
  }
};

const logTelegramMetric = async (input: {
  companyId?: string | null;
  botId: string;
  action: 'message.sent' | 'message.failed';
  status: 'OK' | 'ERROR';
  message?: string;
  meta?: Record<string, any>;
}) => {
  try {
    await logIntegrationEvent({
      companyId: input.companyId || undefined,
      integration: 'TELEGRAM',
      entityId: input.botId,
      action: input.action,
      status: input.status,
      message: input.message,
      meta: {
        botId: input.botId,
        ...(input.meta || {})
      }
    });
  } catch (e) {
    logger.warn('[TelegramOutbox] Failed to log integration event:', e);
  }
};

class TelegramOutbox {
  async sendMessage(params: SendMessageParams) {
    const { botId, token, chatId, text, replyMarkup, payload, companyId, userId } = params;
    try {
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
      await logTelegramMetric({
        companyId,
        botId,
        action: 'message.sent',
        status: 'OK',
        meta: { chatId, messageId }
      });
      return result;
    } catch (e: any) {
      await logTelegramMetric({
        companyId,
        botId,
        action: 'message.failed',
        status: 'ERROR',
        message: e?.message || 'Failed to send message',
        meta: { chatId }
      });
      throw e;
    }
  }

  private async sendAndLog(kind: string, sender: () => Promise<any>, ctx: OutboxContext, caption?: string, extra?: any) {
    try {
      const result = await sender();
      const messageId = Array.isArray(result) ? result[0]?.message_id : result?.message_id;
      await logOutgoing(ctx.botId, ctx.chatId, caption || `[${kind}]`, messageId, extra);
      await emitPlatformEvent({
        companyId: ctx.companyId,
        botId: ctx.botId,
        eventType: 'tg.message.outgoing',
        userId: ctx.userId,
        chatId: ctx.chatId,
        payload: {
          messageId,
          text: summarizeText(caption || `[${kind}]`),
          media: kind
        }
      });
      await logTelegramMetric({
        companyId: ctx.companyId,
        botId: ctx.botId,
        action: 'message.sent',
        status: 'OK',
        meta: { chatId: ctx.chatId, messageId, media: kind }
      });
      return result;
    } catch (e: any) {
      await logTelegramMetric({
        companyId: ctx.companyId,
        botId: ctx.botId,
        action: 'message.failed',
        status: 'ERROR',
        message: e?.message || 'Failed to send message',
        meta: { chatId: ctx.chatId, media: kind }
      });
      throw e;
    }
  }

  async sendPhoto(params: SendPhotoParams) {
    const { botId, token, chatId, photo, caption, replyMarkup, payload, companyId, userId } = params;
    try {
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
      await logTelegramMetric({
        companyId,
        botId,
        action: 'message.sent',
        status: 'OK',
        meta: { chatId, messageId, media: 'photo' }
      });
      return result;
    } catch (e: any) {
      await logTelegramMetric({
        companyId,
        botId,
        action: 'message.failed',
        status: 'ERROR',
        message: e?.message || 'Failed to send message',
        meta: { chatId, media: 'photo' }
      });
      throw e;
    }
  }

  async sendDocument(params: SendFileParams) {
    const { botId, token, chatId, file, caption, replyMarkup, payload, companyId, userId } = params;
    return this.sendAndLog('document',
      () => TelegramSender.sendDocument(token, chatId, file, caption, replyMarkup),
      { botId, token, chatId, companyId, userId },
      caption,
      { markup: replyMarkup, document: file, ...(payload || {}) }
    );
  }

  async sendVideo(params: SendFileParams) {
    const { botId, token, chatId, file, caption, replyMarkup, payload, companyId, userId } = params;
    return this.sendAndLog('video',
      () => TelegramSender.sendVideo(token, chatId, file, caption, replyMarkup),
      { botId, token, chatId, companyId, userId },
      caption,
      { markup: replyMarkup, video: file, ...(payload || {}) }
    );
  }

  async sendAudio(params: SendFileParams) {
    const { botId, token, chatId, file, caption, replyMarkup, payload, companyId, userId } = params;
    return this.sendAndLog('audio',
      () => TelegramSender.sendAudio(token, chatId, file, caption, replyMarkup),
      { botId, token, chatId, companyId, userId },
      caption,
      { markup: replyMarkup, audio: file, ...(payload || {}) }
    );
  }

  async sendVoice(params: SendFileParams) {
    const { botId, token, chatId, file, caption, replyMarkup, payload, companyId, userId } = params;
    return this.sendAndLog('voice',
      () => TelegramSender.sendVoice(token, chatId, file, caption, replyMarkup),
      { botId, token, chatId, companyId, userId },
      caption,
      { markup: replyMarkup, voice: file, ...(payload || {}) }
    );
  }

  async sendAnimation(params: SendFileParams) {
    const { botId, token, chatId, file, caption, replyMarkup, payload, companyId, userId } = params;
    return this.sendAndLog('animation',
      () => TelegramSender.sendAnimation(token, chatId, file, caption, replyMarkup),
      { botId, token, chatId, companyId, userId },
      caption,
      { markup: replyMarkup, animation: file, ...(payload || {}) }
    );
  }

  async sendSticker(params: SendFileParams) {
    const { botId, token, chatId, file, payload, companyId, userId } = params;
    return this.sendAndLog('sticker',
      () => TelegramSender.sendSticker(token, chatId, file),
      { botId, token, chatId, companyId, userId },
      '[sticker]',
      { sticker: file, ...(payload || {}) }
    );
  }

  async sendMediaGroup(params: SendMediaGroupParams) {
    const { botId, token, chatId, media, payload, companyId, userId } = params;
    try {
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
      await logTelegramMetric({
        companyId,
        botId,
        action: 'message.sent',
        status: 'OK',
        meta: { chatId, messageId: messages.map((m: any) => m?.message_id).filter(Boolean), media: 'group' }
      });
      return result;
    } catch (e: any) {
      await logTelegramMetric({
        companyId,
        botId,
        action: 'message.failed',
        status: 'ERROR',
        message: e?.message || 'Failed to send message',
        meta: { chatId, media: 'group' }
      });
      throw e;
    }
  }

  async editMessageText(params: EditMessageParams) {
    const { botId, token, chatId, messageId, text, replyMarkup, payload, companyId, userId } = params;
    try {
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
      await logTelegramMetric({
        companyId,
        botId,
        action: 'message.sent',
        status: 'OK',
        meta: { chatId, messageId, edit: true }
      });
      return result;
    } catch (e: any) {
      await logTelegramMetric({
        companyId,
        botId,
        action: 'message.failed',
        status: 'ERROR',
        message: e?.message || 'Failed to edit message',
        meta: { chatId, messageId, edit: true }
      });
      throw e;
    }
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
