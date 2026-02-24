/**
 * Lead SELL Wizard — collect car card + photos + contact + review
 * §6.3 from MEGA PROMPT v7
 *
 * Steps:
 *  1. Brand (required)
 *  2. Model (required)
 *  3. Year (required)
 *  4. Price (required)
 *  5. Mileage (optional)
 *  6. Fuel (optional)
 *  7. Transmission (optional)
 *  8. Drive (optional)
 *  9. Condition (optional)
 * 10. City (optional)
 * 11. Description (optional, forbidden contacts check)
 * 12. Photos (optional — user sends photos)
 * 13. Contact (required)
 * 14. Review → confirm / edit / cancel
 *
 * Admin actions after confirm:
 *  - Save to inventory (idempotent)
 *  - Publish to CarTié channel (idempotent)
 *  - Publish to B2B channel (idempotent)
 *  - Create B2B request (idempotent)
 */

import { PipelineContext } from '../../core/types.js';
import { prisma } from '../../../../../services/prisma.js';
import { resolveLang, t, button } from '../../core/utils/telegramText.js';
import { telegramOutbox } from '../../messaging/outbox/telegramOutbox.js';
import { buildCallbackData, ActionTokens } from '../../core/utils/callbackUtils.js';
import {
    buildBrandKeyboard, buildModelKeyboard, buildYearKeyboard,
    buildFuelKeyboard, buildCityKeyboard,
    buildTransmissionKeyboard, buildDriveKeyboard, buildConditionKeyboard
} from '../../core/utils/quickPicks.js';
import { parseYearInput, parseBudgetUSD, parseMileageKm, normalizePhoneUA, containsForbiddenContacts } from '../../core/utils/inputValidators.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const updateSession = async (ctx: PipelineContext, state: string, variables: Record<string, any>) => {
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

const TOTAL_STEPS = 13;
const stepHeader = (n: number) => `Крок ${n}/${TOTAL_STEPS}`;

// ---------------------------------------------------------------------------
// START
// ---------------------------------------------------------------------------
export const startLeadSellWizard = async (ctx: PipelineContext) => {
    const vars = (ctx.session?.variables as any) || {};
    const lang = resolveLang(ctx);
    const flow = { step: 1 };
    await updateSession(ctx, 'LS_BRAND', { ...vars, leadSell: flow });
    await sendInline(ctx,
        `${t(lang, 'lead.sell.title')}\n\n${stepHeader(1)}. Марка авто:\n\n${t(lang, 'common.step_hint_brand')}`,
        buildBrandKeyboard(lang)
    );
};

// ---------------------------------------------------------------------------
// ROUTE to correct step UI
// ---------------------------------------------------------------------------
const routeSellStep = async (ctx: PipelineContext, flow: any) => {
    const vars = (ctx.session?.variables as any) || {};
    const lang = resolveLang(ctx);
    const step = flow.step;
    const cancelBtn = { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) };
    const backBtn = (backAction: string) => ({ text: button(lang, 'common.back'), callback_data: buildCallbackData(backAction) });
    const skipBtn = (skipAction: string) => ({ text: button(lang, 'common.skip'), callback_data: buildCallbackData(skipAction) });

    if (step === 2) {
        await updateSession(ctx, 'LS_MODEL', { ...vars, leadSell: flow });
        await sendInline(ctx,
            `${stepHeader(2)}. Модель для ${flow.brand || ''}:`,
            buildModelKeyboard(flow.brand || '', lang)
        );
    } else if (step === 3) {
        await updateSession(ctx, 'LS_YEAR', { ...vars, leadSell: flow });
        await sendInline(ctx, `${stepHeader(3)}. Рік випуску:`, [
            [{ text: 'Ввести вручну', callback_data: buildCallbackData('ls_yr', 'OTHER') }],
            [backBtn('ls_back_2'), cancelBtn]
        ]);
    } else if (step === 4) {
        await updateSession(ctx, 'LS_PRICE', { ...vars, leadSell: flow });
        await sendInline(ctx, `${stepHeader(4)}. Ціна (USD):\n\nВведіть число, наприклад: 25000`, [
            [backBtn('ls_back_3'), cancelBtn]
        ]);
    } else if (step === 5) {
        await updateSession(ctx, 'LS_MILEAGE', { ...vars, leadSell: flow });
        await sendInline(ctx, `${stepHeader(5)}. Пробіг (км):\n\n${t(lang, 'common.step_hint_mileage')}`, [
            [skipBtn('ls_skip_ml')],
            [backBtn('ls_back_4'), cancelBtn]
        ]);
    } else if (step === 6) {
        await updateSession(ctx, 'LS_FUEL', { ...vars, leadSell: flow });
        await sendInline(ctx, `${stepHeader(6)}. Тип палива:`, buildFuelKeyboard(lang));
    } else if (step === 7) {
        await updateSession(ctx, 'LS_TRANS', { ...vars, leadSell: flow });
        await sendInline(ctx, `${stepHeader(7)}. КПП:`, buildTransmissionKeyboard());
    } else if (step === 8) {
        await updateSession(ctx, 'LS_DRIVE', { ...vars, leadSell: flow });
        await sendInline(ctx, `${stepHeader(8)}. Привід:`, buildDriveKeyboard());
    } else if (step === 9) {
        await updateSession(ctx, 'LS_CONDITION', { ...vars, leadSell: flow });
        await sendInline(ctx, `${stepHeader(9)}. Стан авто:`, buildConditionKeyboard());
    } else if (step === 10) {
        await updateSession(ctx, 'LS_CITY', { ...vars, leadSell: flow });
        await sendInline(ctx, `${stepHeader(10)}. Місто:`, buildCityKeyboard(lang));
    } else if (step === 11) {
        await updateSession(ctx, 'LS_DESC', { ...vars, leadSell: flow });
        await sendInline(ctx, `${stepHeader(11)}. Опис авто (необовʼязково):\n\nНапишіть текстом або натисніть «Пропустити».`, [
            [skipBtn('ls_skip_desc')],
            [backBtn('ls_back_10'), cancelBtn]
        ]);
    } else if (step === 12) {
        await updateSession(ctx, 'LS_PHOTO', { ...vars, leadSell: flow });
        await sendInline(ctx, `${stepHeader(12)}. Додайте фото авто:\n\nНадішліть фото або натисніть «Пропустити».`, [
            [skipBtn('ls_skip_photo')],
            [backBtn('ls_back_11'), cancelBtn]
        ]);
    } else if (step === 13) {
        await updateSession(ctx, 'LS_CONTACT', { ...vars, leadSell: flow });
        const isPrivate = String(ctx.chatType) === 'private';
        if (isPrivate) {
            await sendWithKeyboard(ctx, `${stepHeader(13)}. Контакт для звʼязку:`, [
                [{ text: button(lang, 'common.shareContact'), request_contact: true }],
                [{ text: button(lang, 'common.back') }]
            ]);
        } else {
            await sendInline(ctx, `${stepHeader(13)}. Введіть номер телефону:`, [
                [backBtn('ls_back_12'), cancelBtn]
            ]);
        }
    } else if (step === 14) {
        await showSellReview(ctx, flow);
    }
};

// ---------------------------------------------------------------------------
// REVIEW
// ---------------------------------------------------------------------------
const buildSellSummary = (flow: any): string => {
    const lines = [
        `Марка: ${flow.brand || '—'}`,
        `Модель: ${flow.model || '—'}`,
        `Рік: ${flow.year || '—'}`,
        `Ціна: ${flow.price ? `${flow.price} USD` : '—'}`,
        `Пробіг: ${flow.mileage ? `${flow.mileage} км` : '—'}`,
        `Паливо: ${flow.fuel || '—'}`,
        `КПП: ${flow.transmission || '—'}`,
        `Привід: ${flow.drive || '—'}`,
        `Стан: ${flow.condition || '—'}`,
        `Місто: ${flow.city || '—'}`,
        `Опис: ${flow.description || '—'}`,
        `Фото: ${flow.photos?.length ? `${flow.photos.length} шт.` : '—'}`,
        `Контакт: ${flow.phone || '—'}`
    ];
    return lines.join('\n');
};

const showSellReview = async (ctx: PipelineContext, flow: any) => {
    const vars = (ctx.session?.variables as any) || {};
    const lang = resolveLang(ctx);
    await updateSession(ctx, 'LS_REVIEW', { ...vars, leadSell: flow });
    const summary = buildSellSummary(flow);
    await sendInline(ctx, t(lang, 'lead.sell.review.title', { summary }), [
        [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData(ActionTokens.LS_SAVE) }],
        [{ text: button(lang, 'common.edit'), callback_data: buildCallbackData('ls_edit') }],
        [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]);
};

// ---------------------------------------------------------------------------
// CALLBACK handler
// ---------------------------------------------------------------------------
export const handleLeadSellCallback = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
    const vars = (ctx.session?.variables as any) || {};
    const flow = vars.leadSell || { step: 1 };
    const lang = resolveLang(ctx);

    if (action === ActionTokens.LB_CANCEL) {
        await updateSession(ctx, 'CL_MENU', { ...vars, leadSell: null });
        await sendInline(ctx, t(lang, 'cancelled'), []);
        return true;
    }

    // Brand
    if (action === 'lb_e_b') {
        if (payload === 'OTHER') {
            await updateSession(ctx, 'LS_BRAND_TXT', { ...vars, leadSell: flow });
            await sendInline(ctx, 'Введіть марку текстом:', [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]);
            return true;
        }
        flow.brand = payload;
        flow.step = 2;
        await routeSellStep(ctx, flow);
        return true;
    }

    // Model
    if (action === 'lb_e_m') {
        if (payload === 'SKIP') flow.model = null;
        else if (payload === 'OTHER') {
            await updateSession(ctx, 'LS_MODEL_TXT', { ...vars, leadSell: flow });
            await sendInline(ctx, 'Введіть модель текстом:', [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]);
            return true;
        } else flow.model = payload;
        flow.step = 3;
        await routeSellStep(ctx, flow);
        return true;
    }

    // Year
    if (action === 'ls_yr') {
        if (payload === 'OTHER') {
            await updateSession(ctx, 'LS_YEAR_TXT', { ...vars, leadSell: flow });
            await sendInline(ctx, 'Введіть рік випуску:', [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]);
            return true;
        }
    }

    // Fuel / Trans / Drive / Condition (delegates from quickPicks)
    if (action === 'ls_e_tr') {
        flow.transmission = payload === 'SKIP' ? null : payload;
        flow.step = 8;
        await routeSellStep(ctx, flow);
        return true;
    }
    if (action === 'ls_e_dr') {
        flow.drive = payload === 'SKIP' ? null : payload;
        flow.step = 9;
        await routeSellStep(ctx, flow);
        return true;
    }
    if (action === 'ls_e_cd') {
        flow.condition = payload === 'SKIP' ? null : payload;
        flow.step = 10;
        await routeSellStep(ctx, flow);
        return true;
    }

    // Fuel reuse from buy wizard (lb_e_fu action from quickPicks)
    if (action === 'lb_e_fu') {
        flow.fuel = payload === 'SKIP' ? null : payload;
        flow.step = 7;
        await routeSellStep(ctx, flow);
        return true;
    }

    // City (lb_e_ct)
    if (action === 'lb_e_ct') {
        if (payload === 'OTHER') {
            await updateSession(ctx, 'LS_CITY_TXT', { ...vars, leadSell: flow });
            await sendInline(ctx, 'Введіть місто:', [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]);
            return true;
        }
        flow.city = payload === 'SKIP' ? null : payload;
        flow.step = 11;
        await routeSellStep(ctx, flow);
        return true;
    }

    // Skips
    if (action === 'ls_skip_ml') { flow.mileage = null; flow.step = 6; await routeSellStep(ctx, flow); return true; }
    if (action === 'ls_skip_desc') { flow.description = null; flow.step = 12; await routeSellStep(ctx, flow); return true; }
    if (action === 'ls_skip_photo') { flow.photos = []; flow.step = 13; await routeSellStep(ctx, flow); return true; }

    // Back buttons
    if (action.startsWith('ls_back_')) {
        const fromStep = parseInt(action.replace('ls_back_', ''), 10);
        if (fromStep >= 1 && fromStep <= 13) {
            flow.step = fromStep;
            await routeSellStep(ctx, flow);
            return true;
        }
        // Legacy compat
        const legacyMap: Record<string, number> = { 'ls_back_tr': 6, 'ls_back_dr': 7, 'ls_back_cd': 8 };
        const s = legacyMap[action];
        if (s) { flow.step = s; await routeSellStep(ctx, flow); return true; }
    }

    // lb_e_b_back — back from model to brand
    if (action === 'lb_e_b_back') {
        flow.step = 1;
        await routeSellStep(ctx, flow);
        return true;
    }

    // Edit
    if (action === 'ls_edit') {
        flow.step = 1; // Restart
        await routeSellStep(ctx, flow);
        return true;
    }

    return false;
};

// ---------------------------------------------------------------------------
// TEXT handler
// ---------------------------------------------------------------------------
export const handleLeadSellText = async (ctx: PipelineContext, text: string): Promise<boolean> => {
    const vars = (ctx.session?.variables as any) || {};
    const state = ctx.session?.state;
    const flow = vars.leadSell || { step: 1 };
    const lang = resolveLang(ctx);
    const message = ctx.update?.message;

    if (state === 'LS_BRAND_TXT') {
        flow.brand = text.trim();
        flow.step = 2;
        await routeSellStep(ctx, flow);
        return true;
    }

    if (state === 'LS_MODEL_TXT') {
        flow.model = text.trim();
        flow.step = 3;
        await routeSellStep(ctx, flow);
        return true;
    }

    if (state === 'LS_YEAR' || state === 'LS_YEAR_TXT') {
        const parsed = parseYearInput(text);
        if (!parsed) {
            await sendInline(ctx, t(lang, 'common.err.invalid_year'), []);
            return true;
        }
        flow.year = parsed.min;
        flow.step = 4;
        await routeSellStep(ctx, flow);
        return true;
    }

    if (state === 'LS_PRICE') {
        const parsed = parseBudgetUSD(text);
        if (parsed === null) {
            await sendInline(ctx, t(lang, 'common.err.invalid_budget'), []);
            return true;
        }
        flow.price = parsed;
        flow.step = 5;
        await routeSellStep(ctx, flow);
        return true;
    }

    if (state === 'LS_MILEAGE') {
        const parsed = parseMileageKm(text);
        if (parsed === null) {
            await sendInline(ctx, t(lang, 'common.err.invalid_mileage'), []);
            return true;
        }
        flow.mileage = parsed;
        flow.step = 6;
        await routeSellStep(ctx, flow);
        return true;
    }

    if (state === 'LS_CITY_TXT') {
        flow.city = text.trim();
        flow.step = 11;
        await routeSellStep(ctx, flow);
        return true;
    }

    if (state === 'LS_DESC') {
        if (containsForbiddenContacts(text)) {
            await sendInline(ctx, t(lang, 'common.err.contacts_forbidden'), []);
            return true;
        }
        flow.description = text.trim();
        flow.step = 12;
        await routeSellStep(ctx, flow);
        return true;
    }

    if (state === 'LS_PHOTO') {
        // Accumulate photos
        const photos = flow.photos || [];
        if (message?.photo?.length) {
            const largest = message.photo[message.photo.length - 1];
            photos.push(largest.file_id);
            flow.photos = photos;
            await updateSession(ctx, 'LS_PHOTO', { ...vars, leadSell: flow });
            await sendInline(ctx, `📸 Фото додано (${photos.length}). Надішліть ще або натисніть «Далі».`, [
                [{ text: 'Далі ➡️', callback_data: buildCallbackData('ls_skip_photo') }]
            ]);
            return true;
        }
        // Text in photo state means done or skip
        flow.step = 13;
        await routeSellStep(ctx, flow);
        return true;
    }

    if (state === 'LS_CONTACT') {
        if (message?.contact?.phone_number) {
            flow.phone = normalizePhoneUA(message.contact.phone_number) || message.contact.phone_number;
            flow.step = 14;
            await routeSellStep(ctx, flow);
            return true;
        }
        const isBack = text.toLowerCase().includes('назад') || text === button(lang, 'common.back');
        if (isBack) {
            flow.step = 12;
            await routeSellStep(ctx, flow);
            return true;
        }
        const normalized = normalizePhoneUA(text);
        if (!normalized) {
            await sendInline(ctx, t(lang, 'common.err.invalid_phone'), []);
            return true;
        }
        flow.phone = normalized;
        flow.step = 14;
        await routeSellStep(ctx, flow);
        return true;
    }

    return false;
};
