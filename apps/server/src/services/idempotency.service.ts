import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export type IdempotentContext = {
  companyId?: string | null;
  integration: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey: string;
  traceId?: string | null;
  meta?: Record<string, unknown> | null;
};

class IdempotencyService {
  buildKey(parts: Array<string | number | null | undefined>) {
    return parts
      .map(part => String(part || '').trim())
      .filter(Boolean)
      .join(':');
  }

  async runOnce<T>(ctx: IdempotentContext, handler: () => Promise<T>) {
    try {
      await prisma.integrationEventLog.create({
        data: {
          companyId: ctx.companyId || null,
          integration: ctx.integration,
          action: ctx.action,
          entityType: ctx.entityType || null,
          entityId: ctx.entityId || null,
          status: 'STARTED',
          traceId: ctx.traceId || null,
          idempotencyKey: ctx.idempotencyKey,
          meta: (ctx.meta || {}) as any
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await prisma.integrationEventLog.findUnique({
          where: { idempotencyKey: ctx.idempotencyKey }
        });

        return {
          deduplicated: true,
          result: null,
          existing
        } as const;
      }
      throw error;
    }

    try {
      const result = await handler();

      await prisma.integrationEventLog.update({
        where: { idempotencyKey: ctx.idempotencyKey },
        data: {
          status: 'SUCCESS'
        }
      }).catch(() => null);

      return {
        deduplicated: false,
        result,
        existing: null
      } as const;
    } catch (error) {
      await prisma.integrationEventLog.update({
        where: { idempotencyKey: ctx.idempotencyKey },
        data: {
          status: 'FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      }).catch(() => null);

      throw error;
    }
  }
}

export const idempotencyService = new IdempotencyService();
