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
