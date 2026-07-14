import { describe, expect, it } from 'vitest';
import { mapInventoryOutput, mapPublicInventoryOutput } from './dto.js';

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

  it('restores missing AutoRIA brand from source url when raw text is compressed', () => {
    const rawText = [
      'AUTO.RIA.comЛегкові з пробігомОдеська областьОдесаTeslaModel XTesla Model X Одеса',
      'Item 1 of 8Tesla Model X 2017І покоління • 75D 75 kWh Dual Motor (333 к.с.) AWD • Base',
      '25 000 $',
      '112 тис. км',
      'UA, Одеська обл., Одеса, 65000'
    ].join('');

    const mapped = mapInventoryOutput({
      id: 'ext_auto_ria_2',
      sourceProvider: 'AUTO_RIA',
      sourceUrl: 'https://auto.ria.com/uk/auto_tesla_model_x_37038816.html',
      title: 'Перевірений VIN-код',
      price: 0,
      year: 2017,
      mileage: 75000,
      specs: { rawText }
    } as any);

    expect(mapped.title).toBe('Tesla Model X 2017');
    expect(mapped.brand).toBe('Tesla');
    expect(mapped.model).toBe('Model X');
    expect(mapped.presentation.title).toBe('Tesla Model X 2017');
  });

  it('sanitizes public inventory output for MiniApp responses', () => {
    const mapped = mapPublicInventoryOutput({
      id: 'car_public_1',
      title: 'VOLVO S90 2018',
      price: 17000,
      currency: 'USD',
      year: 2018,
      mileage: 128000,
      status: 'AVAILABLE',
      availabilityState: 'IN_STOCK',
      publicationStatus: 'PUBLISHED',
      description: 'VOLVO S90 2018\nВ НАЯВНОСТІ\nМенеджер +380 63 000 00 00',
      source: 'MTPROTO',
      sourceChatId: '2913209509',
      sourceMessageId: 721,
      mediaGroupKey: 'album_721',
      mediaUrls: ['/media/company/chat/721/cover.jpg'],
      mediaItems: [{ url: '/media/company/chat/721/cover.jpg', sourceMessageId: 721, tgFileId: 'AgAC_private' }],
      originalRaw: { text: 'Менеджер +380 63 000 00 00', rawText: 'internal raw text' },
      specs: {
        brand: 'VOLVO',
        model: 'S90',
        fuel: 'petrol',
        transmission: 'automatic',
        rawText: 'Менеджер +380 63 000 00 00'
      }
    } as any) as any;

    expect(mapped).not.toHaveProperty('originalRaw');
    expect(mapped).not.toHaveProperty('source');
    expect(mapped).not.toHaveProperty('sourceChatId');
    expect(mapped).not.toHaveProperty('sourceMessageId');
    expect(mapped).not.toHaveProperty('mediaGroupKey');
    expect(mapped).not.toHaveProperty('mediaItems');
    expect(mapped.specs).not.toHaveProperty('rawText');
    expect(JSON.stringify(mapped)).not.toContain('+380');
    expect(mapped.description).toBe(mapped.presentation.description);
    expect(mapped.mediaUrls).toEqual(['/media/company/chat/721/cover.jpg']);
  });

  it('does not expose parser fragments as vehicle location', () => {
    const mapped = mapPublicInventoryOutput({
      id: 'car_public_location_1',
      title: 'HYUNDAI IONIQ 5',
      price: 16000,
      currency: 'USD',
      year: 2024,
      mileage: 17000,
      location: 'ний',
      status: 'PENDING',
      availabilityState: 'IN_TRANSIT',
      publicationStatus: 'PUBLISHED',
      mediaUrls: ['/media/company/chat/cover.jpg'],
      description: [
        'HYUNDAI IONIQ 5 2024',
        '⏳#вдорозі (викуплена і прямує в Україну)',
        '🚙 Задній привід',
        '💵 Ціна за розмитнене авто у Львові: 16 000$'
      ].join('\n')
    } as any) as any;

    expect(mapped.location).toBe('');
    expect(mapped.presentation.subtitle).toBe('2024 • В дорозі');
    expect(mapped.presentation.detailRows).not.toContainEqual({ label: 'Локація', value: 'ний' });
    expect(JSON.stringify(mapped)).not.toContain('• ний •');
  });
});
