import { NormalizationType } from '@prisma/client';
import { prisma } from '../../services/prisma.js';
import {
  EMERGENCY_PLACES,
  EMERGENCY_SPEC_OPTIONS,
  EMERGENCY_VEHICLE_MAKES
} from './vehicleTaxonomy.fallback.js';
import { resolveVehicleCompatibilityConstraints } from './vehicleTaxonomy.compatibility.js';
import { shouldRejectPublicModelLabel, vehicleTaxonomyCandidateService } from './vehicleTaxonomy.candidates.js';
import { normalizeTaxonomyLabel, vehicleTaxonomyId } from './vehicleTaxonomy.ids.js';
import { vehicleTaxonomyRepository } from './vehicleTaxonomy.repository.js';
import type {
  VehicleTaxonomyBrand,
  VehicleTaxonomyCompatibilityConstraints,
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
const OTHER_LABELS = new Set(['other', 'інша марка', 'інша модель', 'інше']);
const SPEC_GROUPS = {
  bodyTypes: ['bodyType', 'body_type', 'body', 'кузов'],
  fuels: ['fuel', 'engineType', 'engine_type', 'пальне'],
  transmissions: ['transmission', 'gearbox', 'кпп'],
  drives: ['drive', 'drivetrain', 'привід']
} as const;
const CRITERIA_SPEC_FIELDS = {
  bodyTypes: { single: 'bodyType', multiple: 'bodyTypes', candidateGroup: 'bodyType' },
  fuels: { single: 'fuel', multiple: 'fuels', candidateGroup: 'fuel' },
  transmissions: { single: 'transmission', multiple: 'transmissions', candidateGroup: 'transmission' },
  drives: { single: 'drive', multiple: 'drives', candidateGroup: 'drive' }
} as const;
const INVENTORY_SPEC_FIELDS = {
  bodyTypes: ['bodyType', 'body', 'body_type'],
  fuels: ['fuel', 'engineType', 'engine_type'],
  transmissions: ['transmission', 'gearbox'],
  drives: ['drive', 'drivetrain']
} as const;
const POPULAR_BRAND_IDS = [
  'bmw',
  'mercedes-benz',
  'audi',
  'volkswagen',
  'toyota',
  'tesla',
  'porsche',
  'lexus',
  'nissan',
  'hyundai',
  'kia',
  'mazda',
  'honda',
  'ford',
  'chevrolet',
  'skoda',
  'renault',
  'peugeot',
  'citroen',
  'volvo',
  'land-rover',
  'jeep',
  'mitsubishi',
  'opel',
  'fiat'
] as const;
const POPULAR_BRAND_WEIGHT: Map<string, number> = new Map(POPULAR_BRAND_IDS.map((id, index) => [id, index]));

export { vehicleTaxonomyId };

const normalizeLabel = normalizeTaxonomyLabel;
const canonicalKey = (value: unknown) => normalizeTaxonomyLabel(value).toLowerCase();

const publicId = (slug: unknown, label: unknown) => {
  const slugId = vehicleTaxonomyId(slug);
  return slugId && slugId !== 'unknown' ? slugId : vehicleTaxonomyId(label);
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

type CanonicalOption = {
  id: string;
  label: string;
  aliases?: string[];
  brandId?: string;
  candidate?: boolean;
};

export type VehicleTaxonomyCanonicalizationIssue = {
  field: string;
  value: string;
  reason: 'unknown' | 'model_not_in_brand' | 'incompatible';
  expected?: string[];
};

export type VehicleTaxonomyCanonicalizationResult<T extends Record<string, unknown>> = {
  data: T;
  issues: VehicleTaxonomyCanonicalizationIssue[];
  taxonomy: {
    version?: string;
    source?: VehicleTaxonomyResponse['source'];
    updatedAt?: string;
    stale?: boolean;
  };
};

type CanonicalizeParams = {
  companyId?: string | null;
  source?: string;
  recordCandidates?: boolean;
};

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

const readSourceAliases = (sourceMeta: unknown) => {
  if (!isJsonObject(sourceMeta)) return [];
  const raw = sourceMeta.aliases || sourceMeta.searchAliases || sourceMeta.synonyms;
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map(normalizeLabel).filter(Boolean);
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

const mergeExternalIds = (
  current?: VehicleTaxonomyExternalIds,
  incoming?: VehicleTaxonomyExternalIds
): VehicleTaxonomyExternalIds | undefined => {
  const merged = { ...(current || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (merged[key] === undefined) merged[key] = value;
  }
  return Object.keys(merged).length ? merged : undefined;
};

const addOptionAlias = <T extends VehicleTaxonomyOption>(item: T, alias: unknown): T => {
  const value = normalizeLabel(alias);
  if (!value || canonicalKey(value) === canonicalKey(item.label)) return item;
  const aliases = Array.from(new Set([...(item.aliases || []), value])).sort((a, b) => a.localeCompare(b));
  return { ...item, aliases };
};

const mergeOptionMetadata = <T extends VehicleTaxonomyOption>(target: T, source: VehicleTaxonomyOption): T => {
  const aliases = Array.from(new Set([...(target.aliases || []), ...(source.aliases || [])]))
    .filter((alias) => canonicalKey(alias) !== canonicalKey(target.label))
    .sort((a, b) => a.localeCompare(b));
  const externalIds = mergeExternalIds(target.externalIds, source.externalIds);
  return {
    ...target,
    ...(aliases.length ? { aliases } : {}),
    ...(externalIds ? { externalIds } : {})
  };
};

const mergeCompatibilityConstraints = (
  current?: VehicleTaxonomyCompatibilityConstraints,
  incoming?: VehicleTaxonomyCompatibilityConstraints
): VehicleTaxonomyCompatibilityConstraints | undefined => {
  if (!current) return incoming;
  if (!incoming) return current;
  const merged: VehicleTaxonomyCompatibilityConstraints = { ...current };
  for (const key of ['fuels', 'bodyTypes', 'transmissions', 'drives'] as const) {
    const values = Array.from(new Set([...(current[key] || []), ...(incoming[key] || [])]));
    if (values.length) merged[key] = values;
  }
  if (!merged.source && incoming.source) merged.source = incoming.source;
  return merged;
};

const option = (
  label: string,
  params: {
    id?: string;
    aliases?: Map<string, Set<string>>;
    sourceMeta?: unknown;
  } = {}
): VehicleTaxonomyOption => {
  const aliases = Array.from(new Set([
    ...(params.aliases ? aliasList(params.aliases, label) : []),
    ...readSourceAliases(params.sourceMeta)
  ].filter((alias) => canonicalKey(alias) !== canonicalKey(label))))
    .sort((a, b) => a.localeCompare(b));
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
  return !shouldRejectPublicModelLabel(normalized);
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

const brandWeight = (brand: VehicleTaxonomyBrand) => {
  const direct = POPULAR_BRAND_WEIGHT.get(brand.id);
  if (direct !== undefined) return direct;
  return POPULAR_BRAND_WEIGHT.get(vehicleTaxonomyId(brand.label)) ?? POPULAR_BRAND_IDS.length;
};

const sortBrands = (items: VehicleTaxonomyBrand[]) =>
  [...items].sort((a, b) => {
    if (a.id === 'other') return 1;
    if (b.id === 'other') return -1;
    const weightDelta = brandWeight(a) - brandWeight(b);
    if (weightDelta !== 0) return weightDelta;
    return a.label.localeCompare(b.label);
  });

const buildBrands = (
  makes: VehicleTaxonomySnapshotMake[],
  brandAliases: Map<string, Set<string>>,
  modelAliases: Map<string, Set<string>>
): VehicleTaxonomyBrand[] => {
  const brands = new Map<string, VehicleTaxonomyBrand>();
  const brandKeys = new Map<string, string>();

  for (const make of makes) {
    const label = normalizeLabel(make.label);
    if (!label) continue;

    const brandId = publicId(make.slug, label);
    const brandKey = vehicleTaxonomyId(label);
    const canonicalBrandId = brandKeys.get(brandKey) || brandId;
    const existing = brands.get(canonicalBrandId);
    const brandConstraints = resolveVehicleCompatibilityConstraints({ brandLabel: label, sourceMeta: make.sourceMeta });
    const incomingBrand = {
      ...option(label, { id: canonicalBrandId, aliases: brandAliases, sourceMeta: make.sourceMeta }),
      ...(brandConstraints ? { constraints: brandConstraints } : {})
    };
    const brand: VehicleTaxonomyBrand = existing
      ? addOptionAlias({
        ...mergeOptionMetadata(existing, incomingBrand),
        constraints: mergeCompatibilityConstraints(existing.constraints, brandConstraints),
        models: existing.models
      }, label)
      : { ...incomingBrand, models: [] };
    brandKeys.set(brandKey, canonicalBrandId);
    const modelKeys = new Map<string, VehicleTaxonomyModel>(brand.models.map((model) => [vehicleTaxonomyId(model.label), model]));

    for (const model of make.models || []) {
      const modelLabel = normalizeLabel(model.label);
      if (!shouldKeepModel(modelLabel)) continue;
      const modelId = publicId(model.slug, modelLabel);
      const modelKey = vehicleTaxonomyId(modelLabel);
      const modelConstraints = resolveVehicleCompatibilityConstraints({
        brandLabel: label,
        modelLabel,
        sourceMeta: model.sourceMeta
      });
      const incomingModel = {
        ...option(modelLabel, { id: modelId, aliases: modelAliases, sourceMeta: model.sourceMeta }),
        ...(modelConstraints ? { constraints: modelConstraints } : {}),
        brandId: canonicalBrandId
      } satisfies VehicleTaxonomyModel;
      const existingModel = modelKeys.get(modelKey);
      if (existingModel) {
        const mergedModel = addOptionAlias({
          ...mergeOptionMetadata(existingModel, incomingModel),
          constraints: mergeCompatibilityConstraints(existingModel.constraints, modelConstraints),
          brandId: canonicalBrandId
        }, modelLabel);
        const index = brand.models.findIndex((item) => item === existingModel);
        if (index >= 0) brand.models[index] = mergedModel;
        modelKeys.set(modelKey, mergedModel);
        continue;
      }
      const nextModel = { ...incomingModel, brandId: canonicalBrandId };
      brand.models.push(nextModel);
      modelKeys.set(modelKey, nextModel);
    }

    brand.models = ensureOtherModel(sortOptions(brand.models), canonicalBrandId);
    brands.set(canonicalBrandId, brand);
  }

  if (!brands.has('other')) {
    brands.set('other', {
      ...option(OTHER_LABEL),
      models: [{ ...option(OTHER_LABEL), brandId: 'other' }]
    });
  }

  return sortBrands(Array.from(brands.values()));
};

const groupMatches = (optionGroup: string, expected: readonly string[]) => {
  const normalized = canonicalKey(optionGroup);
  return expected.some((group) => normalized === canonicalKey(group));
};

const buildSpecOptions = (specOptions: VehicleTaxonomySnapshotSpecOption[], group: readonly string[]) => {
  const mapped = new Map<string, VehicleTaxonomyOption>();
  const optionKeys = new Map<string, string>();
  for (const specOption of specOptions) {
    const label = normalizeLabel(specOption.label);
    if (!label || !groupMatches(specOption.group, group)) continue;
    const id = publicId(specOption.slug, label);
    const key = vehicleTaxonomyId(label);
    const canonicalId = optionKeys.get(key) || id;
    const incoming = option(label, { id: canonicalId, sourceMeta: specOption.sourceMeta });
    const existing = mapped.get(canonicalId);
    mapped.set(canonicalId, existing ? addOptionAlias(mergeOptionMetadata(existing, incoming), label) : incoming);
    optionKeys.set(key, canonicalId);
  }
  return sortOptions(Array.from(mapped.values()));
};

const buildCities = (snapshot: VehicleTaxonomySnapshot, cityAliases: Map<string, Set<string>>) => {
  const mapped = new Map<string, VehicleTaxonomyOption>();
  const cityKeys = new Map<string, string>();
  for (const place of snapshot.places) {
    const label = normalizeLabel(place.label);
    if (!label) continue;
    const id = publicId(place.slug, label);
    const key = vehicleTaxonomyId(label);
    const canonicalId = cityKeys.get(key) || id;
    const incoming = option(label, { id: canonicalId, aliases: cityAliases, sourceMeta: place.sourceMeta });
    const existing = mapped.get(canonicalId);
    mapped.set(canonicalId, existing ? addOptionAlias(mergeOptionMetadata(existing, incoming), label) : incoming);
    cityKeys.set(key, canonicalId);
  }
  return sortOptions(Array.from(mapped.values()));
};

const fallbackSnapshot = (): VehicleTaxonomySnapshot => ({
  makes: EMERGENCY_VEHICLE_MAKES,
  specOptions: EMERGENCY_SPEC_OPTIONS,
  places: EMERGENCY_PLACES,
  updatedAt: null
});

const readLabel = (value: unknown): string => {
  if (isJsonObject(value)) {
    return normalizeLabel(value.label)
      || normalizeLabel(value.name)
      || normalizeLabel(value.title)
      || normalizeLabel(value.value);
  }
  return normalizeLabel(value);
};

const readOptionId = (value: unknown): string => {
  if (!isJsonObject(value)) return '';
  return normalizeLabel(value.id) || normalizeLabel(value.slug);
};

const readInputExternalIds = (value: unknown): VehicleTaxonomyExternalIds => {
  if (!isJsonObject(value)) return {};
  const raw = isJsonObject(value.externalIds)
    ? value.externalIds
    : isJsonObject(value.external_ids)
      ? value.external_ids
      : {};
  const output = Object.entries(raw).reduce<VehicleTaxonomyExternalIds>((acc, [key, entryValue]) => {
    if (typeof entryValue === 'string' || typeof entryValue === 'number') acc[key] = entryValue;
    return acc;
  }, {});
  for (const key of ['autoria', 'autoriaId', 'nhtsa', 'nhtsaId']) {
    const entryValue = value[key];
    if (typeof entryValue === 'string' || typeof entryValue === 'number') output[key.replace(/Id$/, '')] = entryValue;
  }
  return output;
};

const listValues = (single: unknown, multiple: unknown): unknown[] => {
  const values = Array.isArray(multiple) ? multiple : [];
  if (values.length) return values;
  return single === undefined || single === null || single === '' ? [] : [single];
};

const publicOption = (optionValue: CanonicalOption) => ({
  id: optionValue.id,
  label: optionValue.label,
  ...(optionValue.brandId ? { brandId: optionValue.brandId } : {}),
  ...(optionValue.candidate ? { candidate: true } : {})
});

const valueMatchesOption = (value: unknown, optionValue: VehicleTaxonomyOption) => {
  const label = readLabel(value);
  const id = readOptionId(value);
  const optionId = canonicalKey(optionValue.id);
  const optionLabel = canonicalKey(optionValue.label);
  const labelKey = canonicalKey(label);
  const idKey = canonicalKey(id);
  const labelId = vehicleTaxonomyId(label);
  const explicitId = vehicleTaxonomyId(id);
  const inputExternalIds = readInputExternalIds(value);
  if (labelKey && (labelKey === optionLabel || labelKey === optionId || labelId === optionId)) return true;
  if (idKey && (idKey === optionId || idKey === optionLabel || explicitId === optionId)) return true;
  if (optionValue.externalIds && Object.entries(inputExternalIds).some(([key, entryValue]) => String(optionValue.externalIds?.[key] || '') === String(entryValue))) return true;
  return (optionValue.aliases || []).some((alias) => canonicalKey(alias) === labelKey || canonicalKey(alias) === idKey);
};

const findOption = <T extends VehicleTaxonomyOption>(value: unknown, options: T[]): T | undefined =>
  options.find((optionValue) => valueMatchesOption(value, optionValue));

const candidateOption = (value: unknown): CanonicalOption | null => {
  const label = readLabel(value);
  if (!label) return null;
  return { id: vehicleTaxonomyId(label), label, candidate: true };
};

const makeIssue = (
  field: string,
  value: unknown,
  reason: VehicleTaxonomyCanonicalizationIssue['reason'],
  expected?: string[]
): VehicleTaxonomyCanonicalizationIssue | null => {
  const label = readLabel(value);
  if (!label) return null;
  return {
    field,
    value: label,
    reason,
    ...(expected?.length ? { expected } : {})
  };
};

const pushIssue = (
  issues: VehicleTaxonomyCanonicalizationIssue[],
  field: string,
  value: unknown,
  reason: VehicleTaxonomyCanonicalizationIssue['reason'],
  expected?: string[]
) => {
  const issue = makeIssue(field, value, reason, expected);
  if (issue) issues.push(issue);
};

const mergeConstraints = (
  brands: VehicleTaxonomyBrand[],
  models: VehicleTaxonomyModel[]
): VehicleTaxonomyCompatibilityConstraints => {
  const constraints = [...brands.map((brand) => brand.constraints), ...models.map((model) => model.constraints)]
    .filter((item): item is VehicleTaxonomyCompatibilityConstraints => Boolean(item));
  return constraints.reduce<VehicleTaxonomyCompatibilityConstraints>((acc, item) => {
    for (const key of ['fuels', 'bodyTypes', 'transmissions', 'drives'] as const) {
      if (!item[key]?.length) continue;
      acc[key] = acc[key]?.length
        ? acc[key]?.filter((value) => item[key]?.includes(value))
        : [...item[key]!];
    }
    return acc;
  }, {});
};

const optionAllowed = (optionValue: CanonicalOption, allowed?: string[]) =>
  !allowed?.length || allowed.includes(optionValue.id) || allowed.includes(vehicleTaxonomyId(optionValue.label));

const applyFirstString = (target: Record<string, unknown>, keys: readonly string[], value: string | undefined) => {
  const key = keys.find((candidate) => candidate in target) || keys[0];
  if (!key) return;
  if (value) target[key] = value;
  else delete target[key];
};

const recordCandidateSafely = async (
  params: CanonicalizeParams,
  issue: VehicleTaxonomyCanonicalizationIssue,
  kind: 'make' | 'model' | 'city' | 'specOption',
  makeLabel?: string | null
) => {
  if (params.recordCandidates === false) return;
  try {
    await vehicleTaxonomyCandidateService.recordCandidate({
      kind,
      label: issue.value,
      makeLabel,
      source: params.source || 'VEHICLE_TAXONOMY_CANONICALIZER',
      evidence: {
        field: issue.field,
        reason: issue.reason,
        expected: issue.expected
      }
    });
  } catch {
    // Candidate collection must never block a user-facing request.
  }
};

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

  async canonicalizeCriteria(
    criteria: Record<string, unknown>,
    params: CanonicalizeParams = {}
  ): Promise<VehicleTaxonomyCanonicalizationResult<Record<string, unknown>>> {
    const taxonomy = await this.getPublicTaxonomy({ companyId: params.companyId, countryCode: 'UA' });
    const output: Record<string, unknown> = { ...criteria };
    const issues: VehicleTaxonomyCanonicalizationIssue[] = [];

    const brandInputs = listValues(criteria.brand, criteria.brands);
    const canonicalBrands = brandInputs.reduce<CanonicalOption[]>((acc, value) => {
      const match = findOption(value, taxonomy.brands);
      if (match && !OTHER_LABELS.has(canonicalKey(match.label))) {
        acc.push(publicOption(match));
        return acc;
      }
      const candidate = candidateOption(value);
      if (!candidate || OTHER_LABELS.has(canonicalKey(candidate.label))) return acc;
      acc.push(candidate);
      pushIssue(issues, 'brand', value, 'unknown');
      return acc;
    }, []);

    const knownBrands = canonicalBrands
      .map((brand) => taxonomy.brands.find((source) => source.id === brand.id))
      .filter((brand): brand is VehicleTaxonomyBrand => Boolean(brand));

    const modelInputs = listValues(criteria.model, criteria.models);
    const searchBrands = knownBrands.length ? knownBrands : taxonomy.brands;
    const canonicalModels = modelInputs.reduce<CanonicalOption[]>((acc, value) => {
      if (OTHER_LABELS.has(canonicalKey(readLabel(value)))) return acc;
      for (const brand of searchBrands) {
        const match = findOption(value, brand.models || []);
        if (!match || OTHER_LABELS.has(canonicalKey(match.label))) continue;
        acc.push(publicOption({ ...match, brandId: brand.id }));
        return acc;
      }

      const modelLabel = readLabel(value);
      const modelExistsElsewhere = knownBrands.length
        ? taxonomy.brands.some((brand) => !knownBrands.some((known) => known.id === brand.id) && findOption(value, brand.models || []))
        : false;
      if (modelLabel) {
        acc.push({ id: vehicleTaxonomyId(modelLabel), label: modelLabel, brandId: knownBrands[0]?.id, candidate: true });
        pushIssue(
          issues,
          'model',
          value,
          modelExistsElsewhere ? 'model_not_in_brand' : 'unknown',
          knownBrands.flatMap((brand) => brand.models || []).map((model) => model.label).filter((label) => canonicalKey(label) !== 'other').slice(0, 20)
        );
      }
      return acc;
    }, []);

    const knownModels = canonicalModels
      .map((model) => taxonomy.brands.flatMap((brand) => brand.models || []).find((source) => source.id === model.id && (!model.brandId || source.brandId === model.brandId)))
      .filter((model): model is VehicleTaxonomyModel => Boolean(model));
    const constraints = mergeConstraints(knownBrands, knownModels);

    if (canonicalBrands.length) {
      output.brand = canonicalBrands[0].label;
      output.brands = canonicalBrands.map(publicOption);
    }
    if (canonicalModels.length) {
      output.model = canonicalModels[0].label;
      output.models = canonicalModels.map(publicOption);
    }

    for (const [constraintKey, fieldConfig] of Object.entries(CRITERIA_SPEC_FIELDS) as Array<[keyof typeof CRITERIA_SPEC_FIELDS, typeof CRITERIA_SPEC_FIELDS[keyof typeof CRITERIA_SPEC_FIELDS]]>) {
      const optionInputs = listValues(criteria[fieldConfig.single], criteria[fieldConfig.multiple]);
      if (!optionInputs.length) continue;
      const sourceOptions = taxonomy[constraintKey] as VehicleTaxonomyOption[];
      const canonical = optionInputs.reduce<CanonicalOption[]>((acc, value) => {
        const match = findOption(value, sourceOptions);
        const resolved = match ? publicOption(match) : candidateOption(value);
        if (!resolved) return acc;
        if (!optionAllowed(resolved, constraints[constraintKey])) {
          pushIssue(issues, fieldConfig.single, value, 'incompatible', constraints[constraintKey]);
          return acc;
        }
        if (!match) pushIssue(issues, fieldConfig.single, value, 'unknown');
        acc.push(resolved);
        return acc;
      }, []);
      if (canonical.length) {
        output[fieldConfig.single] = canonical[0].label;
        output[fieldConfig.multiple] = canonical.map(publicOption);
      } else {
        delete output[fieldConfig.single];
        delete output[fieldConfig.multiple];
      }
    }

    const cityInputs = listValues(criteria.city, criteria.cities);
    const canonicalCities = cityInputs.reduce<CanonicalOption[]>((acc, value) => {
      const match = findOption(value, taxonomy.cities);
      const resolved = match ? publicOption(match) : candidateOption(value);
      if (!resolved) return acc;
      if (!match) pushIssue(issues, 'city', value, 'unknown');
      acc.push(resolved);
      return acc;
    }, []);
    if (canonicalCities.length) {
      output.city = canonicalCities[0].label;
      output.cities = canonicalCities.map(publicOption);
    }

    await Promise.all(issues.map((issue) => {
      const kind = issue.field === 'brand'
        ? 'make'
        : issue.field === 'model'
          ? 'model'
          : issue.field === 'city'
            ? 'city'
            : 'specOption';
      const makeLabel = kind === 'model' ? knownBrands[0]?.label || canonicalBrands[0]?.label || null : undefined;
      return recordCandidateSafely(params, issue, kind, makeLabel);
    }));

    return {
      data: output,
      issues,
      taxonomy: {
        version: taxonomy.version,
        source: taxonomy.source,
        updatedAt: taxonomy.updatedAt,
        stale: taxonomy.stale
      }
    };
  }

  async canonicalizeInventoryInput<T extends Record<string, unknown>>(
    input: T,
    params: CanonicalizeParams = {}
  ): Promise<VehicleTaxonomyCanonicalizationResult<T>> {
    const specs = isJsonObject(input.specs) ? { ...input.specs } : {};
    const criteria: Record<string, unknown> = {
      brand: specs.brand || specs.make,
      model: specs.model,
      bodyType: specs.bodyType || specs.body || specs.body_type,
      fuel: specs.fuel || specs.engineType || specs.engine_type,
      transmission: specs.transmission || specs.gearbox,
      drive: specs.drive || specs.drivetrain,
      city: input.location
    };
    const canonicalized = await this.canonicalizeCriteria(criteria, params);
    const output: Record<string, unknown> = { ...input };

    if (isJsonObject(input.specs)) {
      const nextSpecs: Record<string, unknown> = { ...specs };
      if (canonicalized.data.brand) nextSpecs.brand = canonicalized.data.brand;
      if (canonicalized.data.model) nextSpecs.model = canonicalized.data.model;
      applyFirstString(nextSpecs, INVENTORY_SPEC_FIELDS.bodyTypes, canonicalized.data.bodyType as string | undefined);
      applyFirstString(nextSpecs, INVENTORY_SPEC_FIELDS.fuels, canonicalized.data.fuel as string | undefined);
      applyFirstString(nextSpecs, INVENTORY_SPEC_FIELDS.transmissions, canonicalized.data.transmission as string | undefined);
      applyFirstString(nextSpecs, INVENTORY_SPEC_FIELDS.drives, canonicalized.data.drive as string | undefined);
      nextSpecs._taxonomy = {
        ...canonicalized.taxonomy,
        issues: canonicalized.issues
      };
      output.specs = nextSpecs;
    }

    if ('location' in input && canonicalized.data.city) {
      output.location = canonicalized.data.city;
    }

    return {
      data: output as T,
      issues: canonicalized.issues,
      taxonomy: canonicalized.taxonomy
    };
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
