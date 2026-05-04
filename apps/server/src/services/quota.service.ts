import { prisma } from './prisma.js';

export type QuotaPeriod = 'second' | 'minute' | 'day' | 'month';

export type QuotaConsumeParams = {
  companyId?: string | null;
  botId?: string | null;
  tgUserId: string;
  scope: string;
  limit: number;
  period?: QuotaPeriod;
  amount?: number;
};

export type QuotaConsumeResult = {
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
  periodKey: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const buildPeriodKey = (date: Date, period: QuotaPeriod) => {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const h = pad2(date.getUTCHours());
  const min = pad2(date.getUTCMinutes());
  const sec = pad2(date.getUTCSeconds());

  if (period === 'month') return `${y}-${m}`;
  if (period === 'second') return `${y}-${m}-${d}-${h}:${min}:${sec}`;
  if (period === 'minute') return `${y}-${m}-${d}-${h}:${min}`;
  return `${y}-${m}-${d}`;
};

class QuotaService {
  async consume(params: QuotaConsumeParams): Promise<QuotaConsumeResult> {
    const period = params.period || 'day';
    const amount = Math.max(1, Number(params.amount || 1));
    const limit = Math.max(1, Number(params.limit || 1));
    const periodKey = buildPeriodKey(new Date(), period);

    const row = await prisma.$transaction(async tx => {
      const where = {
        companyId_botId_tgUserId_scope_periodKey: {
          companyId: params.companyId || null,
          botId: params.botId || null,
          tgUserId: params.tgUserId,
          scope: params.scope,
          periodKey
        }
      } as any;

      const next = await tx.quotaUsage.upsert({
        where,
        create: {
          companyId: params.companyId || null,
          botId: params.botId || null,
          tgUserId: params.tgUserId,
          scope: params.scope,
          periodKey,
          used: amount
        },
        update: {
          used: { increment: amount }
        }
      });

      return next;
    });

    const allowed = row.used <= limit;
    return {
      allowed,
      used: row.used,
      remaining: Math.max(0, limit - row.used),
      limit,
      periodKey
    };
  }

  async getCurrentUsage(params: Omit<QuotaConsumeParams, 'limit' | 'amount'> & { period?: QuotaPeriod }) {
    const period = params.period || 'day';
    const periodKey = buildPeriodKey(new Date(), period);
    const row = await prisma.quotaUsage.findUnique({
      where: {
        companyId_botId_tgUserId_scope_periodKey: {
          companyId: params.companyId || null,
          botId: params.botId || null,
          tgUserId: params.tgUserId,
          scope: params.scope,
          periodKey
        }
      } as any
    });
    return {
      used: row?.used || 0,
      periodKey
    };
  }
}

export const quotaService = new QuotaService();
