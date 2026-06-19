import { describe, expect, it, vi } from 'vitest';
import {
  VehicleTaxonomyCandidateService,
  shouldRejectPublicModelLabel
} from './vehicleTaxonomy.candidates.js';

const buildPrismaMock = () => ({
  vehicleTaxonomyCandidate: {
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'candidate_1', ...data })),
    update: vi.fn().mockImplementation(async ({ data }) => ({ id: 'candidate_1', ...data }))
  },
  carListing: {
    findMany: vi.fn()
  },
  normalizationAlias: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'alias_1', ...data })),
    update: vi.fn().mockImplementation(async ({ data }) => ({ id: 'alias_1', ...data }))
  }
});

describe('vehicle taxonomy candidates', () => {
  it('rejects noisy long model labels from public taxonomy', () => {
    expect(shouldRejectPublicModelLabel('Model X Білий колірЕлектроВідсутній у розшукуОпис від продавця')).toBe(true);
    expect(shouldRejectPublicModelLabel('X5 M50i G05')).toBe(false);
  });

  it('records a normalized taxonomy candidate for review', async () => {
    const prisma = buildPrismaMock();
    const service = new VehicleTaxonomyCandidateService({
      prisma,
      now: () => new Date('2026-06-18T10:00:00.000Z')
    });

    const record = await service.recordCandidate({
      kind: 'model',
      label: '  Model X Long Range  ',
      makeLabel: 'Tesla',
      source: 'OBSERVED_INVENTORY',
      evidence: { carListingId: 'car_1' }
    });

    expect(record).toMatchObject({ id: 'candidate_1', label: 'Model X Long Range', makeLabel: 'Tesla' });
    expect(prisma.vehicleTaxonomyCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'model',
        label: 'Model X Long Range',
        makeLabel: 'Tesla',
        source: 'OBSERVED_INVENTORY',
        status: 'NEW',
        evidence: expect.objectContaining({
          firstSeenAt: '2026-06-18T10:00:00.000Z',
          lastSeenAt: '2026-06-18T10:00:00.000Z',
          samples: [expect.objectContaining({ carListingId: 'car_1' })]
        })
      })
    });
  });

  it('scans observed inventory into rejected model candidates without publishing them', async () => {
    const prisma = buildPrismaMock();
    const noisyModel = 'Model X Білий колірЕлектроВідсутній у розшукуОпис від продавця';
    prisma.carListing.findMany.mockResolvedValue([
      {
        id: 'car_1',
        companyId: 'company_1',
        title: `Tesla ${noisyModel}`,
        location: 'Львів',
        specs: { brand: 'Tesla', model: noisyModel },
        sourceUrl: 'https://auto.ria.com/uk/auto_tesla_model_x_123.html',
        originalRaw: {}
      }
    ]);
    const service = new VehicleTaxonomyCandidateService({
      prisma,
      now: () => new Date('2026-06-18T10:00:00.000Z')
    });

    const result = await service.collectObservedInventoryCandidates({ companyId: 'company_1', limit: 10 });

    expect(result).toMatchObject({ scanned: 1, rejectedModels: 1, recorded: 1 });
    expect(prisma.vehicleTaxonomyCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'model',
        label: noisyModel,
        makeLabel: 'Tesla',
        source: 'OBSERVED_INVENTORY_REJECTED_MODEL'
      })
    });
  });

  it('lists candidates with bounded filters for moderation', async () => {
    const prisma = buildPrismaMock();
    prisma.vehicleTaxonomyCandidate.findMany.mockResolvedValue([{ id: 'candidate_1', status: 'NEW' }]);
    const service = new VehicleTaxonomyCandidateService({ prisma });

    const result = await service.listCandidates({ kind: 'city', status: 'NEW', limit: 500 });

    expect(result).toEqual([{ id: 'candidate_1', status: 'NEW' }]);
    expect(prisma.vehicleTaxonomyCandidate.findMany).toHaveBeenCalledWith({
      where: { kind: 'city', status: 'NEW' },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
  });

  it('approves brand/model/city candidates by creating normalization aliases, not public taxonomy rows', async () => {
    const prisma = buildPrismaMock();
    prisma.vehicleTaxonomyCandidate.findUnique.mockResolvedValue({
      id: 'candidate_1',
      kind: 'make',
      label: 'Тесла',
      status: 'NEW'
    });
    const service = new VehicleTaxonomyCandidateService({
      prisma,
      now: () => new Date('2026-06-19T10:00:00.000Z')
    });

    const result = await service.reviewCandidate({
      id: 'candidate_1',
      status: 'APPROVED',
      canonicalLabel: 'Tesla',
      companyId: 'company_1'
    });

    expect(result.alias).toMatchObject({
      id: 'alias_1',
      alias: 'Тесла',
      canonical: 'Tesla',
      companyId: 'company_1'
    });
    expect(prisma.normalizationAlias.create).toHaveBeenCalledWith({
      data: {
        type: 'brand',
        alias: 'Тесла',
        canonical: 'Tesla',
        companyId: 'company_1'
      }
    });
    expect(prisma.vehicleTaxonomyCandidate.update).toHaveBeenCalledWith({
      where: { id: 'candidate_1' },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date('2026-06-19T10:00:00.000Z')
      }
    });
  });

  it('rejects candidates without creating aliases', async () => {
    const prisma = buildPrismaMock();
    prisma.vehicleTaxonomyCandidate.findUnique.mockResolvedValue({
      id: 'candidate_1',
      kind: 'specOption',
      label: 'nonsense',
      status: 'NEW'
    });
    const service = new VehicleTaxonomyCandidateService({ prisma });

    await service.reviewCandidate({ id: 'candidate_1', status: 'REJECTED' });

    expect(prisma.normalizationAlias.create).not.toHaveBeenCalled();
    expect(prisma.vehicleTaxonomyCandidate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'candidate_1' },
      data: expect.objectContaining({ status: 'REJECTED' })
    }));
  });
});
