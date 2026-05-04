import { prisma } from '../../services/prisma.js';
import { logger } from '../../utils/logger.js';

let activityEntityId: string | null | undefined;

const resolveActivityEntityId = async () => {
  if (activityEntityId !== undefined) return activityEntityId;
  try {
    const def = await prisma.entityDefinition.findFirst({
      where: { slug: 'sys_activity', status: 'ACTIVE' },
      select: { id: true }
    });
    activityEntityId = def?.id || null;
    return activityEntityId;
  } catch (error: any) {
    logger.warn('[OrchestrationActivity] Failed to resolve sys_activity definition', error?.message || error);
    activityEntityId = null;
    return activityEntityId;
  }
};

export const recordOrchestrationActivity = async (input: {
  id?: string;
  action: string;
  details: string;
  entityType?: string;
  entityId?: string;
  userId?: string | null;
  status?: string;
}) => {
  const entityId = await resolveActivityEntityId();
  if (!entityId) return;

  try {
    await prisma.entityRecord.create({
      data: {
        entityId,
        data: {
          id: input.id || input.entityId || `activity_${Date.now()}`,
          action: input.action,
          details: input.details,
          entityType: input.entityType || 'ORCHESTRATION',
          entityId: input.entityId || null,
          userId: input.userId || null,
          status: input.status || 'OK',
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (error: any) {
    logger.warn('[OrchestrationActivity] Failed to write sys_activity record', error?.message || error);
  }
};
