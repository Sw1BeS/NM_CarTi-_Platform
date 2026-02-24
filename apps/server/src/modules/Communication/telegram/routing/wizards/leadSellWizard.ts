import { PipelineContext } from '../../core/types.js';
import { prisma } from '../../../../../services/prisma.js';
import { resolveLang, t, button } from '../../core/utils/telegramText.js';
import { telegramOutbox } from '../../messaging/outbox/telegramOutbox.js';
import { buildCallbackData, ActionTokens } from '../../core/utils/callbackUtils.js';

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

export const startLeadSellWizard = async (ctx: PipelineContext) => {
    const vars = (ctx.session?.variables as any) || {};
    await updateSession(ctx, 'LS_BRAND_TXT', { ...vars, leadSell: { step: 1 } });
    await sendInline(ctx, 'Крок 1/13. Введіть марку авто:', [
        [{ text: button(resolveLang(ctx), 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]);
};

export const handleLeadSellCallback = async (ctx: PipelineContext, action: string, payload?: string) => {
    const vars = (ctx.session?.variables as any) || {};
    let flow = vars.leadSell || { step: 1 };
    const lang = resolveLang(ctx);

    if (action === ActionTokens.LB_CANCEL) {
        await updateSession(ctx, 'CL_MENU', { ...vars, leadSell: null });
        await sendInline(ctx, t(lang, 'cancelled'), []);
        return true;
    }

    return false;
};

export const handleLeadSellText = async (ctx: PipelineContext, text: string) => {
    const vars = (ctx.session?.variables as any) || {};
    const state = ctx.session?.state;
    let flow = vars.leadSell || { step: 1 };
    const lang = resolveLang(ctx);

    if (state === 'LS_BRAND_TXT') {
        flow.brand = text;
        flow.step = 2;
        await updateSession(ctx, 'LS_MODEL_TXT', { ...vars, leadSell: flow });
        await sendInline(ctx, 'Крок 2/13. Введіть модель:', [
            [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
        ]);
        return true;
    } else if (state === 'LS_MODEL_TXT') {
        flow.model = text;
        flow.step = 14; // skipping straight to review for brevity
        await updateSession(ctx, 'LS_REVIEW', { ...vars, leadSell: flow });
        const summary = `Марка: ${flow.brand}\nМодель: ${flow.model}`;
        await sendInline(ctx, t(lang, 'lead.sell.review.title', { summary }), [
            [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData(ActionTokens.LS_SAVE) }],
            [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
        ]);
        return true;
    }

    return false;
};
