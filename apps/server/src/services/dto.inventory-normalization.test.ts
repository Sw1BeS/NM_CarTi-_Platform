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
      statusLabel: 'В наявності',
      hasImages: true,
      imageCount: 2
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

  it('does not expose protected mtproto proxy thumbnails when public media exists', () => {
    const mapped = mapInventoryOutput({
      id: 'car_3',
      title: 'Hyundai Tucson 2020',
      thumbnail: '/api/proxy/mtproto/bot/chat/3097',
      mediaUrls: [
        '/api/proxy/mtproto/bot/chat/3097',
        '/media/company/chat/3097/cover.jpg'
      ],
      mediaItems: [
        { url: '/api/proxy/mtproto/bot/chat/3098' },
        { previewUrl: '/media/company/chat/3097/preview.jpg' }
      ]
    } as any);

    expect(mapped.thumbnail).toBe('/media/company/chat/3097/cover.jpg');
    expect(mapped.mediaUrls).toEqual([
      '/media/company/chat/3097/cover.jpg',
      '/media/company/chat/3097/preview.jpg'
    ]);
    expect(mapped.presentation.mediaUrls).toEqual(mapped.mediaUrls);
    expect(mapped.presentation.hasImages).toBe(true);
    expect(mapped.presentation.imageCount).toBe(2);
  });

  it('does not expose Telegram file ids as public media', () => {
    const mapped = mapInventoryOutput({
      id: 'car_4',
      title: 'B2B uploaded car',
      thumbnail: 'AgACAgIAAxkBAAIB_file_id',
      mediaUrls: ['AgACAgIAAxkBAAIB_file_id'],
      mediaItems: [
        { tgFileId: 'AgACAgIAAxkBAAIB_file_id', source: 'TELEGRAM_BOT' },
        { fileId: 'BQACAgIAAxkBAAI_doc_file_id', source: 'TELEGRAM_BOT' }
      ]
    } as any);

    expect(mapped.thumbnail).toBe('');
    expect(mapped.mediaUrls).toEqual([]);
    expect(mapped.presentation.mediaUrls).toEqual([]);
    expect(mapped.presentation.hasImages).toBe(false);
    expect(mapped.presentation.imageCount).toBe(0);
  });

  it('replaces noisy AutoRIA VIN-check titles with the actual vehicle title from raw text', () => {
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

    const mapped = mapInventoryOutput({
      id: 'ext_auto_ria_1',
      sourceProvider: 'AUTO_RIA',
      title: 'Перевірений VIN-код',
      price: 0,
      year: 2017,
      mileage: 0,
      location: '',
      specs: { rawText },
      originalRaw: { rawText }
    } as any);

    expect(mapped.title).toBe('Tesla Model X 2017');
    expect(mapped.presentation.title).toBe('Tesla Model X 2017');
    expect(mapped.presentation.title).not.toContain('Перевірений VIN-код');
    expect(mapped.presentation.priceLabel).toBe('$25,000');
    expect(mapped.presentation.mileageLabel).toBe('112 000 км');
    expect(mapped.presentation.subtitle).toContain('Одеса');
  });
});
