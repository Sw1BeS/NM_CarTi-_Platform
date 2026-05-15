import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  normalizationAlias: {
    findMany: vi.fn()
  },
  carListing: {
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
    prismaMock.carListing.findMany.mockResolvedValue([]);
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

  it('merges observed inventory values and normalization aliases', async () => {
    prismaMock.normalizationAlias.findMany.mockResolvedValue([
      { type: 'brand', alias: 'бмв', canonical: 'BMW' },
      { type: 'model', alias: 'ікс пʼять', canonical: 'X5' },
      { type: 'city', alias: 'Львівська обл.', canonical: 'Львів' }
    ]);
    prismaMock.carListing.findMany.mockResolvedValue([
      {
        title: 'Zeekr 001 2024',
        year: 2024,
        location: 'Львів',
        sourceUrl: '',
        specs: {
          brand: 'Zeekr',
          model: '001',
          bodyType: 'Ліфтбек',
          fuel: 'Електро',
          transmission: 'Автомат',
          drive: 'Повний'
        },
        originalRaw: {}
      }
    ]);

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const taxonomy = await vehicleTaxonomyService.getTaxonomy({ companyId: 'company_1' });

    expect(taxonomy.brands.find((brand) => brand.label === 'BMW')?.aliases).toContain('бмв');
    expect(taxonomy.brands.find((brand) => brand.label === 'BMW')?.models.find((model) => model.label === 'X5')?.aliases).toContain('ікс пʼять');
    expect(taxonomy.brands.find((brand) => brand.label === 'Zeekr')?.models).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: '001', brandId: 'zeekr' })])
    );
    expect(taxonomy.cities.find((city) => city.label === 'Львів')?.aliases).toContain('Львівська обл.');
  });
});
