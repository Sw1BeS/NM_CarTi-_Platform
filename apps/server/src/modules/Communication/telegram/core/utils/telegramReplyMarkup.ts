import { buildMiniAppUrl } from './miniappUrl.js';
import { sanitizeTelegramUsername } from './telegramChatId.js';

export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel' | 'unknown';

type BotLike = {
  config?: any;
};

export const isPrivateChatType = (chatType?: string | null) => String(chatType || '') === 'private';

export const isPrivateChatId = (chatId?: string | null) => {
  const value = String(chatId || '').trim();
  return !!value && !value.startsWith('-');
};

export const resolveChatTypeFromUpdate = (update: any): TelegramChatType => {
  const chatType = update?.message?.chat?.type
    || update?.callback_query?.message?.chat?.type
    || update?.channel_post?.chat?.type
    || update?.edited_message?.chat?.type;

  if (chatType === 'private' || chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
    return chatType;
  }

  return 'unknown';
};

export const buildOpenBotAndMiniAppKeyboard = (
  bot: BotLike,
  opts: { preferWebAppButton?: boolean } = {}
) => {
  const cfg = (bot?.config || {}) as Record<string, any>;
  const username = sanitizeTelegramUsername(String(cfg.botUsername || cfg.username || ''));
  const miniAppUrl = buildMiniAppUrl(bot as any, {});

  const rows: Array<Array<Record<string, any>>> = [];
  if (username) {
    rows.push([{ text: 'Відкрити бота', url: `https://t.me/${username}` }]);
  }

  if (miniAppUrl) {
    if (opts.preferWebAppButton) {
      rows.push([{ text: 'Відкрити MiniApp', web_app: { url: miniAppUrl } }]);
    } else {
      rows.push([{ text: 'Відкрити MiniApp', url: miniAppUrl }]);
    }
  }

  if (!rows.length) return undefined;
  return { inline_keyboard: rows };
};

const hasReplyKeyboard = (replyMarkup: any) => {
  if (!replyMarkup || typeof replyMarkup !== 'object') return false;
  return Array.isArray(replyMarkup.keyboard) || replyMarkup.request_contact || replyMarkup.resize_keyboard;
};

export const resolveReplyMarkupForChat = (params: {
  replyMarkup?: any;
  bot: BotLike;
  chatType?: string | null;
  chatId?: string | null;
}) => {
  const { replyMarkup } = params;
  if (!replyMarkup) return replyMarkup;

  const isPrivate = params.chatType
    ? isPrivateChatType(params.chatType)
    : isPrivateChatId(params.chatId);

  if (isPrivate) return replyMarkup;
  if (!hasReplyKeyboard(replyMarkup)) return replyMarkup;

  return buildOpenBotAndMiniAppKeyboard(params.bot, { preferWebAppButton: true });
};
