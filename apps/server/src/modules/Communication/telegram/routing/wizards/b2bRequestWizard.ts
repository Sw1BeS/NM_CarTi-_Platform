import { prisma } from '../../../../../services/prisma.js';
import type { PipelineContext } from '../../core/types.js';
import { resolveLang, t, button } from '../../core/utils/telegramText.js';
import { telegramOutbox } from '../../messaging/outbox/telegramOutbox.js';
import { ActionTokens, buildCallbackData } from '../../core/utils/callbackUtils.js';
import { containsForbiddenContacts, parseBudgetUSD, parseMileageKm, parseYearInput } from '../../core/utils/inputValidators.js';
import { buildFuelKeyboard, FUEL_OPTIONS, pickFromList } from '../../core/utils/quickPicks.js';
import { renderB2bChannelPost } from '../../../../../services/cardRenderer.js';
import { normalizeBotConfigChatId } from '../../core/utils/telegramChatId.js';

type B2BRequestDraft = {
  step: number;
  data: {
    title?: string;
    yearMin?: number | null;
    yearMax?: number | null;
    budgetMax?: number | null;
    mileageMax?: number | null;
    fuel?: string | null;
    note?: string | null;
  };
  history: string[];
  reviewMode?: boolean;
};

const toText = (value: unknown) => String(value || '').trim();

const sendMessage = async (ctx: PipelineContext, text: string, replyMarkup?: any, targetChatId?: string) => {
  if (!ctx.bot) return;
  const chatId = targetChatId || ctx.chatId;
  if (!chatId) return;
  await telegramOutbox.sendMessage({
    botId: ctx.bot.id,
    token: ctx.bot.token,
    chatId,
    text,
    replyMarkup,
    companyId: ctx.companyId
  });
};

const readDraft = (ctx: PipelineContext): B2BRequestDraft => {
  const vars = (ctx.session?.variables as any) || {};
  const draft = vars.b2bRequestDraft as B2BRequestDraft | undefined;
  if (draft && typeof draft === 'object') {
    return {
      step: Number(draft.step || 1),
      data: { ...(draft.data || {}) },
      history: Array.isArray(draft.history) ? draft.history : [],
      reviewMode: Boolean(draft.reviewMode)
    };
  }

  const legacy = vars.b2bReqFlow || {};
  return {
    step: Number(legacy.step || 1),
    data: {
      title: legacy.title,
      yearMin: legacy.yearMin || null,
      yearMax: legacy.yearMax || null,
      budgetMax: legacy.budget || null,
      mileageMax: legacy.mileage || null,
      fuel: legacy.fuel || null,
      note: legacy.note || null
    },
    history: [],
    reviewMode: false
  };
};

const persistDraft = async (ctx: PipelineContext, draft: B2BRequestDraft, state?: string) => {
  if (!ctx.session) return;
  const vars = (ctx.session.variables as any) || {};
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: state || `BQ_STEP_${draft.step}`,
      variables: {
        ...vars,
        b2bRequestDraft: draft,
        b2bReqFlow: null
      },
      lastActive: new Date()
    }
  });
};

const clearDraft = async (ctx: PipelineContext) => {
  if (!ctx.session) return;
  const vars = (ctx.session.variables as any) || {};
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: 'B2B_MENU',
      variables: {
        ...vars,
        b2bRequestDraft: null,
        b2bReqFlow: null
      },
      lastActive: new Date()
    }
  });
};

const resolvePartnerContext = async (ctx: PipelineContext) => {
  const vars = (ctx.session?.variables as any) || {};
  const tgUserId = String(ctx.update?.callback_query?.from?.id || ctx.update?.message?.from?.id || ctx.userId || '').trim();

  if (vars.b2bPartnerId && vars.b2bPartnerName) {
    return {
      partnerId: String(vars.b2bPartnerId),
      partnerName: String(vars.b2bPartnerName)
    };
  }

  if (!tgUserId) return null;
  const partnerUser = await prisma.partnerUser.findFirst({
    where: {
      telegramId: tgUserId,
      ...(ctx.companyId ? { companyId: ctx.companyId } : {})
    },
    include: {
      partner: true
    }
  });
  if (!partnerUser?.partner?.id) return null;

  return {
    partnerId: partnerUser.partner.id,
    partnerName: partnerUser.partner.name || 'Партнер'
  };
};

const yearLabel = (draft: B2BRequestDraft) => {
  if (draft.data.yearMin && draft.data.yearMax && draft.data.yearMin !== draft.data.yearMax) {
    return `${draft.data.yearMin}-${draft.data.yearMax}`;
  }
  if (draft.data.yearMin) return String(draft.data.yearMin);
  return '—';
};

const moveToNextOrReview = async (ctx: PipelineContext, draft: B2BRequestDraft, nextStep: number) => {
  if (draft.reviewMode) {
    draft.reviewMode = false;
    draft.step = 7;
    await routeStep(ctx, draft);
    return;
  }
  draft.step = nextStep;
  await routeStep(ctx, draft);
};

const routeStep = async (ctx: PipelineContext, draft: B2BRequestDraft) => {
  const lang = resolveLang(ctx);

  if (draft.step <= 1) {
    draft.step = 1;
    await persistDraft(ctx, draft, 'BQ_TITLE');
    await sendMessage(ctx, 'Крок 1/6\nВкажіть що шукаєте (марка/модель):', {
      inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
    });
    return;
  }

  if (draft.step === 2) {
    await persistDraft(ctx, draft, 'BQ_YEAR');
    await sendMessage(ctx, `Крок 2/6\nВкажіть рік (необовʼязково).\n${t(lang, 'common.step_hint_year')}`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bq_skip_year') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_1') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 3) {
    await persistDraft(ctx, draft, 'BQ_BUDGET');
    await sendMessage(ctx, `Крок 3/6\nВкажіть бюджет (необовʼязково).\n${t(lang, 'common.step_hint_budget')}`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bq_skip_budget') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_2') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 4) {
    await persistDraft(ctx, draft, 'BQ_MILEAGE');
    await sendMessage(ctx, `Крок 4/6\nВкажіть пробіг (необовʼязково).\n${t(lang, 'common.step_hint_mileage')}`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bq_skip_mileage') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_3') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 5) {
    await persistDraft(ctx, draft, 'BQ_FUEL');
    await sendMessage(ctx, 'Крок 5/6\nОберіть паливо (необовʼязково):', {
      inline_keyboard: [
        ...buildFuelKeyboard(lang),
        [{ text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_4') }]
      ]
    });
    return;
  }

  if (draft.step === 6) {
    await persistDraft(ctx, draft, 'BQ_NOTE');
    await sendMessage(ctx, 'Крок 6/6\nДодайте примітку (без контактів):', {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bq_skip_note') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_5') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  await persistDraft(ctx, draft, 'BQ_REVIEW');
  const partnerCtx = await resolvePartnerContext(ctx);
  const summary = [
    `🚗 ${draft.data.title || '—'}`,
    `📅 Рік: ${yearLabel(draft)}`,
    `💰 Бюджет: ${draft.data.budgetMax ? `до ${draft.data.budgetMax} USD` : '—'}`,
    `🛣 Пробіг: ${draft.data.mileageMax ? `до ${draft.data.mileageMax} км` : '—'}`,
    `⛽ Паливо: ${draft.data.fuel || '—'}`,
    `📝 Примітка: ${draft.data.note || '—'}`,
    `🏢 Хто шукає: ${partnerCtx?.partnerName || 'Ваш майданчик'}`
  ].join('\n');

  await sendMessage(ctx, t(lang, 'b2b.request.review.title', { summary }), {
    inline_keyboard: [
      [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData(ActionTokens.BQ_PUB) }],
      [{ text: button(lang, 'common.edit'), callback_data: buildCallbackData('bq_edit') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const showEditFields = async (ctx: PipelineContext, draft: B2BRequestDraft) => {
  const lang = resolveLang(ctx);
  await persistDraft(ctx, draft, 'BQ_REVIEW');
  await sendMessage(ctx, '✏️ Оберіть поле для зміни:', {
    inline_keyboard: [
      [{ text: `Що шукаєте: ${draft.data.title || '—'}`, callback_data: buildCallbackData('bq_j', '1') }],
      [{ text: `Рік: ${yearLabel(draft)}`, callback_data: buildCallbackData('bq_j', '2') }],
      [{ text: `Бюджет: ${draft.data.budgetMax ? `до ${draft.data.budgetMax} USD` : '—'}`, callback_data: buildCallbackData('bq_j', '3') }],
      [{ text: `Пробіг: ${draft.data.mileageMax ? `до ${draft.data.mileageMax} км` : '—'}`, callback_data: buildCallbackData('bq_j', '4') }],
      [{ text: `Паливо: ${draft.data.fuel || '—'}`, callback_data: buildCallbackData('bq_j', '5') }],
      [{ text: `Примітка: ${draft.data.note || '—'}`, callback_data: buildCallbackData('bq_j', '6') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

export const startB2BRequestWizard = async (ctx: PipelineContext) => {
  const draft: B2BRequestDraft = {
    step: 1,
    data: {},
    history: []
  };
  await routeStep(ctx, draft);
};

const publishRequest = async (ctx: PipelineContext, draft: B2BRequestDraft) => {
  if (!ctx.bot) return;

  const partnerCtx = await resolvePartnerContext(ctx);
  const request = await prisma.b2bRequest.create({
    data: {
      companyId: ctx.companyId || null,
      botId: ctx.bot.id,
      requesterPartnerId: partnerCtx?.partnerId || null,
      title: draft.data.title || 'Автозапит',
      yearMin: draft.data.yearMin || null,
      yearMax: draft.data.yearMax || null,
      budgetMax: draft.data.budgetMax || null,
      payload: {
        source: 'b2b_bot',
        request: {
          title: draft.data.title || null,
          yearMin: draft.data.yearMin || null,
          yearMax: draft.data.yearMax || null,
          budgetMax: draft.data.budgetMax || null,
          mileageMax: draft.data.mileageMax || null,
          fuel: draft.data.fuel || null,
          comment: draft.data.note || null,
          companyName: partnerCtx?.partnerName || 'Партнер'
        }
      } as any,
      description: draft.data.note || null,
      status: 'COLLECTING_VARIANTS'
    }
  });

  const channelId = normalizeBotConfigChatId(ctx.bot.channelId);
  if (channelId) {
    const { text, replyMarkup } = renderB2bChannelPost({
      ...request,
      payload: {
        ...(request.payload as any || {}),
        request: {
          ...((request.payload as any)?.request || {}),
          companyName: partnerCtx?.partnerName || 'Партнер'
        },
        companyName: partnerCtx?.partnerName || 'Партнер'
      }
    });

    await telegramOutbox.sendMessage({
      botId: ctx.bot.id,
      token: ctx.bot.token,
      chatId: String(channelId),
      text,
      replyMarkup,
      companyId: ctx.companyId
    }).catch(() => null);
  }

  await clearDraft(ctx);
  await sendMessage(ctx, '✅ Запит опубліковано в каналі. Очікуйте варіанти.', { remove_keyboard: true });
};

export const handleB2BReqCallback = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
  const draft = readDraft(ctx);
  const lang = resolveLang(ctx);

  if (action === ActionTokens.LB_CANCEL) {
    await clearDraft(ctx);
    await sendMessage(ctx, t(lang, 'cancelled'), { remove_keyboard: true });
    return true;
  }

  if (action.startsWith('bq_back_')) {
    const step = Number(action.replace('bq_back_', ''));
    if (Number.isFinite(step) && step >= 1) {
      draft.step = step;
      await routeStep(ctx, draft);
    }
    return true;
  }

  if (action === 'bq_skip_year') {
    draft.data.yearMin = null;
    draft.data.yearMax = null;
    await moveToNextOrReview(ctx, draft, 3);
    return true;
  }

  if (action === 'bq_skip_budget') {
    draft.data.budgetMax = null;
    await moveToNextOrReview(ctx, draft, 4);
    return true;
  }

  if (action === 'bq_skip_mileage') {
    draft.data.mileageMax = null;
    await moveToNextOrReview(ctx, draft, 5);
    return true;
  }

  if (action === 'bq_skip_note') {
    draft.data.note = null;
    await moveToNextOrReview(ctx, draft, 7);
    return true;
  }

  if (action === 'bq_edit') {
    await showEditFields(ctx, draft);
    return true;
  }

  if (action === 'bq_j') {
    const step = Number(toText(payload));
    if (!Number.isFinite(step) || step < 1 || step > 6) return true;
    draft.step = step;
    draft.reviewMode = true;
    await routeStep(ctx, draft);
    return true;
  }

  if (action === 'lb_e_fu') {
    if (payload === 'SKIP') {
      draft.data.fuel = null;
    } else {
      draft.data.fuel = pickFromList(FUEL_OPTIONS, payload) || toText(payload) || null;
    }
    await moveToNextOrReview(ctx, draft, 6);
    return true;
  }

  if (action === ActionTokens.BQ_PUB) {
    await publishRequest(ctx, draft);
    return true;
  }

  return false;
};

export const handleB2BReqText = async (ctx: PipelineContext, text: string): Promise<boolean> => {
  const draft = readDraft(ctx);
  const state = String(ctx.session?.state || '');
  const lang = resolveLang(ctx);

  if (state === 'BQ_TITLE') {
    const value = toText(text);
    if (value.length < 2) {
      await sendMessage(ctx, '⚠️ Введіть марку/модель (мінімум 2 символи).');
      return true;
    }
    draft.data.title = value;
    await moveToNextOrReview(ctx, draft, 2);
    return true;
  }

  if (state === 'BQ_YEAR') {
    const parsed = parseYearInput(text);
    if (!parsed) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_year'));
      return true;
    }
    draft.data.yearMin = parsed.min;
    draft.data.yearMax = parsed.max;
    await moveToNextOrReview(ctx, draft, 3);
    return true;
  }

  if (state === 'BQ_BUDGET') {
    const parsed = parseBudgetUSD(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_budget'));
      return true;
    }
    draft.data.budgetMax = parsed;
    await moveToNextOrReview(ctx, draft, 4);
    return true;
  }

  if (state === 'BQ_MILEAGE') {
    const parsed = parseMileageKm(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_mileage'));
      return true;
    }
    draft.data.mileageMax = parsed;
    await moveToNextOrReview(ctx, draft, 5);
    return true;
  }

  if (state === 'BQ_NOTE') {
    if (containsForbiddenContacts(text)) {
      await sendMessage(ctx, t(lang, 'common.err.contacts_forbidden'));
      return true;
    }
    draft.data.note = toText(text) || null;
    await moveToNextOrReview(ctx, draft, 7);
    return true;
  }

  return false;
};
