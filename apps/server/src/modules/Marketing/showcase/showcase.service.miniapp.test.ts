import { beforeEach, describe, expect, it, vi } from 'vitest';

const showcaseFindUnique = vi.fn();
const botFindFirst = vi.fn();
const carCount = vi.fn();
const carFindMany = vi.fn();

vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    showcase: {
      findUnique: showcaseFindUnique
    },
    botConfig: {
      findFirst: botFindFirst
    },
    carListing: {
      count: carCount,
      findMany: carFindMany
    }
  }
}));

const makeShowcase = (overrides: Record<string, unknown> = {}) => ({
  id: 'showcase_1',
  workspaceId: 'company_1',
  name: 'CarTié',
  slug: 'cartie',
  isPublic: true,
  botId: 'bot_1',
  rules: {
    mode: 'FILTER',
    filters: {
      status: ['AVAILABLE']
    }
  },
  createdAt: new Date('2026-05-05T00:00:00.000Z'),
  updatedAt: new Date('2026-05-05T00:00:00.000Z'),
  ...overrides
});

describe('ShowcaseService MiniApp inventory routing', () => {
  beforeEach(() => {
    showcaseFindUnique.mockReset();
    botFindFirst.mockReset();
    carCount.mockReset();
    carFindMany.mockReset();
    carCount.mockResolvedValue(0);
    carFindMany.mockResolvedValue([]);
  });

  it('uses explicit MiniApp status over default showcase status filters', async () => {
    showcaseFindUnique.mockResolvedValue(makeShowcase());

    const { ShowcaseService } = await import('./showcase.service.js');
    await new ShowcaseService().getInventoryForShowcase('cartie', {
      status: 'PENDING'
    } as any);

    expect(carCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'company_1',
        status: 'PENDING'
      })
    }));
  });

  it('falls back to bot company inventory when slug resolves to a bot without a showcase', async () => {
    showcaseFindUnique.mockResolvedValue(null);
    botFindFirst.mockResolvedValue({
      id: 'bot_2',
      name: 'B2B',
      companyId: 'company_2',
      config: {
        defaultShowcaseSlug: 'cardealer_lviv_bot',
        miniAppConfig: { showcaseSlug: 'cardealer_lviv_bot' }
      }
    });

    const { ShowcaseService } = await import('./showcase.service.js');
    const result = await new ShowcaseService().getInventoryForShowcase('cardealer_lviv_bot', {
      status: 'AVAILABLE'
    } as any);

    expect(result.showcase.slug).toBe('cardealer_lviv_bot');
    expect(result.showcase.workspaceId).toBe('company_2');
    expect(carFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'company_2',
        status: 'AVAILABLE'
      })
    }));
  });
});
