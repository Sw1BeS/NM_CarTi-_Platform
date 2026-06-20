import crypto from 'node:crypto';
import axios from 'axios';
import { prisma } from '../../../services/prisma.js';
import { logger } from '../../../utils/logger.js';
import { isEnvFlagEnabled } from '../../../services/featureFlags.js';
import { sanitizeMetaEventSourceUrl } from './metaEventSourceUrl.js';

export type MetaActionSource = 'email' | 'website' | 'app' | 'phone_call' | 'chat' | 'physical_store' | 'system_generated' | 'business_messaging' | string;

export type MetaCapiTrackInput = {
  eventId?: string | null;
  event_id?: string | null;
  eventTime?: number | string | Date | null;
  event_time?: number | string | Date | null;
  entityType?: string | null;
  entityId?: string | null;
  stage?: string | null;
  externalId?: string | null;
  external_id?: string | null;
  externalIds?: string[] | null;
  external_ids?: string[] | null;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  firstName?: string | null;
  first_name?: string | null;
  lastName?: string | null;
  last_name?: string | null;
  dateOfBirth?: string | null;
  date_of_birth?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  postalCode?: string | null;
  postal_code?: string | null;
  country?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  eventSourceUrl?: string | null;
  event_source_url?: string | null;
  actionSource?: MetaActionSource | null;
  action_source?: MetaActionSource | null;
  value?: number | null;
  currency?: string | null;
  contentIds?: string[] | null;
  contentName?: string | null;
  contentCategory?: string | null;
  customData?: Record<string, unknown> | null;
};

export const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');

export const META_B2C_BOT_INTEGRATION = 'META_B2C_BOT';
export const META_B2C_BOT_CRM_MODE = 'CRM_CONVERSION_LEADS';
export const META_B2C_BOT_CRM_LEAD_EVENT_SOURCE = 'CarTié SalesDrive';
const APPROVED_B2C_BOT_CRM_EVENT_NAMES = new Set([
  'Lead',
  'Contact',
  'Contacted',
  'QualifiedLead',
  'Schedule',
  'Scheduled',
  'Won',
  'Purchase'
]);

export const maskMetaAccessToken = (value?: string | null) => {
  const token = toText(value);
  if (!token) return '';
  if (token.length <= 8) return `${token.slice(0, 2)}***`;
  return `${token.slice(0, 2)}***${token.slice(-4)}`;
};

const toText = (value: unknown) => String(value || '').trim();

const normalizeMetaEmail = (value?: string | null) => {
  const email = String(value || '').trim().toLowerCase();
  return email && email.includes('@') ? email : undefined;
};

const normalizeMetaPhone = (value?: string | null) => {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits.length >= 8 ? digits : undefined;
};

const normalizeMetaText = (value?: string | null) => {
  const text = String(value || '').trim().toLowerCase();
  return text || undefined;
};

const normalizeMetaCity = (value?: string | null) => {
  const text = normalizeMetaText(value);
  return text ? text.replace(/[\s\p{P}\p{S}]+/gu, '') : undefined;
};

const normalizeMetaCountryOrState = (value?: string | null) => {
  const text = normalizeMetaText(value)?.replace(/[^a-z]/g, '');
  return text && text.length === 2 ? text : undefined;
};

const normalizeMetaDateOfBirth = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const digits = text.replace(/[^\d]/g, '');
  if (/^\d{8}$/.test(digits)) return digits;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return undefined;
  const date = new Date(parsed);
  const year = date.getUTCFullYear();
  if (year < 1900 || year > new Date().getUTCFullYear()) return undefined;
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const normalizeMetaArrayHash = (value?: string | null, normalizer?: (value?: string | null) => string | undefined) => {
  const normalized = normalizer ? normalizer(value) : String(value || '').trim().toLowerCase();
  return normalized ? [sha256(normalized)] : undefined;
};

const normalizeMetaHashList = (
  values: Array<string | null | undefined>,
  normalizer?: (value?: string | null) => string | undefined
) => {
  const hashed = values
    .map((value) => normalizer ? normalizer(value) : String(value || '').trim().toLowerCase())
    .filter((value): value is string => Boolean(value))
    .map(sha256);
  return Array.from(new Set(hashed));
};

const resolveMetaNameParts = (input: MetaCapiTrackInput = {}) => {
  const explicitFirst = normalizeMetaText(input.firstName || input.first_name);
  const explicitLast = normalizeMetaText(input.lastName || input.last_name);
  if (explicitFirst || explicitLast) {
    return { firstName: explicitFirst, lastName: explicitLast };
  }
  const parts = normalizeMetaText(input.name)?.split(/\s+/).filter(Boolean) || [];
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined
  };
};

const buildMetaUserData = (input: MetaCapiTrackInput = {}, options: { includeName?: boolean } = {}) => {
  const nameParts: { firstName?: string; lastName?: string } = options.includeName ? resolveMetaNameParts(input) : {};
  const externalIds = normalizeMetaHashList([
    input.externalId || input.external_id,
    ...(Array.isArray(input.externalIds) ? input.externalIds : []),
    ...(Array.isArray(input.external_ids) ? input.external_ids : [])
  ]);
  return {
    ...(normalizeMetaArrayHash(input.phone, normalizeMetaPhone) ? { ph: normalizeMetaArrayHash(input.phone, normalizeMetaPhone) } : {}),
    ...(normalizeMetaArrayHash(input.email, normalizeMetaEmail) ? { em: normalizeMetaArrayHash(input.email, normalizeMetaEmail) } : {}),
    ...(options.includeName && normalizeMetaArrayHash(nameParts.firstName, normalizeMetaText) ? { fn: normalizeMetaArrayHash(nameParts.firstName, normalizeMetaText) } : {}),
    ...(options.includeName && normalizeMetaArrayHash(nameParts.lastName, normalizeMetaText) ? { ln: normalizeMetaArrayHash(nameParts.lastName, normalizeMetaText) } : {}),
    ...(normalizeMetaArrayHash(input.dateOfBirth || input.date_of_birth, normalizeMetaDateOfBirth) ? { db: normalizeMetaArrayHash(input.dateOfBirth || input.date_of_birth, normalizeMetaDateOfBirth) } : {}),
    ...(normalizeMetaArrayHash(input.city, normalizeMetaCity) ? { ct: normalizeMetaArrayHash(input.city, normalizeMetaCity) } : {}),
    ...(normalizeMetaArrayHash(input.state, normalizeMetaCountryOrState) ? { st: normalizeMetaArrayHash(input.state, normalizeMetaCountryOrState) } : {}),
    ...(normalizeMetaArrayHash(input.zip || input.postalCode || input.postal_code) ? { zp: normalizeMetaArrayHash(input.zip || input.postalCode || input.postal_code) } : {}),
    ...(normalizeMetaArrayHash(input.country, normalizeMetaCountryOrState) ? { country: normalizeMetaArrayHash(input.country, normalizeMetaCountryOrState) } : {}),
    ...(externalIds.length ? { external_id: externalIds } : {}),
    ...(input.fbp ? { fbp: String(input.fbp) } : {}),
    ...(input.fbc ? { fbc: String(input.fbc) } : {}),
    ...(input.ip || input.clientIpAddress ? { client_ip_address: String(input.ip || input.clientIpAddress) } : {}),
    ...(input.userAgent || input.clientUserAgent ? { client_user_agent: String(input.userAgent || input.clientUserAgent) } : {})
  };
};

const redactSensitiveText = (value: unknown, accessToken?: string | null) => {
  let text = String(value || '').trim();
  if (!text) return text;
  const token = toText(accessToken);
  if (token) text = text.replaceAll(token, '[redacted-token]');
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d\s()\-]{6,}\d)/g, '[redacted-phone]');
};

const sanitizeMetaResponse = (value: unknown, accessToken?: string | null) => {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(redactSensitiveText(JSON.stringify(value), accessToken));
  } catch {
    return redactSensitiveText(value, accessToken);
  }
};

const toJsonPreviewValue = (value: unknown): string | number | boolean | null => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
};

const buildMatchQualitySummary = (userData: Record<string, unknown>) => {
  const keys = new Set(Object.keys(userData));
  const piiKeys = ['ph', 'em', 'fn', 'ln', 'db', 'ct', 'st', 'zp', 'country', 'external_id'].filter((key) => keys.has(key));
  const browserKeys = ['fbp', 'fbc'].filter((key) => keys.has(key));
  const transportKeys = ['client_ip_address', 'client_user_agent'].filter((key) => keys.has(key));
  const hasPrimaryContact = keys.has('ph') || keys.has('em');
  const hasBrowserPair = keys.has('fbp') && keys.has('fbc');
  const hasTransportPair = keys.has('client_ip_address') && keys.has('client_user_agent');
  const tier = hasPrimaryContact && hasBrowserPair && hasTransportPair
    ? 'strong'
    : (hasPrimaryContact && (browserKeys.length || transportKeys.length) ? 'partial_browser' : 'basic');

  return {
    tier,
    piiKeys,
    browserKeys,
    transportKeys,
    hasPrimaryContact,
    hasExternalId: keys.has('external_id'),
    hasBrowserPair,
    hasTransportPair
  };
};

const buildB2CBotCrmPayloadSummary = (payload: any) => {
  const event = Array.isArray(payload?.data) ? payload.data[0] : undefined;
  const customData = event?.custom_data && typeof event.custom_data === 'object' ? event.custom_data : {};
  const userData = event?.user_data && typeof event.user_data === 'object' ? event.user_data : {};
  const customDataPreview = Object.fromEntries(
    Object.entries(customData).filter(([key]) => [
      'event_source',
      'lead_event_source',
      'crm_status',
      'destination_key',
      'content_name',
      'content_category',
      'content_ids',
      'value',
      'currency',
      'car_listing_id',
      'car_title',
      'car_year',
      'car_location',
      'car_status',
      'car_price_label',
      'intent_kind',
      'intent_title',
      'selected_car_count',
      'status_id',
      'status_name',
      'status_time',
      'salesdrive_order_id',
      'salesdrive_lead_id',
      'event_source_url',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term'
    ].includes(key))
      .map(([key, value]) => [key, toJsonPreviewValue(value)])
  );

  return {
    topLevelHasTestEventCode: Boolean(payload?.test_event_code),
    topLevelHasData: Array.isArray(payload?.data),
    eventName: event?.event_name,
    eventTime: event?.event_time,
    eventId: event?.event_id,
    actionSource: event?.action_source,
    customDataKeys: Object.keys(customData),
    customDataPreview,
    userDataKeys: Object.keys(userData),
    matchQuality: buildMatchQualitySummary(userData)
  };
};

const readB2CBotDatasetConfig = () => {
  const datasetId = toText(process.env.META_B2C_BOT_DATASET_ID);
  const destinationKey = toText(process.env.META_B2C_BOT_DESTINATION_KEY) || 'b2c_bot_sandbox';
  const accessToken = toText(process.env.META_B2C_BOT_ACCESS_TOKEN);
  const testEventCode = toText(process.env.META_B2C_BOT_TEST_EVENT_CODE);
  const missing = [
    datasetId ? '' : 'META_B2C_BOT_DATASET_ID',
    accessToken ? '' : 'META_B2C_BOT_ACCESS_TOKEN'
  ].filter(Boolean);

  return {
    datasetId,
    destinationKey,
    accessToken,
    testEventCode,
    testMode: isEnvFlagEnabled('META_B2C_BOT_TEST_MODE', false),
    capiEnabled: isEnvFlagEnabled('META_B2C_BOT_CAPI_ENABLED', false),
    missing
  };
};

export const buildMetaEventId = (companyId: string, eventName: string, input: MetaCapiTrackInput = {}) => {
  const explicit = toText(input.eventId || input.event_id);
  if (explicit.startsWith('meta:')) return explicit;
  const entityType = toText(input.entityType) || 'meta_event';
  const entityId = toText(input.entityId) || explicit || `${eventName}_${Date.now()}`;
  const stage = toText(input.stage) || 'default';
  return `meta:${companyId}:${eventName}:${entityType}:${entityId}:${stage}`;
};

const MAX_META_EVENT_AGE_SECONDS = 7 * 24 * 60 * 60;

const buildAttemptLogKey = (eventId: string, reason: string) =>
  `${eventId}:${reason}:${Date.now()}:${crypto.randomUUID()}`;

const parseExplicitEventUnixTime = (value: unknown): number | undefined => {
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isNaN(millis) ? undefined : Math.floor(millis / 1000);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value > 1_000_000_000_000 ? value / 1000 : value);
  }
  const text = toText(value);
  if (!text) return undefined;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return Math.floor(numeric > 1_000_000_000_000 ? numeric / 1000 : numeric);
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
};

const resolveMetaEventTime = (input: MetaCapiTrackInput = {}) => {
  const explicit = input.eventTime ?? input.event_time;
  const nowUnix = Math.floor(Date.now() / 1000);
  const explicitUnix = parseExplicitEventUnixTime(explicit);
  const eventTime = explicitUnix || nowUnix;
  const tooOld = explicitUnix !== undefined && eventTime < nowUnix - MAX_META_EVENT_AGE_SECONDS;
  return {
    eventTime,
    explicit: explicitUnix !== undefined,
    tooOld
  };
};

export class MetaCapiService {
  async trackB2CBotDatasetEvent(companyId: string | null | undefined, eventName: string, input: MetaCapiTrackInput = {}) {
    return this.trackB2CBotCrmLifecycleEvent(companyId, eventName, input);
  }

  async trackB2CBotCrmLifecycleEvent(companyId: string | null | undefined, eventName: string, input: MetaCapiTrackInput = {}) {
    if (!isEnvFlagEnabled('META_CAPI_ENABLED', false)) {
      return { success: false, skipped: true, reason: 'META_CAPI_DISABLED' };
    }

    const config = readB2CBotDatasetConfig();
    if (!config.capiEnabled) {
      return {
        success: false,
        skipped: true,
        reason: 'META_B2C_BOT_CAPI_DISABLED',
        destinationKey: config.destinationKey
      };
    }
    if (config.missing.length) {
      return {
        success: false,
        skipped: true,
        reason: 'META_B2C_BOT_CONFIG_MISSING',
        missing: config.missing,
        destinationKey: config.destinationKey
      };
    }
    if (!APPROVED_B2C_BOT_CRM_EVENT_NAMES.has(eventName)) {
      return {
        success: false,
        skipped: true,
        reason: 'META_B2C_BOT_CRM_EVENT_NOT_APPROVED',
        eventName,
        destinationKey: config.destinationKey
      };
    }

    const eventId = toText(input.eventId || input.event_id)
      || buildMetaEventId(companyId || 'global', eventName, {
        ...input,
        stage: toText(input.stage) || config.destinationKey
      });
    const idempotencyKey = eventId;
    const entityType = toText(input.entityType) || 'meta_b2c_bot_event';
    const entityId = toText(input.entityId) || eventId;
    const resolvedEventTime = resolveMetaEventTime(input);
    if (resolvedEventTime.tooOld) {
      await prisma.integrationEventLog.create({
        data: {
          companyId,
          integration: META_B2C_BOT_INTEGRATION,
          action: eventName,
          status: 'SKIPPED',
          entityType,
          entityId,
          message: 'Meta B2C bot event skipped because event_time is older than 7 days',
          idempotencyKey: buildAttemptLogKey(eventId, 'old_event_time'),
          meta: {
            mode: META_B2C_BOT_CRM_MODE,
            eventId,
            destinationKey: config.destinationKey,
            reason: 'META_EVENT_TIME_TOO_OLD',
            eventTime: resolvedEventTime.eventTime
          }
        }
      }).catch(() => null);
      return { success: false, skipped: true, reason: 'META_EVENT_TIME_TOO_OLD', eventId, destinationKey: config.destinationKey };
    }
    const existingLog = await prisma.integrationEventLog.findUnique({
      where: { idempotencyKey }
    }).catch(() => null);
    if (existingLog?.status === 'SUCCESS') {
      await prisma.integrationEventLog.create({
        data: {
          companyId,
          integration: META_B2C_BOT_INTEGRATION,
          action: eventName,
          status: 'SKIPPED',
          entityType,
          entityId,
          message: 'Meta B2C bot duplicate success skipped',
          idempotencyKey: buildAttemptLogKey(eventId, 'duplicate'),
          meta: {
            mode: META_B2C_BOT_CRM_MODE,
            eventId,
            destinationKey: config.destinationKey,
            reason: 'duplicate_success'
          }
        }
      }).catch(() => null);
      return { success: true, eventId, duplicate: true, destinationKey: config.destinationKey };
    }

    const userData = buildMetaUserData(input, { includeName: true });

    const customData = {
      ...(input.customData && typeof input.customData === 'object' ? input.customData : {}),
      ...(input.value !== undefined && input.value !== null ? { value: input.value, currency: input.currency || 'USD' } : {}),
      ...(Array.isArray(input.contentIds) ? { content_ids: input.contentIds } : {}),
      ...(input.contentName ? { content_name: input.contentName } : {}),
      ...(input.contentCategory ? { content_category: input.contentCategory } : {}),
      crm_status: toText((input.customData as any)?.crm_status) || toText(input.stage) || eventName,
      event_source: 'crm',
      lead_event_source: META_B2C_BOT_CRM_LEAD_EVENT_SOURCE,
      destination_key: config.destinationKey
    };

    const payload = {
      data: [{
        event_name: eventName,
        event_id: eventId,
        event_time: resolvedEventTime.eventTime,
        user_data: userData,
        action_source: 'system_generated',
        ...(Object.keys(customData).length ? { custom_data: customData } : {})
      }],
      ...(config.testMode && config.testEventCode ? { test_event_code: config.testEventCode } : {})
    };
    const payloadSummary = buildB2CBotCrmPayloadSummary(payload);

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v25.0/${config.datasetId}/events`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.accessToken}`
          }
        }
      );
      const responseData = sanitizeMetaResponse(response?.data, config.accessToken) as any;

      await prisma.integrationEventLog.create({
        data: {
          companyId,
          integration: META_B2C_BOT_INTEGRATION,
          action: eventName,
          status: 'SUCCESS',
          entityType,
          entityId,
          message: `Meta B2C bot event ${eventName} sent`,
          idempotencyKey,
          meta: {
            mode: META_B2C_BOT_CRM_MODE,
            eventId,
            destinationKey: config.destinationKey,
            testEventCodeUsed: Boolean(config.testMode && config.testEventCode),
            payloadSummary,
            response: responseData,
            fbtrace_id: responseData?.fbtrace_id,
            token: undefined,
            tokenMasked: maskMetaAccessToken(config.accessToken),
            hasPhone: Boolean(input.phone),
            hasEmail: Boolean(input.email),
            hasExternalId: Boolean(input.externalId || input.external_id || input.externalIds?.length || input.external_ids?.length),
            hasName: Boolean(input.name || input.firstName || input.first_name || input.lastName || input.last_name),
            hasClientIp: Boolean(input.ip || input.clientIpAddress),
            hasClientUserAgent: Boolean(input.userAgent || input.clientUserAgent),
            hasFbp: Boolean(input.fbp),
            hasFbc: Boolean(input.fbc)
          }
        }
      }).catch(() => null);

      logger.info(`[Meta CAPI] B2C bot event sent: ${eventName}`);
      return { success: true, eventId, destinationKey: config.destinationKey };
    } catch (error: any) {
      const rawError = error?.response?.data?.error?.message || error?.message || 'Meta B2C bot CAPI request failed';
      const message = redactSensitiveText(rawError, config.accessToken);
      const responseData = sanitizeMetaResponse(error?.response?.data, config.accessToken) as any;
      await prisma.integrationEventLog.create({
        data: {
          companyId,
          integration: META_B2C_BOT_INTEGRATION,
          action: eventName,
          status: 'ERROR',
          entityType,
          entityId,
          message,
          idempotencyKey: buildAttemptLogKey(eventId, 'error'),
          meta: {
            mode: META_B2C_BOT_CRM_MODE,
            eventId,
            destinationKey: config.destinationKey,
            testEventCodeUsed: Boolean(config.testMode && config.testEventCode),
            payloadSummary,
            response: responseData,
            fbtrace_id: responseData?.fbtrace_id || responseData?.error?.fbtrace_id,
            token: undefined,
            tokenMasked: maskMetaAccessToken(config.accessToken)
          }
        }
      }).catch(() => null);
      logger.error('[Meta CAPI] B2C bot error:', message);
      return { success: false, eventId, destinationKey: config.destinationKey, error: message };
    }
  }

  async trackEvent(companyId: string, eventName: string, input: MetaCapiTrackInput = {}) {
    if (!isEnvFlagEnabled('META_CAPI_ENABLED', false)) {
      return { success: false, skipped: true, reason: 'META_CAPI_DISABLED' };
    }

    const integration = await prisma.integration.findUnique({
      where: {
        companyId_type: {
          companyId,
          type: 'META_PIXEL' as any
        }
      }
    });

    if (!integration || !integration.isActive) {
      return null;
    }

    const config = (integration.config || {}) as Record<string, unknown>;
    const pixelId = toText(config.pixelId);
    const accessToken = toText(config.accessToken);
    const testEventCode = toText(config.test_event_code) || toText(config.testCode);

    if (!pixelId || !accessToken) {
      logger.error('[Meta CAPI] Missing pixelId or accessToken');
      return { success: false, error: 'Missing configuration' };
    }

    const eventId = buildMetaEventId(companyId, eventName, input);
    const idempotencyKey = eventId;
    const entityType = toText(input.entityType) || 'meta_event';
    const entityId = toText(input.entityId) || eventId;
    const resolvedEventTime = resolveMetaEventTime(input);
    if (resolvedEventTime.tooOld) {
      await prisma.integrationEventLog.create({
        data: {
          companyId,
          integration: 'META_PIXEL',
          action: eventName,
          status: 'SKIPPED',
          entityType,
          entityId,
          message: 'Meta CAPI event skipped because event_time is older than 7 days',
          idempotencyKey: buildAttemptLogKey(eventId, 'old_event_time'),
          meta: {
            eventId,
            reason: 'META_EVENT_TIME_TOO_OLD',
            eventTime: resolvedEventTime.eventTime
          }
        }
      }).catch(() => null);
      return { success: false, skipped: true, reason: 'META_EVENT_TIME_TOO_OLD', eventId };
    }
    const existingLog = await prisma.integrationEventLog.findUnique({
      where: { idempotencyKey }
    }).catch(() => null);
    if (existingLog?.status === 'SUCCESS') {
      await prisma.integrationEventLog.create({
        data: {
          companyId,
          integration: 'META_PIXEL',
          action: eventName,
          status: 'SKIPPED',
          entityType,
          entityId,
          message: 'Meta CAPI duplicate success skipped',
          idempotencyKey: buildAttemptLogKey(eventId, 'duplicate'),
          meta: {
            eventId,
            reason: 'duplicate_success'
          }
        }
      }).catch(() => null);
      return { success: true, eventId, duplicate: true };
    }

    const userData = buildMetaUserData(input, { includeName: true });
    const eventSourceUrl = sanitizeMetaEventSourceUrl(input.eventSourceUrl || input.event_source_url);

    const customData = {
      ...(input.customData && typeof input.customData === 'object' ? input.customData : {}),
      ...(input.value !== undefined && input.value !== null ? { value: input.value, currency: input.currency || 'USD' } : {}),
      ...(Array.isArray(input.contentIds) ? { content_ids: input.contentIds } : {}),
      ...(input.contentName ? { content_name: input.contentName } : {}),
      ...(input.contentCategory ? { content_category: input.contentCategory } : {})
    };

    const payload = {
      data: [{
        event_name: eventName,
        event_id: eventId,
        event_time: resolvedEventTime.eventTime,
        user_data: userData,
        action_source: input.actionSource || input.action_source || 'website',
        ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
        ...(Object.keys(customData).length ? { custom_data: customData } : {})
      }],
      ...(testEventCode ? { test_event_code: testEventCode } : {})
    };

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
        payload
      );
      const responseData = sanitizeMetaResponse(response?.data, accessToken) as any;

      await prisma.integrationEventLog.create({
        data: {
          companyId,
          integration: 'META_PIXEL',
          action: eventName,
          status: 'SUCCESS',
          entityType,
          entityId,
          message: `Meta CAPI event ${eventName} sent`,
          idempotencyKey,
          meta: {
            eventId,
            hasPhone: Boolean(input.phone),
            hasEmail: Boolean(input.email),
            hasExternalId: Boolean(input.externalId || input.external_id || input.externalIds?.length || input.external_ids?.length),
            hasName: Boolean(input.name || input.firstName || input.first_name || input.lastName || input.last_name),
            hasClientIp: Boolean(input.ip || input.clientIpAddress),
            hasClientUserAgent: Boolean(input.userAgent || input.clientUserAgent),
            hasFbp: Boolean(input.fbp),
            hasFbc: Boolean(input.fbc),
            response: responseData,
            fbtrace_id: responseData?.fbtrace_id,
            tokenMasked: maskMetaAccessToken(accessToken)
          }
        }
      }).catch(() => null);

      logger.info(`[Meta CAPI] Event sent: ${eventName}`);
      return { success: true, eventId };
    } catch (error: any) {
      const rawError = error?.response?.data?.error?.message || error?.message || 'Meta CAPI request failed';
      const message = redactSensitiveText(rawError, accessToken);
      await prisma.integrationEventLog.create({
        data: {
          companyId,
          integration: 'META_PIXEL',
          action: eventName,
          status: 'ERROR',
          entityType,
          entityId,
          message,
          idempotencyKey: buildAttemptLogKey(eventId, 'error'),
          meta: { eventId }
        }
      }).catch(() => null);
      logger.error('[Meta CAPI] Error:', message);
      return { success: false, eventId, error: message };
    }
  }
}
