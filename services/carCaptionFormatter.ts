import { CarListing, Language } from '../types';

/**
 * Format car listing for Telegram caption
 * Creates a clean, readable format suitable for Telegram messages
 */
export function formatCarCaptionForTelegram(car: CarListing, lang: Language = 'UK'): string {
    const t = {
        EN: {
            mileage: 'km',
            price: 'Price',
            specs: 'Specs',
            vin: 'VIN'
        },
        UK: {
            mileage: 'км',
            price: 'Ціна',
            specs: 'Характеристики',
            vin: 'VIN'
        },
        RU: {
            mileage: 'км',
            price: 'Цена',
            specs: 'Характеристики',
            vin: 'VIN'
        }
    };

    const loc = t[lang];

    // Build specs line (compact)
    const specsArr: string[] = [];
    if (car.mileage) specsArr.push(`${Math.round(car.mileage / 1000)} ${loc.mileage.toLowerCase()}`);
    if (car.specs?.engine) specsArr.push(car.specs.engine);
    if (car.specs?.transmission) specsArr.push(car.specs.transmission);
    if (car.specs?.fuel) specsArr.push(car.specs.fuel);

    const specsLine = specsArr.join(' | ');

    const parts: string[] = [
        `🚗 <b>${car.title}</b>`,
        ''
    ];

    if (specsLine) {
        parts.push(`📊 ${specsLine}`);
    }

    parts.push(`💰 ${car.price.amount.toLocaleString()} ${car.price.currency}`);

    if (car.specs?.vin) {
        parts.push(`🔑 ${loc.vin}: ${car.specs.vin}`);
    }

    if (car.location) {
        parts.push(`📍 ${car.location}`);
    }

    return parts.join('\n').trim();
}

/**
 * Create inline keyboard for car card
 */
export function createCarCardKeyboard(car: CarListing, lang: Language = 'UK') {
    const t = {
        EN: {
            addToRequest: '➕ Add to Request',
            viewCatalog: '📋 Catalog',
            openSource: '🔗 Open Link'
        },
        UK: {
            addToRequest: '➕ Додати в запит',
            viewCatalog: '📋 В каталог',
            openSource: '🔗 Відкрити джерело'
        },
        RU: {
            addToRequest: '➕ Добавить в запрос',
            viewCatalog: '📋 В каталог',
            openSource: '🔗 Открыть источник'
        }
    };

    const loc = t[lang];

    return {
        inline_keyboard: [
            [
                { text: loc.addToRequest, callback_data: `add_car:${car.canonicalId}` }
            ],
            [
                { text: loc.viewCatalog, callback_data: `catalog:${car.canonicalId}` },
                { text: loc.openSource, url: car.sourceUrl }
            ]
        ]
    };
}
