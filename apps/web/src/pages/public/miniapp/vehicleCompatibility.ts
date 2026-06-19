import type {
  VehicleTaxonomyBrand,
  VehicleTaxonomyCompatibilityConstraints,
  VehicleTaxonomyOption
} from '../../../services/miniappApi';

type ResolveCompatibilityInput = {
  brandSources: VehicleTaxonomyBrand[];
  selectedBrands: string[];
  selectedModels: string[];
};

const findByIdOrLabel = <T extends { id: string; label: string }>(items: T[], value: string) =>
  items.find(item => item.id === value || item.label === value);

export const resolveActiveVehicleConstraints = ({
  brandSources,
  selectedBrands,
  selectedModels
}: ResolveCompatibilityInput): VehicleTaxonomyCompatibilityConstraints | undefined => {
  if (selectedBrands.length !== 1 || selectedModels.length > 1) return undefined;

  const brand = findByIdOrLabel(brandSources, selectedBrands[0]);
  if (!brand) return undefined;
  if (!selectedModels.length) return brand.constraints;

  const model = findByIdOrLabel(brand.models || [], selectedModels[0]);
  return model?.constraints || brand.constraints;
};

export const filterOptionsByVehicleConstraints = (
  options: VehicleTaxonomyOption[],
  constraints: VehicleTaxonomyCompatibilityConstraints | undefined,
  group: 'fuels' | 'bodyTypes' | 'transmissions' | 'drives'
) => {
  const allowed = constraints?.[group];
  if (!allowed?.length) return options;
  const allowedIds = new Set(allowed);
  return options.filter(option => allowedIds.has(option.id));
};

export const isValueAllowedByOptions = (value: string, options: VehicleTaxonomyOption[]) =>
  !value || options.some(option => option.label === value || option.id === value);
