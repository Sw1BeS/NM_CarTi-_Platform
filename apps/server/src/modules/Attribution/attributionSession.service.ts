import crypto from 'node:crypto';
import { prisma } from '../../services/prisma.js';
import type {
  AttributionCreateInput,
  AttributionIdentifiers,
  AttributionQuery,
  AttributionRequestMeta,
  AttributionSnapshot
} from './attributionTypes.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TOKEN_BYTE_LENGTH = 24;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;
const DEFAULT_TTL_DAYS = 30;

const ALLOWED_QUERY_KEYS = new Set([
  'destination',
  'dest',
  'campaign_token',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'utm_cartie_token',
  'utm_cartie_attribution_token',
  'utm_fbclid',
  'utm_fbp',
  'utm_fbc',
  'fbclid',
  'fbc',
  'fbp',
  'ad_id',
  'adset_id',
  'campaign_id',
  'placement',
  'source',
  'ref'
]);

const SENSITIVE_QUERY_KEY_PATTERN = /email|phone|tel|name|first|last|address|token|secret|password/i;

type AttributionSessionRecord = {
  id: string;
  token: string;
  companyId: string | null;
  botId: string | null;
  destination: string;
  source: string | null;
  query: unknown;
  identifiers: unknown;
  requestMeta: unknown;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AttributionSessionDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<AttributionSessionRecord>;
  findUnique(args: { where: { token: string } }): Promise<AttributionSessionRecord | null>;
  update(args: { where: { token: string }; data: Record<string, unknown> }): Promise<AttributionSessionRecord>;
};

type PrismaLike = {
  attributionSession: AttributionSessionDelegate;
};

export type AttributionCreateResult = {
  token: string;
  redirectUrl: string;
  snapshot: AttributionSnapshot;
  cookies: {
    fbp?: string;
    fbc?: string;
  };
};

export type AttributionLookupOptions = {
  consume?: boolean;
  now?: Date;
};

const toText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return toText(value[0]);
  }
  return undefined;
};

const toSafeText = (value: unknown, maxLength = 256): string | undefined => {
  const text = toText(value);
  if (!text) return undefined;
  return text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
};

export const sanitizeAttributionQuery = (query: Record<string, unknown>): AttributionQuery => {
  const sanitized: AttributionQuery = {};

  for (const [rawKey, rawValue] of Object.entries(query || {})) {
    const key = rawKey.trim().toLowerCase();
    if (!key || !ALLOWED_QUERY_KEYS.has(key) || SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
      continue;
    }
    const value = toSafeText(rawValue, key === 'fbclid' || key === 'fbc' || key === 'fbp' ? 512 : 256);
    if (value) {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

const token = (): string => crypto.randomBytes(TOKEN_BYTE_LENGTH).toString('base64url');

const randomFbpSuffix = (): string => {
  const left = crypto.randomInt(1000000000, 2147483647);
  const right = crypto.randomInt(1000000000, 2147483647);
  return `${left}${right}`;
};

const normalizeFbp = (value: unknown): string | undefined => {
  const text = toSafeText(value, 128);
  if (!text || !/^fb\.1\.\d+\.[A-Za-z0-9_-]+$/.test(text)) {
    return undefined;
  }
  return text;
};

const normalizeFbc = (value: unknown): string | undefined => {
  const text = toSafeText(value, 640);
  if (!text || !/^fb\.1\.\d+\..+$/.test(text)) {
    return undefined;
  }
  return text;
};

const buildFbp = (now: Date): string => `fb.1.${now.getTime()}.${randomFbpSuffix()}`;

const buildFbc = (fbclid: string | undefined, now: Date): string | undefined => {
  if (!fbclid) return undefined;
  return `fb.1.${now.getTime()}.${fbclid}`;
};

const toJsonObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toDateIso = (value: Date): string => value.toISOString();

const buildSnapshot = (record: AttributionSessionRecord): AttributionSnapshot => {
  const requestMeta = toJsonObject(record.requestMeta);
  const identifiers = toJsonObject(record.identifiers) as AttributionIdentifiers;
  const source = toText(record.source);
  const eventSourceUrl = toText(requestMeta.eventSourceUrl);

  return {
    token: record.token,
    destination: record.destination,
    ...(source ? { source } : {}),
    query: toJsonObject(record.query) as AttributionQuery,
    identifiers,
    ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
    created_at: toDateIso(record.createdAt),
    expires_at: toDateIso(record.expiresAt)
  };
};

const appendIfMissing = (url: URL, key: string, value: string | undefined): void => {
  if (!value || url.searchParams.has(key)) return;
  url.searchParams.set(key, value);
};

const buildRedirectUrl = (input: AttributionCreateInput, tokenValue: string, sanitizedQuery: AttributionQuery, identifiers: AttributionIdentifiers): string => {
  if (!input.redirectUrl) {
    const botUsername = toSafeText(input.botUsername, 128);
    if (!botUsername) {
      throw new Error('Attribution redirect requires botUsername or redirectUrl');
    }
    return `https://t.me/${botUsername}?start=${tokenValue}`;
  }

  const url = new URL(input.redirectUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Attribution redirect URL must be http or https');
  }

  if (input.appendAttributionParams !== false) {
    appendIfMissing(url, 'cartie_attribution_token', tokenValue);
    appendIfMissing(url, 'attribution_token', tokenValue);
    appendIfMissing(url, 'fbclid', identifiers.fbclid || sanitizedQuery.fbclid);
    appendIfMissing(url, 'fbp', identifiers.fbp);
    appendIfMissing(url, '_fbp', identifiers.fbp);
    appendIfMissing(url, 'fbc', identifiers.fbc);
    appendIfMissing(url, '_fbc', identifiers.fbc);
    appendIfMissing(url, 'utm_cartie_token', tokenValue);
    appendIfMissing(url, 'utm_cartie_attribution_token', tokenValue);
    appendIfMissing(url, 'utm_fbclid', identifiers.fbclid || sanitizedQuery.fbclid);
    appendIfMissing(url, 'utm_fbp', identifiers.fbp);
    appendIfMissing(url, 'utm_fbc', identifiers.fbc);
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'campaign_token', 'ad_id', 'adset_id', 'campaign_id', 'placement'] as const) {
      appendIfMissing(url, key, sanitizedQuery[key]);
    }
    appendIfMissing(url, 'utm_term', `cartie_token_${tokenValue}`);
  }

  return url.toString();
};

export class AttributionSessionService {
  constructor(
    private readonly db: PrismaLike = prisma as unknown as PrismaLike,
    private readonly ttlDays = DEFAULT_TTL_DAYS
  ) {}

  async createSession(input: AttributionCreateInput): Promise<AttributionCreateResult> {
    const now = input.now || new Date();
    const sanitizedQuery = sanitizeAttributionQuery(input.query);
    const fbclid = sanitizedQuery.fbclid;
    const fbp = normalizeFbp(input.cookies?.fbp) || normalizeFbp(sanitizedQuery.fbp) || buildFbp(now);
    const fbc = normalizeFbc(input.cookies?.fbc) || normalizeFbc(sanitizedQuery.fbc) || buildFbc(fbclid, now);
    const ip = toSafeText(input.requestMeta.ip, 128);
    const userAgent = toSafeText(input.requestMeta.userAgent, 512);
    const eventSourceUrl = toSafeText(input.requestMeta.eventSourceUrl, 2048);
    const referrer = toSafeText(input.requestMeta.referrer, 2048);
    const sessionToken = token();
    const expiresAt = new Date(now.getTime() + this.ttlDays * MS_PER_DAY);
    const identifiers: AttributionIdentifiers = {
      ...(fbclid ? { fbclid } : {}),
      ...(fbp ? { fbp } : {}),
      ...(fbc ? { fbc } : {}),
      ...(ip ? { client_ip_address: ip } : {}),
      ...(userAgent ? { client_user_agent: userAgent } : {})
    };
    const requestMeta: AttributionRequestMeta = {
      ...(ip ? { ip } : {}),
      ...(userAgent ? { userAgent } : {}),
      ...(eventSourceUrl ? { eventSourceUrl } : {}),
      ...(referrer ? { referrer } : {})
    };
    const source = toSafeText(input.source, 128) || sanitizedQuery.utm_source || sanitizedQuery.source;

    const record = await this.db.attributionSession.create({
      data: {
        token: sessionToken,
        companyId: toSafeText(input.companyId, 128) || null,
        botId: toSafeText(input.botId, 128) || null,
        destination: input.destination,
        source: source || null,
        query: sanitizedQuery,
        identifiers,
        requestMeta,
        expiresAt
      }
    });

    return {
      token: record.token,
      redirectUrl: buildRedirectUrl(input, record.token, sanitizedQuery, identifiers),
      snapshot: buildSnapshot(record),
      cookies: {
        ...(fbp ? { fbp } : {}),
        ...(fbc ? { fbc } : {})
      }
    };
  }

  async lookupToken(tokenValue: string | null | undefined, options: AttributionLookupOptions = {}): Promise<AttributionSnapshot | null> {
    const cleanedToken = toSafeText(tokenValue, 80);
    if (!cleanedToken || !TOKEN_PATTERN.test(cleanedToken)) {
      return null;
    }

    const record = await this.db.attributionSession.findUnique({
      where: { token: cleanedToken }
    });
    if (!record) return null;

    const now = options.now || new Date();
    if (record.expiresAt.getTime() <= now.getTime()) {
      return null;
    }

    if (options.consume) {
      const consumed = await this.db.attributionSession.update({
        where: { token: cleanedToken },
        data: { consumedAt: now }
      });
      return buildSnapshot(consumed);
    }

    return buildSnapshot(record);
  }

  async resolveSnapshotFromToken(tokenValue: string | null | undefined, options: AttributionLookupOptions = {}): Promise<AttributionSnapshot | null> {
    return this.lookupToken(tokenValue, options);
  }
}

export const attributionSessionService = new AttributionSessionService();
