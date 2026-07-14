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
        OR: expect.arrayContaining([
          { availabilityState: { in: ['IN_TRANSIT', 'IMPORT_TO_ORDER'] } },
          {
            AND: [
              { status: 'PENDING' },
              { publicationStatus: 'PUBLISHED' }
            ]
          }
        ])
      })
    }));
  });

  it('infers pending inventory when only IN_TRANSIT availabilityState is passed', async () => {
    showcaseFindUnique.mockResolvedValue(makeShowcase());

    const { ShowcaseService } = await import('./showcase.service.js');
    await new ShowcaseService().getInventoryForShowcase('cartie', {
      availabilityState: 'IN_TRANSIT'
    } as any);

    expect(carCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'company_1',
        availabilityState: 'IN_TRANSIT',
        OR: expect.arrayContaining([
          { availabilityState: { in: ['IN_TRANSIT', 'IMPORT_TO_ORDER'] } },
          {
            AND: [
              { status: 'PENDING' },
              { publicationStatus: 'PUBLISHED' }
            ]
          }
        ])
      })
    }));
  });

  it('hard-clamps public inventory to PUBLISHED even when showcase rules request unpublished statuses', async () => {
    showcaseFindUnique.mockResolvedValue(makeShowcase({
      rules: {
        mode: 'FILTER',
        filters: {
          status: ['AVAILABLE'],
          publicationStatus: ['REVIEW', 'HIDDEN']
        }
      }
    }));

    const { ShowcaseService } = await import('./showcase.service.js');
    const result = await new ShowcaseService().getInventoryForShowcase('cartie', {
      status: 'AVAILABLE'
    } as any);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(carCount).not.toHaveBeenCalled();
    expect(carFindMany).not.toHaveBeenCalled();
  });

  it('includes legacy AVAILABLE cars that are textually marked as in transit when MiniApp requests PENDING', async () => {
    showcaseFindUnique.mockResolvedValue(makeShowcase());

    const { ShowcaseService } = await import('./showcase.service.js');
    await new ShowcaseService().getInventoryForShowcase('cartie', {
      status: 'PENDING'
    } as any);

    expect(carFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'company_1',
        OR: expect.arrayContaining([
          { availabilityState: { in: ['IN_TRANSIT', 'IMPORT_TO_ORDER'] } },
          expect.objectContaining({
            AND: expect.arrayContaining([
              { status: 'PENDING' },
              { publicationStatus: 'PUBLISHED' }
            ])
          }),
          expect.objectContaining({
            AND: expect.arrayContaining([
              { status: 'AVAILABLE' },
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { description: expect.objectContaining({ contains: '#вдорозі' }) },
                  { description: expect.objectContaining({ contains: 'прямує' }) }
                ])
              })
            ])
          })
        ])
      })
    }));
  });

  it('searches MiniApp inventory by normalized source/spec fields, not only raw title text', async () => {
    showcaseFindUnique.mockResolvedValue(makeShowcase());
    carFindMany.mockResolvedValue([
      {
        id: 'car_toyota',
        title: 'Toyota Camry 2020',
        description: '',
        location: 'Київ',
        sourceUrl: '',
        year: 2020,
        specs: { brand: 'Toyota', model: 'Camry' },
        originalRaw: {}
      },
      {
        id: 'car_nissan_specs',
        title: 'Перевірений VIN-код',
        description: '',
        location: 'Київ',
        sourceUrl: '',
        year: 2021,
        specs: { brand: 'nissan', model: 'leaf' },
        originalRaw: {}
      },
      {
        id: 'car_nissan_source_url',
        title: 'Перевірений VIN-код',
        description: '',
        location: 'Львів',
        sourceUrl: 'https://auto.ria.com/uk/auto_nissan_leaf_12345678.html',
        year: 2022,
        specs: {},
        originalRaw: {}
      }
    ]);

    const { ShowcaseService } = await import('./showcase.service.js');
    const result = await new ShowcaseService().getInventoryForShowcase('cartie', {
      status: 'AVAILABLE',
      search: 'Nissan'
    } as any);

    expect(carCount).not.toHaveBeenCalled();
    expect(carFindMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 200
    }));
    expect(result.total).toBe(2);
    expect(result.items.map(item => item.id)).toEqual(['car_nissan_specs', 'car_nissan_source_url']);
  });

  it('does not match known brand searches from noisy scraped related-listing text', async () => {
    showcaseFindUnique.mockResolvedValue(makeShowcase());
    carFindMany.mockResolvedValue([
      {
        id: 'car_tesla_related_text',
        title: 'Tesla Model X 2023',
        description: 'Схожі оголошення Nissan X-Trail 2025, Toyota Highlander 2024',
        location: 'Київ',
        sourceUrl: 'https://auto.ria.com/uk/auto_tesla_model_x_123.html',
        year: 2023,
        specs: { brand: 'Tesla', model: 'Model X' },
        originalRaw: {}
      },
      {
        id: 'car_nissan_title',
        title: 'NISSAN ROGUE 2017',
        description: '',
        location: 'Львів',
        sourceUrl: '',
        year: 2017,
        specs: { brand: 'NISSAN', model: 'ROGUE' },
        originalRaw: {}
      }
    ]);

    const { ShowcaseService } = await import('./showcase.service.js');
    const result = await new ShowcaseService().getInventoryForShowcase('cartie', {
      status: 'PENDING',
      search: 'Nissan'
    } as any);

    expect(result.total).toBe(1);
    expect(result.items.map(item => item.id)).toEqual(['car_nissan_title']);
  });

  it('requires the remaining model tokens when a search contains a known brand and model', async () => {
    showcaseFindUnique.mockResolvedValue(makeShowcase());
    carFindMany.mockResolvedValue([
      {
        id: 'car_nissan_rogue',
        title: 'NISSAN ROGUE 2017',
        description: '',
        location: 'Львів',
        sourceUrl: '',
        year: 2017,
        specs: { brand: 'NISSAN', model: 'ROGUE' },
        originalRaw: {}
      },
      {
        id: 'car_nissan_leaf',
        title: 'Перевірений VIN-код',
        description: '',
        location: 'Київ',
        sourceUrl: 'https://auto.ria.com/uk/auto_nissan_leaf_12345678.html',
        year: 2022,
        specs: {},
        originalRaw: {}
      },
      {
        id: 'car_tesla_noisy_description',
        title: 'Tesla Model X 2023',
        description: 'Схожі оголошення Nissan Leaf 2022',
        location: 'Київ',
        sourceUrl: '',
        year: 2023,
        specs: { brand: 'Tesla', model: 'Model X' },
        originalRaw: {}
      }
    ]);

    const { ShowcaseService } = await import('./showcase.service.js');
    const result = await new ShowcaseService().getInventoryForShowcase('cartie', {
      status: 'AVAILABLE',
      search: 'Nissan Leaf'
    } as any);

    expect(result.total).toBe(1);
    expect(result.items.map(item => item.id)).toEqual(['car_nissan_leaf']);
  });

  it('continues bounded search batches past the first full candidate page', async () => {
    showcaseFindUnique.mockResolvedValue(makeShowcase());
    carFindMany
      .mockResolvedValueOnce(Array.from({ length: 200 }, (_, index) => ({
        id: `car_toyota_${index}`,
        title: `Toyota Camry ${index}`,
        description: '',
        location: 'Київ',
        sourceUrl: '',
        year: 2020,
        specs: { brand: 'Toyota', model: 'Camry' },
        originalRaw: {}
      })))
      .mockResolvedValueOnce([
        {
          id: 'car_nissan_older',
          title: 'Перевірений VIN-код',
          description: '',
          location: 'Львів',
          sourceUrl: 'https://auto.ria.com/uk/auto_nissan_leaf_12345678.html',
          year: 2022,
          specs: {},
          originalRaw: {}
        }
      ]);

    const { ShowcaseService } = await import('./showcase.service.js');
    const result = await new ShowcaseService().getInventoryForShowcase('cartie', {
      status: 'AVAILABLE',
      search: 'nissan'
    } as any);

    expect(carFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ skip: 0, take: 200 }));
    expect(carFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ skip: 200, take: 200 }));
    expect(result.total).toBe(1);
    expect(result.items.map(item => item.id)).toEqual(['car_nissan_older']);
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
        publicationStatus: 'PUBLISHED',
        OR: expect.arrayContaining([
          { availabilityState: 'IN_STOCK' },
          expect.objectContaining({
            AND: expect.arrayContaining([
              { status: 'AVAILABLE' },
              expect.objectContaining({ NOT: expect.any(Object) })
            ])
          })
        ])
      })
    }));
  });
});
