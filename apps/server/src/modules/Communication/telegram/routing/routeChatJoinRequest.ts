import type { PipelineMiddleware } from '../core/types.js';
import { telegramInviteService } from '../core/telegramInvite.service.js';
import { telegramOutbox } from '../messaging/outbox/telegramOutbox.js';
import { logger } from '../../../../utils/logger.js';

const clean = (value: unknown) => String(value || '').trim();

export const routeChatJoinRequest: PipelineMiddleware = async (ctx, next) => {
  const joinRequest = ctx.update?.chat_join_request;
  if (!joinRequest) {
    return next();
  }

  const bot = ctx.bot;
  if (!bot?.token) {
    return next();
  }

  const chatId = clean(joinRequest.chat?.id);
  const userId = clean(joinRequest.from?.id);
  const username = clean(joinRequest.from?.username);
  const fullName = [clean(joinRequest.from?.first_name), clean(joinRequest.from?.last_name)].filter(Boolean).join(' ').trim();
  const cfg = ((bot.config || {}) as Record<string, any>);
  const autoApprove = Boolean(cfg?.b2b?.autoApproveJoinRequests || cfg?.autoApproveJoinRequests);

  let approved = false;
  if (autoApprove && chatId && userId) {
    try {
      await telegramInviteService.approveChatJoinRequest({
        token: bot.token,
        chatId,
        userId
      });
      approved = true;
    } catch (error) {
      logger.warn('[routeChatJoinRequest] approveChatJoinRequest failed', error);
    }
  }

  if (bot.adminChatId) {
    const adminText = [
      '[B2B REG]',
      approved ? '✅ Join request підтверджено автоматично' : '⏳ Новий chat_join_request',
      `Канал: ${chatId}`,
      `Користувач: ${fullName || '—'}`,
      username ? `Username: @${username.replace(/^@/, '')}` : null,
      `TG User ID: ${userId || '—'}`
    ].filter(Boolean).join('\n');

    await telegramOutbox.sendMessage({
      botId: bot.id,
      token: bot.token,
      chatId: String(bot.adminChatId),
      text: adminText,
      companyId: bot.companyId || null
    }).catch(() => null);
  }

  return next();
};
