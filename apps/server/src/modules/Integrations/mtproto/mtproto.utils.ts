
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
                // Try to get name from fwdFrom (might be just ID if not cached)
                // msgOrText.fwdFrom.fromId might be PeerChannel
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
        const priceMatch = cleanText.match(/(?:Price|Цена|💰)?\s*:?\s*(\d+[\s,.]?\d*)\s*(\$|€|USD|EUR|AZN|rub|руб)/i) ||
            cleanText.match(/(\$|€|USD|EUR|AZN)\s*(\d+[\s,.]?\d*)/i);

        let price = null;
        let currency = 'USD';

        if (priceMatch) {
            const val = priceMatch[1].replace(/[\s,.]/g, ''); // Naive cleanup, assuming integer prices
            // If match index 1 is currency (second regex case), swap
            if (isNaN(Number(val))) {
                // Not logic for second regex
            } else {
                price = parseInt(val, 10);
            }

            // Refined Price Extraction
            const rawNum = priceMatch[1].match(/\d/) ? priceMatch[1] : priceMatch[2];
            const rawCurr = priceMatch[1].match(/\d/) ? priceMatch[2] : priceMatch[1];

            if (rawNum) price = parseInt(rawNum.replace(/[\s,.]/g, ''), 10);
            if (rawCurr) currency = this.normalizeCurrency(rawCurr);
        }

        // 3. Extract Year
        const yearMatch = cleanText.match(/(?:Year|Год|📅)?\s*:?\s*(19\d{2}|20\d{2})/i);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

        // 4. Extract Mileage
        const mileageMatch = cleanText.match(/(?:Mileage|Пробег|km|км)?\s*:?\s*(\d+[\s,.]?\d*)\s*(?:km|км|mi|miles)/i);
        let mileage = null;
        if (mileageMatch) {
            mileage = parseInt(mileageMatch[1].replace(/[\s,.]/g, ''), 10);
        }

        // 5. Title Extraction (Naive: First line or first sentence)
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

    static normalizeCurrency(raw: string): string {
        raw = raw.toUpperCase().trim();
        if (['$', 'USD'].includes(raw)) return 'USD';
        if (['€', 'EUR'].includes(raw)) return 'EUR';
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
