const BRAND_LIST = [
    'Acura', 'Alfa Romeo', 'Aston Martin', 'Audi', 'Bentley', 'BMW', 'BYD', 'Cadillac', 'Chevrolet',
    'Chery', 'Chrysler', 'Citroen', 'Cupra', 'Dacia', 'Daewoo', 'Dodge', 'Ferrari', 'Fiat', 'Ford',
    'Geely', 'Genesis', 'GMC', 'Great Wall', 'Honda', 'Hummer', 'Hyundai', 'Infiniti', 'Jaguar',
    'Jeep', 'Kia', 'Lamborghini', 'Land Rover', 'Lexus', 'Lincoln', 'Maserati', 'Mazda', 'McLaren',
    'Mercedes', 'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan', 'Opel', 'Peugeot', 'Porsche', 'Renault',
    'Rolls-Royce', 'Saab', 'Seat', 'Skoda', 'Smart', 'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen',
    'Volvo', 'ZAZ'
];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BRAND_RE = new RegExp(`\\b(${BRAND_LIST.map(escapeRegex).join('|')})\\b`, 'i');

const trimText = (value?: string | null) => String(value || '').trim();
const cleanModel = (value: string) =>
    value
        .replace(/\b(19|20)\d{2}\b/g, '')
        .replace(/\b(usd|eur|uah|грн|дол|у\.?е\.?|уе)\b/gi, '')
        .replace(/(?:color|colour|колір|цвет|condition|стан|price|ціна|цена|budget|бюджет|пробіг|пробег)\b.*$/i, '')
        .replace(/[|•]/g, ' ')
        .replace(/[;,].*$/, '')
        .replace(/\s+/g, ' ')
        .trim();

const normalizeFuel = (raw: string) => {
    const lower = raw.toLowerCase();
    if (/(electro|electric|електро|электро)/.test(lower)) return 'electric';
    if (/(hybrid|гібрид|гибрид)/.test(lower)) return 'hybrid';
    if (/(diesel|дизел)/.test(lower)) return 'diesel';
    if (/(gas|гбо|lpg|cng|газ)/.test(lower)) return 'gas';
    if (/(petrol|gasoline|бензин)/.test(lower)) return 'petrol';
    return '';
};

const normalizeTransmission = (raw: string) => {
    const lower = raw.toLowerCase();
    if (/(автомат|automatic|акпп|at|dsg|tiptronic|вариатор|cvt|робот)/.test(lower)) return 'automatic';
    if (/(manual|механик|мкпп)/.test(lower)) return 'manual';
    return '';
};

const normalizeDrive = (raw: string) => {
    const lower = raw.toLowerCase();
    if (/(awd|4wd|4x4|повн|full|quattro|xdrive)/.test(lower)) return 'awd';
    if (/(fwd|перед)/.test(lower)) return 'fwd';
    if (/(rwd|задн)/.test(lower)) return 'rwd';
    return '';
};

const normalizeCondition = (raw: string) => {
    const lower = raw.toLowerCase();
    if (/(в дорозі|в пути|transit|en route)/.test(lower)) return 'in_transit';
    if (/(після дтп|после дтп|after crash|бит|пошкодж)/.test(lower)) return 'damaged';
    if (/(на ходу|заводиться|їде|едет|ready|готов)/.test(lower)) return 'running';
    return '';
};

export const PATTERNS = {
    // Price: $10000, 10 000 $, 10.000 eur, 10k usd
    PRICE: /((?:\$|€|£|₴)\s*[\d\s.,]+(?:k|к|тыс|тис)?|[\d\s.,]+(?:k|к|тыс|тис)?\s*(?:\$|€|£|₴|usd|eur|uah|грн|дол|у\.?е\.?|уе))/i,
    YEAR: /\b(19|20)\d{2}(?:p|р|г|y|\.|s)?\b/i,
    MILEAGE: /([\d\s.,]+(?:k|к|тыс|тис)?)\s*(?:km|км|miles?|mi|мил)\b/i,
    MILEAGE_LABEL: /(?:mileage|пробег|пробіг)\s*[:\-]?\s*([\d\s.,]+(?:k|к|тыс|тис)?)/i,
    VIN: /\b[A-HJ-NPR-Z0-9]{17}\b/i,
    ENGINE: /(\d(?:\.|,)\d)\s*(?:l|л)?\s*(?:d|i|t|tdi|tfsi|cdi|дизель|бензин|газ|hybrid|gbo|гбо|electro|електро|электро)/i,
    LOCATION: /(?:city|місто|город|location|локац(?:ія|ия))\s*[:\-]?\s*([a-zа-яіїєґ' -]{2,40})/i,
    COLOR: /(?:color|colour|колір|цвет)\s*[:\-]?\s*([a-zа-яіїєґ' -]{2,30})/i
};

export const CURRENCY_MAP: Record<string, string> = {
    '$': 'USD',
    'usd': 'USD',
    'дол': 'USD',
    'bucks': 'USD',
    'у.е': 'USD',
    'у.е.': 'USD',
    'у е': 'USD',
    'уе': 'USD',
    '€': 'EUR',
    'eur': 'EUR',
    'евро': 'EUR',
    '₴': 'UAH',
    'uah': 'UAH',
    'грн': 'UAH'
};

export const normalizeCurrency = (raw: string): string => {
    const lower = trimText(raw).toLowerCase();
    for (const [key, code] of Object.entries(CURRENCY_MAP)) {
        if (lower.includes(key)) return code;
    }
    return 'USD';
};

export const normalizeNumber = (raw: string): number => {
    if (!raw) return 0;

    let clean = raw.toLowerCase().replace(/[\s\u00a0]/g, '');
    const multiplier = /(k|к|тыс|тис)/.test(clean) ? 1000 : 1;
    clean = clean.replace(/(k|к|t|т|тыс|тис)/g, '');
    clean = clean.replace(/[^0-9.,]/g, '');

    if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
        clean = clean.replace(/\./g, '');
    } else if (/^\d{1,3}(,\d{3})+$/.test(clean)) {
        clean = clean.replace(/,/g, '');
    } else if (clean.includes(',') && clean.includes('.')) {
        clean = clean.replace(/,/g, '');
    } else if (clean.includes(',')) {
        const parts = clean.split(',');
        clean = parts[parts.length - 1].length === 3 ? clean.replace(/,/g, '') : clean.replace(/,/g, '.');
    }

    return (parseFloat(clean) || 0) * multiplier;
};

export const parseCarData = (text: string) => {
    const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean);
    const parsed: Record<string, any> = {};
    const firstLine = lines[0] || '';

    if (firstLine) {
        const brandMatch = firstLine.match(BRAND_RE);
        if (brandMatch) {
            parsed.brand = trimText(brandMatch[0]);
            const modelRaw = firstLine.slice(brandMatch.index! + brandMatch[0].length);
            const model = cleanModel(modelRaw);
            if (model) parsed.model = model;
        }
        const titleFromLine = cleanModel(firstLine);
        if (titleFromLine) parsed.title = titleFromLine;
    }

    for (const line of lines) {
        if (!parsed.price) {
            const priceMatch = line.match(PATTERNS.PRICE);
            if (priceMatch) {
                const value = priceMatch[1] || priceMatch[0];
                const numberPart = value.replace(/[$€£₴]|usd|eur|uah|грн|дол|у\.?е\.?|уе/gi, '');
                parsed.price = normalizeNumber(numberPart);
                parsed.currency = normalizeCurrency(value.replace(/[\d\s.,]/g, '') || line);
            }
        }

        if (!parsed.year) {
            const yearMatch = line.match(PATTERNS.YEAR);
            if (yearMatch) {
                const y = parseInt(yearMatch[0].match(/\d{4}/)?.[0] || '0', 10);
                if (y >= 1900 && y <= new Date().getFullYear() + 1) parsed.year = y;
            }
        }

        if (!parsed.vin) {
            const vinMatch = line.match(PATTERNS.VIN);
            if (vinMatch) parsed.vin = vinMatch[0].toUpperCase();
        }

        if (!parsed.mileage) {
            const mileageMatch = line.match(PATTERNS.MILEAGE) || line.match(PATTERNS.MILEAGE_LABEL);
            if (mileageMatch) {
                const mileage = normalizeNumber(mileageMatch[1]);
                parsed.mileage = mileage > 0 && mileage < 1000 ? mileage * 1000 : mileage;
            }
        }

        if (!parsed.engine) {
            const engineMatch = line.match(PATTERNS.ENGINE);
            if (engineMatch) parsed.engine = trimText(engineMatch[0]);
        }

        if (!parsed.fuel) {
            const fuel = normalizeFuel(line);
            if (fuel) parsed.fuel = fuel;
        }

        if (!parsed.transmission) {
            const transmission = normalizeTransmission(line);
            if (transmission) parsed.transmission = transmission;
        }

        if (!parsed.drive) {
            const drive = normalizeDrive(line);
            if (drive) parsed.drive = drive;
        }

        if (!parsed.color) {
            const colorMatch = line.match(PATTERNS.COLOR);
            if (colorMatch) parsed.color = trimText(colorMatch[1]);
        }

        if (!parsed.location) {
            const locationMatch = line.match(PATTERNS.LOCATION);
            if (locationMatch) parsed.location = trimText(locationMatch[1]);
        }

        if (!parsed.condition) {
            const condition = normalizeCondition(line);
            if (condition) parsed.condition = condition;
        }
    }

    if (!parsed.title) {
        const fallbackTitle = trimText(`${parsed.brand || ''} ${parsed.model || ''}`) || cleanModel(firstLine);
        if (fallbackTitle) parsed.title = fallbackTitle;
    }

    return parsed;
};
