import { TelegramSender } from '../../messaging/telegramSender.js';
import type { PipelineContext } from '../types.js';
import { resolveLang, t } from './telegramText.js';
import { normalizeBotConfigChatId } from './telegramChatId.js';

type AccessOk = {
  ok: true;
  adminChatId: string;
  actorId: string;
};

type AccessErr = {
  ok: false;
  errorText: string;
};

export type AdminTestAccessResult = AccessOk | AccessErr;

const ADMIN_STATUSES = new Set(['administrator', 'creator']);

export const assertAdminTestAccess = async (ctx: PipelineContext): Promise<AdminTestAccessResult> => {
  const lang = resolveLang(ctx);
  const cb = ctx.update?.callback_query;
  if (!ctx.bot || !cb) {
    return { ok: false, errorText: t(lang, 'admin.test.err.unavailable') };
  }

  const chat = cb.message?.chat;
  const chatType = String(chat?.type || ctx.chatType || '').toLowerCase();
  if (chatType !== 'group' && chatType !== 'supergroup') {
    return { ok: false, errorText: t(lang, 'admin.test.err.group_only') };
  }

  const adminChatId = normalizeBotConfigChatId(ctx.bot.adminChatId);
  const callbackChatId = String(chat?.id || ctx.chatId || '').trim();
  if (!adminChatId || String(adminChatId) !== callbackChatId) {
    return { ok: false, errorText: t(lang, 'admin.test.err.admin_chat_only') };
  }

  const actorId = String(cb.from?.id || '').trim();
  if (!actorId) {
    return { ok: false, errorText: t(lang, 'admin.test.err.forbidden') };
  }

  try {
    const member = await TelegramSender.getChatMember(ctx.bot.token, String(adminChatId), actorId);
    const status = String((member as any)?.status || '').toLowerCase();
    if (!ADMIN_STATUSES.has(status)) {
      return { ok: false, errorText: t(lang, 'admin.test.err.forbidden') };
    }
    return { ok: true, adminChatId: String(adminChatId), actorId };
  } catch {
    return { ok: false, errorText: t(lang, 'admin.test.err.unavailable') };
  }
};

export const assertConfiguredAdminActionAccess = async (ctx: PipelineContext): Promise<AdminTestAccessResult> => {
  const cb = ctx.update?.callback_query;
  if (!ctx.bot || !cb) {
    return { ok: false, errorText: 'Не вдалося перевірити права для цієї дії.' };
  }

  const chat = cb.message?.chat;
  const chatType = String(chat?.type || ctx.chatType || '').toLowerCase();
  const adminChatId = normalizeBotConfigChatId(ctx.bot.adminChatId);
  const callbackChatId = String(chat?.id || ctx.chatId || '').trim();
  if (!adminChatId || String(adminChatId) !== callbackChatId) {
    return { ok: false, errorText: 'Дія доступна лише в налаштованому admin chat.' };
  }

  const actorId = String(cb.from?.id || '').trim();
  if (!actorId) {
    return { ok: false, errorText: 'Недостатньо прав для цієї дії.' };
  }

  if (chatType === 'private') {
    return actorId === callbackChatId
      ? { ok: true, adminChatId: String(adminChatId), actorId }
      : { ok: false, errorText: 'Недостатньо прав для цієї дії.' };
  }

  if (chatType !== 'group' && chatType !== 'supergroup') {
    return { ok: false, errorText: 'Дія доступна лише в налаштованому admin chat.' };
  }

  try {
    const member = await TelegramSender.getChatMember(ctx.bot.token, String(adminChatId), actorId);
    const status = String((member as any)?.status || '').toLowerCase();
    if (!ADMIN_STATUSES.has(status)) {
      return { ok: false, errorText: 'Лише адміністратори групи можуть виконати цю дію.' };
    }
    return { ok: true, adminChatId: String(adminChatId), actorId };
  } catch {
    return { ok: false, errorText: 'Не вдалося перевірити права для цієї дії.' };
  }
};

export const assertConfiguredAdminGroupActionAccess = async (ctx: PipelineContext): Promise<AdminTestAccessResult> => {
  const cb = ctx.update?.callback_query;
  if (!ctx.bot || !cb) {
    return { ok: false, errorText: 'Не вдалося перевірити права для цієї дії.' };
  }

  const chat = cb.message?.chat;
  const chatType = String(chat?.type || ctx.chatType || '').toLowerCase();
  if (chatType !== 'group' && chatType !== 'supergroup') {
    return { ok: false, errorText: 'Дія доступна лише в налаштованій admin-групі.' };
  }

  const adminChatId = normalizeBotConfigChatId(ctx.bot.adminChatId);
  const callbackChatId = String(chat?.id || ctx.chatId || '').trim();
  if (!adminChatId || String(adminChatId) !== callbackChatId) {
    return { ok: false, errorText: 'Дія доступна лише в налаштованій admin-групі.' };
  }

  const actorId = String(cb.from?.id || '').trim();
  if (!actorId) {
    return { ok: false, errorText: 'Недостатньо прав для цієї дії.' };
  }

  try {
    const member = await TelegramSender.getChatMember(ctx.bot.token, String(adminChatId), actorId);
    const status = String((member as any)?.status || '').toLowerCase();
    if (!ADMIN_STATUSES.has(status)) {
      return { ok: false, errorText: 'Лише адміністратори групи можуть виконати цю дію.' };
    }
    return { ok: true, adminChatId: String(adminChatId), actorId };
  } catch {
    return { ok: false, errorText: 'Не вдалося перевірити права для цієї дії.' };
  }
};
