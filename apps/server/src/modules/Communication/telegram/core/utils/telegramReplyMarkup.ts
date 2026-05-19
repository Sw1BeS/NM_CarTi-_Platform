import { buildMiniAppUrl } from './miniappUrl.js';
import { sanitizeTelegramUsername } from './telegramChatId.js';

export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel' | 'unknown';

type BotLike = {
  config?: any;
};

type MiniAppDirectLinkIntent = {
  startParam: string;
  writeFlow?: 'request' | 'sell' | 'support';
};

export const isPrivateChatType = (chatType?: string | null) => String(chatType || '') === 'private';

export const isPrivateChatId = (chatId?: string | null) => {
  const value = String(chatId || '').trim();
  return !!value && !value.startsWith('-');
};

const resolveIntentFromMiniAppUrl = (rawUrl?: string | null): MiniAppDirectLinkIntent => {
  const fallback = 'home';
  const value = String(rawUrl || '').trim();
  if (!value) return { startParam: fallback };

  try {
    const url = new URL(value);
    const explicitStart = url.searchParams.get('startapp') || url.searchParams.get('tgWebAppStartParam');
    if (explicitStart) {
      const normalizedStart = explicitStart.toLowerCase();
      if (normalizedStart === 'sell_car' || normalizedStart === 'sell') {
        return { startParam: explicitStart, writeFlow: 'sell' };
      }
      if (normalizedStart === 'view_request' || normalizedStart === 'request') {
        return { startParam: explicitStart, writeFlow: 'request' };
      }
      if (normalizedStart === 'support') {
        return { startParam: explicitStart, writeFlow: 'support' };
      }
      return { startParam: explicitStart };
    }

    const entry = String(url.searchParams.get('entry') || '').trim().toLowerCase();
    const status = String(url.searchParams.get('status') || '').trim().toUpperCase();
    const availabilityState = String(url.searchParams.get('availabilityState') || '').trim().toUpperCase();
    const type = String(url.searchParams.get('type') || url.searchParams.get('requestType') || '').trim().toUpperCase();

    if (entry === 'request' && type === 'SELL') return { startParam: 'sell_car', writeFlow: 'sell' };
    if (entry === 'request') return { startParam: 'view_request', writeFlow: 'request' };
    if (entry === 'inventory' && (availabilityState === 'IN_TRANSIT' || status === 'PENDING')) return { startParam: 'view_transit' };
    if (entry === 'inventory') return { startParam: 'view_inventory' };
    if (entry === 'favorites' || entry === 'favourites') return { startParam: 'view_favorites' };
    if (entry === 'support') return { startParam: 'support', writeFlow: 'support' };
    if (entry === 'status') return { startParam: 'view_status' };
    if (entry === 'profile') return { startParam: 'profile' };
  } catch {
    return { startParam: fallback };
  }

  return { startParam: fallback };
};

const buildPrivateBotLink = (username: string, writeFlow?: MiniAppDirectLinkIntent['writeFlow']) => {
  if (writeFlow === 'sell') return `https://t.me/${username}?start=sell`;
  return `https://t.me/${username}`;
};

const buildTelegramMiniAppDirectLink = (username: string, miniAppUrl?: string | null) => {
  const intent = resolveIntentFromMiniAppUrl(miniAppUrl);
  if (intent.writeFlow) return buildPrivateBotLink(username, intent.writeFlow);
  const startParam = intent.startParam.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'home';
  return `https://t.me/${username}/app?startapp=${encodeURIComponent(startParam)}`;
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
      const deepLink = username ? buildTelegramMiniAppDirectLink(username, miniAppUrl) : miniAppUrl;
      rows.push([{ text: 'Відкрити MiniApp', url: deepLink }]);
    }
  }

  if (!rows.length) return undefined;
  return { inline_keyboard: rows };
};

const hasReplyKeyboard = (replyMarkup: any) => {
  if (!replyMarkup || typeof replyMarkup !== 'object') return false;
  return Array.isArray(replyMarkup.keyboard) || replyMarkup.request_contact || replyMarkup.resize_keyboard;
};

const resolveMiniAppDeepLink = (bot: BotLike, fallbackUrl?: string) => {
  const cfg = (bot?.config || {}) as Record<string, any>;
  const username = sanitizeTelegramUsername(String(cfg.botUsername || cfg.username || ''));
  const miniAppUrl = buildMiniAppUrl(bot as any, {});
  if (username) return buildTelegramMiniAppDirectLink(username, fallbackUrl || miniAppUrl);
  return miniAppUrl || fallbackUrl;
};

const sanitizeInlineWebAppButtons = (replyMarkup: any, bot: BotLike) => {
  if (!replyMarkup || typeof replyMarkup !== 'object') return replyMarkup;
  if (!Array.isArray(replyMarkup.inline_keyboard)) return replyMarkup;

  const inline_keyboard = replyMarkup.inline_keyboard.map((row: any) => {
    if (!Array.isArray(row)) return row;
    return row
      .map((btn: any) => {
        if (!btn || typeof btn !== 'object') return btn;
        if (!btn.web_app) return btn;
        const url = resolveMiniAppDeepLink(bot, btn.web_app?.url);
        if (!url) return { text: btn.text || 'Відкрити MiniApp' };
        const { web_app, ...rest } = btn;
        return { ...rest, url };
      })
      .filter(Boolean);
  });

  return {
    ...replyMarkup,
    inline_keyboard
  };
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
  const sanitized = sanitizeInlineWebAppButtons(replyMarkup, params.bot);
  if (!hasReplyKeyboard(sanitized)) return sanitized;

  return buildOpenBotAndMiniAppKeyboard(params.bot, { preferWebAppButton: false });
};
