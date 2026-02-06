export const PATTERNS = {
    // Price: $10000, 10 000 $, 10.000 eur, 10k usd
    PRICE: /((?:\$|€|£|₴)\s*[\d\s.,]+(?:k|к|тыс|тис)?|[\d\s.,]+(?:k|к|тыс|тис)?\s*(?:\$|€|£|₴|usd|eur|uah|грн|дол))/i,

    // Year: 2018, 2018p, 2018р, 2018 г.в.
    YEAR: /\b(19|20)\d{2}(?:p|р|г|y|\.|s)?\b/i,

    // Mileage: 100k km, 100 тыс км, 100000km, 100т.км
    MILEAGE: /([\d\s.,]+)(?:k|t|т|к|тыс|тис)?\s*(?:km|км|mil|mi|мил)/i,

    // VIN: 17 chars, no I/O/Q
    VIN: /\b[A-HJ-NPR-Z0-9]{17}\b/i,

    // Engine: 2.0d, 3.0i, 2.0 tdi, 2.0 бензин, 2.0 diesel
    ENGINE: /(\d(?:\.|,)\d)\s*(?:l|л)?\s*(?:d|i|t|tdi|tfsi|cdi|дизель|бензин|газ|hybrid|gbo|гбо|electro|електро|электро)/i
};

export const CURRENCY_MAP: Record<string, string> = {
    '$': 'USD', 'usd': 'USD', 'дол': 'USD', 'bucks': 'USD',
    '€': 'EUR', 'eur': 'EUR', 'евро': 'EUR',
    '₴': 'UAH', 'uah': 'UAH', 'грн': 'UAH'
};

export const normalizeCurrency = (raw: string): string => {
    const lower = raw.toLowerCase().trim();
    for (const [key, code] of Object.entries(CURRENCY_MAP)) {
        if (lower.includes(key)) return code;
    }
    return 'USD'; // Default
};

export const normalizeNumber = (raw: string): number => {
    if (!raw) return 0;
    // Replace comma with dot if it's a decimal separator, but handle thousands
    // Simple heuristic: remove spaces, remove 'k/t' suffixes first
    let clean = raw.toLowerCase().replace(/[\s\u00A0]/g, '');

    const multiplier = (clean.includes('k') || clean.includes('к') || clean.includes('тыс') || clean.includes('тис')) ? 1000 : 1;
    clean = clean.replace(/[kкtт]/g, '').replace(/тыс|тис/g, '');

    // If format is like 10.000 or 10,000 -> it's 10000
    // If format is 10.5 -> it's 10.5
    // We remove all non-digit chars except last dot/comma if it looks like decimal

    // Strip non-numeric/non-dot/non-comma
    clean = clean.replace(/[^0-9.,]/g, '');

    if (clean.includes(',')) {
        if (clean.includes('.')) {
            // mixed (10,000.50 or 10.000,50) - complex, let's assume standard US 10,000.50
            clean = clean.replace(/,/g, '');
        } else {
            // only comma. If 3 digits after comma, likely thousands (10,000), else decimal (10,5)
            const parts = clean.split(',');
            if (parts.length > 1 && parts[parts.length - 1].length === 3) {
                clean = clean.replace(/,/g, '');
            } else {
                clean = clean.replace(/,/g, '.');
            }
        }
    }

    return (parseFloat(clean) || 0) * multiplier;
};

export const parseCarData = (text: string) => {
    const lines = text.split('\n');
    const specs: Record<string, any> = {};

    // Extraction
    const priceMatch = text.match(PATTERNS.PRICE);
    const yearMatch = text.match(PATTERNS.YEAR);
    const vinMatch = text.match(PATTERNS.VIN);
    const mileageMatch = text.match(PATTERNS.MILEAGE);
    const engineMatch = text.match(PATTERNS.ENGINE);

    if (priceMatch) {
        const valStr = priceMatch[1] || priceMatch[0];
        // clean currency symbols to get number
        const numStr = valStr.replace(/[$€£₴usd eur uah грн дол a-zа-я]/gi, '');
        specs.price = normalizeNumber(numStr);
        specs.currency = normalizeCurrency(valStr.replace(/[\d\s.,]/g, '') || text); // try regex match or context
    }

    if (yearMatch) {
        const y = parseInt(yearMatch[1] || yearMatch[0], 10);
        if (y > 1900 && y < 2030) specs.year = y;
    }

    if (vinMatch) {
        specs.vin = vinMatch[0].toUpperCase();
    }

    if (mileageMatch) {
        const m = normalizeNumber(mileageMatch[1]);
        specs.mileage = m < 1000 ? m * 1000 : m; // heuristic: if < 1000 likely it means 'thousands' implicitly or just mistake, but usually 100k -> 100000
    }

    if (engineMatch) {
        specs.engine = engineMatch[0].trim();
    }

    return specs;
};
