import { describe, expect, it, vi } from 'vitest';

const upsertMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock('./prisma.js', () => ({
  prisma: {
    $transaction: async (fn: any) => fn({
      quotaUsage: {
        upsert: upsertMock
      }
    }),
    quotaUsage: {
      findUnique: findUniqueMock
    }
  }
}));

describe('quota.service', () => {
  it('marks usage as blocked when limit is exceeded', async () => {
    upsertMock.mockResolvedValueOnce({ used: 6 });

    const { quotaService } = await import('./quota.service.js');
    const res = await quotaService.consume({
      companyId: 'cmp',
      botId: 'bot',
      tgUserId: '1',
      scope: 'bot_a.lead.daily',
      limit: 5,
      period: 'day'
    });

    expect(res.allowed).toBe(false);
    expect(res.used).toBe(6);
    expect(res.remaining).toBe(0);
  });

  it('returns current usage and period key', async () => {
    findUniqueMock.mockResolvedValueOnce({ used: 2 });

    const { quotaService } = await import('./quota.service.js');
    const res = await quotaService.getCurrentUsage({
      companyId: 'cmp',
      botId: 'bot',
      tgUserId: '1',
      scope: 'bot.step.per_minute',
      period: 'minute'
    });

    expect(res.used).toBe(2);
    expect(typeof res.periodKey).toBe('string');
    expect(res.periodKey.length).toBeGreaterThan(0);
  });
});
