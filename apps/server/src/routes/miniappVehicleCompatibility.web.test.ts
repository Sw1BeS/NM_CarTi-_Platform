import { describe, expect, it } from 'vitest';
import {
  filterOptionsByVehicleConstraints,
  isValueAllowedByOptions,
  resolveActiveVehicleConstraints
} from '../../../web/src/pages/public/miniapp/vehicleCompatibility.ts';

const brands = [
  {
    id: 'tesla',
    label: 'Tesla',
    constraints: { fuels: ['електро'], transmissions: ['автомат'] },
    models: [
      { id: 'model-3', label: 'Model 3', brandId: 'tesla', constraints: { fuels: ['електро'], bodyTypes: ['седан'] } },
      { id: 'model-y', label: 'Model Y', brandId: 'tesla', constraints: { fuels: ['електро'], bodyTypes: ['suv'] } }
    ]
  },
  {
    id: 'bmw',
    label: 'BMW',
    models: [{ id: 'x5', label: 'X5', brandId: 'bmw' }]
  }
];

const fuels = [
  { id: 'бензин', label: 'Бензин' },
  { id: 'дизель', label: 'Дизель' },
  { id: 'електро', label: 'Електро' }
];

describe('MiniApp vehicle compatibility filtering', () => {
  it('uses brand-level constraints before a model is selected', () => {
    const constraints = resolveActiveVehicleConstraints({
      brandSources: brands,
      selectedBrands: ['Tesla'],
      selectedModels: []
    });

    expect(filterOptionsByVehicleConstraints(fuels, constraints, 'fuels')).toEqual([{ id: 'електро', label: 'Електро' }]);
    expect(isValueAllowedByOptions('Дизель', filterOptionsByVehicleConstraints(fuels, constraints, 'fuels'))).toBe(false);
  });

  it('uses model-level constraints when a constrained model is selected', () => {
    const constraints = resolveActiveVehicleConstraints({
      brandSources: brands,
      selectedBrands: ['tesla'],
      selectedModels: ['Model 3']
    });

    expect(constraints).toMatchObject({ fuels: ['електро'], bodyTypes: ['седан'] });
  });

  it('does not over-filter broad multi-brand requests', () => {
    const constraints = resolveActiveVehicleConstraints({
      brandSources: brands,
      selectedBrands: ['Tesla', 'BMW'],
      selectedModels: []
    });

    expect(constraints).toBeUndefined();
    expect(filterOptionsByVehicleConstraints(fuels, constraints, 'fuels')).toHaveLength(3);
  });
});
