import { describe, expect, it } from 'vitest';
import {
  parseVehicleTaxonomySyncArgs,
  validateVehicleTaxonomySyncOptions
} from './sync_vehicle_taxonomy.helpers.js';

describe('sync vehicle taxonomy CLI helpers', () => {
  it('defaults to emergency fallback dry-run', () => {
    const options = parseVehicleTaxonomySyncArgs([]);

    expect(options).toMatchObject({
      dryRun: true,
      sources: ['EMERGENCY_FALLBACK'],
      countryCode: 'UA',
      includeSettlements: false,
      scanObserved: false
    });
    expect(validateVehicleTaxonomySyncOptions(options, {})).toEqual([]);
  });

  it('requires an env gate for write mode', () => {
    const options = parseVehicleTaxonomySyncArgs(['--source=EMERGENCY_FALLBACK', '--apply']);

    expect(options.dryRun).toBe(false);
    expect(validateVehicleTaxonomySyncOptions(options, {})).toContain('Write mode requires ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1.');
    expect(validateVehicleTaxonomySyncOptions(options, { ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE: '1' })).toEqual([]);
  });

  it('requires company scope for observed inventory writes', () => {
    const options = parseVehicleTaxonomySyncArgs(['--apply', '--scan-observed']);

    expect(validateVehicleTaxonomySyncOptions(options, { ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE: '1' })).toContain(
      'Observed inventory candidate scan in write mode requires --companyId=<workspaceId>.'
    );
  });

  it('parses source lists and provider limits', () => {
    const options = parseVehicleTaxonomySyncArgs([
      '--sources=NHTSA,KATOTTG',
      '--country-code=ua',
      '--model-make-limit=5',
      '--vehicle-type=car'
    ]);

    expect(options).toMatchObject({
      dryRun: true,
      sources: ['NHTSA', 'KATOTTG'],
      countryCode: 'UA',
      modelMakeLimit: 5,
      includeSettlements: false,
      vehicleType: 'car'
    });
  });

  it('parses explicit full source import flags', () => {
    const options = parseVehicleTaxonomySyncArgs([
      '--sources=AUTO_RIA,KATOTTG',
      '--all-models',
      '--include-settlements',
      '--model-make-offset=25',
      '--model-fetch-concurrency=4',
      '--category-id=1'
    ]);

    expect(options).toMatchObject({
      dryRun: true,
      sources: ['AUTO_RIA', 'KATOTTG'],
      countryCode: 'UA',
      modelMakeLimit: null,
      modelMakeOffset: 25,
      modelFetchConcurrency: 4,
      includeSettlements: true,
      categoryId: 1
    });
  });

  it('accepts model-make-limit=all as a non-ambiguous full fan-out alias', () => {
    const options = parseVehicleTaxonomySyncArgs(['--source=NHTSA', '--model-make-limit=all']);

    expect(options.modelMakeLimit).toBeNull();
  });
});
