
import { Data } from './data';

// Simple Levenshtein distance for fuzzy match
const levenshtein = (a: string, b: string): number => {
    const matrix = [];
    let i, j;
    for (i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
};

export const NormalizationService = {
    async normalizeBrand(input: string): Promise<string | null> {
        if (!input) return null;
        const normalizedInput = input.trim().toLowerCase();
        const dicts = await Data.getDictionaries();
        const brands = dicts.brands;
        
        // 1. Direct Match
        for (const brand of brands) {
            if (brand.key.toLowerCase() === normalizedInput) return brand.key;
            if (brand.values.some(v => v.toLowerCase() === normalizedInput)) return brand.key;
        }

        // 2. Fuzzy Match (Aliases)
        let bestMatch = null;
        let minDistance = 3; // Tolerance

        for (const brand of brands) {
            // Check key
            const distKey = levenshtein(normalizedInput, brand.key.toLowerCase());
            if (distKey < minDistance) {
                minDistance = distKey;
                bestMatch = brand.key;
            }
            // Check aliases
            for (const alias of brand.values) {
                const dist = levenshtein(normalizedInput, alias.toLowerCase());
                if (dist < minDistance) {
                    minDistance = dist;
                    bestMatch = brand.key;
                }
            }
        }

        if (bestMatch) return bestMatch;
        
        // Return original capitalized nicely if no match
        return input.trim().charAt(0).toUpperCase() + input.trim().slice(1);
    },

    async normalizeCity(input: string): Promise<string | null> {
        if (!input) return null;
        const normalizedInput = input.trim().toLowerCase();
        const dicts = await Data.getDictionaries();
        const cities = dicts.cities;
        
        for (const city of cities) {
            if (city.key.toLowerCase() === normalizedInput) return city.key;
            if (city.values.some(v => v.toLowerCase() === normalizedInput)) {
                return city.key;
            }
        }
        
        return input.trim().charAt(0).toUpperCase() + input.trim().slice(1);
    }
};
