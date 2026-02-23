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
  });
});
