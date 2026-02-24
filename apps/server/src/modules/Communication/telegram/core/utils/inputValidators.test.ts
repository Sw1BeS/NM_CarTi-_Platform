/**
 * Unit tests for inputValidators.ts
 * Covers all 5 validators: parseYearInput, parseBudgetUSD, parseMileageKm,
 * normalizePhoneUA, containsForbiddenContacts
 */
import { describe, it, expect } from 'vitest';
import { parseYearInput, parseBudgetUSD, parseMileageKm, normalizePhoneUA, containsForbiddenContacts } from './inputValidators.js';

describe('parseYearInput', () => {
    it('parses single year', () => {
        expect(parseYearInput('2020')).toEqual({ min: 2020, max: 2020 });
    });
    it('parses year range with dash', () => {
        expect(parseYearInput('2018-2022')).toEqual({ min: 2018, max: 2022 });
    });
    it('parses "від 2018"', () => {
        const r = parseYearInput('від 2018');
        expect(r).toBeTruthy();
        expect(r!.min).toBe(2018);
    });
    it('normalizes 2-digit year (20 → 2020)', () => {
        const r = parseYearInput('20');
        expect(r).toBeTruthy();
        expect(r!.min).toBe(2020);
    });
    it('returns null for out of range', () => {
        expect(parseYearInput('1980')).toBeNull();
    });
    it('returns null for garbage', () => {
        expect(parseYearInput('hello')).toBeNull();
    });
    it('returns null for empty string', () => {
        expect(parseYearInput('')).toBeNull();
    });
});

describe('parseBudgetUSD', () => {
    it('parses plain number', () => {
        expect(parseBudgetUSD('20000')).toBe(20000);
    });
    it('parses with spaces "20 000"', () => {
        expect(parseBudgetUSD('20 000')).toBe(20000);
    });
    it('parses "20k"', () => {
        expect(parseBudgetUSD('20k')).toBe(20000);
    });
    it('parses "20тис"', () => {
        expect(parseBudgetUSD('20тис')).toBe(20000);
    });
    it('parses "20 тис"', () => {
        expect(parseBudgetUSD('20 тис')).toBe(20000);
    });
    it('returns null for too small', () => {
        expect(parseBudgetUSD('500')).toBeNull();
    });
    it('returns null for too large', () => {
        expect(parseBudgetUSD('500000')).toBeNull();
    });
    it('returns null for garbage', () => {
        expect(parseBudgetUSD('hello world')).toBeNull();
    });
});

describe('parseMileageKm', () => {
    it('parses plain number', () => {
        expect(parseMileageKm('120000')).toBe(120000);
    });
    it('parses "120k"', () => {
        expect(parseMileageKm('120k')).toBe(120000);
    });
    it('parses "120тис"', () => {
        expect(parseMileageKm('120тис')).toBe(120000);
    });
    it('returns null for too large', () => {
        expect(parseMileageKm('700000')).toBeNull();
    });
    it('returns null for empty', () => {
        expect(parseMileageKm('')).toBeNull();
    });
});

describe('normalizePhoneUA', () => {
    it('normalizes +380 format', () => {
        expect(normalizePhoneUA('+380991234567')).toBe('+380991234567');
    });
    it('normalizes 380 without +', () => {
        expect(normalizePhoneUA('380991234567')).toBe('+380991234567');
    });
    it('normalizes 0-prefixed', () => {
        expect(normalizePhoneUA('0991234567')).toBe('+380991234567');
    });
    it('normalizes 9-digit (no prefix)', () => {
        expect(normalizePhoneUA('991234567')).toBe('+380991234567');
    });
    it('strips formatting', () => {
        expect(normalizePhoneUA('+38 099 123 45 67')).toBe('+380991234567');
    });
    it('returns null for too short', () => {
        expect(normalizePhoneUA('12345')).toBeNull();
    });
    it('returns null for wrong format', () => {
        expect(normalizePhoneUA('+1234567890')).toBeNull();
    });
});

describe('containsForbiddenContacts', () => {
    it('detects UA phone', () => {
        expect(containsForbiddenContacts('Мій номер +380991234567')).toBe(true);
    });
    it('detects @username', () => {
        expect(containsForbiddenContacts('Пишіть мені @my_username')).toBe(true);
    });
    it('detects t.me link', () => {
        expect(containsForbiddenContacts('Ось моя група t.me/mygroup')).toBe(true);
    });
    it('detects viber', () => {
        expect(containsForbiddenContacts('Зв\'яжіться через viber')).toBe(true);
    });
    it('detects whatsapp', () => {
        expect(containsForbiddenContacts('пишіть whatsapp')).toBe(true);
    });
    it('allows normal text', () => {
        expect(containsForbiddenContacts('Хочу BMW X5 білого кольору')).toBe(false);
    });
    it('allows short numbers', () => {
        expect(containsForbiddenContacts('2020 рік, 150 сил')).toBe(false);
    });
});
