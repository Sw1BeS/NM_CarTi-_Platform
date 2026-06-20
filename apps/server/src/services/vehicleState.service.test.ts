import { describe, expect, it } from 'vitest';
import {
  deriveVehicleAvailabilityState,
  deriveVehiclePublicationStatus,
  vehicleAvailabilityLabel
} from './vehicleState.service.js';

describe('vehicleState service', () => {
  it('separates publication review from transit availability', () => {
    expect(deriveVehiclePublicationStatus({ status: 'PENDING', autoPublish: false })).toBe('REVIEW');
    expect(deriveVehicleAvailabilityState({ title: 'BMW X5 2020', status: undefined })).toBe('IN_STOCK');
  });

  it('derives transit and import directions from text signals', () => {
    expect(deriveVehicleAvailabilityState({ title: 'Audi Q7 #вдорозі' })).toBe('IN_TRANSIT');
    expect(deriveVehicleAvailabilityState({ description: 'BMW X7 під замовлення' })).toBe('IMPORT_TO_ORDER');
  });

  it('lets parsed stock status override noisy transit text', () => {
    expect(deriveVehicleAvailabilityState({
      description: 'AUDI Q7 #вдорозі в наявності',
      specs: { status: 'in_stock', condition: 'in_stock' }
    })).toBe('IN_STOCK');
    expect(deriveVehicleAvailabilityState({
      description: 'BMW X5 в наявності',
      specs: { status: 'in_transit' }
    })).toBe('IN_TRANSIT');
  });

  it('derives sold and reserved availability from parsed specs or text', () => {
    expect(deriveVehicleAvailabilityState({ specs: { status: 'sold' } })).toBe('SOLD');
    expect(deriveVehicleAvailabilityState({ description: 'AUDI Q5 2017 ❌ Продано' })).toBe('SOLD');
    expect(deriveVehicleAvailabilityState({ specs: { status: 'reserved' } })).toBe('RESERVED');
  });

  it('labels normalized vehicle directions for public presentation', () => {
    expect(vehicleAvailabilityLabel('IN_STOCK')).toBe('В наявності');
    expect(vehicleAvailabilityLabel('IN_TRANSIT')).toBe('В дорозі');
    expect(vehicleAvailabilityLabel('IMPORT_TO_ORDER')).toBe('Під замовлення');
  });
});
