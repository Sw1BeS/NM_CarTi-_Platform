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

  it('deduplicates English/Ukrainian city aliases and canonicalizes petrol to бензин', async () => {
    prismaMock.normalizationAlias.findMany.mockResolvedValue([
      { type: 'city', alias: 'Київ', canonical: 'Kyiv' },
      { type: 'city', alias: 'Івано-Франківськ', canonical: 'Ivano-Frankivsk' }
    ]);
    prismaMock.carListing.findMany.mockResolvedValue([
      {
        title: 'Nissan Leaf 2020',
        year: 2020,
        location: 'Kyiv',
        sourceUrl: '',
        specs: {
          fuel: 'petrol',
          transmission: 'automatic'
        },
        originalRaw: {}
      },
      {
        title: 'BMW X5 2022',
        year: 2022,
        location: 'Київ',
        sourceUrl: '',
        specs: {
          fuel: 'Бензин'
        },
        originalRaw: {}
      }
    ]);

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const taxonomy = await vehicleTaxonomyService.getTaxonomy({ companyId: 'company_1' });

    expect(taxonomy.fuels.filter((fuel) => fuel.label.toLowerCase() === 'petrol')).toHaveLength(0);
    expect(taxonomy.fuels.filter((fuel) => fuel.label === 'Бензин')).toHaveLength(1);
    expect(taxonomy.fuels.find((fuel) => fuel.label === 'Бензин')?.aliases).toEqual(
      expect.arrayContaining(['petrol'])
    );
    expect(taxonomy.cities.filter((city) => city.id === 'kyiv')).toHaveLength(1);
    expect(taxonomy.cities.find((city) => city.id === 'kyiv')).toMatchObject({
      label: 'Київ',
      aliases: expect.arrayContaining(['Kyiv'])
    });
    expect(taxonomy.cities.filter((city) => city.id === 'ivano-frankivsk')).toHaveLength(1);
    expect(taxonomy.cities.find((city) => city.id === 'ivano-frankivsk')).toMatchObject({
      label: 'Івано-Франківськ',
      aliases: expect.arrayContaining(['Ivano-Frankivsk'])
    });
  });
});
