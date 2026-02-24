/**
 * Lead BUY Wizard — 9 steps + review + edit
 * §6.2 from MEGA PROMPT v7
 *
 * Steps:
 *  1. Brand (required)
 *  2. Model (optional)
 *  3. Year (optional)
 *  4. Budget (optional)
 *  5. Mileage (optional)
 *  6. Fuel (optional)
 *  7. City (optional)
 *  8. Comment (optional, forbidden contacts check)
 *  9. Contact (required)
 * 10. Review → confirm / edit / cancel
 */

import { PipelineContext } from '../../core/types.js';
import { prisma } from '../../../../../services/prisma.js';
import { resolveLang, t, button, type Lang } from '../../core/utils/telegramText.js';
import { telegramOutbox } from '../../messaging/outbox/telegramOutbox.js';
import { buildCallbackData, ActionTokens } from '../../core/utils/callbackUtils.js';
import {
    buildBrandKeyboard, buildModelKeyboard, buildYearKeyboard,
    buildBudgetKeyboard, buildMileageKeyboard, buildFuelKeyboard,
    buildCityKeyboard
} from '../../core/utils/quickPicks.js';
import { parseYearInput, parseBudgetUSD, parseMileageKm, normalizePhoneUA, containsForbiddenContacts } from '../../core/utils/inputValidators.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const updateSession = async (ctx: PipelineContext, state: string, variables: Record<string, any>) => {
    if (!ctx.session) return;
    ctx.session = await prisma.botSession.update({
        where: { id: ctx.session.id },
        data: { state, variables, lastActive: new Date() }
    });
};

const sendInline = async (ctx: PipelineContext, text: string, buttons: any[][]) => {
    if (!ctx.chatId || !ctx.bot) return;
    await telegramOutbox.sendMessage({
        botId: ctx.bot.id,
        token: ctx.bot.token,
        chatId: ctx.chatId,
        text,
        replyMarkup: { inline_keyboard: buttons },
        companyId: ctx.companyId
    });
};

const sendWithKeyboard = async (ctx: PipelineContext, text: string, keyboard: any[][]) => {
    if (!ctx.chatId || !ctx.bot) return;
    await telegramOutbox.sendMessage({
        botId: ctx.bot.id,
        token: ctx.bot.token,
        chatId: ctx.chatId,
        text,
        replyMarkup: { keyboard, resize_keyboard: true, one_time_keyboard: true },
        companyId: ctx.companyId
    });
};

const TOTAL_STEPS = 9;
const stepHeader = (n: number) => `Крок ${n}/${TOTAL_STEPS}`;

// Step state mapping
const STEP_STATES: Record<number, string> = {
    1: 'LB_BRAND', 2: 'LB_MODEL', 3: 'LB_YEAR', 4: 'LB_BUDGET',
    5: 'LB_MILEAGE', 6: 'LB_FUEL', 7: 'LB_CITY', 8: 'LB_COMMENT',
    9: 'LB_CONTACT', 10: 'LB_REVIEW'
};

// Fields for edit jump
const EDIT_FIELDS = [
    { step: 1, key: 'brand', label: 'Марка', cb: 'lb_j_1' },
    { step: 2, key: 'model', label: 'Модель', cb: 'lb_j_2' },
    { step: 3, key: 'year', label: 'Рік', cb: 'lb_j_3' },
    { step: 4, key: 'budget', label: 'Бюджет', cb: 'lb_j_4' },
    { step: 5, key: 'mileage', label: 'Пробіг', cb: 'lb_j_5' },
    { step: 6, key: 'fuel', label: 'Паливо', cb: 'lb_j_6' },
    { step: 7, key: 'city', label: 'Місто', cb: 'lb_j_7' },
    { step: 8, key: 'comment', label: 'Коментар', cb: 'lb_j_8' },
    { step: 9, key: 'phone', label: 'Контакт', cb: 'lb_j_9' }
];

// ---------------------------------------------------------------------------
// START
// ---------------------------------------------------------------------------
export const startLeadBuyWizard = async (ctx: PipelineContext) => {
    const vars = (ctx.session?.variables as any) || {};
    const lang = resolveLang(ctx);
    const flow = { step: 1 };
    await updateSession(ctx, 'LB_BRAND', { ...vars, leadBuy: flow });
    await sendInline(ctx,
        `${stepHeader(1)}. ${t(lang, 'lead.buy.title')}\n\n${t(lang, 'common.step_hint_brand')}`,
        buildBrandKeyboard(lang)
    );
};

// ---------------------------------------------------------------------------
// ROUTE to correct step UI
// ---------------------------------------------------------------------------
const routeBuyStep = async (ctx: PipelineContext, flow: any) => {
    const vars = (ctx.session?.variables as any) || {};
    const lang = resolveLang(ctx);
    const step = flow.step;

    if (step === 2) {
        await updateSession(ctx, 'LB_MODEL', { ...vars, leadBuy: flow });
        await sendInline(ctx,
            `${stepHeader(2)}. Оберіть модель для ${flow.brand || ''}:\n\n${t(lang, 'common.step_hint_model')}`,
            buildModelKeyboard(flow.brand || '', lang)
        );
    } else if (step === 3) {
        await updateSession(ctx, 'LB_YEAR', { ...vars, leadBuy: flow });
        await sendInline(ctx,
            `${stepHeader(3)}. Оберіть рік:\n\n${t(lang, 'common.step_hint_year')}`,
            buildYearKeyboard(lang)
        );
    } else if (step === 4) {
        await updateSession(ctx, 'LB_BUDGET', { ...vars, leadBuy: flow });
        await sendInline(ctx,
            `${stepHeader(4)}. Вкажіть бюджет (USD):\n\n${t(lang, 'common.step_hint_budget')}`,
            buildBudgetKeyboard(lang)
        );
    } else if (step === 5) {
        await updateSession(ctx, 'LB_MILEAGE', { ...vars, leadBuy: flow });
        await sendInline(ctx,
            `${stepHeader(5)}. Максимальний пробіг:\n\n${t(lang, 'common.step_hint_mileage')}`,
            buildMileageKeyboard(lang)
        );
    } else if (step === 6) {
        await updateSession(ctx, 'LB_FUEL', { ...vars, leadBuy: flow });
        await sendInline(ctx,
            `${stepHeader(6)}. Тип палива:`,
            buildFuelKeyboard(lang)
        );
    } else if (step === 7) {
        await updateSession(ctx, 'LB_CITY', { ...vars, leadBuy: flow });
        await sendInline(ctx,
            `${stepHeader(7)}. Місто:`,
            buildCityKeyboard(lang)
        );
    } else if (step === 8) {
        await updateSession(ctx, 'LB_COMMENT', { ...vars, leadBuy: flow });
        await sendInline(ctx,
            `${stepHeader(8)}. Додатковий коментар (необовʼязково):\n\nНапишіть текстом або натисніть «Пропустити».`,
            [
                [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('lb_skip_comment') }],
                [
                    { text: button(lang, 'common.back'), callback_data: buildCallbackData('lb_back_7') },
                    { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
                ]
            ]
        );
    } else if (step === 9) {
        await updateSession(ctx, 'LB_CONTACT', { ...vars, leadBuy: flow });
        const isPrivate = String(ctx.chatType) === 'private';
        if (isPrivate) {
            await sendWithKeyboard(ctx,
                `${stepHeader(9)}. Ваш контакт для звʼязку:\n\nНатисніть кнопку нижче або введіть номер вручну.`,
                [
                    [{ text: button(lang, 'common.shareContact'), request_contact: true }],
                    [{ text: button(lang, 'common.back') }]
                ]
            );
        } else {
            await sendInline(ctx,
                `${stepHeader(9)}. Введіть номер телефону:\n\n${t(lang, 'common.step_hint_budget').replace(/Бюджет/g, 'Телефон')}`,
                [
                    [
                        { text: button(lang, 'common.back'), callback_data: buildCallbackData('lb_back_8') },
                        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
                    ]
                ]
            );
        }
    } else if (step === 10) {
        await showReview(ctx, flow);
    }
};

// ---------------------------------------------------------------------------
// REVIEW
// ---------------------------------------------------------------------------
const buildSummary = (flow: any): string => {
    const lines = [
        `Марка: ${flow.brand || '—'}`,
        `Модель: ${flow.model || '—'}`,
        `Рік: ${flow.yearDisplay || flow.year || '—'}`,
        `Бюджет: ${flow.budget ? `до ${flow.budget} USD` : '—'}`,
        `Пробіг: ${flow.mileage ? `до ${flow.mileage} км` : '—'}`,
        `Паливо: ${flow.fuel || '—'}`,
        `Місто: ${flow.city || '—'}`,
        `Коментар: ${flow.comment || '—'}`,
        `Контакт: ${flow.phone || '—'}`
    ];
    return lines.join('\n');
};

const showReview = async (ctx: PipelineContext, flow: any) => {
    const vars = (ctx.session?.variables as any) || {};
    const lang = resolveLang(ctx);
    await updateSession(ctx, 'LB_REVIEW', { ...vars, leadBuy: flow });
    const summary = buildSummary(flow);
    await sendInline(ctx, t(lang, 'lead.buy.review.title', { summary }), [
        [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData(ActionTokens.LB_FAV_SEND) }],
        [{ text: button(lang, 'common.edit'), callback_data: buildCallbackData(ActionTokens.LB_EDIT) }],
        [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]);
};

// ---------------------------------------------------------------------------
// CALLBACK handler (inline keyboard clicks)
// ---------------------------------------------------------------------------
export const handleLeadBuyCallback = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
    const vars = (ctx.session?.variables as any) || {};
    const flow = vars.leadBuy || { step: 1 };
    const lang = resolveLang(ctx);

    // Cancel
    if (action === ActionTokens.LB_CANCEL) {
        await updateSession(ctx, 'CL_MENU', { ...vars, leadBuy: null });
        await sendInline(ctx, t(lang, 'cancelled'), []);
        return true;
    }

    // Edit — show field list
    if (action === ActionTokens.LB_EDIT) {
        const rows = EDIT_FIELDS.map(f => [{
            text: `${f.label}: ${flow[f.key] || '—'}`,
            callback_data: buildCallbackData(f.cb)
        }]);
        rows.push([{ text: button(lang, 'common.back'), callback_data: buildCallbackData('lb_back_review') }]);
        await sendInline(ctx, 'Оберіть поле для зміни:', rows);
        return true;
    }

    // Jump to edit a specific field
    if (action.startsWith('lb_j_')) {
        const stepNum = parseInt(action.replace('lb_j_', ''), 10);
        if (stepNum >= 1 && stepNum <= 9) {
            flow.step = stepNum;
            flow._editReturn = true; // Flag to return to review after edit
            await routeBuyStep(ctx, flow);
            return true;
        }
    }

    // Back to review (from edit field list)
    if (action === 'lb_back_review') {
        flow.step = 10;
        await showReview(ctx, flow);
        return true;
    }

    // Brand pick
    if (action === 'lb_e_b' || action === ActionTokens.LB_EDIT_BRAND) {
        if (payload === 'OTHER') {
            await updateSession(ctx, 'LB_BRAND_TXT', { ...vars, leadBuy: flow });
            await sendInline(ctx, 'Введіть марку текстом:', [
                [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
            ]);
            return true;
        }
        if (payload === 'BACK') {
            flow.step = 1;
            await routeBuyStep(ctx, flow);
            return true;
        }
        flow.brand = payload;
        flow.step = flow._editReturn ? 10 : 2;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Model pick
    if (action === 'lb_e_m' || action === ActionTokens.LB_EDIT_MODEL) {
        if (payload === 'SKIP') { flow.model = null; }
        else if (payload === 'OTHER') {
            await updateSession(ctx, 'LB_MODEL_TXT', { ...vars, leadBuy: flow });
            await sendInline(ctx, 'Введіть модель текстом:', [
                [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
            ]);
            return true;
        } else if (payload === 'BACK') {
            flow.step = 1;
            await routeBuyStep(ctx, flow);
            return true;
        } else {
            flow.model = payload;
        }
        flow.step = flow._editReturn ? 10 : 3;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Year pick
    if (action === 'lb_e_y' || action === ActionTokens.LB_EDIT_YEAR) {
        if (payload === 'SKIP') { flow.year = null; flow.yearDisplay = null; }
        else if (payload === 'OTHER') {
            await updateSession(ctx, 'LB_YEAR_TXT', { ...vars, leadBuy: flow });
            await sendInline(ctx, `Введіть рік (напр. 2018 або 2018-2022):`, [
                [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
            ]);
            return true;
        } else {
            flow.yearDisplay = `від ${payload}`;
            flow.year = payload;
        }
        flow.step = flow._editReturn ? 10 : 4;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Budget pick
    if (action === 'lb_e_bg' || action === ActionTokens.LB_EDIT_BUDGET) {
        if (payload === 'SKIP') { flow.budget = null; }
        else if (payload === 'OTHER') {
            await updateSession(ctx, 'LB_BUDGET_TXT', { ...vars, leadBuy: flow });
            await sendInline(ctx, `Введіть бюджет (USD):\n\n${t(lang, 'common.step_hint_budget')}`, [
                [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
            ]);
            return true;
        } else {
            flow.budget = parseInt(payload || '0', 10) || null;
        }
        flow.step = flow._editReturn ? 10 : 5;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Mileage pick
    if (action === 'lb_e_ml' || action === ActionTokens.LB_EDIT_MILEAGE) {
        if (payload === 'SKIP') { flow.mileage = null; }
        else if (payload === 'OTHER') {
            await updateSession(ctx, 'LB_MILEAGE_TXT', { ...vars, leadBuy: flow });
            await sendInline(ctx, `Введіть пробіг (км):\n\n${t(lang, 'common.step_hint_mileage')}`, [
                [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
            ]);
            return true;
        } else {
            flow.mileage = parseInt(payload || '0', 10) || null;
        }
        flow.step = flow._editReturn ? 10 : 6;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Fuel pick
    if (action === 'lb_e_fu' || action === ActionTokens.LB_EDIT_FUEL) {
        if (payload === 'SKIP') { flow.fuel = null; }
        else { flow.fuel = payload; }
        flow.step = flow._editReturn ? 10 : 7;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // City pick
    if (action === 'lb_e_ct' || action === ActionTokens.LB_EDIT_CITY) {
        if (payload === 'SKIP') { flow.city = null; }
        else if (payload === 'OTHER') {
            await updateSession(ctx, 'LB_CITY_TXT', { ...vars, leadBuy: flow });
            await sendInline(ctx, 'Введіть місто:', [
                [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
            ]);
            return true;
        } else {
            flow.city = payload;
        }
        flow.step = flow._editReturn ? 10 : 8;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Skip comment
    if (action === 'lb_skip_comment') {
        flow.comment = null;
        flow.step = flow._editReturn ? 10 : 9;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Back buttons from each step
    if (action.startsWith('lb_back_')) {
        const fromStep = parseInt(action.replace('lb_back_', ''), 10);
        if (fromStep >= 1 && fromStep <= 9) {
            flow.step = fromStep;
            await routeBuyStep(ctx, flow);
            return true;
        }
        // lb_back_y, lb_back_bg, lb_back_ml, lb_back_fu, lb_back_ct — legacy compat
        const legacyMap: Record<string, number> = {
            'lb_back_y': 2, 'lb_back_bg': 3, 'lb_back_ml': 4,
            'lb_back_fu': 5, 'lb_back_ct': 6
        };
        const legacyStep = legacyMap[action];
        if (legacyStep) {
            flow.step = legacyStep;
            await routeBuyStep(ctx, flow);
            return true;
        }
    }

    // lb_e_b_back — back from model to brand
    if (action === 'lb_e_b_back') {
        flow.step = 1;
        await routeBuyStep(ctx, flow);
        return true;
    }

    return false;
};

// ---------------------------------------------------------------------------
// TEXT handler (manual input)
// ---------------------------------------------------------------------------
export const handleLeadBuyText = async (ctx: PipelineContext, text: string): Promise<boolean> => {
    const vars = (ctx.session?.variables as any) || {};
    const state = ctx.session?.state;
    const flow = vars.leadBuy || { step: 1 };
    const lang = resolveLang(ctx);

    // Brand text
    if (state === 'LB_BRAND_TXT') {
        const trimmed = text.trim();
        if (trimmed.length < 2) {
            await sendInline(ctx, '⚠️ Введіть мінімум 2 символи.', []);
            return true;
        }
        flow.brand = trimmed;
        flow.step = flow._editReturn ? 10 : 2;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Model text
    if (state === 'LB_MODEL_TXT') {
        flow.model = text.trim() || null;
        flow.step = flow._editReturn ? 10 : 3;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Year text
    if (state === 'LB_YEAR_TXT') {
        const parsed = parseYearInput(text);
        if (!parsed) {
            await sendInline(ctx, t(lang, 'common.err.invalid_year'), []);
            return true;
        }
        flow.year = parsed.min === parsed.max ? String(parsed.min) : `${parsed.min}-${parsed.max}`;
        flow.yearDisplay = flow.year;
        flow.step = flow._editReturn ? 10 : 4;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Budget text
    if (state === 'LB_BUDGET_TXT') {
        const parsed = parseBudgetUSD(text);
        if (parsed === null) {
            await sendInline(ctx, t(lang, 'common.err.invalid_budget'), []);
            return true;
        }
        flow.budget = parsed;
        flow.step = flow._editReturn ? 10 : 5;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Mileage text
    if (state === 'LB_MILEAGE_TXT') {
        const parsed = parseMileageKm(text);
        if (parsed === null) {
            await sendInline(ctx, t(lang, 'common.err.invalid_mileage'), []);
            return true;
        }
        flow.mileage = parsed;
        flow.step = flow._editReturn ? 10 : 6;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // City text
    if (state === 'LB_CITY_TXT') {
        flow.city = text.trim() || null;
        flow.step = flow._editReturn ? 10 : 8;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Comment text
    if (state === 'LB_COMMENT') {
        if (containsForbiddenContacts(text)) {
            await sendInline(ctx, t(lang, 'common.err.contacts_forbidden'), [
                [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('lb_skip_comment') }]
            ]);
            return true;
        }
        flow.comment = text.trim();
        flow.step = flow._editReturn ? 10 : 9;
        delete flow._editReturn;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Contact text (manual phone or shared contact)
    if (state === 'LB_CONTACT') {
        const message = ctx.update?.message;

        // Shared contact
        if (message?.contact?.phone_number) {
            const normalized = normalizePhoneUA(message.contact.phone_number) || message.contact.phone_number;
            flow.phone = normalized;
            flow.step = 10;
            await routeBuyStep(ctx, flow);
            return true;
        }

        // Back button text
        const isBack = text.toLowerCase().includes('назад') || text === button(lang, 'common.back');
        if (isBack) {
            flow.step = 8;
            await routeBuyStep(ctx, flow);
            return true;
        }

        // Manual phone
        const normalized = normalizePhoneUA(text);
        if (!normalized) {
            await sendInline(ctx, t(lang, 'common.err.invalid_phone'), []);
            return true;
        }
        flow.phone = normalized;
        flow.step = 10;
        await routeBuyStep(ctx, flow);
        return true;
    }

    // Contact text input
    if (state === 'LB_CONTACT_TXT') {
        const normalized = normalizePhoneUA(text);
        if (!normalized) {
            await sendInline(ctx, t(lang, 'common.err.invalid_phone'), []);
            return true;
        }
        flow.phone = normalized;
        flow.step = 10;
        await routeBuyStep(ctx, flow);
        return true;
    }

    return false;
};
