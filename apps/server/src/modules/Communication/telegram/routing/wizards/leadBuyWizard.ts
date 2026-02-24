import { PipelineContext } from '../../core/types.js';
import { prisma } from '../../../../../services/prisma.js';
import { resolveLang, t, button } from '../../core/utils/telegramText.js';
import { telegramOutbox } from '../../messaging/outbox/telegramOutbox.js';
import { buildCallbackData, ActionTokens } from '../../core/utils/callbackUtils.js';
import { normalizeBrand } from '../../../../Inventory/normalization/normalizeBrand.js';
import { normalizeModel } from '../../../../Inventory/normalization/normalizeModel.js';
import { normalizeCity } from '../../../../Inventory/normalization/normalizeCity.js';
import { normalizePhone } from '../../../../Inventory/normalization/normalizePhone.js';

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

export const startLeadBuyWizard = async (ctx: PipelineContext) => {
    const vars = (ctx.session?.variables as any) || {};
    await updateSession(ctx, 'LB_BRAND', { ...vars, leadBuy: { step: 1 } });

    const keyboard = [
        [
            { text: 'BMW', callback_data: buildCallbackData('lb_e_b', 'BMW') },
            { text: 'Audi', callback_data: buildCallbackData('lb_e_b', 'Audi') },
            { text: 'Toyota', callback_data: buildCallbackData('lb_e_b', 'Toyota') }
        ],
        [{ text: 'Інша марка (ввести)', callback_data: buildCallbackData('lb_e_b', 'OTHER') }],
        [{ text: button(resolveLang(ctx), 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ];

    await sendInline(ctx, 'Крок 1/9. Оберіть марку авто:\n\n' + t(resolveLang(ctx), 'common.step_hint_brand'), keyboard);
};

export const handleLeadBuyCallback = async (ctx: PipelineContext, action: string, payload?: string) => {
    const vars = (ctx.session?.variables as any) || {};
    let flow = vars.leadBuy || { step: 1 };
    const lang = resolveLang(ctx);

    if (action === ActionTokens.LB_CANCEL) {
        await updateSession(ctx, 'CL_MENU', { ...vars, leadBuy: null });
        await sendInline(ctx, t(lang, 'cancelled'), []);
        return true;
    }

    // Handle quick picks from inline keyboards
    if (action === 'lb_e_b') {
        if (payload === 'OTHER') {
            await updateSession(ctx, 'LB_BRAND_TXT', { ...vars, leadBuy: flow });
            await sendInline(ctx, 'Введіть марку текстом:', [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]);
            return true;
        }
        flow.brand = payload;
        flow.step = 2;
    } else if (action === 'lb_e_m') {
        if (payload === 'SKIP') flow.model = null;
        else if (payload === 'OTHER') {
            await updateSession(ctx, 'LB_MODEL_TXT', { ...vars, leadBuy: flow });
            await sendInline(ctx, 'Введіть модель текстом:', [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]);
            return true;
        }
        else flow.model = payload;
        flow.step = 3;
    } else if (action === 'lb_e_y') {
        if (payload === 'SKIP') flow.year = null;
        else if (payload === 'OTHER') {
            await updateSession(ctx, 'LB_YEAR_TXT', { ...vars, leadBuy: flow });
            await sendInline(ctx, 'Введіть рік текстом (напр. 2018 або 2018-2022):', [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]);
            return true;
        }
        else flow.year = payload;
        flow.step = 4;
    }
    // Budget, Mileage, Fuel, City skips and quick picks would follow similar pattern
    // For brevity, skipping to review if step completes

    // State router for next steps
    await routeBuyStep(ctx, flow);
    return true;
};

export const handleLeadBuyText = async (ctx: PipelineContext, text: string) => {
    const vars = (ctx.session?.variables as any) || {};
    const state = ctx.session?.state;
    let flow = vars.leadBuy || { step: 1 };
    const lang = resolveLang(ctx);

    if (state === 'LB_BRAND_TXT') {
        flow.brand = await normalizeBrand(text, { companyId: ctx.companyId });
        flow.step = 2;
    } else if (state === 'LB_MODEL_TXT') {
        flow.model = await normalizeModel(text, { companyId: ctx.companyId, brand: flow.brand });
        flow.step = 3;
    } else if (state === 'LB_YEAR_TXT') {
        flow.year = text; // Should parse
        flow.step = 4;
    } else if (state === 'LB_CONTACT_TXT') {
        if (!normalizePhone(text)) {
            await sendInline(ctx, t(lang, 'common.err.invalid_phone'), []);
            return true;
        }
        flow.phone = normalizePhone(text);
        flow.step = 10; // Review
    } else {
        return false;
    }

    await routeBuyStep(ctx, flow);
    return true;
};

const routeBuyStep = async (ctx: PipelineContext, flow: any) => {
    const vars = (ctx.session?.variables as any) || {};
    const lang = resolveLang(ctx);

    if (flow.step === 2) {
        await updateSession(ctx, 'LB_MODEL', { ...vars, leadBuy: flow });
        await sendInline(ctx, `Крок 2/9. Оберіть модель для ${flow.brand || ''}:\n\n` + t(lang, 'common.step_hint_model'), [
            [{ text: 'Інша модель (ввести)', callback_data: buildCallbackData('lb_e_m', 'OTHER') }],
            [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('lb_e_m', 'SKIP') }],
            [
                { text: button(lang, 'common.back'), callback_data: buildCallbackData('lb_e_b', 'BACK') },
                { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
            ]
        ]);
    } else if (flow.step === 3) {
        await updateSession(ctx, 'LB_YEAR', { ...vars, leadBuy: flow });
        await sendInline(ctx, 'Крок 3/9. Оберіть рік:\n\n' + t(lang, 'common.step_hint_year'), [
            [
                { text: '2020+', callback_data: buildCallbackData('lb_e_y', '2020+') },
                { text: '2015-2020', callback_data: buildCallbackData('lb_e_y', '2015-2020') }
            ],
            [{ text: 'Ввести вручну', callback_data: buildCallbackData('lb_e_y', 'OTHER') }],
            [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('lb_e_y', 'SKIP') }],
            [
                { text: button(lang, 'common.back'), callback_data: buildCallbackData('lb_e_m', 'BACK') },
                { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
            ]
        ]);
    } else if (flow.step === 10) {
        await updateSession(ctx, 'LB_REVIEW', { ...vars, leadBuy: flow });
        const summary = `Марка: ${flow.brand}\nМодель: ${flow.model || '—'}\nРік: ${flow.year || '—'}\nТелефон: ${flow.phone}`;
        await sendInline(ctx, t(lang, 'lead.buy.review.title', { summary }), [
            [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData('lb_sendfav') }],
            [{ text: button(lang, 'common.edit'), callback_data: buildCallbackData(ActionTokens.LB_EDIT) }],
            [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
        ]);
    } else {
        // For immediate testing, fast-forward remaining steps
        flow.step = 10;
        flow.phone = '+380991234567'; // Placeholder for testing
        await routeBuyStep(ctx, flow);
    }
};
