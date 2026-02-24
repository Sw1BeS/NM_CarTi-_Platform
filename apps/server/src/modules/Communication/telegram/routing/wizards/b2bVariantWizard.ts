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
    title?: string;
    price?: number | null;
    year?: number | null;
    mileage?: number | null;
    contact?: string | null;
    note?: string | null;
  };
  history: string[];
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

const readDraft = (ctx: PipelineContext): VariantDraft | null => {
  const vars = (ctx.session?.variables as any) || {};
  const draft = vars.b2bVariantDraft as VariantDraft | undefined;
  if (!draft || typeof draft !== 'object') return null;
  if (!draft.requestId) return null;
  return {
    step: Number(draft.step || 1),
    requestId: draft.requestId,
    requestPublicId: draft.requestPublicId || draft.requestId,
    data: { ...(draft.data || {}) },
    history: Array.isArray(draft.history) ? draft.history : []
  };
};

const persistDraft = async (ctx: PipelineContext, draft: VariantDraft, state?: string) => {
  if (!ctx.session) return;
  const vars = (ctx.session.variables as any) || {};
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: state || `BV_STEP_${draft.step}`,
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

const routeStep = async (ctx: PipelineContext, draft: VariantDraft) => {
  const lang = resolveLang(ctx);
  if (draft.step <= 1) {
    draft.step = 1;
    await persistDraft(ctx, draft, 'BV_TITLE');
    await sendMessage(ctx, `Крок 1/6\nОпишіть варіант для запиту #${draft.requestPublicId}:`, {
      inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
    });
    return;
  }

  if (draft.step === 2) {
    await persistDraft(ctx, draft, 'BV_PRICE');
    await sendMessage(ctx, 'Крок 2/6\nВкажіть ціну (необовʼязково):', {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bv_skip_price') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_1') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 3) {
    await persistDraft(ctx, draft, 'BV_YEAR');
    await sendMessage(ctx, 'Крок 3/6\nВкажіть рік (необовʼязково):', {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bv_skip_year') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_2') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 4) {
    await persistDraft(ctx, draft, 'BV_MILEAGE');
    await sendMessage(ctx, 'Крок 4/6\nВкажіть пробіг (необовʼязково):', {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bv_skip_mileage') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_3') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 5) {
    await persistDraft(ctx, draft, 'BV_CONTACT');
    await sendMessage(ctx, 'Крок 5/6\nДодайте контакт для адміністратора:', {
      keyboard: [
        [{ text: button(lang, 'common.shareContact'), request_contact: true }],
        [{ text: button(lang, 'common.back') }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    });
    await sendMessage(ctx, 'Керування кроком:', {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_4') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 6) {
    await persistDraft(ctx, draft, 'BV_NOTE');
    await sendMessage(ctx, 'Крок 6/6\nДодайте коментар (без контактів):', {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bv_skip_note') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bv_back_5') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  await persistDraft(ctx, draft, 'BV_REVIEW');
  const summary = [
    `Запит: #${draft.requestPublicId}`,
    `Опис: ${draft.data.title || '—'}`,
    `Ціна: ${draft.data.price ? `${draft.data.price} USD` : '—'}`,
    `Рік: ${draft.data.year || '—'}`,
    `Пробіг: ${draft.data.mileage ? `${draft.data.mileage} км` : '—'}`,
    `Контакт: ${draft.data.contact || '—'}`,
    `Примітка: ${draft.data.note || '—'}`
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
      [{ text: `Опис: ${draft.data.title || '—'}`, callback_data: buildCallbackData('bv_j', '1') }],
      [{ text: `Ціна: ${draft.data.price ? `${draft.data.price} USD` : '—'}`, callback_data: buildCallbackData('bv_j', '2') }],
      [{ text: `Рік: ${draft.data.year || '—'}`, callback_data: buildCallbackData('bv_j', '3') }],
      [{ text: `Пробіг: ${draft.data.mileage ? `${draft.data.mileage} км` : '—'}`, callback_data: buildCallbackData('bv_j', '4') }],
      [{ text: `Контакт: ${draft.data.contact || '—'}`, callback_data: buildCallbackData('bv_j', '5') }],
      [{ text: `Примітка: ${draft.data.note || '—'}`, callback_data: buildCallbackData('bv_j', '6') }],
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
    `Опис: ${variant.title || '—'}`,
    `Ціна: ${variant.price ? `${variant.price} USD` : '—'}`,
    `Рік: ${variant.year || '—'}`,
    `Пробіг: ${variant.mileage ? `${variant.mileage} км` : '—'}`,
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
      title: draft.data.title || 'Варіант без опису',
      price: draft.data.price || null,
      year: draft.data.year || null,
      mileage: draft.data.mileage || null,
      contact: draft.data.contact || null,
      companyName: partnerUser?.partner?.name || null,
      specs: {
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
    data: {},
    history: []
  };

  await routeStep(ctx, draft);
};

export const handleB2BVariantCallback = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
  const draft = readDraft(ctx);
  const lang = resolveLang(ctx);

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

  if (!draft) return false;

  if (action === 'bv_edit') {
    await showEditFields(ctx, draft);
    return true;
  }

  if (action === 'bv_j') {
    const step = Number(toText(payload));
    if (!Number.isFinite(step) || step < 1 || step > 6) return true;
    draft.step = step;
    await routeStep(ctx, draft);
    return true;
  }

  if (action.startsWith('bv_back_')) {
    const step = Number(action.replace('bv_back_', ''));
    if (Number.isFinite(step) && step >= 1) {
      draft.step = step;
      await routeStep(ctx, draft);
    }
    return true;
  }

  if (action === 'bv_skip_price') {
    draft.data.price = null;
    draft.step = 3;
    await routeStep(ctx, draft);
    return true;
  }

  if (action === 'bv_skip_year') {
    draft.data.year = null;
    draft.step = 4;
    await routeStep(ctx, draft);
    return true;
  }

  if (action === 'bv_skip_mileage') {
    draft.data.mileage = null;
    draft.step = 5;
    await routeStep(ctx, draft);
    return true;
  }

  if (action === 'bv_skip_note') {
    draft.data.note = null;
    draft.step = 7;
    await routeStep(ctx, draft);
    return true;
  }

  if (action === ActionTokens.BV_SEND) {
    await submitVariant(ctx, draft);
    return true;
  }

  if (action === ActionTokens.BV_FIT || action === ActionTokens.BV_NFIT) {
    const variantId = toText(payload);
    if (!variantId) return true;

    const variant = await prisma.requestVariant.findUnique({
      where: { id: variantId },
      include: { request: true, sellerPartner: true }
    });
    if (!variant?.request) {
      await sendMessage(ctx, '⚠️ Варіант не знайдено.');
      return true;
    }

    const isFit = action === ActionTokens.BV_FIT;
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
      await sendMessage(ctx, [
        '🔥 [FIT]',
        `Запит: #${variant.request.publicId || variant.request.id}`,
        `Варіант: ${variant.title || '—'}`,
        `Ціна: ${variant.price ? `${variant.price} USD` : '—'}`,
        `Контакт продавця: ${variant.contact || '—'}`,
        `Компанія: ${variant.sellerPartner?.name || variant.companyName || '—'}`
      ].join('\n'), undefined, String(ctx.bot.adminChatId));
    }

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

  if (state === 'BV_TITLE') {
    const value = toText(text);
    if (value.length < 2) {
      await sendMessage(ctx, '⚠️ Введіть опис варіанту (мінімум 2 символи).');
      return true;
    }
    draft.data.title = value;
    draft.step = 2;
    await routeStep(ctx, draft);
    return true;
  }

  if (state === 'BV_PRICE') {
    const parsed = parseBudgetUSD(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_budget'));
      return true;
    }
    draft.data.price = parsed;
    draft.step = 3;
    await routeStep(ctx, draft);
    return true;
  }

  if (state === 'BV_YEAR') {
    const parsed = parseYearInput(text);
    if (!parsed) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_year'));
      return true;
    }
    draft.data.year = parsed.min;
    draft.step = 4;
    await routeStep(ctx, draft);
    return true;
  }

  if (state === 'BV_MILEAGE') {
    const parsed = parseMileageKm(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_mileage'));
      return true;
    }
    draft.data.mileage = parsed;
    draft.step = 5;
    await routeStep(ctx, draft);
    return true;
  }

  if (state === 'BV_CONTACT') {
    const source = message?.contact?.phone_number || text;
    const normalized = normalizePhoneUA(source);
    if (!normalized) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_phone'));
      return true;
    }
    draft.data.contact = normalized;
    draft.step = 6;
    await routeStep(ctx, draft);
    return true;
  }

  if (state === 'BV_NOTE') {
    if (containsForbiddenContacts(text)) {
      await sendMessage(ctx, t(lang, 'common.err.contacts_forbidden'));
      return true;
    }
    draft.data.note = toText(text) || null;
    draft.step = 7;
    await routeStep(ctx, draft);
    return true;
  }

  return false;
};
