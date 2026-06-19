import { prisma as defaultPrisma } from '../../services/prisma.js';
import {
  EMERGENCY_PLACES,
  EMERGENCY_SPEC_OPTIONS,
  EMERGENCY_VEHICLE_MAKES
} from './vehicleTaxonomy.fallback.js';
import { normalizeTaxonomyLabel, vehicleTaxonomyId } from './vehicleTaxonomy.ids.js';
import {
  fetchAutoriaMarks,
  fetchAutoriaModels,
  fetchAutoriaPlaces,
  fetchAutoriaSpecOptions
} from './providers/autoria.provider.js';
import { fetchGeoNamesPlaces, fetchKatottgPlaces } from './providers/geoplaces.provider.js';
import { fetchNhtsaMakes, fetchNhtsaModelsForMakeId } from './providers/nhtsa.provider.js';
import type {
  VehicleTaxonomyExternalIds,
  VehicleTaxonomySourceDataset,
  VehicleTaxonomySourceMake,
  VehicleTaxonomySourceModel
} from './vehicleTaxonomy.types.js';

export type VehicleTaxonomySyncSource = 'AUTO_RIA' | 'NHTSA' | 'KATOTTG' | 'GEONAMES' | 'EMERGENCY_FALLBACK';

export type VehicleTaxonomySyncInput = {
  sources?: VehicleTaxonomySyncSource[];
  countryCode?: string | null;
  dryRun?: boolean;
  autoriaApiKey?: string | null;
  categoryId?: number;
  vehicleType?: string;
  modelMakeLimit?: number | null;
  modelMakeOffset?: number;
  modelFetchConcurrency?: number;
  includeSettlements?: boolean;
};

export type VehicleTaxonomySyncRunView = {
  id: string;
  source: string;
  status: string;
  dryRun: boolean;
  startedAt?: string;
  finishedAt?: string | null;
  counts: Record<string, unknown>;
  error?: string | null;
  sourceMeta?: unknown;
};

export type VehicleTaxonomyProviderLoader = (input: VehicleTaxonomySyncInput) => Promise<VehicleTaxonomySourceDataset>;

export type VehicleTaxonomySyncDeps = {
  prisma?: any;
  providers?: Partial<Record<VehicleTaxonomySyncSource, VehicleTaxonomyProviderLoader>>;
  now?: () => Date;
};

const DEFAULT_SOURCES: VehicleTaxonomySyncSource[] = ['NHTSA', 'KATOTTG'];
const ALLOWED_SOURCES = new Set<VehicleTaxonomySyncSource>([
  'AUTO_RIA',
  'NHTSA',
  'KATOTTG',
  'GEONAMES',
  'EMERGENCY_FALLBACK'
]);

const normalizeSources = (sources?: VehicleTaxonomySyncSource[]) => {
  const values = (sources?.length ? sources : DEFAULT_SOURCES)
    .map((source) => String(source || '').trim().toUpperCase() as VehicleTaxonomySyncSource)
    .filter((source) => ALLOWED_SOURCES.has(source));
  return Array.from(new Set(values));
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const runView = (run: any, dryRun?: boolean): VehicleTaxonomySyncRunView => ({
  id: String(run.id),
  source: String(run.source || ''),
  status: String(run.status || ''),
  dryRun: Boolean(dryRun ?? asRecord(run.sourceMeta).dryRun),
  startedAt: run.startedAt instanceof Date ? run.startedAt.toISOString() : run.startedAt,
  finishedAt: run.finishedAt instanceof Date ? run.finishedAt.toISOString() : run.finishedAt ?? null,
  counts: asRecord(run.counts),
  error: run.error ?? null,
  sourceMeta: run.sourceMeta
});

const emptyDataset = (): Required<VehicleTaxonomySourceDataset> => ({
  makes: [],
  models: [],
  specOptions: [],
  places: []
});

const mergeDataset = (target: Required<VehicleTaxonomySourceDataset>, source: VehicleTaxonomySourceDataset) => {
  target.makes.push(...(source.makes || []));
  target.models.push(...(source.models || []));
  target.specOptions.push(...(source.specOptions || []));
  target.places.push(...(source.places || []));
};

const datasetCounts = (sources: VehicleTaxonomySyncSource[], dataset: Required<VehicleTaxonomySourceDataset>) => ({
  sources: sources.length,
  makes: dataset.makes.length,
  models: dataset.models.length,
  specOptions: dataset.specOptions.length,
  places: dataset.places.length
});

const sourceMeta = (source: string, externalIds?: VehicleTaxonomyExternalIds, extra?: Record<string, unknown>) => ({
  source,
  ...(externalIds ? { externalIds } : {}),
  ...(extra || {})
});

const compactMeta = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

const modelMakeFanoutLimit = (value: number | null | undefined, defaultLimit: number) =>
  value === null ? Number.POSITIVE_INFINITY : Math.max(0, value ?? defaultLimit);

const modelMakeFanoutOffset = (value: number | undefined) =>
  Math.max(0, value ?? 0);

const mapWithConcurrency = async <T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) => {
  const output: R[] = [];
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index]);
    }
  }));
  return output;
};

const emergencyDataset = async (): Promise<VehicleTaxonomySourceDataset> => ({
  makes: EMERGENCY_VEHICLE_MAKES.map((make) => ({
    slug: vehicleTaxonomyId(make.label),
    label: make.label,
    sourceMeta: { source: 'EMERGENCY_FALLBACK' }
  })),
  models: EMERGENCY_VEHICLE_MAKES.flatMap((make) =>
    make.models.map((model) => ({
      makeSlug: vehicleTaxonomyId(make.label),
      slug: vehicleTaxonomyId(model.label),
      label: model.label,
      sourceMeta: { source: 'EMERGENCY_FALLBACK' }
    }))
  ),
  specOptions: EMERGENCY_SPEC_OPTIONS.map((option) => ({
    group: option.group,
    slug: vehicleTaxonomyId(option.label),
    label: option.label,
    sourceMeta: { source: 'EMERGENCY_FALLBACK' }
  })),
  places: EMERGENCY_PLACES.map((place) => ({
    countryCode: 'UA',
    type: place.slug === 'Вся Україна' ? 'country_scope' : 'city',
    slug: vehicleTaxonomyId(place.label),
    label: place.label,
    sourceMeta: { source: 'EMERGENCY_FALLBACK' }
  }))
});

const defaultProviders: Record<VehicleTaxonomySyncSource, VehicleTaxonomyProviderLoader> = {
  AUTO_RIA: async (input) => {
    const apiKey = input.autoriaApiKey || process.env.AUTORIA_API_KEY;
    if (!apiKey) throw new Error('AUTO_RIA sync requires autoriaApiKey or AUTORIA_API_KEY');
    const categoryId = input.categoryId || 1;
    const makes = await fetchAutoriaMarks({ apiKey, categoryId });
    const modelMakeLimit = modelMakeFanoutLimit(input.modelMakeLimit, 50);
    const modelMakeOffset = modelMakeFanoutOffset(input.modelMakeOffset);
    const modelMakeIds = makes
      .slice(modelMakeOffset, Number.isFinite(modelMakeLimit) ? modelMakeOffset + modelMakeLimit : undefined)
      .map((make) => make.externalIds?.autoria)
      .filter((id): id is string | number => id !== undefined && id !== null);
    const models = (await mapWithConcurrency(
      modelMakeIds,
      input.modelFetchConcurrency || 6,
      (makeExternalId) => fetchAutoriaModels({ apiKey, categoryId, makeExternalId })
    )).flat();
    const [specOptions, places] = await Promise.all([
      fetchAutoriaSpecOptions({ apiKey, categoryId }),
      fetchAutoriaPlaces({ apiKey })
    ]);
    return { makes, models, specOptions, places };
  },
  NHTSA: async (input) => {
    const makes = await fetchNhtsaMakes(input.vehicleType || 'car');
    const modelMakeLimit = modelMakeFanoutLimit(input.modelMakeLimit, 0);
    const modelMakeOffset = modelMakeFanoutOffset(input.modelMakeOffset);
    const modelMakeIds = makes
      .slice(modelMakeOffset, Number.isFinite(modelMakeLimit) ? modelMakeOffset + modelMakeLimit : undefined)
      .map((make) => make.externalIds?.nhtsa)
      .filter((id): id is string | number => id !== undefined && id !== null);
    const models = (await mapWithConcurrency(
      modelMakeIds,
      input.modelFetchConcurrency || 6,
      (makeId) => fetchNhtsaModelsForMakeId(makeId)
    )).flat();
    return { makes, models };
  },
  KATOTTG: async (input) => ({ places: await fetchKatottgPlaces({ includeSettlements: input.includeSettlements === true }) }),
  GEONAMES: async () => ({ places: await fetchGeoNamesPlaces() }),
  EMERGENCY_FALLBACK: emergencyDataset
};

export class VehicleTaxonomySyncService {
  private readonly db: any;
  private readonly providers: Record<VehicleTaxonomySyncSource, VehicleTaxonomyProviderLoader>;
  private readonly now: () => Date;

  constructor(deps: VehicleTaxonomySyncDeps = {}) {
    this.db = deps.prisma || defaultPrisma;
    this.providers = { ...defaultProviders, ...(deps.providers || {}) };
    this.now = deps.now || (() => new Date());
  }

  async startSync(input: VehicleTaxonomySyncInput = {}): Promise<VehicleTaxonomySyncRunView> {
    const sources = normalizeSources(input.sources);
    if (!sources.length) {
      throw new Error('At least one supported taxonomy source is required');
    }

    const dryRun = input.dryRun !== false;
    const countryCode = String(input.countryCode || 'UA').toUpperCase();
    const source = sources.join(',');
    const optionsMeta = compactMeta({
      categoryId: input.categoryId,
      vehicleType: input.vehicleType,
      modelMakeLimit: input.modelMakeLimit === null ? 'all' : input.modelMakeLimit,
      modelMakeOffset: input.modelMakeOffset,
      modelFetchConcurrency: input.modelFetchConcurrency,
      includeSettlements: input.includeSettlements === true ? true : undefined
    });
    const sourceMetaValue = {
      dryRun,
      countryCode,
      sources,
      ...(Object.keys(optionsMeta).length ? { options: optionsMeta } : {})
    };
    const dataset = await this.collectDataset(sources, { ...input, countryCode });
    const counts = datasetCounts(sources, dataset);

    if (dryRun) {
      const timestamp = this.now();
      return {
        id: `dry_${timestamp.getTime()}`,
        source,
        status: 'DRY_RUN',
        dryRun: true,
        startedAt: timestamp.toISOString(),
        finishedAt: timestamp.toISOString(),
        counts,
        error: null,
        sourceMeta: sourceMetaValue
      };
    }

    const run = await this.db.taxonomySyncRun.create({
      data: {
        source,
        status: 'RUNNING',
        counts: {},
        sourceMeta: sourceMetaValue
      }
    });

    try {
      await this.persistDataset(dataset, countryCode);
      const finished = await this.db.taxonomySyncRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCESS',
          finishedAt: this.now(),
          counts
        }
      });
      return runView(finished, dryRun);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Vehicle taxonomy sync failed';
      const failed = await this.db.taxonomySyncRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: this.now(),
          counts,
          error: message
        }
      });
      return runView(failed, dryRun);
    }
  }

  async getLatestRun(): Promise<VehicleTaxonomySyncRunView | null> {
    const run = await this.db.taxonomySyncRun.findFirst({
      orderBy: { startedAt: 'desc' }
    });
    return run ? runView(run) : null;
  }

  private async collectDataset(sources: VehicleTaxonomySyncSource[], input: VehicleTaxonomySyncInput) {
    const dataset = emptyDataset();
    for (const source of sources) {
      mergeDataset(dataset, await this.providers[source](input));
    }
    return dataset;
  }

  private async persistDataset(dataset: Required<VehicleTaxonomySourceDataset>, countryCode: string) {
    const makeIdBySlug = new Map<string, string>();
    const makeIdByExternalValue = new Map<string, string>();

    for (const make of dataset.makes) {
      const slug = make.slug || vehicleTaxonomyId(make.label);
      const label = normalizeTaxonomyLabel(make.label);
      if (!slug || !label) continue;
      const saved = await this.db.vehicleMake.upsert({
        where: { slug },
        update: {
          label,
          normalizedKey: vehicleTaxonomyId(label),
          active: true,
          sourceMeta: sourceMeta(String(make.sourceMeta?.source || 'UNKNOWN'), make.externalIds, make.sourceMeta)
        },
        create: {
          slug,
          label,
          normalizedKey: vehicleTaxonomyId(label),
          active: true,
          sourceMeta: sourceMeta(String(make.sourceMeta?.source || 'UNKNOWN'), make.externalIds, make.sourceMeta)
        }
      });
      makeIdBySlug.set(slug, saved.id);
      Object.values(make.externalIds || {}).forEach((value) => {
        makeIdByExternalValue.set(String(value), saved.id);
      });
    }

    for (const model of dataset.models) {
      await this.upsertModel(model, makeIdBySlug, makeIdByExternalValue);
    }

    for (const option of dataset.specOptions) {
      const label = normalizeTaxonomyLabel(option.label);
      if (!label || !option.group) continue;
      const normalizedKey = vehicleTaxonomyId(label);
      await this.db.vehicleSpecOption.upsert({
        where: { group_normalizedKey: { group: option.group, normalizedKey } },
        update: {
          slug: option.slug || normalizedKey,
          label,
          active: true,
          sourceMeta: sourceMeta(String(option.sourceMeta?.source || 'UNKNOWN'), option.externalIds, option.sourceMeta)
        },
        create: {
          group: option.group,
          slug: option.slug || normalizedKey,
          label,
          normalizedKey,
          active: true,
          sourceMeta: sourceMeta(String(option.sourceMeta?.source || 'UNKNOWN'), option.externalIds, option.sourceMeta)
        }
      });
    }

    for (const place of dataset.places) {
      const label = normalizeTaxonomyLabel(place.label);
      if (!label || !place.type) continue;
      const normalizedKey = vehicleTaxonomyId(label);
      await this.db.geoPlace.upsert({
        where: {
          countryCode_type_normalizedKey: {
            countryCode: place.countryCode || countryCode,
            type: place.type,
            normalizedKey
          }
        },
        update: {
          slug: place.slug || normalizedKey,
          label,
          region: place.region || null,
          latitude: place.latitude ?? null,
          longitude: place.longitude ?? null,
          active: true,
          sourceMeta: sourceMeta(String(place.sourceMeta?.source || 'UNKNOWN'), place.externalIds, place.sourceMeta)
        },
        create: {
          countryCode: place.countryCode || countryCode,
          type: place.type,
          slug: place.slug || normalizedKey,
          label,
          normalizedKey,
          region: place.region || null,
          latitude: place.latitude ?? null,
          longitude: place.longitude ?? null,
          active: true,
          sourceMeta: sourceMeta(String(place.sourceMeta?.source || 'UNKNOWN'), place.externalIds, place.sourceMeta)
        }
      });
    }
  }

  private async upsertModel(
    model: VehicleTaxonomySourceModel,
    makeIdBySlug: Map<string, string>,
    makeIdByExternalValue: Map<string, string>
  ) {
    const label = normalizeTaxonomyLabel(model.label);
    const makeId = (model.makeSlug ? makeIdBySlug.get(model.makeSlug) : undefined)
      || (model.makeExternalId !== undefined && model.makeExternalId !== null ? makeIdByExternalValue.get(String(model.makeExternalId)) : undefined);
    if (!label || !makeId) return;

    const normalizedKey = vehicleTaxonomyId(label);
    await this.db.vehicleModel.upsert({
      where: { makeId_normalizedKey: { makeId, normalizedKey } },
      update: {
        slug: model.slug || normalizedKey,
        label,
        active: true,
        sourceMeta: sourceMeta(String(model.sourceMeta?.source || 'UNKNOWN'), model.externalIds, model.sourceMeta)
      },
      create: {
        makeId,
        slug: model.slug || normalizedKey,
        label,
        normalizedKey,
        active: true,
        sourceMeta: sourceMeta(String(model.sourceMeta?.source || 'UNKNOWN'), model.externalIds, model.sourceMeta)
      }
    });
  }
}

export const vehicleTaxonomySyncService = new VehicleTaxonomySyncService();
