export type VehicleTaxonomyExternalIds = Record<string, string | number>;

export type VehicleTaxonomyOption = {
  id: string;
  label: string;
  aliases?: string[];
  externalIds?: VehicleTaxonomyExternalIds;
};

export type VehicleTaxonomyCompatibilityConstraints = {
  fuels?: string[];
  bodyTypes?: string[];
  transmissions?: string[];
  drives?: string[];
  source?: string;
};

export type VehicleTaxonomyModel = VehicleTaxonomyOption & {
  brandId?: string;
  constraints?: VehicleTaxonomyCompatibilityConstraints;
};

export type VehicleTaxonomyBrand = VehicleTaxonomyOption & {
  models: VehicleTaxonomyModel[];
  constraints?: VehicleTaxonomyCompatibilityConstraints;
};

export type VehicleTaxonomyResponse = {
  ok?: boolean;
  version?: string;
  source?: 'LOCAL_SNAPSHOT' | 'EMERGENCY_FALLBACK';
  updatedAt?: string;
  stale?: boolean;
  brands: VehicleTaxonomyBrand[];
  bodyTypes: VehicleTaxonomyOption[];
  fuels: VehicleTaxonomyOption[];
  transmissions: VehicleTaxonomyOption[];
  drives: VehicleTaxonomyOption[];
  cities: VehicleTaxonomyOption[];
};

export type VehicleTaxonomySnapshotMake = {
  id: string;
  slug: string;
  label: string;
  sourceMeta: unknown;
  updatedAt?: Date | null;
  models: Array<{
    id: string;
    slug: string;
    label: string;
    sourceMeta: unknown;
    updatedAt?: Date | null;
  }>;
};

export type VehicleTaxonomySnapshotSpecOption = {
  group: string;
  slug: string;
  label: string;
  sourceMeta: unknown;
  updatedAt?: Date | null;
};

export type VehicleTaxonomySnapshotPlace = {
  slug: string;
  label: string;
  sourceMeta: unknown;
  updatedAt?: Date | null;
};

export type VehicleTaxonomySnapshot = {
  makes: VehicleTaxonomySnapshotMake[];
  specOptions: VehicleTaxonomySnapshotSpecOption[];
  places: VehicleTaxonomySnapshotPlace[];
  updatedAt?: Date | null;
};

export type VehicleTaxonomySourceMake = {
  slug: string;
  label: string;
  externalIds?: VehicleTaxonomyExternalIds;
  sourceMeta?: Record<string, unknown>;
};

export type VehicleTaxonomySourceModel = {
  makeSlug?: string;
  makeExternalId?: string | number;
  slug: string;
  label: string;
  externalIds?: VehicleTaxonomyExternalIds;
  sourceMeta?: Record<string, unknown>;
};

export type VehicleTaxonomySourceSpecOption = {
  group: string;
  slug: string;
  label: string;
  externalIds?: VehicleTaxonomyExternalIds;
  sourceMeta?: Record<string, unknown>;
};

export type VehicleTaxonomySourcePlace = {
  countryCode: string;
  type: string;
  slug: string;
  label: string;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  externalIds?: VehicleTaxonomyExternalIds;
  sourceMeta?: Record<string, unknown>;
};

export type VehicleTaxonomySourceDataset = {
  makes?: VehicleTaxonomySourceMake[];
  models?: VehicleTaxonomySourceModel[];
  specOptions?: VehicleTaxonomySourceSpecOption[];
  places?: VehicleTaxonomySourcePlace[];
};
