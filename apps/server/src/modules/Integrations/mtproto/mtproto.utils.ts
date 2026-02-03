
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
        const cleaned = raw.replace(/\s/g, '');
        const normalized = /^\d{1,3}([.,]\d{3})+$/.test(cleaned)
            ? cleaned.replace(/[.,]/g, '')
            : cleaned.replace(/,/g, '');
        const value = Number.parseFloat(normalized);
        return Number.isFinite(value) ? value : null;
    }

    static detectCurrency(text: string): string | undefined {
        const upper = text.toUpperCase();
        if (upper.includes('UAH') || text.includes('₴')) return 'UAH';
        if (upper.includes('EUR') || text.includes('€')) return 'EUR';
        if (upper.includes('USD') || text.includes('$')) return 'USD';
        return undefined;
    }

    static parsePrice(text: string): { price: number | null; currency: string } {
        const labeled = text.match(/(?:Price|Цена|💰)\s*:?\s*([\d\s.,]+)\s*(k|к|тыс|тис)?\s*(\$|€|₴|USD|EUR|UAH)?/i);
        const symbolFirst = text.match(/(\$|€|₴|USD|EUR|UAH)\s*([\d\s.,]+)\s*(k|к|тыс|тис)?/i);
        const symbolLast = text.match(/([\d\s.,]+)\s*(k|к|тыс|тис)?\s*(\$|€|₴|USD|EUR|UAH)/i);

        let rawNum: string | undefined;
        let rawCurr: string | undefined;
        let suffix: string | undefined;

        if (labeled) {
            rawNum = labeled[1];
            suffix = labeled[2];
            rawCurr = labeled[3];
        } else if (symbolFirst) {
            rawCurr = symbolFirst[1];
            rawNum = symbolFirst[2];
            suffix = symbolFirst[3];
        } else if (symbolLast) {
            rawNum = symbolLast[1];
            suffix = symbolLast[2];
            rawCurr = symbolLast[3];
        }

        if (!rawNum) return { price: null, currency: this.detectCurrency(text) || 'USD' };
        let price = this.normalizeNumber(rawNum);
        if (price === null) return { price: null, currency: this.detectCurrency(text) || 'USD' };
        if (suffix && /k|к|тыс|тис/i.test(suffix)) {
            price = price * 1000;
        }
        const currency = rawCurr ? (this.detectCurrency(rawCurr) || 'USD') : (this.detectCurrency(text) || 'USD');
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
        const parsedPrice = this.parsePrice(cleanText);
        const price = parsedPrice.price;
        const currency = parsedPrice.currency;

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
