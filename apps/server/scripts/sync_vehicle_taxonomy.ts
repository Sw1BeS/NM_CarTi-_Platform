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

async function main() {
  if (errors.length) {
    console.error(buildVehicleTaxonomySyncUsage());
    for (const error of errors) console.error(`[vehicle-taxonomy:sync] error: ${error}`);
    process.exitCode = 1;
    return;
  }

  log(`mode=${options.dryRun ? 'DRY_RUN' : 'APPLY'} sources=${options.sources.join(',')} country=${options.countryCode}`);

  const syncRun = await vehicleTaxonomySyncService.startSync({
    sources: options.sources,
    countryCode: options.countryCode,
    dryRun: options.dryRun,
    modelMakeLimit: options.modelMakeLimit,
    categoryId: options.categoryId,
    vehicleType: options.vehicleType
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
    console.error('[vehicle-taxonomy:sync] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
