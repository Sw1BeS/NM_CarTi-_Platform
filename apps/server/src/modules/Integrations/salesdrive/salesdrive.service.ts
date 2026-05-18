import { logIntegrationEvent, type IntegrationLogStatus } from '../../../services/integrationEventLog.service.js';
import {
  SALESDRIVE_INTEGRATION,
  buildSalesDriveImportPreview,
  checkSalesDriveHealth,
  fetchSalesDriveOrderList,
  readSalesDriveConfig,
  toSafeSalesDriveConfig,
  type SalesDriveOrderListOptions
} from './salesdrive.connector.js';

const mapStatus = (status: string): IntegrationLogStatus => status === 'OK' ? 'OK' : status === 'CONFIG_MISSING' ? 'WARN' : 'ERROR';

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
    const items = buildSalesDriveImportPreview(result.rows);
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
}

export const salesDriveService = new SalesDriveService();
