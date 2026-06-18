import { NormalizationType } from '@prisma/client';
import { prisma } from '../../services/prisma.js';
import {
  EMERGENCY_PLACES,
  EMERGENCY_SPEC_OPTIONS,
  EMERGENCY_VEHICLE_MAKES
} from './vehicleTaxonomy.fallback.js';
import { normalizeTaxonomyLabel, vehicleTaxonomyId } from './vehicleTaxonomy.ids.js';
import { vehicleTaxonomyRepository } from './vehicleTaxonomy.repository.js';
import type {
  VehicleTaxonomyBrand,
  VehicleTaxonomyExternalIds,
  VehicleTaxonomyModel,
  VehicleTaxonomyOption,
  VehicleTaxonomyResponse,
  VehicleTaxonomySnapshot,
  VehicleTaxonomySnapshotMake,
  VehicleTaxonomySnapshotSpecOption
} from './vehicleTaxonomy.types.js';

const TAXONOMY_VERSION = '2026-06-18.vehicle-taxonomy-source';
const OTHER_LABEL = 'Other';
const SPEC_GROUPS = {
  bodyTypes: ['bodyType', 'body_type', 'body', 'кузов'],
  fuels: ['fuel', 'engineType', 'engine_type', 'пальне'],
  transmissions: ['transmission', 'gearbox', 'кпп'],
  drives: ['drive', 'drivetrain', 'привід']
} as const;

const noisyModelPatterns = [
  /опис від продавця/i,
  /відсутній у розшуку/i,
  /офіційних відкритих/i,
  /перевірк/i
];

export { vehicleTaxonomyId };

const normalizeLabel = normalizeTaxonomyLabel;
const canonicalKey = (value: unknown) => normalizeTaxonomyLabel(value).toLowerCase();

const publicId = (slug: unknown, label: unknown) => {
  const slugId = vehicleTaxonomyId(slug);
  return slugId && slugId !== 'unknown' ? slugId : vehicleTaxonomyId(label);
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const readExternalIds = (sourceMeta: unknown): VehicleTaxonomyExternalIds | undefined => {
  if (!isJsonObject(sourceMeta)) return undefined;
  const raw = sourceMeta.externalIds || sourceMeta.external_ids;
  if (!isJsonObject(raw)) return undefined;

  const output = Object.entries(raw).reduce<VehicleTaxonomyExternalIds>((acc, [key, value]) => {
    if (typeof value === 'string' || typeof value === 'number') acc[key] = value;
    return acc;
  }, {});

  return Object.keys(output).length ? output : undefined;
};

const addAlias = (aliases: Map<string, Set<string>>, canonical: unknown, alias: unknown) => {
  const key = canonicalKey(canonical);
  const value = normalizeLabel(alias);
  if (!key || !value || key === value.toLowerCase()) return;
  const set = aliases.get(key) || new Set<string>();
  set.add(value);
  aliases.set(key, set);
};

const aliasList = (aliases: Map<string, Set<string>>, label: unknown) =>
  Array.from(aliases.get(canonicalKey(label)) || []).sort((a, b) => a.localeCompare(b));

const option = (
  label: string,
  params: {
    id?: string;
    aliases?: Map<string, Set<string>>;
    sourceMeta?: unknown;
  } = {}
): VehicleTaxonomyOption => {
  const aliases = params.aliases ? aliasList(params.aliases, label) : [];
  const externalIds = readExternalIds(params.sourceMeta);
  return {
    id: params.id || vehicleTaxonomyId(label),
    label,
    ...(aliases.length ? { aliases } : {}),
    ...(externalIds ? { externalIds } : {})
  };
};

const shouldKeepModel = (label: unknown) => {
  const normalized = normalizeLabel(label);
  if (!normalized) return false;
  if (normalized.length > 80) return false;
  return !noisyModelPatterns.some((pattern) => pattern.test(normalized));
};

const ensureOtherModel = (models: VehicleTaxonomyModel[], brandId: string) => {
  if (models.some((model) => model.id === 'other')) return models;
  return [...models, { ...option(OTHER_LABEL), brandId }];
};

const sortOptions = <T extends VehicleTaxonomyOption>(items: T[]) =>
  [...items].sort((a, b) => {
    if (a.id === 'other') return 1;
    if (b.id === 'other') return -1;
    return a.label.localeCompare(b.label);
  });

const buildBrands = (
  makes: VehicleTaxonomySnapshotMake[],
  brandAliases: Map<string, Set<string>>,
  modelAliases: Map<string, Set<string>>
): VehicleTaxonomyBrand[] => {
  const brands = new Map<string, VehicleTaxonomyBrand>();

  for (const make of makes) {
    const label = normalizeLabel(make.label);
    if (!label) continue;

    const brandId = publicId(make.slug, label);
    const existing = brands.get(brandId);
    const brand = existing || {
      ...option(label, { id: brandId, aliases: brandAliases, sourceMeta: make.sourceMeta }),
      models: []
    };
    const modelIds = new Set(brand.models.map((model) => model.id));

    for (const model of make.models || []) {
      const modelLabel = normalizeLabel(model.label);
      if (!shouldKeepModel(modelLabel)) continue;
      const modelId = publicId(model.slug, modelLabel);
      if (modelIds.has(modelId)) continue;
      brand.models.push({
        ...option(modelLabel, { id: modelId, aliases: modelAliases, sourceMeta: model.sourceMeta }),
        brandId
      });
      modelIds.add(modelId);
    }

    brand.models = ensureOtherModel(sortOptions(brand.models), brandId);
    brands.set(brandId, brand);
  }

  if (!brands.has('other')) {
    brands.set('other', {
      ...option(OTHER_LABEL),
      models: [{ ...option(OTHER_LABEL), brandId: 'other' }]
    });
  }

  return sortOptions(Array.from(brands.values()));
};

const groupMatches = (optionGroup: string, expected: readonly string[]) => {
  const normalized = canonicalKey(optionGroup);
  return expected.some((group) => normalized === canonicalKey(group));
};

const buildSpecOptions = (specOptions: VehicleTaxonomySnapshotSpecOption[], group: readonly string[]) => {
  const mapped = new Map<string, VehicleTaxonomyOption>();
  for (const specOption of specOptions) {
    const label = normalizeLabel(specOption.label);
    if (!label || !groupMatches(specOption.group, group)) continue;
    const id = publicId(specOption.slug, label);
    if (!mapped.has(id)) mapped.set(id, option(label, { id, sourceMeta: specOption.sourceMeta }));
  }
  return sortOptions(Array.from(mapped.values()));
};

const buildCities = (snapshot: VehicleTaxonomySnapshot, cityAliases: Map<string, Set<string>>) => {
  const mapped = new Map<string, VehicleTaxonomyOption>();
  for (const place of snapshot.places) {
    const label = normalizeLabel(place.label);
    if (!label) continue;
    const id = publicId(place.slug, label);
    if (!mapped.has(id)) mapped.set(id, option(label, { id, aliases: cityAliases, sourceMeta: place.sourceMeta }));
  }
  return sortOptions(Array.from(mapped.values()));
};

const fallbackSnapshot = (): VehicleTaxonomySnapshot => ({
  makes: EMERGENCY_VEHICLE_MAKES,
  specOptions: EMERGENCY_SPEC_OPTIONS,
  places: EMERGENCY_PLACES,
  updatedAt: null
});

export class VehicleTaxonomyService {
  async getPublicTaxonomy(params: { companyId?: string | null; countryCode?: string | null } = {}): Promise<VehicleTaxonomyResponse> {
    const requestedCountry = String(params.countryCode || 'UA').toUpperCase();
    const localSnapshot = await vehicleTaxonomyRepository.readPublicSnapshot({ countryCode: requestedCountry });
    const useFallback = localSnapshot.makes.length === 0;
    const snapshot = useFallback ? fallbackSnapshot() : localSnapshot;

    const [brandAliases, modelAliases, cityAliases] = await this.readAliases(params.companyId);
    const fallbackSpecs = useFallback ? [] : EMERGENCY_SPEC_OPTIONS;
    const fallbackPlaces = useFallback ? [] : EMERGENCY_PLACES;
    const specOptions = [...snapshot.specOptions, ...fallbackSpecs];
    const placeSnapshot = {
      ...snapshot,
      places: snapshot.places.length ? snapshot.places : fallbackPlaces
    };

    return {
      version: TAXONOMY_VERSION,
      source: useFallback ? 'EMERGENCY_FALLBACK' : 'LOCAL_SNAPSHOT',
      updatedAt: snapshot.updatedAt?.toISOString(),
      stale: useFallback,
      brands: buildBrands(snapshot.makes, brandAliases, modelAliases),
      bodyTypes: buildSpecOptions(specOptions, SPEC_GROUPS.bodyTypes),
      fuels: buildSpecOptions(specOptions, SPEC_GROUPS.fuels),
      transmissions: buildSpecOptions(specOptions, SPEC_GROUPS.transmissions),
      drives: buildSpecOptions(specOptions, SPEC_GROUPS.drives),
      cities: buildCities(placeSnapshot, cityAliases)
    };
  }

  async getTaxonomy(params: { companyId?: string | null } = {}): Promise<VehicleTaxonomyResponse> {
    return this.getPublicTaxonomy({ companyId: params.companyId, countryCode: 'UA' });
  }

  private async readAliases(companyId?: string | null) {
    const aliases = await prisma.normalizationAlias.findMany({
      where: {
        type: { in: [NormalizationType.brand, NormalizationType.model, NormalizationType.city] },
        OR: [
          { companyId: null },
          ...(companyId ? [{ companyId }] : [])
        ]
      },
      select: { type: true, alias: true, canonical: true }
    });

    const brandAliases = new Map<string, Set<string>>();
    const modelAliases = new Map<string, Set<string>>();
    const cityAliases = new Map<string, Set<string>>();

    aliases.forEach((entry) => {
      if (entry.type === NormalizationType.brand) addAlias(brandAliases, entry.canonical, entry.alias);
      if (entry.type === NormalizationType.model) addAlias(modelAliases, entry.canonical, entry.alias);
      if (entry.type === NormalizationType.city) addAlias(cityAliases, entry.canonical, entry.alias);
    });

    return [brandAliases, modelAliases, cityAliases] as const;
  }
}

export const vehicleTaxonomyService = new VehicleTaxonomyService();
