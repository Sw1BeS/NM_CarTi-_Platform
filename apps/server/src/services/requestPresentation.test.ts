import { describe, expect, it } from 'vitest';
import { mapRequestOutput } from './dto.js';
import { buildOperatorRequestPresentation, buildRequestPresentationSnapshot } from './requestPresentation.js';

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
      publicUrl: '/p/app/cartie?entry=inventory&carId=car_1&preview=admin_chat'
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

  it('builds an operator presentation for MiniApp selected-car requests', () => {
    const request = {
      id: 'req_1',
      publicId: 'CD-2026-000001',
      title: 'Raw MiniApp title',
      status: 'COLLECTING_VARIANTS',
      chatId: '111222333',
      budgetMax: 90000,
      createdAt: new Date('2026-05-12T10:00:00.000Z'),
      updatedAt: new Date('2026-05-12T10:02:00.000Z'),
      payload: {
        source: 'miniapp_intent',
        sourceContext: 'miniapp_interest',
        phone: '+380671234567',
        telegram: {
          userId: '111222333',
          username: 'buyer_one'
        },
        requestPresentation: {
          requestTitle: 'Ціна / умови: Mercedes-Benz S 500',
          customerIntent: 'PRICE_TERMS',
          selectedCars: [
            { id: 'car_1', title: 'Mercedes-Benz S 500 2021' }
          ],
          criteriaChips: ['Бюджет 70000-90000']
        }
      }
    };

    const presentation = buildOperatorRequestPresentation(request, { includeContact: true });

    expect(presentation).toEqual(expect.objectContaining({
      title: 'Ціна / умови: Mercedes-Benz S 500',
      sourceLabel: 'MiniApp',
      customerLabel: '@buyer_one',
      contactLabel: '+380671234567',
      intentLabel: 'Ціна/умови',
      selectedCarLabels: ['Mercedes-Benz S 500 2021'],
      criteriaChips: ['Бюджет 70000-90000']
    }));
    expect(presentation.timeline).toEqual([
      { at: '2026-05-12T10:00:00.000Z', label: 'Створено' },
      { at: '2026-05-12T10:02:00.000Z', label: 'Оновлено: COLLECTING_VARIANTS' }
    ]);
  });

  it('maps B2B requests to operator presentation while keeping raw payload in DTO output', () => {
    const request = {
      id: 'req_b2b_1',
      publicId: 'CD-2026-000010',
      title: 'BMW X5 до 2022',
      status: 'COLLECTING_VARIANTS',
      requesterPartnerId: 'partner_1',
      createdAt: new Date('2026-05-12T11:00:00.000Z'),
      updatedAt: new Date('2026-05-12T11:00:00.000Z'),
      payload: {
        source: 'telegram_b2b',
        requesterPartner: {
          id: 'partner_1',
          name: 'Dealer One'
        },
        request: {
          budgetMax: 65000,
          city: 'Львів'
        },
        criteria: {
          brands: [{ id: 'bmw', label: 'BMW' }],
          models: [{ id: 'x5', label: 'X5' }]
        }
      },
      variants: []
    };

    const output = mapRequestOutput(request, { includeContact: true });

    expect(output.presentation).toEqual(expect.objectContaining({
      title: 'BMW X5 до 2022',
      sourceLabel: 'B2B Bot',
      customerLabel: 'Dealer One',
      intentLabel: 'B2B заявка',
      criteriaChips: expect.arrayContaining(['Марка: BMW', 'Модель: X5'])
    }));
    expect(output.payload).toBe(request.payload);
  });
});
