import { prisma } from '../../../services/prisma.js';
import {
  SALESDRIVE_INTEGRATION,
  readSalesDriveConfig,
  toSafeSalesDriveConfig,
  type SalesDriveConfig
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

const isUniqueConflict = (error: unknown) =>
  Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');

const resolveReason = (config: SalesDriveConfig): SalesDriveRequestSyncResult['reason'] => {
  if (config.missing.length) return 'CONFIG_MISSING';
  if (!config.syncEnabled) return 'SYNC_DISABLED';
  if (!config.writeEnabled) return 'WRITE_DISABLED';
  return 'QUEUED';
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
