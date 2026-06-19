import type { VehicleTaxonomySyncSource } from '../modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.js';

export type VehicleTaxonomySyncCliOptions = {
  dryRun: boolean;
  sources: VehicleTaxonomySyncSource[];
  countryCode: string;
  modelMakeLimit?: number | null;
  modelMakeOffset?: number;
  modelFetchConcurrency?: number;
  categoryId?: number;
  vehicleType?: string;
  includeSettlements: boolean;
  scanObserved: boolean;
  companyId?: string;
  observedLimit?: number;
};

const SUPPORTED_SOURCES = new Set<VehicleTaxonomySyncSource>([
  'AUTO_RIA',
  'NHTSA',
  'KATOTTG',
  'GEONAMES',
  'EMERGENCY_FALLBACK'
]);

const readValueArg = (args: string[], name: string) => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : undefined;
};

const readNumberArg = (args: string[], name: string) => {
  const value = readValueArg(args, name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readModelMakeLimitArg = (args: string[]) => {
  if (args.includes('--all-models')) return null;
  const value = readValueArg(args, 'modelMakeLimit') ?? readValueArg(args, 'model-make-limit');
  if (!value) return undefined;
  if (value.toLowerCase() === 'all') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseSources = (value?: string): VehicleTaxonomySyncSource[] => {
  const raw = value || 'EMERGENCY_FALLBACK';
  return Array.from(new Set(
    raw
      .split(',')
      .map((source) => source.trim().toUpperCase() as VehicleTaxonomySyncSource)
      .filter(Boolean)
  ));
};

export const parseVehicleTaxonomySyncArgs = (args: string[]): VehicleTaxonomySyncCliOptions => {
  const apply = args.includes('--apply');
  return {
    dryRun: !apply,
    sources: parseSources(readValueArg(args, 'sources') || readValueArg(args, 'source')),
    countryCode: (readValueArg(args, 'countryCode') || readValueArg(args, 'country-code') || 'UA').toUpperCase(),
    modelMakeLimit: readModelMakeLimitArg(args),
    modelMakeOffset: readNumberArg(args, 'modelMakeOffset') ?? readNumberArg(args, 'model-make-offset'),
    modelFetchConcurrency: readNumberArg(args, 'modelFetchConcurrency') ?? readNumberArg(args, 'model-fetch-concurrency'),
    categoryId: readNumberArg(args, 'categoryId') ?? readNumberArg(args, 'category-id'),
    vehicleType: readValueArg(args, 'vehicleType') || readValueArg(args, 'vehicle-type'),
    includeSettlements: args.includes('--include-settlements'),
    scanObserved: args.includes('--scan-observed'),
    companyId: readValueArg(args, 'companyId') || readValueArg(args, 'company-id'),
    observedLimit: readNumberArg(args, 'observedLimit') ?? readNumberArg(args, 'observed-limit')
  };
};

export const validateVehicleTaxonomySyncOptions = (
  options: VehicleTaxonomySyncCliOptions,
  env: Record<string, string | undefined> = process.env
) => {
  const errors: string[] = [];
  const unsupported = options.sources.filter((source) => !SUPPORTED_SOURCES.has(source));

  if (unsupported.length) {
    errors.push(`Unsupported source(s): ${unsupported.join(', ')}.`);
  }

  if (!options.dryRun && env.ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE !== '1') {
    errors.push('Write mode requires ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1.');
  }

  if (!options.dryRun && options.scanObserved && !options.companyId) {
    errors.push('Observed inventory candidate scan in write mode requires --companyId=<workspaceId>.');
  }

  if (options.countryCode.length !== 2) {
    errors.push('Pass a two-letter --countryCode, for example --countryCode=UA.');
  }

  return errors;
};

export const buildVehicleTaxonomySyncUsage = () => [
  'Usage:',
  '  npm run vehicle-taxonomy:sync -- --source=EMERGENCY_FALLBACK',
  '  npm run vehicle-taxonomy:sync -- --sources=NHTSA,KATOTTG --model-make-limit=0',
  '  npm run vehicle-taxonomy:sync -- --sources=AUTO_RIA,KATOTTG --model-make-limit=25 --model-make-offset=0 --model-fetch-concurrency=2 --include-settlements',
  '  ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1 npm run vehicle-taxonomy:sync -- --source=EMERGENCY_FALLBACK --apply',
  '  ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1 npm run vehicle-taxonomy:sync -- --source=EMERGENCY_FALLBACK --apply --scan-observed --companyId=<workspaceId>',
  '',
  'Default mode is DRY_RUN.',
  '--all-models is explicit full model fan-out; without it AUTO_RIA is bounded and NHTSA fetches makes only.',
  '--model-make-offset with --model-make-limit lets AUTO_RIA model fan-out run in quota-safe batches.',
  '--model-fetch-concurrency controls parallel model fan-out requests; default is 6.',
  '--include-settlements adds Ukrainian towns/villages from KATOTTG to the city selector snapshot.',
  'Write mode requires both --apply and ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1.',
  'Public MiniApp taxonomy never calls external providers live; this script only updates the local snapshot.'
].join('\n');
