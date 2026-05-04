/**
 * §3 — STRICT VALIDATION & ANTI-CHAOS utilities
 * Called by wizard steps to parse and validate user text input.
 */

const CURRENT_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// parseYearInput
// Accepts: "2018" | "2018-2022" | "від 2018"
// Returns parsed { min, max } or null if invalid.
// ---------------------------------------------------------------------------
export type YearRange = { min: number; max: number | null };

export const parseYearInput = (text: string): YearRange | null => {
    const raw = String(text || '').trim().replace(/[^\d\-–—]/g, ' ').trim();
    if (!raw) return null;

    const rangeMatch = raw.match(/(\d{4})\s*[-–—]\s*(\d{4})/);
    if (rangeMatch) {
        const a = Number(rangeMatch[1]);
        const b = Number(rangeMatch[2]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        const min = Math.min(a, b);
        const max = Math.max(a, b);
        if (min < 1990 || max > CURRENT_YEAR + 1) return null;
        return { min, max };
    }

    const singleMatch = raw.match(/\b(\d{4})\b/);
    if (!singleMatch) return null;
    const year = Number(singleMatch[1]);
    if (!Number.isFinite(year)) return null;
    if (year < 1990 || year > CURRENT_YEAR + 1) return null;
    return { min: year, max: null };
};

// ---------------------------------------------------------------------------
// parseBudgetUSD
// Accepts: "20000" | "20 000" | "20k" | "20 тис" | "20тис"
// Returns number (USD) or null.
// ---------------------------------------------------------------------------
export const parseBudgetUSD = (text: string): number | null => {
    const raw = text.trim().toLowerCase();
    const isThousands =
        raw.includes('k') || raw.includes('к') ||
        raw.includes('тис') || raw.includes('тыс');

    const numStr = raw.replace(/[^\d.]/g, '');
    if (!numStr) return null;

    let value = parseFloat(numStr);
    if (isNaN(value)) return null;
    if (isThousands && value < 1000) value *= 1000;

    if (value < 1000 || value > 300_000) return null;
    return Math.round(value);
};

// ---------------------------------------------------------------------------
// parseMileageKm
// Accepts: "120000" | "120k" | "120 тис" | "120тис"
// Returns number (km) or null.
// ---------------------------------------------------------------------------
export const parseMileageKm = (text: string): number | null => {
    const raw = text.trim().toLowerCase();
    const isThousands =
        raw.includes('k') || raw.includes('к') ||
        raw.includes('тис') || raw.includes('тыс');

    const numStr = raw.replace(/[^\d.]/g, '');
    if (!numStr) return null;

    let value = parseFloat(numStr);
    if (isNaN(value)) return null;
    if (isThousands && value < 1000) value *= 1000;

    if (value < 0 || value > 600_000) return null;
    return Math.round(value);
};

// ---------------------------------------------------------------------------
// normalizePhoneUA
// Accepts: "+380XXXXXXXXX" | "0XXXXXXXXX"
// Returns "+380XXXXXXXXX" or null.
// ---------------------------------------------------------------------------
export const normalizePhoneUA = (text: string): string | null => {
    const digits = text.replace(/\D/g, '');

    if (digits.startsWith('380') && digits.length === 12) {
        return `+${digits}`;
    }
    if (digits.startsWith('0') && digits.length === 10) {
        return `+38${digits}`;
    }
    return null;
};

// ---------------------------------------------------------------------------
// containsForbiddenContacts
// Returns true if text contains phone-like patterns, messenger links, etc.
// ---------------------------------------------------------------------------
export const containsForbiddenContacts = (text: string): boolean => {
    const lower = text.toLowerCase();
    const patterns = [
        /\+?380\d{9}/,            // UA phone
        /\b0\d{9}\b/,             // UA short phone
        /\b0\d{2}[\d\s\-()]{5,}\b/, // generic UA-like phone body
        /\d{7,}/,                 // any 7+ digit sequence
        /t\.me\//,                // Telegram link
        /@[a-z0-9_]{2,}/,         // @username
        /viber/,
        /whatsapp/,
        /telegram/,
        /tg:/,
    ];
    return patterns.some(p => p.test(lower));
};
