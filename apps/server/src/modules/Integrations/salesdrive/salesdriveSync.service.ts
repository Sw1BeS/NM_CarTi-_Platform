import { prisma } from '../../../services/prisma.js';
import {
  SALESDRIVE_INTEGRATION,
  createSalesDriveOrder,
  readSalesDriveConfig,
  toSafeSalesDriveConfig,
  type SalesDriveConfig,
  type SalesDriveFetchLike,
  type SalesDriveOrderAddInput
} from './salesdrive.connector.js';

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

const salesDriveOrderInputFromRequest = (request: any): SalesDriveOrderAddInput => {
  const payload = isRecord(request?.payload) ? request.payload : {};
  const tracking = isRecord(payload.tracking) ? payload.tracking : {};
  const leadPayload = isRecord(request?.lead?.payload) ? request.lead.payload : {};
  const leadTracking = isRecord(leadPayload.tracking) ? leadPayload.tracking : {};
  const carListingId = toText(readPath(payload, ['request', 'carListingId']));
  const publicId = toText(request?.publicId) || toText(request?.id);
  const title = toText(request?.title) || `CarTié request ${publicId}`;
  const description = toText(request?.description);
  const budgetMax = numberOrUndefined(request?.budgetMax);

  return {
    externalId: publicId,
    name: toText(request?.lead?.clientName) || undefined,
    phone: toText(request?.lead?.phone) || toText(payload.phone) || toText(readPath(payload, ['request', 'phone'])) || undefined,
    email: toText(leadPayload.email) || toText(payload.email) || undefined,
    title,
    comment: [
      description,
      `CarTié requestId: ${toText(request?.id)}`,
      toText(request?.botId) ? `Bot ID: ${toText(request.botId)}` : ''
    ].filter(Boolean).join('\n'),
    site: toText(tracking.eventSourceUrl) || toText(tracking.event_source_url) || undefined,
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
      source: toText(tracking.utm_source) || toText(leadTracking.utm_source) || undefined,
      medium: toText(tracking.utm_medium) || toText(leadTracking.utm_medium) || undefined,
      campaign: toText(tracking.utm_campaign) || toText(leadTracking.utm_campaign) || undefined,
      content: toText(tracking.utm_content) || toText(leadTracking.utm_content) || undefined,
      term: toText(tracking.utm_term) || toText(leadTracking.utm_term) || undefined,
      page: toText(tracking.utm_page) || toText(leadTracking.utm_page) || undefined
    }
  };
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
