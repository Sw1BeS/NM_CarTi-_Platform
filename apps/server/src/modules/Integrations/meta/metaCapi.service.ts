import crypto from 'node:crypto';
import axios from 'axios';
import { prisma } from '../../../services/prisma.js';
import { logger } from '../../../utils/logger.js';

export type MetaActionSource = 'email' | 'website' | 'app' | 'phone_call' | 'chat' | 'physical_store' | 'system_generated' | 'business_messaging' | string;

export type MetaCapiTrackInput = {
  eventId?: string | null;
  event_id?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  stage?: string | null;
  externalId?: string | null;
  external_id?: string | null;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
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

const toText = (value: unknown) => String(value || '').trim();

const normalizeMetaEmail = (value?: string | null) => {
  const email = String(value || '').trim().toLowerCase();
  return email && email.includes('@') ? email : undefined;
};

const normalizeMetaPhone = (value?: string | null) => {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits.length >= 8 ? digits : undefined;
};

const normalizeMetaArrayHash = (value?: string | null, normalizer?: (value?: string | null) => string | undefined) => {
  const normalized = normalizer ? normalizer(value) : String(value || '').trim().toLowerCase();
  return normalized ? [sha256(normalized)] : undefined;
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

export const buildMetaEventId = (companyId: string, eventName: string, input: MetaCapiTrackInput = {}) => {
  const explicit = toText(input.eventId || input.event_id);
  if (explicit.startsWith('meta:')) return explicit;
  const entityType = toText(input.entityType) || 'meta_event';
  const entityId = toText(input.entityId) || explicit || `${eventName}_${Date.now()}`;
  const stage = toText(input.stage) || 'default';
  return `meta:${companyId}:${eventName}:${entityType}:${entityId}:${stage}`;
};

export class MetaCapiService {
  async trackEvent(companyId: string, eventName: string, input: MetaCapiTrackInput = {}) {
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
    const existingLog = await prisma.integrationEventLog.findUnique({
      where: { idempotencyKey }
    }).catch(() => null);
    if (existingLog?.status === 'SUCCESS') {
      return { success: true, eventId, duplicate: true };
    }

    const userData = {
      ...(normalizeMetaArrayHash(input.phone, normalizeMetaPhone) ? { ph: normalizeMetaArrayHash(input.phone, normalizeMetaPhone) } : {}),
      ...(normalizeMetaArrayHash(input.email, normalizeMetaEmail) ? { em: normalizeMetaArrayHash(input.email, normalizeMetaEmail) } : {}),
      ...(normalizeMetaArrayHash(input.name) ? { fn: normalizeMetaArrayHash(input.name) } : {}),
      ...(normalizeMetaArrayHash(input.externalId || input.external_id) ? { external_id: normalizeMetaArrayHash(input.externalId || input.external_id) } : {}),
      ...(input.fbp ? { fbp: String(input.fbp) } : {}),
      ...(input.fbc ? { fbc: String(input.fbc) } : {}),
      ...(input.ip || input.clientIpAddress ? { client_ip_address: String(input.ip || input.clientIpAddress) } : {}),
      ...(input.userAgent || input.clientUserAgent ? { client_user_agent: String(input.userAgent || input.clientUserAgent) } : {})
    };

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
        event_time: Math.floor(Date.now() / 1000),
        user_data: userData,
        action_source: input.actionSource || input.action_source || 'website',
        ...(input.eventSourceUrl || input.event_source_url ? { event_source_url: String(input.eventSourceUrl || input.event_source_url) } : {}),
        ...(Object.keys(customData).length ? { custom_data: customData } : {})
      }],
      ...(testEventCode ? { test_event_code: testEventCode } : {})
    };

    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
        payload
      );

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
            hasExternalId: Boolean(input.externalId || input.external_id),
            hasFbp: Boolean(input.fbp),
            hasFbc: Boolean(input.fbc)
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
          idempotencyKey,
          meta: { eventId }
        }
      }).catch(() => null);
      logger.error('[Meta CAPI] Error:', message);
      return { success: false, eventId, error: message };
    }
  }
}
