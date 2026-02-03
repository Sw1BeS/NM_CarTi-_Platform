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
            vin: 'VIN'
        },
        UK: {
            mileage: 'км',
            price: 'Ціна',
            vin: 'VIN'
        },
        RU: {
            mileage: 'км',
            price: 'Цена',
            vin: 'VIN'
        }
    };

    const loc = t[lang];

    const rawTitle = car.title || '';
    const yearStr = car.year ? String(car.year) : '';
    const titleNoYear = rawTitle.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
    const header = [titleNoYear, yearStr].filter(Boolean).join(' ').trim();

    const parts: string[] = [`🚗 <b>${(header || rawTitle).toUpperCase()}</b>`];

    if (car.mileage) {
        parts.push(`🛣 ${Math.round(car.mileage / 1000)} ${loc.mileage}`);
    }
    if (car.specs?.engine) {
        parts.push(`⚙️ ${car.specs.engine}`);
    }
    if (car.specs?.drive) {
        parts.push(`🛞 ${car.specs.drive}`);
    }
    if (car.specs?.transmission) {
        parts.push(`🕹 ${car.specs.transmission}`);
    }
    if (car.specs?.vin) {
        parts.push(`🔑 ${loc.vin}: ${car.specs.vin}`);
    }

    if (car.price?.amount) {
        parts.push(`💰 ${car.price.amount.toLocaleString()} ${car.price.currency}`);
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
            viewCatalog: '📋 To Catalog',
            openSource: '🔗 Open Source (URL)'
        },
        UK: {
            addToRequest: '➕ Додати в запит',
            viewCatalog: '📋 В каталог',
            openSource: '🔗 Відкрити джерело (URL)'
        },
        RU: {
            addToRequest: '➕ Добавить в запрос',
            viewCatalog: '📋 В каталог',
            openSource: '🔗 Открыть источник (URL)'
        }
    };

    const loc = t[lang];

    const sourceUrl = typeof car.sourceUrl === 'string' && car.sourceUrl.trim() ? car.sourceUrl.trim() : '';

    const secondRow: any[] = [
        { text: loc.viewCatalog, callback_data: `CAR:ADD_CATALOG:${car.canonicalId}` }
    ];

    if (sourceUrl) {
        secondRow.push({ text: loc.openSource, url: sourceUrl });
    }

    return {
        inline_keyboard: [
            [
                { text: loc.addToRequest, callback_data: `CAR:ADD_REQUEST:${car.canonicalId}` }
            ],
            secondRow
        ]
    };
}
