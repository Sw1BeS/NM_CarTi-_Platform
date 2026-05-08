import { prisma } from '../../../../../services/prisma.js';
import type { PipelineContext } from '../../core/types.js';
import { resolveLang, t, button } from '../../core/utils/telegramText.js';
import { telegramOutbox } from '../../messaging/outbox/telegramOutbox.js';
import { ActionTokens, buildCallbackData } from '../../core/utils/callbackUtils.js';
import { containsForbiddenContacts, normalizePhoneUA, parseBudgetUSD, parseMileageKm, parseYearInput } from '../../core/utils/inputValidators.js';

type VariantDraft = {
  step: number;
  requestId: string;
  requestPublicId: string;
  data: {
    photos: string[];
    year?: number | null;
    mileage?: number | null;
    price?: number | null;
    vin?: string | null;
    condition?: string | null;
    note?: string | null;
    contact?: string | null;
  };
  history: string[];
  reviewMode?: boolean;
};

const TOTAL_STEPS = 8;
const toText = (value: unknown) => String(value || '').trim();
const stepHeader = (step: number) => `Крок ${step}/${TOTAL_STEPS}`;

const isBackIntent = (text: string, lang: ReturnType<typeof resolveLang>) => {
  const normalized = toText(text).toLowerCase();
  return normalized === toText(button(lang, 'common.back')).toLowerCase() || normalized === 'назад' || normalized === 'back';
};

const resolveBackStepFromState = (state: string): number | 'menu' => {
  const map: Record<string, number | 'menu'> = {
    BV_PHOTO: 'menu',
    BV_YEAR: 1,
    BV_MILEAGE: 2,
    BV_PRICE: 3,
    BV_VIN: 4,
    BV_CONDITION: 5,
    BV_NOTE: 6,
    BV_CONTACT: 7,
    BV_REVIEW: 8
  };
  return map[state] ?? 'menu';
};

const isAllowedActionForState = (state: string, action: string) => {
  if (action === ActionTokens.LB_CANCEL) return true;
  if (!state.startsWith('BV_')) return false;
  if (action.startsWith('bv_back_')) return true;
  if (action === 'bv_edit' || action === 'bv_j' || action === ActionTokens.BV_SEND) return state === 'BV_REVIEW';
  if (action === ActionTokens.BV_FIT || action === ActionTokens.BV_NFIT) return true;

  const allowByState: Record<string, string[]> = {
    BV_PHOTO: ['bv_dphoto', 'bv_done_photo'],
    BV_YEAR: ['bv_skip_year'],
    BV_MILEAGE: ['bv_s_ml', 'bv_skip_mileage'],
    BV_PRICE: ['bv_s_pr', 'bv_skip_price'],
    BV_VIN: ['bv_skip_vin'],
    BV_CONDITION: ['bv_s_cond', 'bv_skip_condition'],
    BV_NOTE: ['bv_skip_note'],
    BV_CONTACT: [],
    BV_REVIEW: [ActionTokens.BV_SEND, 'bv_edit', 'bv_j']
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

const readRequestContact = (request: any) => {
  const payload = (request?.payload || {}) as Record<string, any>;
  const nested = (payload.request || {}) as Record<string, any>;
  return toText(request?.contact)
    || toText(payload.contact)
    || toText(payload.phone)
    || toText(nested.contact)
    || toText(nested.phone);
};

const handleRequesterVariantDecision = async (
  ctx: PipelineContext,
  variantId: string,
  decision: 'FIT' | 'NOT_FIT'
) => {
  const variant = await prisma.requestVariant.findUnique({
    where: { id: variantId },
    include: { request: true, sellerPartner: true }
  });
  if (!variant?.request) {
    await sendMessage(ctx, '⚠️ Варіант не знайдено.');
    return true;
  }

  const isFit = decision === 'FIT';
  await prisma.requestVariant.update({
    where: { id: variant.id },
    data: {
      requesterDecision: isFit ? 'FIT' : 'NOT_FIT',
      requesterDecisionAt: new Date(),
      status: isFit ? 'APPROVED' : 'REJECTED',
      fitQueueStatus: isFit ? 'NEW' : null,
      fitQueuedAt: isFit ? new Date() : null
    }
  });

  await sendMessage(ctx, isFit ? '✅ Позначено як «Підходить».' : '❌ Позначено як «Не підходить».');

  if (isFit && ctx.bot?.adminChatId) {
    const actor = ctx.update?.callback_query?.from || ctx.update?.message?.from;
    const actorTgUserId = String(actor?.id || ctx.userId || ctx.chatId || '');
    const actorDisplayName = [actor?.first_name, actor?.last_name].filter(Boolean).join(' ').trim() || 'Користувач';
    const actorUsername = actor?.username ? `@${actor.username}` : '—';
    const actorLink = actor?.username ? `https://t.me/${actor.username}` : `tg://user?id=${actorTgUserId}`;
    const requesterContact = readRequestContact(variant.request);
    const sellerContact = toText(variant.contact || (variant.sellerPartner as any)?.contact);
    await sendMessage(ctx, [
      '🔥 [FIT]',
      `👤 ${actorDisplayName}`,
      `username: ${actorUsername}`,
      `tgUserId: ${actorTgUserId || '—'}`,
      `🔗 ${actorLink}`,
      `Запит: #${variant.request.publicId || variant.request.id}`,
      `Варіант: ${variant.title || '—'}`,
      `Ціна: ${variant.price ? `${variant.price} USD` : '—'}`,
      `Компанія продавця: ${variant.sellerPartner?.name || variant.companyName || '—'}`,
      `Контакт автора: ${requesterContact || '—'}`,
      `Контакт продавця: ${sellerContact || '—'}`,
      'Fit queue: NEW'
    ].join('\n'), undefined, String(ctx.bot.adminChatId));
  }

  return true;
};

const readDraft = (ctx: PipelineContext): VariantDraft | null => {
  const vars = (ctx.session?.variables as any) || {};
  const draft = vars.b2bVariantDraft as VariantDraft | undefined;
  if (!draft || typeof draft !== 'object') return null;
  if (!draft.requestId) return null;
  return {
    step: Number(draft.step || 1),
    requestId: draft.requestId,
    requestPublicId: draft.requestPublicId || draft.requestId,
    data: {
      photos: Array.isArray(draft.data?.photos) ? draft.data.photos : [],
      year: typeof draft.data?.year === 'number' ? draft.data.year : null,
      mileage: typeof draft.data?.mileage === 'number' ? draft.data.mileage : null,
      price: typeof draft.data?.price === 'number' ? draft.data.price : null,
      vin: draft.data?.vin || null,
      condition: draft.data?.condition || null,
      note: draft.data?.note || null,
      contact: draft.data?.contact || null
    },
    history: Array.isArray(draft.history) ? draft.history : [],
    reviewMode: Boolean(draft.reviewMode)
  };
};

const persistDraft = async (ctx: PipelineContext, draft: VariantDraft, state?: string) => {
  if (!ctx.session) return;
  const vars = (ctx.session.variables as any) || {};
  const stateMap: Record<number, string> = {
    1: 'BV_PHOTO',
    2: 'BV_YEAR',
    3: 'BV_MILEAGE',
    4: 'BV_PRICE',
    5: 'BV_VIN',
    6: 'BV_CONDITION',
    7: 'BV_NOTE',
    8: 'BV_CONTACT',
    9: 'BV_REVIEW'
  };
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: state || stateMap[draft.step] || `BV_STEP_${draft.step}`,
      variables: {
        ...vars,
        b2bVariantDraft: draft,
        b2bVariant: null
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
        b2bVariantDraft: null,
        b2bVariant: null
      },
      lastActive: new Date()
    }
  });
};

const loadRequestByPublicId = async (publicId: string) => {
  const normalized = toText(publicId);
  if (!normalized) return null;
  return prisma.b2bRequest.findFirst({
    where: {
      OR: [{ publicId: normalized }, { id: normalized }]
    }
  });
};

const moveToNextOrReview = async (ctx: PipelineContext, draft: VariantDraft, nextStep: number) => {
  if (draft.reviewMode) {
    draft.reviewMode = false;
    draft.step = 9;
    await routeStep(ctx, draft);
    return;
  }
  draft.step = nextStep;
  await routeStep(ctx, draft);
};

const routeStep = async (ctx: PipelineContext, draft: VariantDraft) => {
  const lang = resolveLang(ctx);
  if (draft.step <= 1) {
    draft.step = 1;
    await persistDraft(ctx, draft, 'BV_PHOTO');
    const rows: any[][] = [];
    if (draft.data.photos.length > 0) {
      rows.push([{ text: '✅ Завершити фото', callback_data: buildCallbackData('bv_dphoto') }]);
    }
    rows.push([
      { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_0') },
      { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
    ]);
    await sendMessage(ctx, `${stepHeader(1)}\nНадішліть мінімум 1 фото для запиту #${draft.requestPublicId}:`, {
      inline_keyboard: rows
    });
    return;
  }

  if (draft.step === 2) {
    await persistDraft(ctx, draft, 'BV_YEAR');
    await sendMessage(ctx, `${stepHeader(2)}\nВкажіть рік (необовʼязково):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bv_skip_year') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_1') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 3) {
    await persistDraft(ctx, draft, 'BV_MILEAGE');
    await sendMessage(ctx, `${stepHeader(3)}\nВкажіть пробіг (необовʼязково):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bv_s_ml') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_2') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 4) {
    await persistDraft(ctx, draft, 'BV_PRICE');
    await sendMessage(ctx, `${stepHeader(4)}\nВкажіть ціну (необовʼязково):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bv_s_pr') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_3') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 5) {
    await persistDraft(ctx, draft, 'BV_VIN');
    await sendMessage(ctx, `${stepHeader(5)}\nВкажіть VIN (необовʼязково):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bv_skip_vin') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_4') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 6) {
    await persistDraft(ctx, draft, 'BV_CONDITION');
    await sendMessage(ctx, `${stepHeader(6)}\nВкажіть стан авто (необовʼязково):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bv_s_cond') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_5') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 7) {
    await persistDraft(ctx, draft, 'BV_NOTE');
    await sendMessage(ctx, `${stepHeader(7)}\nДодайте примітку (необовʼязково, без контактів):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bv_skip_note') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_6') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 8) {
    await persistDraft(ctx, draft, 'BV_CONTACT');
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
      await sendMessage(ctx, `${stepHeader(8)}\nВведіть контакт вручну:`);
    }
    return;
  }

  await persistDraft(ctx, draft, 'BV_REVIEW');
  const summary = [
    `Запит: #${draft.requestPublicId}`,
    `Фото: ${draft.data.photos.length} шт.`,
    `Рік: ${draft.data.year || '—'}`,
    `Пробіг: ${draft.data.mileage ? `${draft.data.mileage} км` : '—'}`,
    `Ціна: ${draft.data.price ? `${draft.data.price} USD` : '—'}`,
    `VIN: ${draft.data.vin || '—'}`,
    `Стан: ${draft.data.condition || '—'}`,
    `Примітка: ${draft.data.note || '—'}`,
    `Контакт: ${draft.data.contact || '—'}`
  ].join('\n');

  await sendMessage(ctx, t(lang, 'b2b.variant.review.title', { summary }), {
    inline_keyboard: [
      [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData(ActionTokens.BV_SEND) }],
      [{ text: button(lang, 'common.edit'), callback_data: buildCallbackData('bv_edit') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const showEditFields = async (ctx: PipelineContext, draft: VariantDraft) => {
  const lang = resolveLang(ctx);
  await persistDraft(ctx, draft, 'BV_REVIEW');
  await sendMessage(ctx, '✏️ Оберіть поле для зміни:', {
    inline_keyboard: [
      [{ text: `Фото: ${draft.data.photos.length} шт.`, callback_data: buildCallbackData('bv_j', '1') }],
      [{ text: `Рік: ${draft.data.year || '—'}`, callback_data: buildCallbackData('bv_j', '2') }],
      [{ text: `Пробіг: ${draft.data.mileage ? `${draft.data.mileage} км` : '—'}`, callback_data: buildCallbackData('bv_j', '3') }],
      [{ text: `Ціна: ${draft.data.price ? `${draft.data.price} USD` : '—'}`, callback_data: buildCallbackData('bv_j', '4') }],
      [{ text: `VIN: ${draft.data.vin || '—'}`, callback_data: buildCallbackData('bv_j', '5') }],
      [{ text: `Стан: ${draft.data.condition || '—'}`, callback_data: buildCallbackData('bv_j', '6') }],
      [{ text: `Примітка: ${draft.data.note || '—'}`, callback_data: buildCallbackData('bv_j', '7') }],
      [{ text: `Контакт: ${draft.data.contact || '—'}`, callback_data: buildCallbackData('bv_j', '8') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const notifyRequesterAboutVariant = async (ctx: PipelineContext, request: any, variant: any) => {
  const targets = new Set<string>();
  const payload = (request.payload || {}) as Record<string, any>;
  const directChat = toText(payload.clientChatId || payload.chatId || payload.request?.clientChatId);
  if (directChat) targets.add(directChat);

  if (request.requesterPartnerId) {
    const users = await prisma.partnerUser.findMany({
      where: {
        partnerId: request.requesterPartnerId,
        telegramId: { not: null }
      },
      select: { telegramId: true }
    });
    for (const user of users) {
      if (user.telegramId) targets.add(String(user.telegramId));
    }
  }

  if (!targets.size) return;

  const message = [
    '🟠 [B2B VARIANT]',
    `Запит #${request.publicId || request.id}`,
    `Рік: ${variant.year || '—'}`,
    `Пробіг: ${variant.mileage ? `${variant.mileage} км` : '—'}`,
    `Ціна: ${variant.price ? `${variant.price} USD` : '—'}`,
    `VIN: ${variant.specs?.vin || '—'}`,
    `Стан: ${variant.specs?.condition || '—'}`,
    `Примітка: ${variant.specs?.note || '—'}`,
    'Контакти приховано. Оберіть рішення:'
  ].join('\n');

  const markup = {
    inline_keyboard: [[
      { text: button(resolveLang(ctx), 'b2b.fit'), callback_data: buildCallbackData(ActionTokens.BV_FIT, variant.id) },
      { text: button(resolveLang(ctx), 'b2b.notFit'), callback_data: buildCallbackData(ActionTokens.BV_NFIT, variant.id) }
    ]]
  };

  for (const chatId of targets) {
    await sendMessage(ctx, message, markup, chatId).catch(() => null);
  }
};

const submitVariant = async (ctx: PipelineContext, draft: VariantDraft) => {
  const request = await prisma.b2bRequest.findUnique({ where: { id: draft.requestId } });
  if (!request) {
    await sendMessage(ctx, '⚠️ Запит не знайдено.');
    await clearDraft(ctx);
    return;
  }

  if (!draft.data.photos.length) {
    await sendMessage(ctx, '⚠️ Додайте мінімум 1 фото авто.');
    draft.step = 1;
    await routeStep(ctx, draft);
    return;
  }

  const from = ctx.update?.callback_query?.from || ctx.update?.message?.from;
  const tgUserId = String(from?.id || ctx.userId || '');
  const partnerUser = tgUserId
    ? await prisma.partnerUser.findFirst({
      where: {
        telegramId: tgUserId,
        ...(ctx.companyId ? { companyId: ctx.companyId } : {})
      },
      include: { partner: true }
    })
    : null;

  const variant = await prisma.requestVariant.create({
    data: {
      requestId: request.id,
      sellerPartnerId: partnerUser?.partnerId || null,
      title: `${draft.requestPublicId} варіант`,
      price: draft.data.price || null,
      year: draft.data.year || null,
      mileage: draft.data.mileage || null,
      contact: draft.data.contact || null,
      companyName: partnerUser?.partner?.name || null,
      thumbnail: draft.data.photos[0] || null,
      mediaUrls: draft.data.photos.slice(0, 10),
      specs: {
        vin: draft.data.vin || null,
        condition: draft.data.condition || null,
        note: draft.data.note || null,
        source: 'telegram_b2b_variant'
      } as any,
      status: 'SUBMITTED'
    }
  });

  await notifyRequesterAboutVariant(ctx, request, variant);

  await sendMessage(ctx, '✅ Варіант надіслано автору запиту.', { remove_keyboard: true });
  await clearDraft(ctx);
};

export const startB2BVariantWizard = async (ctx: PipelineContext, requestPublicId: string) => {
  const request = await loadRequestByPublicId(requestPublicId);
  if (!request) {
    await sendMessage(ctx, '⚠️ Запит не знайдено.');
    return;
  }

  const draft: VariantDraft = {
    step: 1,
    requestId: request.id,
    requestPublicId: request.publicId || request.id,
    data: {
      photos: []
    },
    history: []
  };

  await routeStep(ctx, draft);
};

export const handleB2BVariantCallback = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
  const draft = readDraft(ctx);
  const lang = resolveLang(ctx);
  const state = String(ctx.session?.state || '');

  if (action === ActionTokens.LB_CANCEL) {
    await clearDraft(ctx);
    await sendMessage(ctx, t(lang, 'cancelled'), { remove_keyboard: true });
    return true;
  }

  if (action === ActionTokens.BV_SEND && payload && !draft) {
    // Trigger from channel callback: continue in private chat.
    const request = await loadRequestByPublicId(payload);
    if (!request) {
      await sendMessage(ctx, '⚠️ Запит не знайдено.');
      return true;
    }

    const targetChatId = String(ctx.update?.callback_query?.from?.id || '');
    if (!targetChatId) return true;

    const privateSession = await prisma.botSession.upsert({
      where: {
        botId_chatId: {
          botId: ctx.bot!.id,
          chatId: targetChatId
        }
      },
      update: { lastActive: new Date() },
      create: {
        botId: ctx.bot!.id,
        chatId: targetChatId,
        state: 'START',
        variables: {} as any,
        platform: 'TG'
      }
    });

    await sendMessage(ctx, 'Перенаправляю у приватний чат для створення варіанту…', undefined, targetChatId).catch(() => null);
    await startB2BVariantWizard({ ...ctx, chatId: targetChatId, chatType: 'private', session: privateSession }, request.publicId || request.id);
    return true;
  }

  if (action === ActionTokens.BV_FIT || action === ActionTokens.BV_NFIT) {
    const variantId = toText(payload);
    if (!variantId) return true;
    return handleRequesterVariantDecision(ctx, variantId, action === ActionTokens.BV_FIT ? 'FIT' : 'NOT_FIT');
  }

  if (!draft) {
    if (action !== ActionTokens.BV_SEND || !payload) {
      await sendMessage(ctx, '⚠️ Сесія варіанту неактивна. Відкрийте запит і натисніть «Є авто».');
      return true;
    }
    return false;
  }

  if (!isAllowedActionForState(state, action)) {
    await sendMessage(ctx, '⚠️ Ця дія недоступна на поточному кроці.');
    return true;
  }

  if (action === 'bv_edit') {
    await showEditFields(ctx, draft);
    return true;
  }

  if (action === 'bv_j') {
    const step = Number(toText(payload));
    if (!Number.isFinite(step) || step < 1 || step > 8) return true;
    draft.step = step;
    draft.reviewMode = true;
    await routeStep(ctx, draft);
    return true;
  }

  if (action.startsWith('bv_back_')) {
    const step = Number(action.replace('bv_back_', ''));
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

  if (action === 'bv_dphoto' || action === 'bv_done_photo') {
    if (draft.data.photos.length < 1) {
      await sendMessage(ctx, '⚠️ Додайте мінімум 1 фото.');
      draft.step = 1;
      await routeStep(ctx, draft);
      return true;
    }
    await moveToNextOrReview(ctx, draft, 2);
    return true;
  }

  if (action === 'bv_skip_year') {
    draft.data.year = null;
    await moveToNextOrReview(ctx, draft, 3);
    return true;
  }

  if (action === 'bv_s_ml' || action === 'bv_skip_mileage') {
    draft.data.mileage = null;
    await moveToNextOrReview(ctx, draft, 4);
    return true;
  }

  if (action === 'bv_s_pr' || action === 'bv_skip_price') {
    draft.data.price = null;
    await moveToNextOrReview(ctx, draft, 5);
    return true;
  }

  if (action === 'bv_skip_vin') {
    draft.data.vin = null;
    await moveToNextOrReview(ctx, draft, 6);
    return true;
  }

  if (action === 'bv_s_cond' || action === 'bv_skip_condition') {
    draft.data.condition = null;
    await moveToNextOrReview(ctx, draft, 7);
    return true;
  }

  if (action === 'bv_skip_note') {
    draft.data.note = null;
    await moveToNextOrReview(ctx, draft, 8);
    return true;
  }

  if (action === ActionTokens.BV_SEND) {
    await submitVariant(ctx, draft);
    return true;
  }

  return false;
};

export const handleB2BVariantText = async (ctx: PipelineContext, text: string): Promise<boolean> => {
  const draft = readDraft(ctx);
  if (!draft) return false;

  const state = String(ctx.session?.state || '');
  const lang = resolveLang(ctx);
  const message = ctx.update?.message;

  if (state.startsWith('BV_') && isBackIntent(text, lang)) {
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

  if (state === 'BV_PHOTO') {
    const photos = Array.isArray(draft.data.photos) ? draft.data.photos : [];
    if (message?.photo?.length) {
      const file = message.photo[message.photo.length - 1]?.file_id;
      if (file) {
        photos.push(file);
        draft.data.photos = photos;
        await persistDraft(ctx, draft, 'BV_PHOTO');
        await sendMessage(ctx, `📸 Фото додано (${photos.length}). Надішліть ще або натисніть «Завершити фото».`, {
          inline_keyboard: [
            [{ text: '✅ Завершити фото', callback_data: buildCallbackData('bv_dphoto') }],
            [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
          ]
        });
        return true;
      }
    }
    if (message?.document || message?.video || message?.animation || message?.audio || message?.voice) {
      await sendMessage(ctx, '⚠️ Потрібно надіслати саме фото (не документ/відео).');
      return true;
    }
    await sendMessage(ctx, '⚠️ Додайте мінімум 1 фото.');
    return true;
  }

  if (state === 'BV_YEAR') {
    const parsed = parseYearInput(text);
    if (!parsed) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_year'));
      return true;
    }
    draft.data.year = parsed.min;
    await moveToNextOrReview(ctx, draft, 3);
    return true;
  }

  if (state === 'BV_MILEAGE') {
    const parsed = parseMileageKm(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_mileage'));
      return true;
    }
    draft.data.mileage = parsed;
    await moveToNextOrReview(ctx, draft, 4);
    return true;
  }

  if (state === 'BV_PRICE') {
    const parsed = parseBudgetUSD(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_budget'));
      return true;
    }
    draft.data.price = parsed;
    await moveToNextOrReview(ctx, draft, 5);
    return true;
  }

  if (state === 'BV_VIN') {
    draft.data.vin = toText(text) || null;
    await moveToNextOrReview(ctx, draft, 6);
    return true;
  }

  if (state === 'BV_CONDITION') {
    draft.data.condition = toText(text) || null;
    await moveToNextOrReview(ctx, draft, 7);
    return true;
  }

  if (state === 'BV_NOTE') {
    if (containsForbiddenContacts(text)) {
      await sendMessage(ctx, t(lang, 'common.err.contacts_forbidden'));
      return true;
    }
    draft.data.note = toText(text) || null;
    await moveToNextOrReview(ctx, draft, 8);
    return true;
  }

  if (state === 'BV_CONTACT') {
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

  if (state.startsWith('BV_')) {
    await sendMessage(ctx, 'Використайте кнопки під повідомленням або «❌ Скасувати».');
    return true;
  }

  return false;
};
