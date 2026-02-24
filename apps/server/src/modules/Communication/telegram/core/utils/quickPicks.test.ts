/**
 * Unit tests for quickPicks.ts keyboard builders
 * Verifies callback_data ≤ 64 bytes and correct structure
 */
import { describe, it, expect } from 'vitest';
import {
    buildBrandKeyboard, buildModelKeyboard, buildYearKeyboard,
    buildBudgetKeyboard, buildMileageKeyboard, buildFuelKeyboard,
    buildCityKeyboard, buildTransmissionKeyboard, buildDriveKeyboard,
    buildConditionKeyboard, BRANDS, BRAND_MODELS
} from './quickPicks.js';

const MAX_CALLBACK_DATA = 64;

const flattenButtons = (rows: any[][]): any[] => rows.flat();

const validateCallbackData = (rows: any[][]) => {
    for (const btn of flattenButtons(rows)) {
        if (btn.callback_data) {
            const bytes = Buffer.byteLength(btn.callback_data, 'utf-8');
            expect(bytes, `callback_data too long (${bytes}): "${btn.callback_data}"`).toBeLessThanOrEqual(MAX_CALLBACK_DATA);
        }
    }
};

describe('buildBrandKeyboard', () => {
    it('returns non-empty rows', () => {
        const rows = buildBrandKeyboard('UK');
        expect(rows.length).toBeGreaterThan(0);
    });
    it('includes all brands as buttons', () => {
        const rows = buildBrandKeyboard('UK');
        const labels = flattenButtons(rows).map(b => b.text);
        for (const brand of BRANDS) {
            expect(labels).toContain(brand);
        }
    });
    it('has "OTHER" entry', () => {
        const rows = buildBrandKeyboard('UK');
        const other = flattenButtons(rows).find(b => b.callback_data?.includes('OTHER'));
        expect(other).toBeTruthy();
    });
    it('all callback_data ≤ 64 bytes', () => {
        validateCallbackData(buildBrandKeyboard('UK'));
    });
});

describe('buildModelKeyboard', () => {
    it('returns models for known brand', () => {
        const rows = buildModelKeyboard('BMW', 'UK');
        const labels = flattenButtons(rows).map(b => b.text);
        for (const model of BRAND_MODELS['BMW']) {
            expect(labels).toContain(model);
        }
    });
    it('handles unknown brand gracefully', () => {
        const rows = buildModelKeyboard('UnknownBrand', 'UK');
        expect(rows.length).toBeGreaterThan(0); // Still has OTHER/SKIP/nav
    });
    it('all callback_data ≤ 64 bytes', () => {
        validateCallbackData(buildModelKeyboard('Mercedes-Benz', 'UK'));
    });
});

describe('year/budget/mileage/fuel/city keyboards', () => {
    it('buildYearKeyboard callback_data ≤ 64 bytes', () => {
        validateCallbackData(buildYearKeyboard('UK'));
    });
    it('buildBudgetKeyboard callback_data ≤ 64 bytes', () => {
        validateCallbackData(buildBudgetKeyboard('UK'));
    });
    it('buildMileageKeyboard callback_data ≤ 64 bytes', () => {
        validateCallbackData(buildMileageKeyboard('UK'));
    });
    it('buildFuelKeyboard callback_data ≤ 64 bytes', () => {
        validateCallbackData(buildFuelKeyboard('UK'));
    });
    it('buildCityKeyboard callback_data ≤ 64 bytes', () => {
        validateCallbackData(buildCityKeyboard('UK'));
    });
});

describe('sell-wizard keyboards', () => {
    it('buildTransmissionKeyboard callback_data ≤ 64 bytes', () => {
        validateCallbackData(buildTransmissionKeyboard());
    });
    it('buildDriveKeyboard callback_data ≤ 64 bytes', () => {
        validateCallbackData(buildDriveKeyboard());
    });
    it('buildConditionKeyboard callback_data ≤ 64 bytes', () => {
        validateCallbackData(buildConditionKeyboard());
    });
});
