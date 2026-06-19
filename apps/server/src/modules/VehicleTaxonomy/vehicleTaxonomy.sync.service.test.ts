import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleTaxonomySyncService } from './vehicleTaxonomy.sync.service.js';

const autoriaProviderMock = vi.hoisted(() => ({
  fetchAutoriaMarks: vi.fn(),
  fetchAutoriaModels: vi.fn(),
  fetchAutoriaPlaces: vi.fn(),
  fetchAutoriaSpecOptions: vi.fn()
}));

vi.mock('./providers/autoria.provider.js', () => autoriaProviderMock);

const buildPrismaMock = () => ({
  taxonomySyncRun: {
    create: vi.fn().mockResolvedValue({ id: 'run_1' }),
    update: vi.fn().mockImplementation(async ({ data }) => ({
      id: 'run_1',
      source: 'NHTSA',
      status: data.status,
      startedAt: new Date('2026-06-18T09:00:00.000Z'),
      finishedAt: data.finishedAt,
      counts: data.counts,
      sourceMeta: { dryRun: false }
    })),
    findFirst: vi.fn()
  },
  vehicleMake: {
    upsert: vi.fn().mockResolvedValue({ id: 'make_bmw', slug: 'bmw' })
  },
  vehicleModel: {
    upsert: vi.fn()
  },
  vehicleSpecOption: {
    upsert: vi.fn()
  },
  geoPlace: {
    upsert: vi.fn()
  }
});

describe('VehicleTaxonomySyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTORIA_ALLOW_PARTIAL_ON_RATE_LIMIT;
  });

  afterEach(() => {
    delete process.env.AUTORIA_ALLOW_PARTIAL_ON_RATE_LIMIT;
  });

  it('counts provider records in dry-run mode without mutating taxonomy tables', async () => {
    const prisma = buildPrismaMock();
    const service = new VehicleTaxonomySyncService({
      prisma,
      providers: {
        NHTSA: vi.fn().mockResolvedValue({
          makes: [{ slug: 'bmw', label: 'BMW', externalIds: { nhtsa: 452 } }],
          models: [{ makeExternalId: 452, slug: 'x5', label: 'X5', externalIds: { nhtsa: 1712 } }],
          places: [{ countryCode: 'UA', type: 'city', slug: 'kyiv', label: 'Київ' }]
        })
      },
      now: () => new Date('2026-06-18T09:00:00.000Z')
    });

    const result = await service.startSync({ sources: ['NHTSA'], dryRun: true, countryCode: 'UA' });

    expect(result).toMatchObject({ status: 'DRY_RUN', dryRun: true, counts: { makes: 1, models: 1, places: 1 } });
    expect(prisma.taxonomySyncRun.create).not.toHaveBeenCalled();
    expect(prisma.vehicleMake.upsert).not.toHaveBeenCalled();
  });

  it('passes explicit full import options to providers and dry-run metadata', async () => {
    const prisma = buildPrismaMock();
    const provider = vi.fn().mockResolvedValue({
      makes: [{ slug: 'bmw', label: 'BMW', externalIds: { nhtsa: 452 } }],
      models: [],
      places: [{ countryCode: 'UA', type: 'settlement', slug: 'брюховичі', label: 'Брюховичі' }]
    });
    const service = new VehicleTaxonomySyncService({
      prisma,
      providers: { NHTSA: provider },
      now: () => new Date('2026-06-18T09:00:00.000Z')
    });

    const result = await service.startSync({
      sources: ['NHTSA'],
      dryRun: true,
      countryCode: 'ua',
      modelMakeLimit: null,
      vehicleType: 'car',
      includeSettlements: true
    });

    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      countryCode: 'UA',
      modelMakeLimit: null,
      vehicleType: 'car',
      includeSettlements: true
    }));
    expect(result.sourceMeta).toMatchObject({
      countryCode: 'UA',
      options: {
        modelMakeLimit: 'all',
        vehicleType: 'car',
        includeSettlements: true
      }
    });
    expect(result.counts).toMatchObject({ makes: 1, models: 0, places: 1 });
  });

  it('upserts provider records and completes the sync run', async () => {
    const prisma = buildPrismaMock();
    const service = new VehicleTaxonomySyncService({
      prisma,
      providers: {
        NHTSA: vi.fn().mockResolvedValue({
          makes: [{ slug: 'bmw', label: 'BMW', externalIds: { nhtsa: 452 } }],
          models: [{ makeExternalId: 452, slug: 'x5', label: 'X5', externalIds: { nhtsa: 1712 } }],
          specOptions: [{ group: 'fuel', slug: 'diesel', label: 'Дизель' }],
          places: [{ countryCode: 'UA', type: 'city', slug: 'kyiv', label: 'Київ' }]
        })
      },
      now: () => new Date('2026-06-18T09:00:00.000Z')
    });

    const result = await service.startSync({ sources: ['NHTSA'], dryRun: false, countryCode: 'UA' });

    expect(result.status).toBe('SUCCESS');
    expect(prisma.taxonomySyncRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ source: 'NHTSA', status: 'RUNNING' })
    }));
    expect(prisma.vehicleMake.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { slug: 'bmw' },
      create: expect.objectContaining({ slug: 'bmw', label: 'BMW', normalizedKey: 'bmw' })
    }));
    expect(prisma.vehicleModel.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ makeId: 'make_bmw', slug: 'x5', label: 'X5' })
    }));
    expect(prisma.vehicleSpecOption.upsert).toHaveBeenCalled();
    expect(prisma.geoPlace.upsert).toHaveBeenCalled();
    expect(prisma.taxonomySyncRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run_1' },
      data: expect.objectContaining({ status: 'SUCCESS' })
    }));
  });

  it('keeps AUTO.RIA makes when optional model/spec/place fanout is rate-limited in partial mode', async () => {
    const rateLimited = Object.assign(new Error('rate limited'), { response: { status: 429 } });
    process.env.AUTORIA_ALLOW_PARTIAL_ON_RATE_LIMIT = '1';
    autoriaProviderMock.fetchAutoriaMarks.mockResolvedValue([
      { slug: 'tesla', label: 'Tesla', externalIds: { autoria: 2233 } }
    ]);
    autoriaProviderMock.fetchAutoriaModels.mockRejectedValue(rateLimited);
    autoriaProviderMock.fetchAutoriaSpecOptions.mockRejectedValue(rateLimited);
    autoriaProviderMock.fetchAutoriaPlaces.mockRejectedValue(rateLimited);

    const service = new VehicleTaxonomySyncService({
      prisma: buildPrismaMock(),
      now: () => new Date('2026-06-18T09:00:00.000Z')
    });

    const result = await service.startSync({
      sources: ['AUTO_RIA'],
      dryRun: true,
      autoriaApiKey: 'test-key',
      modelMakeLimit: 1,
      modelFetchConcurrency: 1
    });

    expect(result).toMatchObject({
      status: 'DRY_RUN',
      counts: { sources: 1, makes: 1, models: 0, specOptions: 0, places: 0 }
    });
    expect(autoriaProviderMock.fetchAutoriaMarks).toHaveBeenCalledTimes(1);
    expect(autoriaProviderMock.fetchAutoriaModels).toHaveBeenCalledWith({
      apiKey: 'test-key',
      categoryId: 1,
      makeExternalId: 2233
    });
    expect(autoriaProviderMock.fetchAutoriaSpecOptions).toHaveBeenCalled();
    expect(autoriaProviderMock.fetchAutoriaPlaces).toHaveBeenCalled();
  });

  it('still fails AUTO.RIA sync when the required marks request is rate-limited', async () => {
    const rateLimited = Object.assign(new Error('marks rate limited'), { response: { status: 429 } });
    process.env.AUTORIA_ALLOW_PARTIAL_ON_RATE_LIMIT = '1';
    autoriaProviderMock.fetchAutoriaMarks.mockRejectedValue(rateLimited);

    const service = new VehicleTaxonomySyncService({
      prisma: buildPrismaMock(),
      now: () => new Date('2026-06-18T09:00:00.000Z')
    });

    await expect(service.startSync({
      sources: ['AUTO_RIA'],
      dryRun: true,
      autoriaApiKey: 'test-key'
    })).rejects.toThrow('marks rate limited');
  });
});
