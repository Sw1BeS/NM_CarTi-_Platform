import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = vi.hoisted(() => ({
  readPublicSnapshot: vi.fn()
}));

const prismaMock = vi.hoisted(() => ({
  normalizationAlias: {
    findMany: vi.fn()
  },
  vehicleTaxonomyCandidate: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('./vehicleTaxonomy.repository.js', () => ({
  vehicleTaxonomyRepository: repositoryMock
}));

vi.mock('../../services/prisma.js', () => ({
  prisma: prismaMock
}));

describe('VehicleTaxonomyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.normalizationAlias.findMany.mockResolvedValue([]);
    prismaMock.vehicleTaxonomyCandidate.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTaxonomyCandidate.create.mockResolvedValue({ id: 'candidate_1' });
    prismaMock.vehicleTaxonomyCandidate.update.mockResolvedValue({ id: 'candidate_1' });
  });

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

  it('deduplicates provider duplicates by canonical labels when slugs differ', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        {
          id: 'make_mercedes_autoria',
          slug: 'mercedes-benz',
          label: 'Mercedes-Benz',
          sourceMeta: { externalIds: { autoria: 48 } },
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [
            { id: 'model_gle_autoria', slug: 'gle-class', label: 'GLE', sourceMeta: { externalIds: { autoria: 1001 } }, updatedAt: null },
            { id: 'model_s_autoria', slug: 's-class', label: 'S-Class', sourceMeta: {}, updatedAt: null }
          ]
        },
        {
          id: 'make_mercedes_nhtsa',
          slug: 'mercedes_benz',
          label: 'Mercedes Benz',
          sourceMeta: { externalIds: { nhtsa: 449 } },
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [
            { id: 'model_gle_nhtsa', slug: 'mercedes-gle', label: 'GLE', sourceMeta: { externalIds: { nhtsa: 2002 } }, updatedAt: null },
            { id: 'model_c_nhtsa', slug: 'c-class', label: 'C-Class', sourceMeta: {}, updatedAt: null }
          ]
        }
      ],
      specOptions: [],
      places: [],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.getPublicTaxonomy({ countryCode: 'UA' });
    const mercedesBrands = output.brands.filter((brand) => brand.id.includes('mercedes'));

    expect(mercedesBrands).toHaveLength(1);
    expect(mercedesBrands[0]).toMatchObject({
      id: 'mercedes-benz',
      label: 'Mercedes-Benz',
      externalIds: { autoria: 48, nhtsa: 449 }
    });
    expect(mercedesBrands[0].aliases).toContain('Mercedes Benz');
    expect(mercedesBrands[0].models.map((model) => model.label)).toEqual(['C-Class', 'GLE', 'S-Class', 'Other']);
    expect(mercedesBrands[0].models.filter((model) => model.label === 'GLE')).toHaveLength(1);
    expect(mercedesBrands[0].models.find((model) => model.label === 'GLE')?.externalIds).toEqual({ autoria: 1001, nhtsa: 2002 });
  });

  it('keeps popular market brands before noisy provider makes in public suggestions', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        {
          id: 'make_custom',
          slug: '1955-custom-belair',
          label: '1955 Custom Belair',
          sourceMeta: { externalIds: { nhtsa: 1 } },
          updatedAt: null,
          models: []
        },
        {
          id: 'make_aas',
          slug: 'aas',
          label: 'Aas',
          sourceMeta: { externalIds: { nhtsa: 2 } },
          updatedAt: null,
          models: []
        },
        {
          id: 'make_bmw',
          slug: 'bmw',
          label: 'BMW',
          sourceMeta: { source: 'EMERGENCY_FALLBACK' },
          updatedAt: null,
          models: []
        },
        {
          id: 'make_audi',
          slug: 'audi',
          label: 'Audi',
          sourceMeta: { source: 'EMERGENCY_FALLBACK' },
          updatedAt: null,
          models: []
        },
        {
          id: 'make_tesla',
          slug: 'tesla',
          label: 'Tesla',
          sourceMeta: { source: 'EMERGENCY_FALLBACK' },
          updatedAt: null,
          models: []
        },
        {
          id: 'make_toyota',
          slug: 'toyota',
          label: 'Toyota',
          sourceMeta: { source: 'EMERGENCY_FALLBACK' },
          updatedAt: null,
          models: []
        }
      ],
      specOptions: [],
      places: [],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.getPublicTaxonomy({ countryCode: 'UA' });

    expect(output.brands.slice(0, 4).map((brand) => brand.label)).toEqual(['BMW', 'Audi', 'Toyota', 'Tesla']);
    expect(output.brands.findIndex((brand) => brand.label === '1955 Custom Belair')).toBeGreaterThan(3);
  });

  it('deduplicates provider duplicates in cities and spec options by canonical labels', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        {
          id: 'make_bmw',
          slug: 'bmw',
          label: 'BMW',
          sourceMeta: {},
          updatedAt: null,
          models: []
        }
      ],
      specOptions: [
        { group: 'fuel', slug: 'electric', label: 'Електро', sourceMeta: { externalIds: { autoria: 6 } }, updatedAt: null },
        { group: 'fuel', slug: 'ev', label: 'Електро', sourceMeta: { externalIds: { nhtsa: 'EV' } }, updatedAt: null },
        { group: 'bodyType', slug: 'suv-body', label: 'SUV', sourceMeta: { externalIds: { autoria: 5 } }, updatedAt: null },
        { group: 'bodyType', slug: 'suv', label: 'SUV', sourceMeta: { externalIds: { local: 'suv' } }, updatedAt: null }
      ],
      places: [
        { slug: 'kyiv-katottg', label: 'Київ', sourceMeta: { externalIds: { katottg: 'UA80000000000093317' } }, updatedAt: null },
        { slug: 'kyiv-geonames', label: 'Київ', sourceMeta: { externalIds: { geonames: 703448 } }, updatedAt: null }
      ],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.getPublicTaxonomy({ countryCode: 'UA' });

    expect(output.fuels.filter((fuel) => fuel.label === 'Електро')).toHaveLength(1);
    expect(output.fuels.find((fuel) => fuel.label === 'Електро')?.externalIds).toEqual({ autoria: 6, nhtsa: 'EV' });
    expect(output.bodyTypes.filter((bodyType) => bodyType.label === 'SUV')).toHaveLength(1);
    expect(output.bodyTypes.find((bodyType) => bodyType.label === 'SUV')?.externalIds).toEqual({ autoria: 5, local: 'suv' });
    expect(output.cities.filter((city) => city.label === 'Київ')).toHaveLength(1);
    expect(output.cities.find((city) => city.label === 'Київ')?.externalIds).toEqual({
      katottg: 'UA80000000000093317',
      geonames: 703448
    });
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

  it('adds vehicle compatibility constraints for EV-only brands and known EV models', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        {
          id: 'make_tesla',
          slug: 'tesla',
          label: 'Tesla',
          sourceMeta: {},
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [
            { id: 'model_3', slug: 'model-3', label: 'Model 3', sourceMeta: {}, updatedAt: null },
            { id: 'model_y', slug: 'model-y', label: 'Model Y', sourceMeta: {}, updatedAt: null }
          ]
        },
        {
          id: 'make_porsche',
          slug: 'porsche',
          label: 'Porsche',
          sourceMeta: {},
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [{ id: 'model_taycan', slug: 'taycan', label: 'Taycan', sourceMeta: {}, updatedAt: null }]
        }
      ],
      specOptions: [],
      places: [],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });
    prismaMock.normalizationAlias.findMany.mockResolvedValue([]);

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.getPublicTaxonomy({ countryCode: 'UA' });
    const tesla = output.brands.find((brand) => brand.id === 'tesla');
    const model3 = tesla?.models.find((model) => model.id === 'model-3');
    const modelY = tesla?.models.find((model) => model.id === 'model-y');
    const taycan = output.brands.find((brand) => brand.id === 'porsche')?.models.find((model) => model.id === 'taycan');

    expect(tesla?.constraints).toMatchObject({ fuels: ['електро'], transmissions: ['автомат'] });
    expect(model3?.constraints).toMatchObject({ fuels: ['електро'], bodyTypes: ['седан'] });
    expect(modelY?.constraints).toMatchObject({ fuels: ['електро'], bodyTypes: ['suv'] });
    expect(taycan?.constraints).toMatchObject({ fuels: ['електро'], transmissions: ['автомат'] });
  });

  it('canonicalizes request criteria and removes incompatible Tesla fuel', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        {
          id: 'make_tesla',
          slug: 'tesla',
          label: 'Tesla',
          sourceMeta: {},
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [{ id: 'model_model_3', slug: 'model-3', label: 'Model 3', sourceMeta: {}, updatedAt: null }]
        }
      ],
      specOptions: [
        { group: 'fuel', slug: 'електро', label: 'Електро', sourceMeta: {}, updatedAt: null },
        { group: 'fuel', slug: 'дизель', label: 'Дизель', sourceMeta: {}, updatedAt: null },
        { group: 'bodyType', slug: 'седан', label: 'Седан', sourceMeta: {}, updatedAt: null }
      ],
      places: [{ slug: 'kyiv', label: 'Київ', sourceMeta: {}, updatedAt: null }],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.canonicalizeCriteria({
      brand: 'tesla',
      model: 'Model 3',
      fuel: 'Дизель',
      bodyType: 'Седан',
      city: 'Київ'
    }, { companyId: 'company_1', source: 'TEST', recordCandidates: false });

    expect(output.data).toMatchObject({
      brand: 'Tesla',
      model: 'Model 3',
      bodyType: 'Седан',
      city: 'Київ'
    });
    expect(output.data.fuel).toBeUndefined();
    expect(output.issues).toContainEqual(expect.objectContaining({
      field: 'fuel',
      value: 'Дизель',
      reason: 'incompatible',
      expected: ['електро']
    }));
  });

  it('records unknown city as a candidate without promoting it to taxonomy', async () => {
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
      places: [{ slug: 'kyiv', label: 'Київ', sourceMeta: {}, updatedAt: null }],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.canonicalizeCriteria({
      brand: 'BMW',
      model: 'X5',
      city: 'Нереальне місто'
    }, { companyId: 'company_1', source: 'TEST' });

    expect(output.data.city).toBe('Нереальне місто');
    expect(output.data.cities).toEqual([{ id: 'нереальне-місто', label: 'Нереальне місто', candidate: true }]);
    expect(output.issues).toContainEqual(expect.objectContaining({
      field: 'city',
      value: 'Нереальне місто',
      reason: 'unknown'
    }));
    expect(prismaMock.vehicleTaxonomyCandidate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        kind: 'city',
        label: 'Нереальне місто',
        source: 'TEST',
        status: 'NEW'
      })
    }));
  });

  it('maps English drivetrain/spec synonyms onto canonical Ukrainian taxonomy ids', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        {
          id: 'make_tesla',
          slug: 'tesla',
          label: 'Tesla',
          sourceMeta: {},
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [{ id: 'model_model_s', slug: 'model-s', label: 'Model S', sourceMeta: {}, updatedAt: null }]
        }
      ],
      specOptions: [
        { group: 'fuel', slug: 'електро', label: 'Електро', sourceMeta: {}, updatedAt: null },
        { group: 'transmission', slug: 'автомат', label: 'Автомат', sourceMeta: {}, updatedAt: null },
        { group: 'bodyType', slug: 'ліфтбек', label: 'Ліфтбек', sourceMeta: {}, updatedAt: null }
      ],
      places: [],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.canonicalizeCriteria({
      brand: 'Tesla',
      model: 'Model S',
      fuel: 'electric',
      transmission: 'automatic',
      bodyType: 'liftback'
    }, { companyId: 'company_1', source: 'TEST', recordCandidates: false });

    expect(output.data).toMatchObject({
      fuel: 'Електро',
      transmission: 'Автомат',
      bodyType: 'Ліфтбек'
    });
    expect(output.issues).toEqual([]);
  });

  it('matches criteria objects by provider external ids', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        {
          id: 'make_tesla',
          slug: 'tesla',
          label: 'Tesla',
          sourceMeta: { externalIds: { autoria: 2233 } },
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [{ id: 'model_model_y', slug: 'model-y', label: 'Model Y', sourceMeta: { externalIds: { autoria: 777 } }, updatedAt: null }]
        }
      ],
      specOptions: [
        { group: 'fuel', slug: 'електро', label: 'Електро', sourceMeta: { externalIds: { autoria: 6 } }, updatedAt: null }
      ],
      places: [{ slug: 'kyiv', label: 'Київ', sourceMeta: { externalIds: { autoria: 10 } }, updatedAt: null }],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.canonicalizeCriteria({
      brands: [{ externalIds: { autoria: 2233 }, label: 'raw brand' }],
      models: [{ autoriaId: 777, label: 'raw model' }],
      fuels: [{ externalIds: { autoria: 6 }, label: 'raw fuel' }],
      cities: [{ autoria: 10, label: 'raw city' }]
    }, { companyId: 'company_1', source: 'TEST', recordCandidates: false });

    expect(output.data).toMatchObject({
      brand: 'Tesla',
      model: 'Model Y',
      fuel: 'Електро',
      city: 'Київ'
    });
    expect(output.issues).toEqual([]);
  });

  it('canonicalizes inventory specs and keeps taxonomy diagnostics inside specs metadata', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        {
          id: 'make_tesla',
          slug: 'tesla',
          label: 'Tesla',
          sourceMeta: {},
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          models: [{ id: 'model_y', slug: 'model-y', label: 'Model Y', sourceMeta: {}, updatedAt: null }]
        }
      ],
      specOptions: [
        { group: 'fuel', slug: 'електро', label: 'Електро', sourceMeta: {}, updatedAt: null },
        { group: 'fuel', slug: 'бензин', label: 'Бензин', sourceMeta: {}, updatedAt: null },
        { group: 'bodyType', slug: 'suv', label: 'SUV', sourceMeta: {}, updatedAt: null }
      ],
      places: [{ slug: 'odesa', label: 'Одеса', sourceMeta: {}, updatedAt: null }],
      updatedAt: new Date('2026-06-18T00:00:00.000Z')
    });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.canonicalizeInventoryInput({
      title: 'Tesla Model Y',
      location: 'Одеса',
      specs: {
        brand: 'tesla',
        model: 'model y',
        fuel: 'Бензин',
        bodyType: 'SUV'
      }
    }, { companyId: 'company_1', source: 'TEST', recordCandidates: false });

    expect(output.data.location).toBe('Одеса');
    expect(output.data.specs).toMatchObject({
      brand: 'Tesla',
      model: 'Model Y',
      bodyType: 'SUV',
      _taxonomy: {
        issues: [expect.objectContaining({ field: 'fuel', reason: 'incompatible' })]
      }
    });
    expect((output.data.specs as Record<string, unknown>).fuel).toBeUndefined();
  });
});
