import { describe, expect, it, vi } from 'vitest';
import {
  VehicleTaxonomyCandidateService,
  shouldRejectPublicModelLabel
} from './vehicleTaxonomy.candidates.js';

const buildPrismaMock = () => ({
  vehicleTaxonomyCandidate: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'candidate_1', ...data })),
    update: vi.fn()
  },
  carListing: {
    findMany: vi.fn()
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
});
