import { describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  vehicleMake: {
    findMany: vi.fn()
  },
  vehicleSpecOption: {
    findMany: vi.fn()
  },
  geoPlace: {
    findMany: vi.fn()
  }
}));

vi.mock('../../services/prisma.js', () => ({
  prisma: prismaMock
}));

describe('VehicleTaxonomyRepository', () => {
  it('reads active makes with models and snapshot options', async () => {
    prismaMock.vehicleMake.findMany.mockResolvedValue([
      {
        id: 'make_1',
        slug: 'bmw',
        label: 'BMW',
        sourceMeta: {},
        updatedAt: new Date('2026-06-18T00:00:00.000Z'),
        models: [
          {
            id: 'model_1',
            slug: 'x5',
            label: 'X5',
            sourceMeta: {},
            updatedAt: new Date('2026-06-18T00:00:00.000Z')
          }
        ]
      }
    ]);
    prismaMock.vehicleSpecOption.findMany.mockResolvedValue([
      {
        group: 'fuel',
        slug: 'diesel',
        label: 'Дизель',
        sourceMeta: {},
        updatedAt: new Date('2026-06-18T00:00:00.000Z')
      }
    ]);
    prismaMock.geoPlace.findMany.mockResolvedValue([
      {
        slug: 'lviv',
        label: 'Львів',
        sourceMeta: {},
        updatedAt: new Date('2026-06-18T00:00:00.000Z')
      }
    ]);

    const { vehicleTaxonomyRepository } = await import('./vehicleTaxonomy.repository.js');
    const snapshot = await vehicleTaxonomyRepository.readPublicSnapshot({ countryCode: 'UA' });

    expect(snapshot.makes[0]).toMatchObject({ slug: 'bmw', label: 'BMW' });
    expect(snapshot.makes[0].models[0]).toMatchObject({ slug: 'x5', label: 'X5' });
    expect(snapshot.specOptions[0]).toMatchObject({ group: 'fuel', slug: 'diesel' });
    expect(snapshot.places[0]).toMatchObject({ slug: 'lviv', label: 'Львів' });
    expect(snapshot.updatedAt?.toISOString()).toBe('2026-06-18T00:00:00.000Z');
  });
});
