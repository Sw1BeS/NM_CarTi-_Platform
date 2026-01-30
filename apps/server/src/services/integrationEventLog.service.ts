import { prisma } from './prisma.js';
import { logger } from '../utils/logger.js';

export type IntegrationLogStatus = 'OK' | 'ERROR' | 'WARN';

export const logIntegrationEvent = async (input: {
  companyId?: string | null;
  integration: string;
  entityId?: string | null;
  action: string;
  status: IntegrationLogStatus;
  message?: string | null;
  payloadMeta?: any;
}) => {
  try {
    await prisma.integrationEventLog.create({
      data: {
        companyId: input.companyId || null,
        integration: input.integration,
        entityId: input.entityId || null,
        action: input.action,
        status: input.status,
        message: input.message || null,
        payloadMeta: input.payloadMeta ?? null
      }
    });
  } catch (e: any) {
    logger.warn('[IntegrationEventLog] Failed to write log', e?.message || e);
  }
};
