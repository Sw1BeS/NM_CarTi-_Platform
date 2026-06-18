import axios from 'axios';
import { normalizeTaxonomyLabel, vehicleTaxonomyId } from '../vehicleTaxonomy.ids.js';
import type { VehicleTaxonomySourceMake, VehicleTaxonomySourceModel } from '../vehicleTaxonomy.types.js';

const NHTSA_BASE_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles';

type NhtsaMake = {
  MakeId?: number;
  Make_ID?: number;
  MakeName?: string;
  Make_Name?: string;
};

type NhtsaModel = {
  Make_ID?: number;
  MakeId?: number;
  Make_Name?: string;
  MakeName?: string;
  Model_ID?: number;
  ModelId?: number;
  Model_Name?: string;
  ModelName?: string;
};

const titleCaseMake = (value: string) => {
  if (!value || value !== value.toUpperCase()) return value;
  const acronyms = new Set(['BMW', 'BYD', 'GMC', 'RAM', 'MINI', 'DS']);
  if (acronyms.has(value)) return value;
  return value
    .toLowerCase()
    .split(/([\s-]+)/)
    .map((part) => /^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join('');
};

export const mapNhtsaMakes = (items: NhtsaMake[]): VehicleTaxonomySourceMake[] =>
  items.reduce<VehicleTaxonomySourceMake[]>((acc, item) => {
    const externalId = item.MakeId ?? item.Make_ID;
    const label = titleCaseMake(normalizeTaxonomyLabel(item.MakeName || item.Make_Name));
    if (!label || externalId === undefined || externalId === null) return acc;
    acc.push({
      slug: vehicleTaxonomyId(label),
      label,
      externalIds: { nhtsa: externalId },
      sourceMeta: { source: 'NHTSA' }
    });
    return acc;
  }, []);

export const mapNhtsaModels = (items: NhtsaModel[]): VehicleTaxonomySourceModel[] =>
  items.reduce<VehicleTaxonomySourceModel[]>((acc, item) => {
    const makeExternalId = item.Make_ID ?? item.MakeId;
    const externalId = item.Model_ID ?? item.ModelId;
    const label = normalizeTaxonomyLabel(item.Model_Name || item.ModelName);
    if (!label || makeExternalId === undefined || makeExternalId === null || externalId === undefined || externalId === null) return acc;
    acc.push({
      makeExternalId,
      makeSlug: item.Make_Name || item.MakeName ? vehicleTaxonomyId(item.Make_Name || item.MakeName) : undefined,
      slug: vehicleTaxonomyId(label),
      label,
      externalIds: { nhtsa: externalId },
      sourceMeta: { source: 'NHTSA' }
    });
    return acc;
  }, []);

export const fetchNhtsaMakes = async (vehicleType = 'car') => {
  const response = await axios.get<{ Results?: NhtsaMake[] }>(
    `${NHTSA_BASE_URL}/GetMakesForVehicleType/${encodeURIComponent(vehicleType)}`,
    { params: { format: 'json' } }
  );
  return mapNhtsaMakes(response.data?.Results || []);
};

export const fetchNhtsaModelsForMakeId = async (makeId: string | number) => {
  const response = await axios.get<{ Results?: NhtsaModel[] }>(
    `${NHTSA_BASE_URL}/GetModelsForMakeId/${encodeURIComponent(String(makeId))}`,
    { params: { format: 'json' } }
  );
  return mapNhtsaModels(response.data?.Results || []);
};
