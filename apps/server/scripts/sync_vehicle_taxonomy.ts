import { prisma } from '../src/services/prisma.js';
import { vehicleTaxonomyCandidateService } from '../src/modules/VehicleTaxonomy/vehicleTaxonomy.candidates.js';
import { vehicleTaxonomySyncService } from '../src/modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.js';
import {
  buildVehicleTaxonomySyncUsage,
  parseVehicleTaxonomySyncArgs,
  validateVehicleTaxonomySyncOptions
} from '../src/scripts/sync_vehicle_taxonomy.helpers.js';

const options = parseVehicleTaxonomySyncArgs(process.argv.slice(2));
const errors = validateVehicleTaxonomySyncOptions(options);

const log = (message: string) => console.log(`[vehicle-taxonomy:sync] ${message}`);
const redactSecrets = (value: unknown) =>
  String(value instanceof Error ? value.stack || value.message : value)
    .replace(/api_key=[^&\s"']+/gi, 'api_key=[redacted]')
    .replace(/api_key['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'api_key: [redacted]')
    .replace(/AUTORIA_API_KEY[=:]\s*[^,\s"']+/gi, 'AUTORIA_API_KEY=[redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted-token]');

async function main() {
  if (errors.length) {
    console.error(buildVehicleTaxonomySyncUsage());
    for (const error of errors) console.error(`[vehicle-taxonomy:sync] error: ${error}`);
    process.exitCode = 1;
    return;
  }

  log(
    [
      `mode=${options.dryRun ? 'DRY_RUN' : 'APPLY'}`,
      `sources=${options.sources.join(',')}`,
      `country=${options.countryCode}`,
      `modelMakeLimit=${options.modelMakeLimit === null ? 'all' : options.modelMakeLimit ?? 'default'}`,
      `modelMakeOffset=${options.modelMakeOffset || 0}`,
      `modelFetchConcurrency=${options.modelFetchConcurrency || 'default'}`,
      `skipAutoriaSpecOptions=${options.skipAutoriaSpecOptions ? 'yes' : 'no'}`,
      `skipAutoriaPlaces=${options.skipAutoriaPlaces ? 'yes' : 'no'}`,
      `includeSettlements=${options.includeSettlements ? 'yes' : 'no'}`
    ].join(' ')
  );

  const syncRun = await vehicleTaxonomySyncService.startSync({
    sources: options.sources,
    countryCode: options.countryCode,
    dryRun: options.dryRun,
    modelMakeLimit: options.modelMakeLimit,
    modelMakeOffset: options.modelMakeOffset,
    modelFetchConcurrency: options.modelFetchConcurrency,
    skipAutoriaSpecOptions: options.skipAutoriaSpecOptions,
    skipAutoriaPlaces: options.skipAutoriaPlaces,
    categoryId: options.categoryId,
    vehicleType: options.vehicleType,
    includeSettlements: options.includeSettlements
  });

  log(`syncRun id=${syncRun.id} status=${syncRun.status} dryRun=${syncRun.dryRun}`);
  log(`counts=${JSON.stringify(syncRun.counts)}`);

  if (options.scanObserved) {
    if (options.dryRun) {
      log(`would_scan_observed companyId=${options.companyId || 'none'} limit=${options.observedLimit || 300}`);
    } else {
      const result = await vehicleTaxonomyCandidateService.collectObservedInventoryCandidates({
        companyId: options.companyId,
        limit: options.observedLimit
      });
      log(`scanObserved=${JSON.stringify(result)}`);
    }
  }
}

main()
  .catch((error) => {
    console.error('[vehicle-taxonomy:sync] failed:', redactSecrets(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
