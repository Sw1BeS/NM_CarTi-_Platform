import { prisma } from '../../../../../services/prisma.js';
import type { PipelineContext } from '../../core/types.js';
import { resolveLang, t, button } from '../../core/utils/telegramText.js';
import { telegramOutbox } from '../../messaging/outbox/telegramOutbox.js';
import { ActionTokens, buildCallbackData } from '../../core/utils/callbackUtils.js';
import {
  containsForbiddenContacts,
  normalizePhoneUA,
  parseBudgetUSD,
  parseMileageKm,
  parseYearInput
} from '../../core/utils/inputValidators.js';
import { buildFuelKeyboard, FUEL_OPTIONS, pickFromList } from '../../core/utils/quickPicks.js';
import { renderB2bChannelPost } from '../../../../../services/cardRenderer.js';
import { normalizeBotConfigChatId } from '../../core/utils/telegramChatId.js';
import { quotaService } from '../../../../../services/quota.service.js';
import { getEnvInt } from '../../../../../services/featureFlags.js';
import { publicIdService } from '../../../../../services/publicId.service.js';

type B2BRequestDraft = {
  step: number;
  data: {
    brand?: string;
    model?: string;
    yearMin?: number | null;
    yearMax?: number | null;
    budgetMax?: number | null;
    mileageMax?: number | null;
    fuel?: string | null;
    note?: string | null;
    contact?: string | null;
  };
  history: string[];
  reviewMode?: boolean;
};

const TOTAL_STEPS = 8;
const DAILY_LIMIT = Math.max(1, getEnvInt('B2B_REQUEST_DAILY_LIMIT', 10));
const toText = (value: unknown) => String(value || '').trim();
const stepHeader = (step: number) => `Крок ${step}/${TOTAL_STEPS}`;
const stepState: Record<number, string> = {
  1: 'BQ_BRAND',
  2: 'BQ_MODEL',
  3: 'BQ_YEAR',
  4: 'BQ_BUDGET',
  5: 'BQ_MILEAGE',
  6: 'BQ_FUEL',
  7: 'BQ_NOTE',
  8: 'BQ_CONTACT',
  9: 'BQ_REVIEW'
};

const isBackIntent = (text: string, lang: ReturnType<typeof resolveLang>) => {
  const normalized = toText(text).toLowerCase();
  return normalized === toText(button(lang, 'common.back')).toLowerCase() || normalized === 'назад' || normalized === 'back';
};

const resolveBackStepFromState = (state: string): number | 'menu' => {
  const map: Record<string, number | 'menu'> = {
    BQ_BRAND: 'menu',
    BQ_MODEL: 1,
    BQ_YEAR: 2,
    BQ_BUDGET: 3,
    BQ_MILEAGE: 4,
    BQ_FUEL: 5,
    BQ_NOTE: 6,
    BQ_CONTACT: 7,
    BQ_REVIEW: 8
  };
  return map[state] ?? 'menu';
};

const isAllowedActionForState = (state: string, action: string) => {
  if (action === ActionTokens.LB_CANCEL) return true;
  if (!state.startsWith('BQ_')) return false;
  if (action.startsWith('bq_back_')) return true;
  if (action === ActionTokens.BQ_PUB || action === 'bq_edit' || action === 'bq_j') return state === 'BQ_REVIEW';
  const allowByState: Record<string, string[]> = {
    BQ_BRAND: [],
    BQ_MODEL: [],
    BQ_YEAR: ['bq_skip_year'],
    BQ_BUDGET: ['bq_s_bg', 'bq_skip_budget'],
    BQ_MILEAGE: ['bq_s_ml', 'bq_skip_mileage'],
    BQ_FUEL: ['bq_fu'],
    BQ_NOTE: ['bq_skip_note'],
    BQ_CONTACT: [],
    BQ_REVIEW: [ActionTokens.BQ_PUB, 'bq_edit', 'bq_j']
  };
  return (allowByState[state] || []).includes(action);
};

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

const sendRegisteredMenu = async (ctx: PipelineContext, notice?: string) => {
  const lang = resolveLang(ctx);
  if (notice) {
    await sendMessage(ctx, notice, { remove_keyboard: true });
  }
  await sendMessage(ctx, t(lang, 'b2b.menu_title_registered'), {
    keyboard: [
      [{ text: button(lang, 'b2bMenu.newRequest') }, { text: button(lang, 'b2bMenu.sell') }],
      [{ text: button(lang, 'b2bMenu.myInventory') }, { text: button(lang, 'common.info') }]
    ],
    resize_keyboard: true
  });
};

const resolveBotUsername = async (ctx: PipelineContext) => {
  let botUsername = String((ctx.bot?.config as any)?.botUsername || (ctx.bot?.config as any)?.username || '').trim();
  if (botUsername || !ctx.bot) return botUsername;

  try {
    const getMeResp = await fetch(`https://api.telegram.org/bot${ctx.bot.token}/getMe`);
    const getMeData = await getMeResp.json();
    if (!getMeData.ok || !getMeData.result?.username) return '';
    botUsername = String(getMeData.result.username).trim();

    await prisma.botConfig.update({
      where: { id: ctx.bot.id },
      data: {
        config: {
          ...((ctx.bot.config as any) || {}),
          botUsername,
          username: botUsername
        } as any
      }
    }).catch(() => null);
  } catch {
    return '';
  }

  return botUsername;
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
      brand: toText(legacy.brand || ''),
      model: toText(legacy.model || ''),
      yearMin: legacy.yearMin || null,
      yearMax: legacy.yearMax || null,
      budgetMax: legacy.budget || null,
      mileageMax: legacy.mileage || null,
      fuel: legacy.fuel || null,
      note: legacy.note || null,
      contact: legacy.contact || null
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
      state: state || stepState[draft.step] || `BQ_STEP_${draft.step}`,
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
    draft.step = 9;
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
    await persistDraft(ctx, draft, 'BQ_BRAND');
    await sendMessage(ctx, `${stepHeader(1)}\nВкажіть марку авто:`, {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_0') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 2) {
    await persistDraft(ctx, draft, 'BQ_MODEL');
    await sendMessage(ctx, `${stepHeader(2)}\nВкажіть модель авто:`, {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_1') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 3) {
    await persistDraft(ctx, draft, 'BQ_YEAR');
    await sendMessage(ctx, `${stepHeader(3)}\nВкажіть рік (необовʼязково).\n${t(lang, 'common.step_hint_year')}`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bq_skip_year') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_2') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 4) {
    await persistDraft(ctx, draft, 'BQ_BUDGET');
    await sendMessage(ctx, `${stepHeader(4)}\nВкажіть бюджет (необовʼязково).\n${t(lang, 'common.step_hint_budget')}`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bq_s_bg') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_3') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 5) {
    await persistDraft(ctx, draft, 'BQ_MILEAGE');
    await sendMessage(ctx, `${stepHeader(5)}\nВкажіть пробіг (необовʼязково).\n${t(lang, 'common.step_hint_mileage')}`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bq_s_ml') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_4') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 6) {
    await persistDraft(ctx, draft, 'BQ_FUEL');
    await sendMessage(ctx, `${stepHeader(6)}\nОберіть паливо (необовʼязково):`, {
      inline_keyboard: buildFuelKeyboard(lang, {
        action: 'bq_fu',
        backAction: 'bq_back_5',
        cancelAction: ActionTokens.LB_CANCEL
      })
    });
    return;
  }

  if (draft.step === 7) {
    await persistDraft(ctx, draft, 'BQ_NOTE');
    await sendMessage(ctx, `${stepHeader(7)}\nДодайте примітку (необовʼязково, без контактів):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bq_skip_note') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_6') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 8) {
    await persistDraft(ctx, draft, 'BQ_CONTACT');
    if (String(ctx.chatType || '') === 'private') {
      await sendMessage(ctx, `${stepHeader(8)}\nДодайте контакт для адміністратора:`, {
        keyboard: [
          [{ text: button(lang, 'common.shareContact'), request_contact: true }],
          [{ text: button(lang, 'common.back') }, { text: button(lang, 'common.cancel') }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      });
    } else {
      await sendMessage(ctx, `${stepHeader(8)}\nВведіть контакт вручну:`, {
        inline_keyboard: [[
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bq_back_7') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]]
      });
    }
    return;
  }

  await persistDraft(ctx, draft, 'BQ_REVIEW');
  const partnerCtx = await resolvePartnerContext(ctx);
  const summary = [
    `🚗 ${toText(draft.data.brand)} ${toText(draft.data.model)}`.trim(),
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
      [{ text: `Марка: ${draft.data.brand || '—'}`, callback_data: buildCallbackData('bq_j', '1') }],
      [{ text: `Модель: ${draft.data.model || '—'}`, callback_data: buildCallbackData('bq_j', '2') }],
      [{ text: `Рік: ${yearLabel(draft)}`, callback_data: buildCallbackData('bq_j', '3') }],
      [{ text: `Бюджет: ${draft.data.budgetMax ? `до ${draft.data.budgetMax} USD` : '—'}`, callback_data: buildCallbackData('bq_j', '4') }],
      [{ text: `Пробіг: ${draft.data.mileageMax ? `до ${draft.data.mileageMax} км` : '—'}`, callback_data: buildCallbackData('bq_j', '5') }],
      [{ text: `Паливо: ${draft.data.fuel || '—'}`, callback_data: buildCallbackData('bq_j', '6') }],
      [{ text: `Примітка: ${draft.data.note || '—'}`, callback_data: buildCallbackData('bq_j', '7') }],
      [{ text: `Контакт: ${draft.data.contact || '—'}`, callback_data: buildCallbackData('bq_j', '8') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

export const startB2BRequestWizard = async (ctx: PipelineContext) => {
  const draft: B2BRequestDraft = {
    step: 1,
    data: {
      brand: '',
      model: ''
    },
    history: []
  };
  await routeStep(ctx, draft);
};

const publishRequest = async (ctx: PipelineContext, draft: B2BRequestDraft) => {
  if (!ctx.bot) return;
  const partnerCtx = await resolvePartnerContext(ctx);
  const from = ctx.update?.callback_query?.from || ctx.update?.message?.from;
  const tgUserId = String(from?.id || ctx.userId || ctx.chatId || '').trim();
  const displayName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || 'Партнер';
  const username = from?.username ? `@${from.username}` : '—';
  const profileLink = from?.username ? `https://t.me/${from.username}` : `tg://user?id=${tgUserId || ctx.chatId || ''}`;

  if (tgUserId) {
    const quota = await quotaService.consume({
      companyId: ctx.companyId || null,
      botId: ctx.bot.id,
      tgUserId,
      scope: 'b2b.request.submit.day',
      limit: DAILY_LIMIT,
      period: 'day'
    });
    if (!quota.allowed) {
      await sendMessage(ctx, `⛔️ Досягнуто ліміт запитів на добу (${DAILY_LIMIT}). Спробуйте завтра.`);
      await clearDraft(ctx);
      return;
    }
  }

  const title = `${toText(draft.data.brand)} ${toText(draft.data.model)}`.trim() || 'Автозапит';
  const publicId = await publicIdService.nextB2bRequestId('CD');
  const request = await prisma.b2bRequest.create({
    data: {
      publicId,
      companyId: ctx.companyId || null,
      botId: ctx.bot.id,
      requesterPartnerId: partnerCtx?.partnerId || null,
      title,
      yearMin: draft.data.yearMin || null,
      yearMax: draft.data.yearMax || null,
      budgetMax: draft.data.budgetMax || null,
      payload: {
        source: 'b2b_bot',
        contact: draft.data.contact || null,
        request: {
          brand: draft.data.brand || null,
          model: draft.data.model || null,
          yearMin: draft.data.yearMin || null,
          yearMax: draft.data.yearMax || null,
          budgetMax: draft.data.budgetMax || null,
          mileageMax: draft.data.mileageMax || null,
          fuel: draft.data.fuel || null,
          comment: draft.data.note || null,
          contact: draft.data.contact || null,
          companyName: partnerCtx?.partnerName || 'Партнер',
          clientChatId: String(ctx.chatId || '')
        }
      } as any,
      description: draft.data.note || null,
      status: 'COLLECTING_VARIANTS'
    }
  });

  const channelId = normalizeBotConfigChatId(ctx.bot.channelId);
  if (channelId) {
    const botUsername = await resolveBotUsername(ctx);
    const responseUrl = botUsername
      ? `https://t.me/${botUsername}?start=b2bv_${request.publicId || request.id}`
      : undefined;
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
    }, { responseUrl });

    await telegramOutbox.sendMessage({
      botId: ctx.bot.id,
      token: ctx.bot.token,
      chatId: String(channelId),
      text,
      replyMarkup,
      companyId: ctx.companyId
    }).catch(() => null);
  }

  if (ctx.bot.adminChatId) {
    await sendMessage(ctx, [
      '🔵 [B2B REQUEST]',
      `👤 ${displayName}`,
      `username: ${username}`,
      `tgUserId: ${tgUserId || '—'}`,
      `🔗 ${profileLink}`,
      `Запит: ${title}`,
      `Компанія: ${partnerCtx?.partnerName || 'Партнер'}`,
      `Контакт: ${draft.data.contact || '—'}`
    ].join('\n'), undefined, String(ctx.bot.adminChatId));
  }

  await clearDraft(ctx);
  await sendMessage(ctx, '✅ Запит опубліковано в каналі. Очікуйте варіанти.', { remove_keyboard: true });
};

export const handleB2BReqCallback = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
  const vars = (ctx.session?.variables as any) || {};
  const hasDraft = Boolean(vars.b2bRequestDraft && typeof vars.b2bRequestDraft === 'object');
  const state = String(ctx.session?.state || '');
  if (!hasDraft && !state.startsWith('BQ_') && action !== ActionTokens.LB_CANCEL) {
    await sendMessage(ctx, '⚠️ Сесія запиту неактивна. Натисніть «Створити запит».');
    return true;
  }

  const draft = readDraft(ctx);
  const lang = resolveLang(ctx);

  if (action === ActionTokens.LB_CANCEL) {
    await clearDraft(ctx);
    await sendMessage(ctx, t(lang, 'cancelled'), { remove_keyboard: true });
    return true;
  }

  if (!isAllowedActionForState(state, action)) {
    await sendMessage(ctx, '⚠️ Ця дія недоступна на поточному кроці.');
    return true;
  }

  if (action.startsWith('bq_back_')) {
    const step = Number(action.replace('bq_back_', ''));
    if (Number.isFinite(step) && step === 0) {
      await clearDraft(ctx);
      await sendRegisteredMenu(ctx);
      return true;
    }
    if (Number.isFinite(step) && step >= 1) {
      draft.step = step;
      await routeStep(ctx, draft);
    }
    return true;
  }

  if (action === 'bq_skip_year') {
    draft.data.yearMin = null;
    draft.data.yearMax = null;
    await moveToNextOrReview(ctx, draft, 4);
    return true;
  }

  if (action === 'bq_s_bg' || action === 'bq_skip_budget') {
    draft.data.budgetMax = null;
    await moveToNextOrReview(ctx, draft, 5);
    return true;
  }

  if (action === 'bq_s_ml' || action === 'bq_skip_mileage') {
    draft.data.mileageMax = null;
    await moveToNextOrReview(ctx, draft, 6);
    return true;
  }

  if (action === 'bq_skip_note') {
    draft.data.note = null;
    await moveToNextOrReview(ctx, draft, 8);
    return true;
  }

  if (action === 'bq_edit') {
    await showEditFields(ctx, draft);
    return true;
  }

  if (action === 'bq_j') {
    const step = Number(toText(payload));
    if (!Number.isFinite(step) || step < 1 || step > 8) return true;
    draft.step = step;
    draft.reviewMode = true;
    await routeStep(ctx, draft);
    return true;
  }

  if (action === 'bq_fu') {
    if (payload === 'SKIP') {
      draft.data.fuel = null;
    } else {
      draft.data.fuel = pickFromList(FUEL_OPTIONS, payload) || toText(payload) || null;
    }
    await moveToNextOrReview(ctx, draft, 7);
    return true;
  }

  if (action === ActionTokens.BQ_PUB) {
    await publishRequest(ctx, draft);
    return true;
  }

  return false;
};

export const handleB2BReqText = async (ctx: PipelineContext, text: string): Promise<boolean> => {
  const state = String(ctx.session?.state || '');
  const lang = resolveLang(ctx);
  const vars = (ctx.session?.variables as any) || {};
  const hasDraft = Boolean(vars.b2bRequestDraft && typeof vars.b2bRequestDraft === 'object');
  if (state.startsWith('BQ_') && !hasDraft) {
    await clearDraft(ctx);
    await sendMessage(ctx, '⚠️ Сесія запиту втрачена. Почнімо заново.');
    return true;
  }
  const draft = readDraft(ctx);
  const message = ctx.update?.message;

  if (state.startsWith('BQ_') && isBackIntent(text, lang)) {
    const back = resolveBackStepFromState(state);
    if (back === 'menu') {
      await clearDraft(ctx);
      await sendRegisteredMenu(ctx);
      return true;
    }
    draft.step = back;
    await routeStep(ctx, draft);
    return true;
  }

  if (state === 'BQ_BRAND') {
    const value = toText(text);
    if (value.length < 2) {
      await sendMessage(ctx, '⚠️ Вкажіть марку (мінімум 2 символи).');
      return true;
    }
    draft.data.brand = value;
    await moveToNextOrReview(ctx, draft, 2);
    return true;
  }

  if (state === 'BQ_MODEL') {
    const value = toText(text);
    if (value.length < 1) {
      await sendMessage(ctx, '⚠️ Вкажіть модель.');
      return true;
    }
    draft.data.model = value;
    await moveToNextOrReview(ctx, draft, 3);
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
    await moveToNextOrReview(ctx, draft, 4);
    return true;
  }

  if (state === 'BQ_BUDGET') {
    const parsed = parseBudgetUSD(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_budget'));
      return true;
    }
    draft.data.budgetMax = parsed;
    await moveToNextOrReview(ctx, draft, 5);
    return true;
  }

  if (state === 'BQ_MILEAGE') {
    const parsed = parseMileageKm(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_mileage'));
      return true;
    }
    draft.data.mileageMax = parsed;
    await moveToNextOrReview(ctx, draft, 6);
    return true;
  }

  if (state === 'BQ_NOTE') {
    if (containsForbiddenContacts(text)) {
      await sendMessage(ctx, t(lang, 'common.err.contacts_forbidden'));
      return true;
    }
    draft.data.note = toText(text) || null;
    await moveToNextOrReview(ctx, draft, 8);
    return true;
  }

  if (state === 'BQ_CONTACT') {
    if (message?.contact?.user_id && message?.from?.id && String(message.contact.user_id) !== String(message.from.id)) {
      await sendMessage(ctx, '⚠️ Поділіться, будь ласка, саме своїм контактом через кнопку Telegram.');
      return true;
    }
    const source = message?.contact?.phone_number || text;
    const normalized = normalizePhoneUA(source);
    if (!normalized) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_phone'));
      return true;
    }
    draft.data.contact = normalized;
    await moveToNextOrReview(ctx, draft, 9);
    return true;
  }

  if (state.startsWith('BQ_')) {
    await sendMessage(ctx, 'Використайте кнопки під повідомленням або «❌ Скасувати».');
    return true;
  }

  return false;
};
