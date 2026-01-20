
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

    static extractPrice(input: any, defaultCurrency = 'USD'): { amount: number, currency: string } {
        let amount = 0;
        let currency = defaultCurrency;

        if (typeof input === 'object' && input !== null) {
            amount = Number(input.amount || 0);
            currency = input.currency || defaultCurrency;
        } else if (typeof input === 'number') {
            amount = input;
        } else if (typeof input === 'string') {
            amount = Number(input.replace(/[^\d.]/g, ''));
        }

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
