import { logIntegrationEvent, type IntegrationLogStatus } from '../../../services/integrationEventLog.service.js';
import { prisma } from '../../../services/prisma.js';
import {
  SALESDRIVE_INTEGRATION,
  buildSalesDriveImportPreview,
  checkSalesDriveHealth,
  fetchSalesDriveOrderList,
  readSalesDriveConfig,
  toSafeSalesDriveConfig,
  type SalesDriveImportPreview,
  type SalesDriveOrderListOptions
} from './salesdrive.connector.js';
import { processSalesDriveRequestSyncQueue } from './salesdriveSync.service.js';

const mapStatus = (status: string): IntegrationLogStatus => status === 'OK' ? 'OK' : status === 'CONFIG_MISSING' ? 'WARN' : 'ERROR';
const syncActions = ['REQUEST_SYNC_QUEUED', 'REQUEST_SYNC_SENT', 'REQUEST_SYNC_SKIPPED'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toText = (value: unknown) => String(value || '').trim();

const redactSalesDriveStatusText = (value: unknown) => {
  const config = readSalesDriveConfig();
  const apiKey = toText((config as any).apiKey);
  let text = toText(value);
  if (apiKey) text = text.replaceAll(apiKey, '[redacted-salesdrive-key]');
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d\s()\-]{6,}\d)/g, '[redacted-phone]');
};

const toIso = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  const text = toText(value);
  return text || undefined;
};

const toSyncStatusItem = (log: any) => {
  const meta = isRecord(log?.meta) ? log.meta : {};
  return {
    requestId: toText(log?.entityId) || undefined,
    requestPublicId: toText(meta.requestPublicId) || undefined,
    action: toText(log?.action) || undefined,
    status: toText(log?.status) || undefined,
    reason: toText(meta.reason) || undefined,
    attempts: Number.isFinite(Number(meta.attempts)) ? Number(meta.attempts) : undefined,
    salesDriveOrderId: toText(meta.salesDriveOrderId) || undefined,
    httpStatus: Number.isFinite(Number(meta.httpStatus)) ? Number(meta.httpStatus) : undefined,
    message: redactSalesDriveStatusText(log?.message),
    createdAt: toIso(log?.createdAt),
    sentAt: toIso(meta.sentAt),
    lastErrorAt: toIso(meta.lastErrorAt)
  };
};

const annotateExistingSalesDriveIdentities = async (
  companyId: string | null | undefined,
  items: SalesDriveImportPreview[]
) => {
  if (!companyId || !items.length) return { items, duplicateCount: 0 };
  const externalIds = [...new Set(items.map((item) => item.externalId).filter((id) => id && id !== 'unknown'))];
  if (!externalIds.length) return { items, duplicateCount: 0 };

  const identities = await prisma.leadIdentity.findMany({
    where: {
      companyId,
      provider: SALESDRIVE_INTEGRATION,
      externalId: { in: externalIds }
    },
    select: { externalId: true, leadId: true }
  });
  const byExternalId = new Map(identities.map((identity) => [identity.externalId, identity.leadId]));
  let duplicateCount = 0;
  const annotated = items.map((item) => {
    const leadId = byExternalId.get(item.externalId);
    if (!leadId) return item;
    duplicateCount += 1;
    return {
      ...item,
      duplicate: {
        provider: SALESDRIVE_INTEGRATION,
        leadId
      },
      warnings: [...new Set([...(item.warnings || []), 'existing_salesdrive_identity'])]
    };
  });

  return { items: annotated, duplicateCount };
};

export class SalesDriveService {
  getConfig() {
    return toSafeSalesDriveConfig(readSalesDriveConfig());
  }

  async syncStatus(companyId: string | null | undefined) {
    const logs = await prisma.integrationEventLog.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        integration: SALESDRIVE_INTEGRATION,
        action: { in: syncActions }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const items = logs.map(toSyncStatusItem);
    const counts = items.reduce((acc, item) => {
      if (item.action === 'REQUEST_SYNC_SENT' && item.status === 'OK') acc.sent += 1;
      else if (item.action === 'REQUEST_SYNC_QUEUED' && item.status === 'ERROR') acc.failed += 1;
      else if (item.action === 'REQUEST_SYNC_SKIPPED') acc.skipped += 1;
      else if (item.action === 'REQUEST_SYNC_QUEUED') acc.queued += 1;
      return acc;
    }, { queued: 0, sent: 0, failed: 0, skipped: 0 });

    return {
      integration: SALESDRIVE_INTEGRATION,
      counts,
      lastSent: items.find((item) => item.action === 'REQUEST_SYNC_SENT' && item.status === 'OK') || null,
      lastError: items.find((item) => item.status === 'ERROR') || null,
      recent: items.slice(0, 20)
    };
  }

  async health(companyId?: string | null) {
    const config = readSalesDriveConfig();
    const health = await checkSalesDriveHealth(config);
    await logIntegrationEvent({
      companyId,
      integration: SALESDRIVE_INTEGRATION,
      action: 'HEALTH_CHECK',
      status: mapStatus(health.status),
      message: health.message,
      meta: {
        configured: health.configured,
        syncEnabled: health.syncEnabled,
        writeEnabled: health.writeEnabled,
        httpStatus: health.httpStatus,
        missing: health.config.missing
      }
    });
    return health;
  }

  async previewImport(companyId: string | null | undefined, options: SalesDriveOrderListOptions = {}) {
    const config = readSalesDriveConfig();
    if (config.missing.length) {
      const safeConfig = toSafeSalesDriveConfig(config);
      await logIntegrationEvent({
        companyId,
        integration: SALESDRIVE_INTEGRATION,
        action: 'IMPORT_PREVIEW',
        status: 'WARN',
        message: `Missing ${config.missing.join(', ')}`,
        meta: { configured: false, missing: config.missing }
      });
      return {
        source: SALESDRIVE_INTEGRATION,
        dryRun: true,
        configured: false,
        config: safeConfig,
        page: options.page || 1,
        limit: options.limit || 50,
        count: 0,
        items: []
      };
    }

    const result = await fetchSalesDriveOrderList(options, config);
    const preview = buildSalesDriveImportPreview(result.rows);
    const { items, duplicateCount } = await annotateExistingSalesDriveIdentities(companyId, preview);
    await logIntegrationEvent({
      companyId,
      integration: SALESDRIVE_INTEGRATION,
      action: 'IMPORT_PREVIEW',
      status: 'OK',
      message: `Prepared ${items.length} SalesDrive import preview item(s)`,
      meta: {
        page: result.page,
        limit: result.limit,
        count: items.length,
        duplicateCount,
        dryRun: true
      }
    });

    return {
      source: SALESDRIVE_INTEGRATION,
      dryRun: true,
      configured: true,
      config: toSafeSalesDriveConfig(config),
      page: result.page,
      limit: result.limit,
      count: items.length,
      items
    };
  }

  async processRequestSyncs(companyId: string | null | undefined, options: { requestId?: string; limit?: number } = {}) {
    return processSalesDriveRequestSyncQueue({
      companyId: companyId || undefined,
      requestId: options.requestId,
      limit: options.limit
    });
  }
}

export const salesDriveService = new SalesDriveService();
