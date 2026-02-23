export type TelegramChatIdKind =
  | 'dialog_channel_or_supergroup'
  | 'dialog_group'
  | 'dialog_private_or_basic'
  | 'mtproto_peer_channel_or_supergroup'
  | 'invalid';

export type NormalizeTelegramChatIdResult = {
  raw: string;
  normalized: string | null;
  kind: TelegramChatIdKind;
  converted: boolean;
};

const POSITIVE_RE = /^\d+$/;
const NEGATIVE_RE = /^-\d+$/;

export const isTelegramChannelOrSupergroupDialogId = (chatId?: string | null) => {
  const value = String(chatId || '').trim();
  return /^-100\d{5,}$/.test(value);
};

export const sanitizeTelegramUsername = (raw?: string | null) => {
  return String(raw || '').trim().replace(/^@/, '');
};

export const normalizeTelegramChatId = (
  rawValue: unknown,
  opts: { forceDialogForPositive?: boolean } = {}
): NormalizeTelegramChatIdResult => {
  const raw = String(rawValue ?? '').trim();
  if (!raw) {
    return { raw, normalized: null, kind: 'invalid', converted: false };
  }

  if (isTelegramChannelOrSupergroupDialogId(raw)) {
    return { raw, normalized: raw, kind: 'dialog_channel_or_supergroup', converted: false };
  }

  if (NEGATIVE_RE.test(raw)) {
    return { raw, normalized: raw, kind: 'dialog_group', converted: false };
  }

  if (!POSITIVE_RE.test(raw)) {
    return { raw, normalized: null, kind: 'invalid', converted: false };
  }

  const shouldConvertToDialog = raw.length >= 10;
  if (!shouldConvertToDialog) {
    return { raw, normalized: raw, kind: 'dialog_private_or_basic', converted: false };
  }

  return {
    raw,
    normalized: `-100${raw}`,
    kind: 'mtproto_peer_channel_or_supergroup',
    converted: true
  };
};

export const normalizeBotConfigChatId = (rawValue: unknown) => {
  const normalized = normalizeTelegramChatId(rawValue, { forceDialogForPositive: true });
  return normalized.normalized;
};

export const toTelegramChannelInternalId = (chatId: string | null | undefined) => {
  const normalized = normalizeTelegramChatId(chatId, { forceDialogForPositive: true }).normalized;
  if (!normalized || !isTelegramChannelOrSupergroupDialogId(normalized)) return null;
  return normalized.slice(4);
};

export const buildTelegramChannelPostUrl = (params: {
  chatId?: string | null;
  messageId?: number | string | null;
  username?: string | null;
}) => {
  const messageId = Number(params.messageId || 0);
  if (!Number.isFinite(messageId) || messageId <= 0) return null;

  const normalized = normalizeTelegramChatId(params.chatId, { forceDialogForPositive: true }).normalized;
  if (normalized && isTelegramChannelOrSupergroupDialogId(normalized)) {
    return `https://t.me/c/${normalized.slice(4)}/${messageId}`;
  }

  const username = sanitizeTelegramUsername(params.username);
  if (username) {
    return `https://t.me/${username}/${messageId}`;
  }

  return null;
};
