import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  normalizationAlias: {
    findMany: vi.fn()
  },
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

vi.mock('./prisma.js', () => ({
  prisma: prismaMock
}));

describe('VehicleTaxonomyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.normalizationAlias.findMany.mockResolvedValue([]);
    prismaMock.vehicleMake.findMany.mockResolvedValue([]);
    prismaMock.vehicleSpecOption.findMany.mockResolvedValue([]);
    prismaMock.geoPlace.findMany.mockResolvedValue([]);
  });

  it('returns curated brands with stable ids and Other fallback', async () => {
    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');

    const taxonomy = await vehicleTaxonomyService.getTaxonomy({ companyId: 'company_1' });

    const bmw = taxonomy.brands.find((brand) => brand.label === 'BMW');
    expect(bmw).toMatchObject({ id: 'bmw', label: 'BMW' });
    expect(bmw?.models.some((model) => model.label === 'X5' && model.brandId === 'bmw')).toBe(true);
    expect(taxonomy.brands.some((brand) => brand.id === 'other')).toBe(true);
    expect(taxonomy.bodyTypes.some((option) => option.label === 'SUV')).toBe(true);
  });

  it('applies normalization aliases without promoting observed inventory noise', async () => {
    prismaMock.normalizationAlias.findMany.mockResolvedValue([
      { type: 'brand', alias: 'бмв', canonical: 'BMW' },
      { type: 'model', alias: 'ікс пʼять', canonical: 'X5' },
      { type: 'city', alias: 'Львівська обл.', canonical: 'Львів' }
    ]);

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const taxonomy = await vehicleTaxonomyService.getTaxonomy({ companyId: 'company_1' });

    expect(taxonomy.brands.find((brand) => brand.label === 'BMW')?.aliases).toContain('бмв');
    expect(taxonomy.brands.find((brand) => brand.label === 'BMW')?.models.find((model) => model.label === 'X5')?.aliases).toContain('ікс пʼять');
    expect(taxonomy.brands.find((brand) => brand.label === 'Zeekr')).toBeUndefined();
    expect(taxonomy.cities.find((city) => city.label === 'Львів')?.aliases).toContain('Львівська обл.');
  });
});
