
export class NormalizationService {
    static cleanString(str: any): string {
        if (!str || typeof str !== 'string') return '';
        return str.trim();
    }

    static normalizePhone(phone: any): string | undefined {
        if (!phone) return undefined;
        let p = String(phone).replace(/[^\d+]/g, '');
        if (p.startsWith('0')) p = '38' + p; // Default UA
        if (p.startsWith('80')) p = '3' + p;
        if (!p.startsWith('+')) p = '+' + p;
        return p.length >= 10 ? p : undefined;
    }

    static normalizeCity(city: any): string {
        if (!city) return '';
        const c = String(city).trim();
        // Simple mapping example - extend as needed
        const lower = c.toLowerCase();
        if (lower.includes('kyiv') || lower.includes('kiev') || lower.includes('київ') || lower.includes('киев')) return 'Kyiv';
        if (lower.includes('lviv') || lower.includes('львів') || lower.includes('львов')) return 'Lviv';
        if (lower.includes('odesa') || lower.includes('odessa') || lower.includes('одеса') || lower.includes('одесса')) return 'Odesa';
        return c.charAt(0).toUpperCase() + c.slice(1);
    }

    private static normalizeCurrencyToken(raw: string): string {
        const lower = String(raw || '').toLowerCase();
        if (!lower) return 'USD';
        if (/(usd|\$|дол|уе|у\.?е\.?|у\s*о|у\.?\s*о\.?)/i.test(lower)) return 'USD';
        if (/(eur|€|евро|євро)/i.test(lower)) return 'EUR';
        if (/(uah|₴|грн|грив)/i.test(lower)) return 'UAH';
        return 'USD';
    }

    private static normalizeCompactNumber(raw: string): number {
        if (!raw) return 0;
        let clean = String(raw).toLowerCase().replace(/[\s\u00a0]/g, '');
        const multiplier = /(k|к|тыс|тис)/.test(clean) ? 1000 : 1;
        clean = clean.replace(/(k|к|тыс|тис)/g, '');
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
    }

    static extractPrice(input: any, defaultCurrency = 'USD'): { amount: number, currency: string } {
        let amount = 0;
        let currency = this.normalizeCurrencyToken(defaultCurrency);

        if (typeof input === 'object' && input !== null) {
            const objAmount = input.amount ?? input.value ?? input.price;
            amount = Number.isFinite(Number(objAmount))
                ? Number(objAmount)
                : this.normalizeCompactNumber(String(objAmount || ''));
            currency = this.normalizeCurrencyToken(input.currency || input.curr || defaultCurrency);
        } else if (typeof input === 'number') {
            amount = input;
        } else if (typeof input === 'string') {
            const raw = input.trim();
            currency = this.normalizeCurrencyToken(raw) || currency;
            amount = this.normalizeCompactNumber(raw);

            // If explicit numeric extraction failed, try to parse first meaningful number token.
            if (!amount) {
                const match = raw.match(/[\d\s.,]+(?:k|к|тыс|тис)?/i);
                if (match) amount = this.normalizeCompactNumber(match[0]);
            }
        }

        if (!Number.isFinite(amount) || amount < 0) amount = 0;
        return { amount: Number.isFinite(amount) ? amount : 0, currency };
    }

    static normalizeYear(year: any): number {
        const y = Number(year);
        if (!Number.isFinite(y)) return 0;
        if (y < 1900) return 0;
        if (y > new Date().getFullYear() + 2) return new Date().getFullYear();
        return y;
    }
}
