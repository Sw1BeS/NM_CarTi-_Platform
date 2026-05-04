/**
 * §2 — QUICK PICK DICTIONARIES
 * Inline keyboard builders for all wizard steps.
 * All callback_data stays within 64-byte limit using short tokens + payload.
 */

import { buildCallbackData } from './callbackUtils.js';
import type { Lang } from './telegramText.js';

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
export const BRANDS = [
    'BMW', 'Audi', 'Mercedes-Benz', 'Volkswagen',
    'Toyota', 'Skoda', 'Renault', 'Nissan',
    'Hyundai', 'Kia', 'Ford', 'Tesla'
];

// Models per brand
export const BRAND_MODELS: Record<string, string[]> = {
    'BMW': ['X5', 'X3', 'X6', 'X1', '3 Series', '5 Series'],
    'Audi': ['A4', 'A6', 'Q5', 'Q7', 'A3', 'Q3'],
    'Mercedes-Benz': ['E-Class', 'C-Class', 'GLC', 'GLE', 'S-Class', 'CLA'],
    'Volkswagen': ['Passat', 'Tiguan', 'Golf', 'Touareg', 'Jetta', 'Polo'],
    'Toyota': ['Camry', 'RAV4', 'Corolla', 'Land Cruiser', 'Prado', 'Yaris'],
    'Skoda': ['Octavia', 'Superb', 'Kodiaq', 'Karoq', 'Fabia'],
    'Renault': ['Megane', 'Duster', 'Logan', 'Sandero'],
    'Nissan': ['Qashqai', 'X-Trail', 'Juke', 'Leaf'],
    'Hyundai': ['Tucson', 'Santa Fe', 'Elantra', 'Kona'],
    'Kia': ['Sportage', 'Sorento', 'Ceed', 'Niro'],
    'Ford': ['Focus', 'Mondeo', 'Kuga', 'Escape'],
    'Tesla': ['Model 3', 'Model Y', 'Model S', 'Model X'],
};

export const FUEL_OPTIONS = ['Бензин', 'Дизель', 'Гібрид', 'Електро', 'Газ', 'Plug-in'];
export const TRANS_OPTIONS = ['Автомат', 'Механіка', 'Робот', 'Варіатор'];
export const DRIVE_OPTIONS = ['Передній', 'Задній', 'Повний'];
export const COND_OPTIONS = ['Ідеальний', 'Добрий', 'Потрібен ремонт', 'Після ДТП'];
export const CITY_OPTIONS = ['Львів', 'Київ', 'Ужгород', 'Дніпро', 'Одеса', 'Харків'];

export const encodePickToken = (index: number) => index.toString(36);

export const decodePickToken = (token?: string | null): number => {
    const value = parseInt(String(token || ''), 36);
    return Number.isFinite(value) ? value : -1;
};

export const pickFromList = (list: string[], token?: string | null): string | null => {
    const idx = decodePickToken(token);
    if (idx < 0 || idx >= list.length) return null;
    return list[idx] || null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const inPairs = (items: string[], action: string, payloadFn?: (v: string) => string): any[][] => {
    const rows: any[][] = [];
    for (let i = 0; i < items.length; i += 2) {
        const row: any[] = [];
        for (let j = i; j < Math.min(i + 2, items.length); j++) {
            const v = payloadFn ? payloadFn(items[j]) : items[j];
            row.push({ text: items[j], callback_data: buildCallbackData(action, v) });
        }
        rows.push(row);
    }
    return rows;
};

const navRow = (backAction: string, skipAction?: string, cancelAction = 'lb_cancel'): any[] => {
    const row: any[] = [{ text: '⬅️ Назад', callback_data: buildCallbackData(backAction) }];
    if (skipAction) row.push({ text: 'Пропустити', callback_data: buildCallbackData(skipAction) });
    row.push({ text: '❌ Скасувати', callback_data: buildCallbackData(cancelAction) });
    return row;
};

// ---------------------------------------------------------------------------
// Brand keyboard (2-column, §2)
// ---------------------------------------------------------------------------
export const buildBrandKeyboard = (
    _lang: Lang,
    opts?: { action?: string; cancelAction?: string; backAction?: string }
): any[][] => {
    const action = opts?.action || 'lb_e_b';
    const cancelAction = opts?.cancelAction || 'lb_cancel';
    const backAction = opts?.backAction || '';
    const rows = inPairs(BRANDS, action, (_v) => encodePickToken(BRANDS.indexOf(_v)));
    rows.push([{ text: 'Інша марка (ввести)', callback_data: buildCallbackData(action, 'OTHER') }]);
    if (backAction) {
        rows.push([
            { text: '⬅️ Назад', callback_data: buildCallbackData(backAction) },
            { text: '❌ Скасувати', callback_data: buildCallbackData(cancelAction) }
        ]);
    } else {
        rows.push([{ text: '❌ Скасувати', callback_data: buildCallbackData(cancelAction) }]);
    }
    return rows;
};

// ---------------------------------------------------------------------------
// Model keyboard for brand
// ---------------------------------------------------------------------------
export const buildModelKeyboard = (
    brand: string,
    _lang: Lang,
    opts?: { action?: string; backAction?: string; cancelAction?: string }
): any[][] => {
    const action = opts?.action || 'lb_e_m';
    const backAction = opts?.backAction || 'lb_e_b_back';
    const cancelAction = opts?.cancelAction || 'lb_cancel';
    const models = BRAND_MODELS[brand] || [];
    const rows = inPairs(models, action, (_v) => encodePickToken(models.indexOf(_v)));
    rows.push([
        { text: 'Інша модель (ввести)', callback_data: buildCallbackData(action, 'OTHER') },
        { text: 'Пропустити', callback_data: buildCallbackData(action, 'SKIP') }
    ]);
    rows.push(navRow(backAction, undefined, cancelAction));
    return rows;
};

// ---------------------------------------------------------------------------
// Year keyboard
// ---------------------------------------------------------------------------
export const buildYearKeyboard = (_lang: Lang): any[][] => [
    [
        { text: 'від 2022', callback_data: buildCallbackData('lb_e_y', '2022') },
        { text: 'від 2020', callback_data: buildCallbackData('lb_e_y', '2020') },
    ],
    [
        { text: 'від 2018', callback_data: buildCallbackData('lb_e_y', '2018') },
        { text: 'від 2015', callback_data: buildCallbackData('lb_e_y', '2015') },
    ],
    [
        { text: 'Ввести вручну', callback_data: buildCallbackData('lb_e_y', 'OTHER') },
        { text: 'Пропустити', callback_data: buildCallbackData('lb_e_y', 'SKIP') },
    ],
    navRow('lb_back_y', undefined),
];

// ---------------------------------------------------------------------------
// Budget keyboard
// ---------------------------------------------------------------------------
export const buildBudgetKeyboard = (_lang: Lang): any[][] => [
    [
        { text: 'до 10 000', callback_data: buildCallbackData('lb_e_bg', '10000') },
        { text: 'до 15 000', callback_data: buildCallbackData('lb_e_bg', '15000') },
    ],
    [
        { text: 'до 20 000', callback_data: buildCallbackData('lb_e_bg', '20000') },
        { text: 'до 25 000', callback_data: buildCallbackData('lb_e_bg', '25000') },
    ],
    [
        { text: 'до 30 000', callback_data: buildCallbackData('lb_e_bg', '30000') },
        { text: 'до 40 000', callback_data: buildCallbackData('lb_e_bg', '40000') },
    ],
    [
        { text: 'до 50 000', callback_data: buildCallbackData('lb_e_bg', '50000') },
        { text: 'Ввести вручну', callback_data: buildCallbackData('lb_e_bg', 'OTHER') },
    ],
    [{ text: 'Пропустити', callback_data: buildCallbackData('lb_e_bg', 'SKIP') }],
    navRow('lb_back_bg', undefined),
];

// ---------------------------------------------------------------------------
// Mileage keyboard
// ---------------------------------------------------------------------------
export const buildMileageKeyboard = (_lang: Lang): any[][] => [
    [
        { text: 'до 50 тис.', callback_data: buildCallbackData('lb_e_ml', '50000') },
        { text: 'до 100 тис.', callback_data: buildCallbackData('lb_e_ml', '100000') },
    ],
    [
        { text: 'до 150 тис.', callback_data: buildCallbackData('lb_e_ml', '150000') },
        { text: 'до 200 тис.', callback_data: buildCallbackData('lb_e_ml', '200000') },
    ],
    [
        { text: 'Ввести вручну', callback_data: buildCallbackData('lb_e_ml', 'OTHER') },
        { text: 'Пропустити', callback_data: buildCallbackData('lb_e_ml', 'SKIP') },
    ],
    navRow('lb_back_ml', undefined),
];

// ---------------------------------------------------------------------------
// Fuel keyboard
// ---------------------------------------------------------------------------
export const buildFuelKeyboard = (
    _lang: Lang,
    opts?: { action?: string; backAction?: string; cancelAction?: string }
): any[][] => {
    const action = opts?.action || 'lb_e_fu';
    const backAction = opts?.backAction || 'lb_back_fu';
    const cancelAction = opts?.cancelAction || 'lb_cancel';
    return [
        ...inPairs(FUEL_OPTIONS, action, (_v) => encodePickToken(FUEL_OPTIONS.indexOf(_v))),
        [{ text: 'Пропустити', callback_data: buildCallbackData(action, 'SKIP') }],
        navRow(backAction, undefined, cancelAction),
    ];
};

// ---------------------------------------------------------------------------
// City keyboard
// ---------------------------------------------------------------------------
export const buildCityKeyboard = (
    _lang: Lang,
    opts?: { action?: string; backAction?: string; cancelAction?: string }
): any[][] => {
    const action = opts?.action || 'lb_e_ct';
    const backAction = opts?.backAction || 'lb_back_ct';
    const cancelAction = opts?.cancelAction || 'lb_cancel';
    return [
        ...inPairs(CITY_OPTIONS, action, (_v) => encodePickToken(CITY_OPTIONS.indexOf(_v))),
        [
            { text: 'Інше (ввести)', callback_data: buildCallbackData(action, 'OTHER') },
            { text: 'Пропустити', callback_data: buildCallbackData(action, 'SKIP') },
        ],
        navRow(backAction, undefined, cancelAction),
    ];
};

// ---------------------------------------------------------------------------
// Transmission / Drive / Condition (for SELL wizard — ls_ prefix)
// ---------------------------------------------------------------------------
export const buildTransmissionKeyboard = (
    opts?: { action?: string; backAction?: string; cancelAction?: string }
): any[][] => {
    const action = opts?.action || 'ls_e_tr';
    const backAction = opts?.backAction || 'ls_back_tr';
    const cancelAction = opts?.cancelAction || 'lb_cancel';
    return [
        ...inPairs(TRANS_OPTIONS, action, (_v) => encodePickToken(TRANS_OPTIONS.indexOf(_v))),
        [{ text: 'Пропустити', callback_data: buildCallbackData(action, 'SKIP') }],
        [
            { text: '⬅️ Назад', callback_data: buildCallbackData(backAction) },
            { text: '❌ Скасувати', callback_data: buildCallbackData(cancelAction) },
        ],
    ];
};

export const buildDriveKeyboard = (
    opts?: { action?: string; backAction?: string; cancelAction?: string }
): any[][] => {
    const action = opts?.action || 'ls_e_dr';
    const backAction = opts?.backAction || 'ls_back_dr';
    const cancelAction = opts?.cancelAction || 'lb_cancel';
    return [
        ...inPairs(DRIVE_OPTIONS, action, (_v) => encodePickToken(DRIVE_OPTIONS.indexOf(_v))),
        [{ text: 'Пропустити', callback_data: buildCallbackData(action, 'SKIP') }],
        [
            { text: '⬅️ Назад', callback_data: buildCallbackData(backAction) },
            { text: '❌ Скасувати', callback_data: buildCallbackData(cancelAction) },
        ],
    ];
};

export const buildConditionKeyboard = (
    opts?: { action?: string; backAction?: string; cancelAction?: string }
): any[][] => {
    const action = opts?.action || 'ls_e_cd';
    const backAction = opts?.backAction || 'ls_back_cd';
    const cancelAction = opts?.cancelAction || 'lb_cancel';
    return [
        ...inPairs(COND_OPTIONS, action, (_v) => encodePickToken(COND_OPTIONS.indexOf(_v))),
        [{ text: 'Пропустити', callback_data: buildCallbackData(action, 'SKIP') }],
        [
            { text: '⬅️ Назад', callback_data: buildCallbackData(backAction) },
            { text: '❌ Скасувати', callback_data: buildCallbackData(cancelAction) },
        ],
    ];
};
