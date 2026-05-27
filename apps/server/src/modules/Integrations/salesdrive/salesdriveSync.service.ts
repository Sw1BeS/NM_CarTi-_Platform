import { prisma } from '../../../services/prisma.js';
import {
  SALESDRIVE_INTEGRATION,
  createSalesDriveOrder,
  readSalesDriveConfig,
  toSafeSalesDriveConfig,
  type SalesDriveConfig,
  type SalesDriveFetchLike,
  type SalesDriveOrderCreateResult,
  type SalesDriveOrderAddInput
} from './salesdrive.connector.js';
import { readAttributionSnapshot } from '../../Attribution/attributionPayload.js';

export type SalesDriveRequestSyncInput = {
  companyId?: string | null;
  requestId: string;
  requestPublicId?: string | null;
  leadId?: string | null;
  botId?: string | null;
  source?: string | null;
};

export type SalesDriveRequestSyncResult = {
  queued: boolean;
  duplicate?: boolean;
  reason: 'CONFIG_MISSING' | 'SYNC_DISABLED' | 'WRITE_DISABLED' | 'QUEUED' | 'DUPLICATE';
  idempotencyKey: string;
};

export type SalesDriveRequestSyncQueueResult = {
  processed: number;
  sent: number;
  failed: number;
  reason?: 'CONFIG_MISSING' | 'SYNC_DISABLED' | 'WRITE_DISABLED';
};

const isUniqueConflict = (error: unknown) =>
  Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');

const resolveReason = (config: SalesDriveConfig): SalesDriveRequestSyncResult['reason'] => {
  if (config.missing.length) return 'CONFIG_MISSING';
  if (!config.syncEnabled) return 'SYNC_DISABLED';
  if (!config.writeEnabled) return 'WRITE_DISABLED';
  return 'QUEUED';
};

const resolveProcessBlockReason = (config: SalesDriveConfig): SalesDriveRequestSyncQueueResult['reason'] | undefined => {
  if (config.missing.length) return 'CONFIG_MISSING';
  if (!config.syncEnabled) return 'SYNC_DISABLED';
  if (!config.writeEnabled) return 'WRITE_DISABLED';
  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toText = (value: unknown) => String(value || '').trim();

const readPath = (value: unknown, path: string[]) => {
  let cursor = value;
  for (const segment of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
};

const redactSensitiveText = (value: unknown) =>
  toText(value)
    .replace(/(?:\+?\d[\d\s()\-]{6,}\d)/g, '[redacted-phone]')
    .replace(/(?:Form-Api-Key|form)["':=\s]+[^"',\s}]+/gi, 'form=[redacted-salesdrive-key]');

const numberOrUndefined = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const attributionTokenPrefix = (token?: string | null) => {
  const text = toText(token);
  return text ? text.slice(0, 8) : undefined;
};

export const salesDriveOrderInputFromRequest = (request: any): SalesDriveOrderAddInput => {
  const payload = isRecord(request?.payload) ? request.payload : {};
  const tracking = isRecord(payload.tracking) ? payload.tracking : {};
  const leadPayload = isRecord(request?.lead?.payload) ? request.lead.payload : {};
  const leadTracking = isRecord(leadPayload.tracking) ? leadPayload.tracking : {};
  const attribution = readAttributionSnapshot(payload) || readAttributionSnapshot(leadPayload);
  const attributionQuery = attribution?.query || {};
  const attributionIdentifiers = attribution?.identifiers || {};
  const carListingId = toText(readPath(payload, ['request', 'carListingId']));
  const publicId = toText(request?.publicId) || toText(request?.id);
  const title = toText(request?.title) || `CarTié request ${publicId}`;
  const description = toText(request?.description);
  const budgetMax = numberOrUndefined(request?.budgetMax);
  const destinationKey = toText(payload.destination_key || payload.destinationKey || leadPayload.destination_key || leadPayload.destinationKey);
  const requestSource = toText(payload.source || leadPayload.source);
  const requestType = toText(payload.request_type || payload.requestType || leadPayload.request_type || leadPayload.requestType);
  const cartieRequestId = toText(payload.cartie_request_id || payload.cartieRequestId || publicId);
  const isB2CBot = toText(payload.direction).toUpperCase() === 'B2C'
    || requestSource === 'b2c_bot'
    || destinationKey === 'b2c_bot_sandbox';
  const typeStr = request?.requesterPartnerId ? 'B2B' : (isB2CBot ? 'B2C' : (payload.source === 'miniapp_intent' ? 'Mini App' : 'LeadBot'));
  const name = toText(request?.lead?.clientName) || toText(leadPayload.name) || undefined;
  const phone = toText(request?.lead?.phone) || toText(payload.phone) || toText(readPath(payload, ['request', 'phone'])) || undefined;
  const tgUsername = toText(leadPayload.telegramUsername) || toText(payload.telegramUsername);
  const tgUserId = toText(leadPayload.telegramUserId) || toText(payload.telegramUserId) || toText(request?.lead?.userTgId);
  const tgUser = tgUsername ? `@${tgUsername.replace(/^@/, '')}` : (tgUserId || undefined);
  const sourceContext = toText(payload.sourceContext) || toText(payload.source) || (isB2CBot ? 'b2c_bot' : 'Telegram');
  const header = isB2CBot
    ? `CarTié B2C | source=${requestSource || 'b2c_bot'} | request_type=${requestType || 'client_auto_selection'} | cartie_request_id=${cartieRequestId}`
    : 'CarTié Lead';

  const commentText = [
    header,
    `Тип: ${typeStr}`,
    isB2CBot ? 'Sector: B2C' : null,
    isB2CBot ? `Surface: ${toText(payload.surface) || 'telegram_bot'}` : null,
    isB2CBot ? `Destination: ${destinationKey || 'b2c_bot_sandbox'}` : null,
    `Заявка: ${publicId}`,
    name ? `Клиент: ${name}` : null,
    phone ? `Телефон: ${phone}` : null,
    tgUser ? `Telegram: ${tgUser}` : null,
    title ? `Авто: ${title}` : null,
    budgetMax ? `Бюджет: ${budgetMax}` : null,
    description ? `Комментарий клиента: ${description}` : null,
    `Источник: ${sourceContext}`,
    tracking.utm_campaign ? `UTM: ${tracking.utm_campaign}` : null,
    attribution ? [
      'Attribution:',
      `token_prefix=${attributionTokenPrefix(attribution.token) || 'none'}`,
      `campaign=${toText(attributionQuery.utm_campaign) || toText(tracking.utm_campaign) || 'none'}`,
      `source=${toText(attributionQuery.utm_source) || toText(tracking.utm_source) || 'none'}`,
      `has_fbc=${Boolean(attributionIdentifiers.fbc)}`,
      `has_fbp=${Boolean(attributionIdentifiers.fbp)}`
    ].join(' ') : null,
    `Internal requestId: ${toText(request?.id)}`
  ].filter(Boolean).join('\n');

  return {
    externalId: publicId,
    name,
    phone,
    email: toText(leadPayload.email) || toText(payload.email) || undefined,
    title,
    comment: commentText,
    site: attribution?.event_source_url || toText(tracking.eventSourceUrl) || toText(tracking.event_source_url) || undefined,
    products: [{
      id: carListingId || publicId,
      name: title,
      costPerItem: budgetMax,
      amount: 1,
      description: description || undefined,
      sku: carListingId || undefined
    }],
    utm: {
      sourceFull: toText(tracking.utm_source_full) || toText(leadTracking.utm_source_full) || undefined,
      source: toText(attributionQuery.utm_source) || toText(tracking.utm_source) || toText(leadTracking.utm_source) || undefined,
      medium: toText(attributionQuery.utm_medium) || toText(tracking.utm_medium) || toText(leadTracking.utm_medium) || undefined,
      campaign: toText(attributionQuery.utm_campaign) || toText(tracking.utm_campaign) || toText(leadTracking.utm_campaign) || undefined,
      content: toText(attributionQuery.utm_content) || toText(tracking.utm_content) || toText(leadTracking.utm_content) || undefined,
      term: toText(attributionQuery.utm_term) || toText(tracking.utm_term) || toText(leadTracking.utm_term) || undefined,
      page: toText(tracking.utm_page) || toText(leadTracking.utm_page) || undefined
    }
  };
};

const persistSalesDriveLeadIdentity = async (
  params: {
    companyId?: string | null;
    request: any;
    result: SalesDriveOrderCreateResult;
  }
) => {
  const externalId = toText(params.result.orderId);
  const companyId = toText(params.companyId || params.request?.companyId);
  const leadId = toText(params.request?.leadId || params.request?.lead?.id);
  const attribution = readAttributionSnapshot(params.request?.payload) || readAttributionSnapshot(params.request?.lead?.payload);
  if (!externalId || !companyId || !leadId) return;

  await prisma.leadIdentity.upsert({
    where: {
      companyId_provider_externalId: {
        companyId,
        provider: 'SALESDRIVE',
        externalId
      }
    },
    create: {
      companyId,
      leadId,
      provider: 'SALESDRIVE',
      externalId,
      confidence: 'HIGH',
      payload: {
        source: 'salesdrive.request_sync',
        requestId: toText(params.request?.id) || undefined,
        requestPublicId: toText(params.request?.publicId) || undefined,
        attributionToken: attribution?.token || undefined
      }
    },
    update: {
      leadId,
      confidence: 'HIGH',
      payload: {
        source: 'salesdrive.request_sync',
        requestId: toText(params.request?.id) || undefined,
        requestPublicId: toText(params.request?.publicId) || undefined,
        attributionToken: attribution?.token || undefined
      }
    }
  });
};

const salesDriveSyncPayload = (
  payload: unknown,
  result: SalesDriveOrderCreateResult,
  syncedAt: string
) => {
  const current = isRecord(payload) ? payload : {};
  const externalCrm = isRecord(current.external_crm) ? current.external_crm : {};
  const orderId = toText(result.orderId);
  const userId = toText(result.userId);
  return {
    ...current,
    salesdrive_order_id: orderId || undefined,
    salesdriveOrderId: orderId || undefined,
    salesdrive_user_id: userId || undefined,
    salesdrive_sync_status: 'sent',
    salesdrive_synced_at: syncedAt,
    external_crm: {
      ...externalCrm,
      salesdrive_order_id: orderId || undefined,
      salesdrive_user_id: userId || undefined,
      salesdrive_sync_status: 'sent',
      salesdrive_synced_at: syncedAt
    }
  };
};

const persistSalesDriveOrderReference = async (
  params: {
    request: any;
    result: SalesDriveOrderCreateResult;
  }
) => {
  const orderId = toText(params.result.orderId);
  if (!orderId) return;
  const syncedAt = new Date().toISOString();
  const requestId = toText(params.request?.id);
  const leadId = toText(params.request?.leadId || params.request?.lead?.id);

  if (requestId) {
    await prisma.b2bRequest.update({
      where: { id: requestId },
      data: {
        payload: salesDriveSyncPayload(params.request?.payload, params.result, syncedAt)
      }
    }).catch(() => null);
  }

  if (leadId) {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        payload: salesDriveSyncPayload(params.request?.lead?.payload, params.result, syncedAt)
      }
    }).catch(() => null);
  }
};

export const enqueueSalesDriveRequestSync = async (
  input: SalesDriveRequestSyncInput,
  config = readSalesDriveConfig()
): Promise<SalesDriveRequestSyncResult> => {
  const idempotencyKey = `salesdrive:sync:request:${input.requestId}`;
  const reason = resolveReason(config);
  const queued = reason === 'QUEUED';
  const safeConfig = toSafeSalesDriveConfig(config);

  try {
    await prisma.integrationEventLog.create({
      data: {
        companyId: input.companyId || null,
        integration: SALESDRIVE_INTEGRATION,
        entityType: 'request',
        entityId: input.requestId,
        action: queued ? 'REQUEST_SYNC_QUEUED' : 'REQUEST_SYNC_SKIPPED',
        status: queued ? 'OK' : 'WARN',
        idempotencyKey,
        message: queued
          ? 'SalesDrive request sync queued'
          : `SalesDrive request sync skipped: ${reason}`,
        meta: {
          requestPublicId: input.requestPublicId || undefined,
          leadId: input.leadId || undefined,
          botId: input.botId || undefined,
          source: input.source || undefined,
          reason,
          configured: safeConfig.configured,
          syncEnabled: safeConfig.syncEnabled,
          writeEnabled: safeConfig.writeEnabled,
          baseUrlConfigured: Boolean(safeConfig.baseUrl),
          missing: safeConfig.missing
        }
      }
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      return { queued: false, duplicate: true, reason: 'DUPLICATE', idempotencyKey };
    }
    throw error;
  }

  return { queued, reason, idempotencyKey };
};

export const processSalesDriveRequestSyncQueue = async (
  options: { companyId?: string | null; requestId?: string | null; limit?: number } = {},
  config = readSalesDriveConfig(),
  fetcher?: SalesDriveFetchLike
): Promise<SalesDriveRequestSyncQueueResult> => {
  const blocked = resolveProcessBlockReason(config);
  if (blocked) return { processed: 0, sent: 0, failed: 0, reason: blocked };

  const logs = await prisma.integrationEventLog.findMany({
    where: {
      integration: SALESDRIVE_INTEGRATION,
      action: 'REQUEST_SYNC_QUEUED',
      entityType: 'request',
      ...(options.companyId ? { companyId: options.companyId } : {}),
      ...(options.requestId ? { entityId: options.requestId } : {})
    },
    orderBy: { createdAt: 'asc' },
    take: Math.min(50, Math.max(1, Math.trunc(options.limit || 25)))
  });

  let sent = 0;
  let failed = 0;

  for (const log of logs) {
    const meta = isRecord(log.meta) ? log.meta : {};
    const attempts = numberOrUndefined(meta.attempts) || 0;
    try {
      const request = await prisma.b2bRequest.findUnique({
        where: { id: String(log.entityId) },
        include: { lead: true }
      });
      if (!request) throw new Error(`Request not found: ${String(log.entityId)}`);

      const result = await createSalesDriveOrder(salesDriveOrderInputFromRequest(request), config, fetcher);
      await persistSalesDriveLeadIdentity({
        companyId: log.companyId,
        request,
        result
      }).catch(() => null);
      await persistSalesDriveOrderReference({ request, result }).catch(() => null);
      await prisma.integrationEventLog.update({
        where: { id: log.id },
        data: {
          action: 'REQUEST_SYNC_SENT',
          status: 'OK',
          message: 'SalesDrive request sync sent',
          meta: {
            ...meta,
            reason: 'SENT',
            attempts: attempts + 1,
            salesDriveOrderId: result.orderId ? String(result.orderId) : undefined,
            salesDriveUserId: result.userId ? String(result.userId) : undefined,
            httpStatus: result.httpStatus,
            sentAt: new Date().toISOString()
          }
        }
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      await prisma.integrationEventLog.update({
        where: { id: log.id },
        data: {
          status: 'ERROR',
          message: redactSensitiveText(error instanceof Error ? error.message : error),
          meta: {
            ...meta,
            reason: 'FAILED',
            attempts: attempts + 1,
            lastErrorAt: new Date().toISOString()
          }
        }
      });
    }
  }

  return { processed: logs.length, sent, failed };
};
