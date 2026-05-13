import { describe, expect, it } from 'vitest';
import { buildRequestPresentationSnapshot } from './requestPresentation.js';

describe('requestPresentation', () => {
  it('builds readable vehicle snapshots and telegram text for selected cars', () => {
    const snapshot = buildRequestPresentationSnapshot({
      slug: 'cartie',
      customerIntent: 'PRICE_TERMS',
      sourceView: 'detail',
      comment: 'Цікавить лізинг',
      cars: [
        {
          id: 'car_1',
          title: 'Mercedes-Benz S 500 4MATIC',
          year: 2021,
          price: 78900,
          currency: 'USD',
          mileage: 45000,
          location: 'Львів',
          thumbnail: 'https://cdn.example/s500.jpg',
          mediaUrls: ['https://cdn.example/s500.jpg'],
          specs: { fuel: 'diesel', drive: 'awd', transmission: 'automatic' },
          status: 'AVAILABLE'
        }
      ]
    });

    expect(snapshot.requestTitle).toBe('Ціна / умови: Mercedes-Benz S 500 4MATIC');
    expect(snapshot.selectedCars[0]).toEqual(expect.objectContaining({
      id: 'car_1',
      title: 'Mercedes-Benz S 500 4MATIC',
      priceLabel: '$78,900',
      mileageLabel: '45 000 км',
      statusLabel: 'В наявності',
      publicUrl: '/p/app/cartie?entry=inventory&carId=car_1'
    }));
    expect(snapshot.telegramText).toContain('Mercedes-Benz S 500 4MATIC');
    expect(snapshot.telegramText).toContain('$78,900');
    expect(snapshot.requestSummary).toContain('Цікавить лізинг');
  });

  it('uses the actual vehicle identity instead of noisy AutoRIA VIN-check titles', () => {
    const rawText = [
      'Перевірений VIN-код AUTO.RIA перевірив VIN-код',
      'Tesla Model X Одеса',
      'Tesla Model X 2017',
      'І покоління • 75D 75 kWh Dual Motor (333 к.с.) AWD • Base',
      '25 000 $',
      '112 тис. км',
      'Електро, 75 кВт-год',
      'UA, Одеська обл., Одеса, 65000'
    ].join(' ');

    const snapshot = buildRequestPresentationSnapshot({
      slug: 'cartie',
      customerIntent: 'PRICE_TERMS',
      sourceView: 'detail',
      cars: [
        {
          id: 'car_auto_ria_1',
          title: 'Перевірений VIN-код',
          year: 2017,
          price: 0,
          mileage: 0,
          status: 'AVAILABLE',
          specs: { rawText },
          originalRaw: { rawText }
        }
      ]
    });

    expect(snapshot.requestTitle).toBe('Ціна / умови: Tesla Model X 2017');
    expect(snapshot.telegramText).toContain('Tesla Model X 2017');
    expect(snapshot.telegramText).toContain('$25,000');
    expect(snapshot.telegramText).toContain('112 000 км');
    expect(snapshot.telegramText).not.toContain('Перевірений VIN-код');
    expect(snapshot.telegramText).not.toContain('2017 (2017)');
  });

  it('prefers a full make/model/year title from noisy compressed AutoRIA text', () => {
    const rawText = [
      'AUTO.RIA.comЛегкові з пробігомОдеська областьОдесаTeslaModel XTesla Model X Одеса',
      'Item 1 of 8Tesla Model X 2017І покоління • 75D 75 kWh Dual Motor (333 к.с.) AWD • Base',
      '25 000 $',
      '112 тис. км',
      'Був в ДТП',
      'Оформити розстрочку на Tesla Model X 2017'
    ].join('');

    const snapshot = buildRequestPresentationSnapshot({
      slug: 'cartie',
      customerIntent: 'PRICE_TERMS',
      cars: [
        {
          id: 'car_auto_ria_2',
          title: 'Перевірений VIN-код',
          year: 2017,
          price: 0,
          mileage: 75000,
          status: 'AVAILABLE',
          specs: { rawText }
        }
      ]
    });

    expect(snapshot.selectedCars[0].title).toBe('Tesla Model X 2017');
    expect(snapshot.telegramText).toContain('Tesla Model X 2017');
    expect(snapshot.telegramText).not.toContain('🚗 1. Model X 2017');
    expect(JSON.stringify(snapshot.vehiclePresentation)).not.toContain('damaged');
  });
});
