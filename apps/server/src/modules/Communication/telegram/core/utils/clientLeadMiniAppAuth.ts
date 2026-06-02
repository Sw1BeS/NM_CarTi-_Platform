import crypto from 'node:crypto';
import { getJwtSecret } from '../../../../../config/jwt.js';

const TOKEN_VERSION = 1;
const TOKEN_TYPE = 'client_lead_reply_keyboard';
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

export type ClientLeadMiniAppAuthPayload = {
  v: number;
  typ: typeof TOKEN_TYPE;
  botId: string;
  companyId?: string;
  chatId: string;
  userId: string;
  username?: string;
  name?: string;
  lang?: string;
  iat: number;
  exp: number;
};

export type ClientLeadMiniAppAuthInput = {
  botId?: string | null;
  companyId?: string | null;
  chatId?: string | null;
  userId?: string | null;
  username?: string | null;
  name?: string | null;
  lang?: string | null;
  now?: Date;
  ttlSeconds?: number;
};

export type ClientLeadMiniAppAuthVerifyResult =
  | { ok: true; payload: ClientLeadMiniAppAuthPayload }
  | { ok: false; reason: 'missing_token' | 'malformed_token' | 'invalid_signature' | 'expired' | 'scope_mismatch' };

const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString('base64url');

const fromBase64url = (value: string) =>
  Buffer.from(value, 'base64url').toString('utf8');

const cleanText = (value?: string | null, maxLength = 128) => {
  const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return text ? text.slice(0, maxLength) : undefined;
};

const sign = (data: string) =>
  crypto.createHmac('sha256', getJwtSecret()).update(data).digest('base64url');

const safeSign = (data: string) => {
  try {
    return sign(data);
  } catch {
    return undefined;
  }
};

const timingSafeEquals = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

export const createClientLeadMiniAppAuthToken = (input: ClientLeadMiniAppAuthInput): string | undefined => {
  const botId = cleanText(input.botId);
  const chatId = cleanText(input.chatId);
  const userId = cleanText(input.userId || input.chatId);
  if (!botId || !chatId || !userId) return undefined;

  const nowSeconds = Math.floor((input.now || new Date()).getTime() / 1000);
  const ttlSeconds = Math.max(60, Math.min(input.ttlSeconds || DEFAULT_TTL_SECONDS, 30 * 24 * 60 * 60));
  const payload: ClientLeadMiniAppAuthPayload = {
    v: TOKEN_VERSION,
    typ: TOKEN_TYPE,
    botId,
    ...(cleanText(input.companyId) ? { companyId: cleanText(input.companyId) } : {}),
    chatId,
    userId,
    ...(cleanText(input.username, 64) ? { username: cleanText(input.username, 64) } : {}),
    ...(cleanText(input.name, 128) ? { name: cleanText(input.name, 128) } : {}),
    ...(cleanText(input.lang, 8) ? { lang: cleanText(input.lang, 8) } : {}),
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds
  };

  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = safeSign(encodedPayload);
  return signature ? `v1.${encodedPayload}.${signature}` : undefined;
};

export const verifyClientLeadMiniAppAuthToken = (
  token: string | undefined,
  expected: { botId?: string | null; companyId?: string | null; now?: Date } = {}
): ClientLeadMiniAppAuthVerifyResult => {
  const raw = cleanText(token, 4096);
  if (!raw) return { ok: false, reason: 'missing_token' };

  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return { ok: false, reason: 'malformed_token' };

  const expectedSignature = safeSign(parts[1]);
  if (!expectedSignature) return { ok: false, reason: 'invalid_signature' };
  if (!timingSafeEquals(parts[2], expectedSignature)) return { ok: false, reason: 'invalid_signature' };

  let payload: ClientLeadMiniAppAuthPayload;
  try {
    payload = JSON.parse(fromBase64url(parts[1])) as ClientLeadMiniAppAuthPayload;
  } catch {
    return { ok: false, reason: 'malformed_token' };
  }

  if (
    payload.v !== TOKEN_VERSION
    || payload.typ !== TOKEN_TYPE
    || !payload.botId
    || !payload.chatId
    || !payload.userId
    || !Number.isFinite(payload.exp)
  ) {
    return { ok: false, reason: 'malformed_token' };
  }

  const nowSeconds = Math.floor((expected.now || new Date()).getTime() / 1000);
  if (payload.exp < nowSeconds) return { ok: false, reason: 'expired' };

  const expectedBotId = cleanText(expected.botId);
  const expectedCompanyId = cleanText(expected.companyId);
  if (expectedBotId && payload.botId !== expectedBotId) return { ok: false, reason: 'scope_mismatch' };
  if (expectedCompanyId && payload.companyId && payload.companyId !== expectedCompanyId) return { ok: false, reason: 'scope_mismatch' };

  return { ok: true, payload };
};
