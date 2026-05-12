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
});
