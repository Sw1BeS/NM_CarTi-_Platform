import { describe, expect, it } from 'vitest';
import { mapInventoryOutput } from './dto.js';

describe('mapInventoryOutput normalization', () => {
  it('normalizes common specs labels and keeps media unique', () => {
    const mapped = mapInventoryOutput({
      id: 'car_1',
      title: 'BMW X5 2020',
      price: 55000,
      currency: 'USD',
      year: 2020,
      mileage: 90000,
      location: 'Lviv',
      thumbnail: 'https://cdn/cover.jpg',
      mediaUrls: ['https://cdn/cover.jpg', 'https://cdn/2.jpg', 'https://cdn/2.jpg'],
      specs: {
        make: 'BMW',
        model: 'X5',
        fuel: 'diesel',
        transmission: 'automatic',
        drive: 'AWD'
      }
    } as any);

    expect(mapped.brand).toBe('BMW');
    expect(mapped.model).toBe('X5');
    expect(mapped.specs.fuel).toBe('Дизель');
    expect(mapped.specs.transmission).toBe('Автомат');
    expect(mapped.specs.drive).toBe('Повний');
    expect(mapped.mediaUrls).toEqual(['https://cdn/cover.jpg', 'https://cdn/2.jpg']);
    expect(mapped.presentation).toMatchObject({
      title: 'BMW X5 2020',
      priceLabel: '$55,000',
      mileageLabel: '90 000 км',
      statusLabel: 'В наявності'
    });
    expect(mapped.presentation.specChips).toEqual(expect.arrayContaining(['Дизель', 'Автомат', 'Повний']));
  });

  it('cleans raw vehicle artifacts from presentation labels', () => {
    const mapped = mapInventoryOutput({
      id: 'car_2',
      title: 'Mercedes-Benz GLE',
      price: 0,
      year: 2023,
      mileage: 0,
      status: 'PENDING',
      specs: {
        fuel: 'running',
        transmission: 'automatic',
        drive: 'awd',
        condition: 'in_transit',
        damage: 'none'
      }
    } as any);

    const presentationText = JSON.stringify(mapped.presentation);
    expect(presentationText).not.toContain('running');
    expect(presentationText).not.toContain('in_transit');
    expect(mapped.presentation.statusLabel).toBe('В дорозі');
    expect(mapped.presentation.specChips).toEqual(expect.arrayContaining(['Автомат', 'Повний', 'Без пошкоджень']));
  });
});
