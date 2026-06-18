import { describe, expect, it, vi } from 'vitest';

const repositoryMock = vi.hoisted(() => ({
  readPublicSnapshot: vi.fn()
}));

const prismaMock = vi.hoisted(() => ({
  normalizationAlias: {
    findMany: vi.fn()
  }
}));

vi.mock('./vehicleTaxonomy.repository.js', () => ({
  vehicleTaxonomyRepository: repositoryMock
}));

vi.mock('../../services/prisma.js', () => ({
  prisma: prismaMock
}));

describe('VehicleTaxonomyService', () => {
  it('deduplicates canonical brands by id and keeps model labels bounded', async () => {
    prismaMock.normalizationAlias.findMany.mockResolvedValue([]);
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        {
          id: 'make_audi_1',
          slug: 'audi',
          label: 'Audi',
          sourceMeta: {},
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [{ id: 'model_a4', slug: 'a4', label: 'A4', sourceMeta: {}, updatedAt: null }]
        },
        {
          id: 'make_audi_2',
          slug: 'audi',
          label: 'AUDI',
          sourceMeta: {},
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [
            { id: 'model_q5', slug: 'q5', label: 'Q5', sourceMeta: {}, updatedAt: null },
            {
              id: 'model_noise',
              slug: 'model-x-noise',
              label: 'Model X Білий колірЕлектроВідсутній у розшукуОпис від продавця',
              sourceMeta: {},
              updatedAt: null
            }
          ]
        }
      ],
      specOptions: [],
      places: [],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.getPublicTaxonomy({ countryCode: 'UA' });

    expect(output.source).toBe('LOCAL_SNAPSHOT');
    expect(output.brands.filter((brand) => brand.id === 'audi')).toHaveLength(1);
    expect(output.brands.find((brand) => brand.id === 'audi')?.models.map((model) => model.label)).toEqual(['A4', 'Q5', 'Other']);
  });

  it('falls back to emergency data when local snapshot is empty', async () => {
    prismaMock.normalizationAlias.findMany.mockResolvedValue([]);
    repositoryMock.readPublicSnapshot.mockResolvedValue({ makes: [], specOptions: [], places: [], updatedAt: null });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.getPublicTaxonomy({ countryCode: 'UA' });

    expect(output.source).toBe('EMERGENCY_FALLBACK');
    expect(output.stale).toBe(true);
    expect(output.brands.some((brand) => brand.id === 'bmw')).toBe(true);
    expect(output.brands.some((brand) => brand.id === 'other')).toBe(true);
  });

  it('applies normalization aliases to canonical options', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        {
          id: 'make_bmw',
          slug: 'bmw',
          label: 'BMW',
          sourceMeta: {},
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [{ id: 'model_x5', slug: 'x5', label: 'X5', sourceMeta: {}, updatedAt: null }]
        }
      ],
      specOptions: [],
      places: [{ slug: 'lviv', label: 'Львів', sourceMeta: {}, updatedAt: null }],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });
    prismaMock.normalizationAlias.findMany.mockResolvedValue([
      { type: 'brand', alias: 'бмв', canonical: 'BMW' },
      { type: 'model', alias: 'ікс пʼять', canonical: 'X5' },
      { type: 'city', alias: 'Львівська обл.', canonical: 'Львів' }
    ]);

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.getPublicTaxonomy({ companyId: 'company_1', countryCode: 'UA' });

    expect(output.brands.find((brand) => brand.id === 'bmw')?.aliases).toContain('бмв');
    expect(output.brands.find((brand) => brand.id === 'bmw')?.models.find((model) => model.id === 'x5')?.aliases).toContain('ікс пʼять');
    expect(output.cities.find((city) => city.id === 'lviv')?.aliases).toContain('Львівська обл.');
  });
});
