import { describe, expect, it } from 'vitest';
import { normalizeNumber, parseCarData } from '../services/enhanced-parsing.utils.js';

describe('enhanced parsing utils', () => {
  it('parses dot-separated thousands as integer', () => {
    expect(normalizeNumber('10.000')).toBe(10000);
    expect(normalizeNumber('12.500')).toBe(12500);
  });

  it('parses price with у.е. marker as USD', () => {
    const parsed = parseCarData('BMW X5\nЦена: 12 500 у.е.\n2019');
    expect(parsed.price).toBe(12500);
    expect(parsed.currency).toBe('USD');
  });

  it('extracts key specs from mixed UA/RU text', () => {
    const parsed = parseCarData('Audi Q7 2021\nПробіг: 118 тис км\nПальне: дизель\nКПП: автомат\nПривід: повний');
    expect(parsed.title).toContain('Audi Q7');
    expect(parsed.mileage).toBe(118000);
    expect(parsed.fuel).toBe('diesel');
    expect(parsed.transmission).toBe('automatic');
    expect(parsed.drive).toBe('awd');
  });

  it('keeps model clean when first line contains extra descriptors', () => {
    const parsed = parseCarData('Audi e-tron 2021, Blue color. Perfect condition.');
    expect(parsed.brand).toBe('Audi');
    expect(parsed.model).toBe('e-tron');
  });

  it('parses Car Tie import channel posts with transit status and damage', () => {
    const parsed = parseCarData([
      '🇺🇸Ford Escape 2018',
      '⏳#викуплена і прямує до України (доступна до викупу)',
      '✅ Заводиться і Їде',
      '🚙 пробіг 215 тис. км',
      '🔥 1.5 бензин',
      '✔️ Ціла безпека',
      '🚙 Повний привід',
      '🛠 Пошкодження: передня частина',
      '💵 Ціна за розмитнене авто у Львові - 8 500$'
    ].join('\n'));

    expect(parsed.title).toBe('Ford Escape');
    expect(parsed.brand).toBe('Ford');
    expect(parsed.model).toBe('Escape');
    expect(parsed.year).toBe(2018);
    expect(parsed.status).toBe('in_transit');
    expect(parsed.condition).toBe('in_transit');
    expect(parsed.mileage).toBe(215000);
    expect(parsed.fuel).toBe('petrol');
    expect(parsed.drive).toBe('awd');
    expect(parsed.damage).toBe('передня частина');
    expect(parsed.safety).toBe('intact');
    expect(parsed.price).toBe(8500);
  });

  it('parses Car Tie showroom posts with in-stock status and trim', () => {
    const parsed = parseCarData([
      '🇺🇸BMW X3 F25 2014',
      '✔️ В НАЯВНОСТІ',
      '🚙 пробіг 130 тис.',
      '🔥 2.0 бензин',
      '⚡️ Топова комплектація',
      '🚙 Повний привід',
      '⚙️ Автомат',
      '💵Ціна - 15 900$'
    ].join('\n'));

    expect(parsed.title).toBe('BMW X3 F25');
    expect(parsed.brand).toBe('BMW');
    expect(parsed.model).toBe('X3 F25');
    expect(parsed.status).toBe('in_stock');
    expect(parsed.condition).toBe('in_stock');
    expect(parsed.trim).toBe('Топова');
    expect(parsed.transmission).toBe('automatic');
    expect(parsed.price).toBe(15900);
  });

  it('keeps sold one-line forwarded showroom posts from polluting the model', () => {
    const parsed = parseCarData('🇺🇸AUDI Q5 2017 ❌ Продано 🚙 пробіг 150 тис. 🔥 2.0 бензин ⚙️ Автомат 💵Ціна - 22 500$');

    expect(parsed.title).toBe('AUDI Q5');
    expect(parsed.brand).toBe('AUDI');
    expect(parsed.model).toBe('Q5');
    expect(parsed.status).toBe('sold');
    expect(parsed.condition).toBe('sold');
    expect(parsed.price).toBe(22500);
    expect(parsed.mileage).toBe(150000);
  });
});
