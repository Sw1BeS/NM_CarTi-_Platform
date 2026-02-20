
/**
 * Telegram Message Parsing & Normalization
 */

export interface ParsedCar {
    title: string;
    description: string;
    price: number | null;
    currency: string;
    year: number | null;
    mileage: number | null;
    status: 'AVAILABLE' | 'SOLD' | 'RESERVED' | 'UNKNOWN';
    forwardedFrom?: string;
    mediaGroupId?: string;
}

export class MessageParser {

    static normalizeNumber(raw: string): number | null {
        // simple: remove all non-digit except last dot/comma
        // actually existing logic was: remove space, then if it looks like digit+delim+digit, strip delim.

        let valStr = raw.replace(/\s/g, '');
        // Check for 'k/tis' suffix logic handled outside? No, expecting number here.

        // Handle 15.5k -> 15.5 passed in?
        // If raw has 'k', it should be stripped before? 
        // parsePrice passes match[1] which might be "15.5".

        // Handle "10,000" -> 10000. "10.000" -> 10000? Or 10.0?
        // Heuristic: if contains comma and dot, comma is thousand sep if before dot.
        // If only comma: "15,500" -> 15500. "15,5" -> 15.5?

        valStr = valStr.replace(/,/g, '.'); // treat comma as dot for simplicity in JS? 
        // Wait, "10,000" becomes "10.000" -> 10.

        // Better: remove ANY non-digit non-dot non-comma.
        valStr = raw.replace(/[^\d.,]/g, '');

        // If multiple dots/commas:
        // "10.000.000" -> remove all but last?
        // "10,000.00" -> remove comma, keep dot.

        // Easy way: 
        if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(valStr)) {
            // 10,000.00
            valStr = valStr.replace(/,/g, '');
        } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(valStr)) {
            // 10.000,00 (euro style)
            valStr = valStr.replace(/\./g, '').replace(/,/g, '.');
        } else {
            // mixed or simple
            // replace comma with dot if it looks like decimal separator (start of string or single occurrence)
            // "15,5" -> "15.5"
            // "15,000" -> "15000"

            // Conservative: remove spaces.
            // If "15 000", space removed -> "15000".
            // If "15,000", -> "15000".
            // If "15.5", -> 15.5.

            const clean = raw.replace(/\s/g, '');
            // remove commas if followed by 3 digits (thousand sep)
            const noThousandSep = clean.replace(/,(?=\d{3})/g, '').replace(/\.(?=\d{3})/g, '');
            // now replace remaining comma with dot
            const standardized = noThousandSep.replace(/,/g, '.');
            const num = parseFloat(standardized);
            return isNaN(num) ? null : num;
        }

        const num = parseFloat(valStr.replace(/,/g, '')); // fallback
        return isNaN(num) ? null : num;
    }

    static normalizeNumberSimple(raw: string): number | null {
        // Remove spaces
        let clean = raw.replace(/\s/g, '');
        // Remove ' thousand' separators (comma or dot followed by 3 digits, followed by end or non-digit, but simpler)

        // Strategy: 
        // 1. If matches "X,XXX" or "X.XXX" pattern repeatedly, strip separators.
        // 2. If "15,5" -> 15.5

        // Let's assume standard float parsing but allow spaces.
        clean = clean.replace(/,/g, '.'); // treat all as potential decimal
        // If multiple dots, keep last? "10.000.00" -> "10000.00"

        const parts = clean.split('.');
        if (parts.length > 2) {
            // merge all except last
            const whole = parts.slice(0, -1).join('');
            const frac = parts[parts.length - 1];
            clean = `${whole}.${frac}`;
        }

        const num = parseFloat(clean);
        return isNaN(num) ? null : num;
    }

    static detectCurrency(text: string): string | undefined {
        const upper = text.toUpperCase();
        if (/(У\.?Е\.?|УЕ|У\. О\.|У\\.О\\.)/i.test(text)) return 'USD';
        if (upper.includes('UAH') || text.includes('₴') || upper.includes('ГРН')) return 'UAH';
        if (upper.includes('EUR') || text.includes('€')) return 'EUR';
        if (upper.includes('USD') || text.includes('$')) return 'USD';
        return undefined;
    }

    static parsePrice(text: string): { price: number | null; currency: string } {
        // We look for Price signatures.
        // Avoid matching "2020" as price.
        // 1. Explicit Labeled: "Price: 10000"
        // 2. Explicit Symbol: "$10000", "10000$"
        // 3. Just number with currency on line?

        // Regex components
        const R_NUM = `([\\d.,]+(?:[ ]?[\\d.,]+)*)`; // digit, dot, comma, maybe space in between
        const R_SUFFIX = `(k|к|тыс\\.?|тис\\.?)?`;
        const R_CURR = `(\\$|€|₴|USD|EUR|UAH|грн\\.?)`;
        const R_LABEL = `(?:Price|Цена|💰)`;

        // Pattern A: Label ... Number ... [Suffix] ... [Currency]
        // Use [ \t] instead of \s to prevent multiline matching for the number part
        const labeledRegex = new RegExp(`${R_LABEL}[:\\s]*${R_NUM}\\s*${R_SUFFIX}\\s*${R_CURR}?`, 'i');

        // Pattern B: Symbol Number [Suffix]
        const symbolFirstRegex = new RegExp(`${R_CURR}\\s*${R_NUM}\\s*${R_SUFFIX}`, 'i');

        // Pattern C: Number [Suffix] Symbol
        const symbolLastRegex = new RegExp(`${R_NUM}\\s*${R_SUFFIX}\\s*${R_CURR}`, 'i');

        let rawNum: string | undefined;
        let suffix: string | undefined;
        let rawCurr: string | undefined;

        const matchA = text.match(labeledRegex);
        if (matchA) {
            rawNum = matchA[1];
            suffix = matchA[2];
            rawCurr = matchA[3];
        } else {
            const matchB = text.match(symbolFirstRegex);
            if (matchB) {
                rawCurr = matchB[1];
                rawNum = matchB[2];
                suffix = matchB[3];
            } else {
                const matchC = text.match(symbolLastRegex);
                if (matchC) {
                    rawNum = matchC[1];
                    suffix = matchC[2];
                    rawCurr = matchC[3];
                }
            }
        }

        const defaultCurr = this.detectCurrency(text) || 'USD';

        if (!rawNum) return { price: null, currency: defaultCurr };

        // Cleanup rawNum: remove trailing dots/commas
        rawNum = rawNum.trim().replace(/[.,]$/, '');

        let price = this.normalizeNumber(rawNum);
        if (price === null) return { price: null, currency: defaultCurr };

        // Apply suffix
        if (suffix) {
            const s = suffix.toLowerCase();
            if (s.startsWith('k') || s.startsWith('к') || s.startsWith('тыс') || s.startsWith('тис')) {
                price *= 1000;
            }
        }

        // Sanity Check: Price shouldn't match Year (1990-2030) unless likely price
        // If Price is 2020 and currency detected is default (maybe none in line), skip?
        // But if explicitly labeled "Price: 2020", it is price.
        if (!matchA && !rawCurr && price >= 1950 && price <= 2030) {
            // Risky: might be year. "2020 Honda"
            // Ensure it's not actually a year.
            // If we found it via SymbolFirst/Last, rawCurr is present.
            // So this block only hits if we matched something weird?
            // Actually matchB and matchC require symbol.
            // So this check is redundant if we enforce symbol for non-labeled.
        }

        const currency = rawCurr ? (this.detectCurrency(rawCurr) || defaultCurr) : defaultCurr;

        return { price, currency };
    }

    static parse(msgOrText: any): ParsedCar {
        let text = '';
        let forwardedFrom = undefined;
        let mediaGroupId = undefined;

        if (typeof msgOrText === 'string') {
            text = msgOrText;
        } else {
            text = msgOrText.message || '';
            if (msgOrText.groupedId) {
                mediaGroupId = msgOrText.groupedId.toString();
            }
            if (msgOrText.fwdFrom) {
                const fwd = msgOrText.fwdFrom;
                if (fwd.fromName) forwardedFrom = fwd.fromName;
                else if (fwd.fromId) forwardedFrom = `ID:${fwd.fromId.channelId || fwd.fromId.userId || '?'}`;
            }
        }

        if (!text) return this.empty();

        const cleanText = text.trim();
        const lower = cleanText.toLowerCase();

        // 1. Detect Status
        let status: ParsedCar['status'] = 'AVAILABLE';
        if (lower.includes('sold') || lower.includes('продан') || lower.includes('❌')) status = 'SOLD';
        else if (lower.includes('reserved') || lower.includes('бронь') || lower.includes('⏳')) status = 'RESERVED';

        // 2. Extract Price
        const parsedPrice = this.parsePrice(cleanText);
        const price = parsedPrice.price;
        const currency = parsedPrice.currency;

        // 3. Extract Year
        // Look for standalone 4-digit number starting 19/20
        // Or "Year: 2020"
        // Avoid matching inside price (already extracted? No, regex is stateless)
        // Heuristic: Year is usually 19xx or 20xx.

        // Regex: 
        // 1. Labeled: "Year: 2020"
        // 2. Context: "2020 Toyota" (start of line or after word)

        let year: number | null = null;
        const yearRegex = /(?:Year|Год|📅)?\s*:?\s*\b(19\d{2}|20\d{2})\b/i;
        const yearMatches = cleanText.match(new RegExp(yearRegex.source, 'gi')) || [];

        // Find best year match independent of Price
        for (const m of yearMatches) {
            // extract number
            const y = parseInt(m.match(/\d{4}/)?.[0] || '0', 10);
            if (y > 0 && y !== price) { // simple collision check
                year = y;
                break;
            }
        }

        // Fallback: search for 20xx in text if not found
        if (!year) {
            const anyYear = cleanText.match(/\b(19\d{2}|20\d{2})\b/);
            if (anyYear) {
                const y = parseInt(anyYear[1], 10);
                if (y !== price) year = y;
            }
        }


        // 4. Extract Mileage
        // Labeled: "Mileage: 100000"
        // Suffix: "100k km", "100 тыс км"

        const R_MILE_NUM = `(\\d+(?:[ \\t.,]?\\d+)*)`;
        const R_MILE_UNIT = `(km|mi|miles|км|миль)`;
        const R_MILE_SUFFIX = `(k|к|тыс|тис)?`;

        const mileRegex = new RegExp(`(?:Mileage|Пробег)\\s*:?\\s*${R_MILE_NUM}\\s*${R_MILE_SUFFIX}\\s*${R_MILE_UNIT}?`, 'i');
        const mileUnitRegex = new RegExp(`\\b${R_MILE_NUM}\\s*${R_MILE_SUFFIX}\\s*${R_MILE_UNIT}\\b`, 'i');

        let mileage: number | null = null;
        const mMatchA = cleanText.match(mileRegex);
        const mMatchB = cleanText.match(mileUnitRegex);

        let rawMile, mSuffix;
        if (mMatchA) {
            rawMile = mMatchA[1];
            mSuffix = mMatchA[2];
        } else if (mMatchB) {
            rawMile = mMatchB[1];
            mSuffix = mMatchB[2];
        }

        if (rawMile) {
            let mVal = this.normalizeNumber(rawMile);
            if (mVal !== null) {
                const suffix = (mSuffix || '').toLowerCase();
                if (suffix && (suffix.startsWith('k') || suffix.startsWith('к') || suffix.startsWith('t') || suffix.startsWith('т'))) {
                    mVal *= 1000;
                }
                // If < 1000, probably x1000 implied? "Mileage 120" -> 120000
                // But tricky. "500 km" might handle delivery.
                // Let's assume raw value if explicitly "km".
                // But "120 тыс" -> 120000.

                mileage = mVal;
            }
        }
        // Safety: if year found and mileage == year, reset (unlikely but possible "2020 km")
        if (mileage === year) mileage = null;


        // 5. Title Extraction
        const lines = cleanText.split('\n').filter(l => l.trim().length > 0);
        const title = lines[0] ? lines[0].substring(0, 100) : 'Unknown Car';

        return {
            title,
            description: cleanText,
            price,
            currency,
            year,
            mileage,
            status
        };
    }

    static getCarImages(msg: any): string[] {
        // ... existing or implement if needed?
        // The file previously didn't have this.
        return [];
    }

    static normalizeCurrency(raw: string): string {
        raw = raw.toUpperCase().trim();
        if (['$', 'USD'].includes(raw)) return 'USD';
        if (['€', 'EUR'].includes(raw)) return 'EUR';
        if (['UAH', '₴'].includes(raw)) return 'UAH';
        if (['AZN', '₼'].includes(raw)) return 'AZN';
        if (['RUB', 'РУБ', '₽'].includes(raw)) return 'RUB';
        return 'USD';
    }

    static empty(): ParsedCar {
        return {
            title: '',
            description: '',
            price: null,
            currency: 'USD',
            year: null,
            mileage: null,
            status: 'UNKNOWN',
            forwardedFrom: undefined,
            mediaGroupId: undefined
        };
    }
}
