import { BotTemplate } from '@prisma/client';
import { prisma } from '../../../../../services/prisma.js';
import type { PipelineContext } from '../../core/types.js';
import { resolveLang, t, button } from '../../core/utils/telegramText.js';
import { telegramOutbox } from '../../messaging/outbox/telegramOutbox.js';
import { ActionTokens, buildCallbackData } from '../../core/utils/callbackUtils.js';
import {
  BRANDS,
  BRAND_MODELS,
  CITY_OPTIONS,
  COND_OPTIONS,
  DRIVE_OPTIONS,
  FUEL_OPTIONS,
  TRANS_OPTIONS,
  buildBrandKeyboard,
  buildCityKeyboard,
  buildConditionKeyboard,
  buildDriveKeyboard,
  buildFuelKeyboard,
  buildModelKeyboard,
  buildTransmissionKeyboard,
  pickFromList
} from '../../core/utils/quickPicks.js';
import {
  containsForbiddenContacts,
  normalizePhoneUA,
  parseBudgetUSD,
  parseMileageKm,
  parseYearInput
} from '../../core/utils/inputValidators.js';
import { createOrMergeLead } from '../../core/leadService.js';
import { renderChannelCarPost } from '../../../../../services/cardRenderer.js';

type LeadSellData = {
  brand: string;
  model: string;
  year?: number | null;
  price?: number | null;
  mileage?: number | null;
  fuel?: string | null;
  transmission?: string | null;
  drive?: string | null;
  condition?: string | null;
  city?: string | null;
  description?: string | null;
  photos: string[];
  phone?: string | null;
};

type LeadSellDraft = {
  step: number;
  data: LeadSellData;
  history: string[];
  reviewMode?: boolean;
};

type SellAdminState = {
  savedInventoryCarId?: string;
  publishedCartieMessageId?: number;
  publishedCartieChannelId?: string;
  publishedB2BMessageId?: number;
  publishedB2BChannelId?: string;
  b2bRequestId?: string;
};

const TOTAL_STEPS = 13;
const toText = (value: unknown) => String(value || '').trim();
const norm = (value: unknown) => toText(value).toLowerCase();

const stepHeader = (step: number) => `Крок ${step}/${TOTAL_STEPS}`;

const readDraft = (ctx: PipelineContext): LeadSellDraft => {
  const vars = (ctx.session?.variables as any) || {};
  const fromDraft = vars.leadSellDraft as LeadSellDraft | undefined;
  if (fromDraft && typeof fromDraft === 'object') {
    const data = (fromDraft.data || {}) as Partial<LeadSellData>;
    return {
      step: Number(fromDraft.step || 1),
      data: {
        brand: toText(data.brand || ''),
        model: toText(data.model || ''),
        year: typeof data.year === 'number' ? data.year : null,
        price: typeof data.price === 'number' ? data.price : null,
        mileage: typeof data.mileage === 'number' ? data.mileage : null,
        fuel: data.fuel || null,
        transmission: data.transmission || null,
        drive: data.drive || null,
        condition: data.condition || null,
        city: data.city || null,
        description: data.description || null,
        photos: Array.isArray(data.photos) ? data.photos : [],
        phone: data.phone || null
      },
      history: Array.isArray(fromDraft.history) ? fromDraft.history : [],
      reviewMode: Boolean(fromDraft.reviewMode)
    };
  }

  const legacy = vars.leadSell || {};
  return {
    step: Number(legacy.step || 1),
    data: {
      brand: toText(legacy.brand || ''),
      model: toText(legacy.model || ''),
      year: typeof legacy.year === 'number' ? legacy.year : null,
      price: typeof legacy.price === 'number' ? legacy.price : null,
      mileage: typeof legacy.mileage === 'number' ? legacy.mileage : null,
      fuel: legacy.fuel || null,
      transmission: legacy.transmission || null,
      drive: legacy.drive || null,
      condition: legacy.condition || null,
      city: legacy.city || null,
      description: legacy.description || null,
      photos: Array.isArray(legacy.photos) ? legacy.photos : [],
      phone: legacy.phone || null
    },
    history: [],
    reviewMode: false
  };
};

const persistDraft = async (ctx: PipelineContext, draft: LeadSellDraft, state?: string) => {
  if (!ctx.session) return;
  const vars = (ctx.session.variables as any) || {};
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: state || (draft.step === 14 ? 'LS_REVIEW' : `LS_STEP_${draft.step}`),
      variables: {
        ...vars,
        leadSellDraft: draft,
        leadSell: null
      },
      lastActive: new Date()
    }
  });
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

const clearDraft = async (ctx: PipelineContext, notice?: string) => {
  if (!ctx.session) return;
  const vars = (ctx.session.variables as any) || {};
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: 'CL_MENU',
      variables: {
        ...vars,
        leadSellDraft: null,
        leadSell: null
      },
      lastActive: new Date()
    }
  });
  if (notice) {
    await sendMessage(ctx, notice, { remove_keyboard: true });
  }
};

const showReview = async (ctx: PipelineContext, draft: LeadSellDraft) => {
  const lang = resolveLang(ctx);
  draft.step = 14;
  draft.reviewMode = false;
  await persistDraft(ctx, draft, 'LS_REVIEW');

  const d = draft.data;
  const summary = [
    `Марка: ${d.brand || '—'}`,
    `Модель: ${d.model || '—'}`,
    `Рік: ${d.year || '—'}`,
    `Ціна: ${d.price ? `${d.price} USD` : '—'}`,
    `Пробіг: ${d.mileage ? `${d.mileage} км` : '—'}`,
    `Паливо: ${d.fuel || '—'}`,
    `КПП: ${d.transmission || '—'}`,
    `Привід: ${d.drive || '—'}`,
    `Стан: ${d.condition || '—'}`,
    `Місто: ${d.city || '—'}`,
    `Опис: ${d.description || '—'}`,
    `Фото: ${d.photos.length ? `${d.photos.length} шт.` : '—'}`,
    `Контакт: ${d.phone || '—'}`
  ].join('\n');

  await sendMessage(ctx, t(lang, 'lead.sell.review.title', { summary }), {
    inline_keyboard: [
      [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData(ActionTokens.LS_SAVE) }],
      [{ text: button(lang, 'common.edit'), callback_data: buildCallbackData('ls_edit') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const showEditFields = async (ctx: PipelineContext, draft: LeadSellDraft) => {
  const lang = resolveLang(ctx);
  const d = draft.data;
  await persistDraft(ctx, draft, 'LS_REVIEW');
  await sendMessage(ctx, '✏️ Оберіть поле для зміни:', {
    inline_keyboard: [
      [{ text: `Марка: ${d.brand || '—'}`, callback_data: buildCallbackData('ls_j', '1') }],
      [{ text: `Модель: ${d.model || '—'}`, callback_data: buildCallbackData('ls_j', '2') }],
      [{ text: `Рік: ${d.year || '—'}`, callback_data: buildCallbackData('ls_j', '3') }],
      [{ text: `Ціна: ${d.price ? `${d.price} USD` : '—'}`, callback_data: buildCallbackData('ls_j', '4') }],
      [{ text: `Пробіг: ${d.mileage ? `${d.mileage} км` : '—'}`, callback_data: buildCallbackData('ls_j', '5') }],
      [{ text: `Паливо: ${d.fuel || '—'}`, callback_data: buildCallbackData('ls_j', '6') }],
      [{ text: `КПП: ${d.transmission || '—'}`, callback_data: buildCallbackData('ls_j', '7') }],
      [{ text: `Привід: ${d.drive || '—'}`, callback_data: buildCallbackData('ls_j', '8') }],
      [{ text: `Стан: ${d.condition || '—'}`, callback_data: buildCallbackData('ls_j', '9') }],
      [{ text: `Місто: ${d.city || '—'}`, callback_data: buildCallbackData('ls_j', '10') }],
      [{ text: `Опис: ${d.description || '—'}`, callback_data: buildCallbackData('ls_j', '11') }],
      [{ text: `Фото: ${d.photos.length ? `${d.photos.length} шт.` : '—'}`, callback_data: buildCallbackData('ls_j', '12') }],
      [{ text: `Контакт: ${d.phone || '—'}`, callback_data: buildCallbackData('ls_j', '13') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const routeStep = async (ctx: PipelineContext, draft: LeadSellDraft) => {
  const lang = resolveLang(ctx);

  if (draft.step <= 1) {
    draft.step = 1;
    await persistDraft(ctx, draft, 'LS_BRAND');
    await sendMessage(
      ctx,
      `${t(lang, 'lead.sell.title')}\n\n${stepHeader(1)}\nОберіть марку авто:`,
      { inline_keyboard: buildBrandKeyboard(lang) }
    );
    return;
  }

  if (draft.step === 2) {
    await persistDraft(ctx, draft, 'LS_MODEL');
    await sendMessage(ctx, `${stepHeader(2)}\nОберіть модель авто:`, {
      inline_keyboard: buildModelKeyboard(draft.data.brand || '', lang)
    });
    return;
  }

  if (draft.step === 3) {
    await persistDraft(ctx, draft, 'LS_YEAR');
    await sendMessage(ctx, `${stepHeader(3)}\nВведіть рік випуску (напр. 2019):`, {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('ls_back_2') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 4) {
    await persistDraft(ctx, draft, 'LS_PRICE');
    await sendMessage(ctx, `${stepHeader(4)}\nВкажіть ціну в USD:`, {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('ls_back_3') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 5) {
    await persistDraft(ctx, draft, 'LS_MILEAGE');
    await sendMessage(ctx, `${stepHeader(5)}\nВкажіть пробіг:`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('ls_skip_ml') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('ls_back_4') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 6) {
    await persistDraft(ctx, draft, 'LS_FUEL');
    await sendMessage(ctx, `${stepHeader(6)}\nОберіть тип палива:`, { inline_keyboard: buildFuelKeyboard(lang) });
    return;
  }

  if (draft.step === 7) {
    await persistDraft(ctx, draft, 'LS_TRANS');
    await sendMessage(ctx, `${stepHeader(7)}\nОберіть КПП:`, { inline_keyboard: buildTransmissionKeyboard() });
    return;
  }

  if (draft.step === 8) {
    await persistDraft(ctx, draft, 'LS_DRIVE');
    await sendMessage(ctx, `${stepHeader(8)}\nОберіть привід:`, { inline_keyboard: buildDriveKeyboard() });
    return;
  }

  if (draft.step === 9) {
    await persistDraft(ctx, draft, 'LS_CONDITION');
    await sendMessage(ctx, `${stepHeader(9)}\nОберіть стан авто:`, { inline_keyboard: buildConditionKeyboard() });
    return;
  }

  if (draft.step === 10) {
    await persistDraft(ctx, draft, 'LS_CITY');
    await sendMessage(ctx, `${stepHeader(10)}\nОберіть місто:`, { inline_keyboard: buildCityKeyboard(lang) });
    return;
  }

  if (draft.step === 11) {
    await persistDraft(ctx, draft, 'LS_DESC');
    await sendMessage(ctx, `${stepHeader(11)}\nОпишіть авто (необовʼязково):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('ls_skip_desc') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('ls_back_10') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 12) {
    await persistDraft(ctx, draft, 'LS_PHOTO');
    await sendMessage(ctx, `${stepHeader(12)}\nНадішліть фото (можна декілька):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('ls_skip_photo') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('ls_back_11') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 13) {
    await persistDraft(ctx, draft, 'LS_CONTACT');
    if (String(ctx.chatType || '') === 'private') {
      await sendMessage(ctx, `${stepHeader(13)}\nВкажіть контакт для звʼязку:`, {
        keyboard: [
          [{ text: button(lang, 'common.shareContact'), request_contact: true }],
          [{ text: button(lang, 'common.back') }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      });
      await sendMessage(ctx, 'Керування кроком:', {
        inline_keyboard: [[
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('ls_back_12') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]]
      });
    } else {
      await sendMessage(ctx, `${stepHeader(13)}\nВведіть номер телефону вручну:`, {
        inline_keyboard: [[
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('ls_back_12') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]]
      });
    }
    return;
  }

  await showReview(ctx, draft);
};

const applyAndNext = async (ctx: PipelineContext, draft: LeadSellDraft, nextStep: number) => {
  if (draft.reviewMode) {
    await showReview(ctx, draft);
    return;
  }
  draft.step = nextStep;
  await routeStep(ctx, draft);
};

const buildSellPayload = (draft: LeadSellDraft) => {
  return {
    sellDraft: draft.data,
    wizard: 'lead_sell_v7',
    leadType: 'SELL'
  };
};

const submitLeadSell = async (ctx: PipelineContext, draft: LeadSellDraft) => {
  if (!ctx.bot) return;

  const from = ctx.update?.callback_query?.from || ctx.update?.message?.from;
  const fullName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim();
  const requestText = [draft.data.brand, draft.data.model, draft.data.year].filter(Boolean).join(' ').trim();

  const leadResult = await createOrMergeLead({
    botId: ctx.bot.id,
    companyId: ctx.companyId || null,
    chatId: ctx.chatId,
    userId: String(from?.id || ctx.userId || ctx.chatId || ''),
    name: fullName || 'Клієнт',
    telegramUsername: from?.username || null,
    telegramName: fullName || null,
    phone: draft.data.phone || undefined,
    request: requestText || 'Продаж авто',
    source: 'TELEGRAM',
    payload: buildSellPayload(draft),
    leadType: 'SELL',
    createRequest: false
  }, ctx.bot.config as any);

  await prisma.lead.update({
    where: { id: leadResult.lead.id },
    data: {
      payload: {
        ...((leadResult.lead.payload as any) || {}),
        ...buildSellPayload(draft),
        sellAdminState: ((leadResult.lead.payload as any)?.sellAdminState || {})
      }
    }
  }).catch(() => null);

  await sendMessage(ctx, '✅ Дані авто передано менеджеру.', { remove_keyboard: true });

  if (ctx.bot.adminChatId) {
    const d = draft.data;
    const summary = [
      '🟣 [LEAD SELL]',
      `Авто: ${d.brand || '—'} ${d.model || ''} ${d.year || ''}`.trim(),
      `Ціна: ${d.price ? `${d.price} USD` : '—'}`,
      `Пробіг: ${d.mileage ? `${d.mileage} км` : '—'}`,
      `Паливо: ${d.fuel || '—'}`,
      `КПП: ${d.transmission || '—'}`,
      `Привід: ${d.drive || '—'}`,
      `Стан: ${d.condition || '—'}`,
      `Місто: ${d.city || '—'}`,
      `Опис: ${d.description || '—'}`,
      `Контакт: ${d.phone || '—'}`,
      `Lead ID: ${leadResult.lead.id}`
    ].join('\n');

    await sendMessage(ctx, summary, {
      inline_keyboard: [
        [{ text: '💾 Зберегти в інвентар', callback_data: buildCallbackData(ActionTokens.LS_SAVE, leadResult.lead.id) }],
        [{ text: '📣 Опублікувати в CarTié', callback_data: buildCallbackData(ActionTokens.LS_PUB_CARTIE, leadResult.lead.id) }],
        [{ text: '🤝 Опублікувати в B2B', callback_data: buildCallbackData(ActionTokens.LS_PUB_B2B, leadResult.lead.id) }],
        [{ text: '📝 Створити B2B запит', callback_data: buildCallbackData(ActionTokens.LS_REQ_B2B, leadResult.lead.id) }]
      ]
    }, String(ctx.bot.adminChatId));
  }

  await clearDraft(ctx);
};

const loadLeadSellState = async (leadId: string) => {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  const payload = (lead.payload as any) || {};
  const sellDraft = payload.sellDraft as LeadSellData | undefined;
  if (!sellDraft || !sellDraft.brand || !sellDraft.model) return null;
  const adminState = (payload.sellAdminState || {}) as SellAdminState;
  return { lead, sellDraft, adminState, payload };
};

const saveLeadSellState = async (leadId: string, payload: any, adminState: SellAdminState) => {
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      payload: {
        ...payload,
        sellAdminState: adminState
      }
    }
  });
};

const ensureInventoryFromLead = async (ctx: PipelineContext, leadId: string) => {
  const loaded = await loadLeadSellState(leadId);
  if (!loaded) return { ok: false as const, message: 'Лід не знайдено або неповні дані.' };
  const { sellDraft, adminState, payload, lead } = loaded;

  if (adminState.savedInventoryCarId) {
    const existing = await prisma.carListing.findUnique({ where: { id: adminState.savedInventoryCarId } });
    if (existing) {
      return { ok: true as const, carId: existing.id, already: true as const };
    }
  }

  const carId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const car = await prisma.carListing.create({
    data: {
      id: carId,
      source: 'MANUAL',
      title: `${sellDraft.brand} ${sellDraft.model}`.trim(),
      price: Number(sellDraft.price || 0),
      currency: 'USD',
      year: Number(sellDraft.year || 0),
      mileage: Number(sellDraft.mileage || 0),
      location: sellDraft.city || null,
      thumbnail: sellDraft.photos?.[0] || null,
      mediaUrls: Array.isArray(sellDraft.photos) ? sellDraft.photos : [],
      specs: {
        fuel: sellDraft.fuel || undefined,
        transmission: sellDraft.transmission || undefined,
        drive: sellDraft.drive || undefined,
        condition: sellDraft.condition || undefined,
        sourceLeadId: lead.id
      } as any,
      description: sellDraft.description || null,
      status: 'AVAILABLE',
      companyId: lead.companyId || ctx.companyId || null,
      postedAt: new Date()
    }
  });

  adminState.savedInventoryCarId = car.id;
  await saveLeadSellState(leadId, payload, adminState);
  return { ok: true as const, carId: car.id, already: false as const };
};

const publishToChannel = async (ctx: PipelineContext, params: {
  leadId: string;
  target: 'cartie' | 'b2b';
}) => {
  const loaded = await loadLeadSellState(params.leadId);
  if (!loaded) return { ok: false as const, message: 'Лід не знайдено або неповні дані.' };
  const { lead, sellDraft, adminState, payload } = loaded;

  let bot = ctx.bot;
  if (params.target === 'b2b') {
    const b2bBot = await prisma.botConfig.findFirst({
      where: {
        companyId: lead.companyId || ctx.companyId || undefined,
        template: BotTemplate.B2B,
        isEnabled: true
      },
      orderBy: { createdAt: 'asc' }
    });
    if (b2bBot) bot = b2bBot as any;
  }

  if (!bot?.channelId) {
    return { ok: false as const, message: 'Канал не налаштовано для публікації.' };
  }

  if (params.target === 'cartie' && adminState.publishedCartieMessageId) {
    return { ok: true as const, already: true as const, messageId: adminState.publishedCartieMessageId };
  }
  if (params.target === 'b2b' && adminState.publishedB2BMessageId) {
    return { ok: true as const, already: true as const, messageId: adminState.publishedB2BMessageId };
  }

  const card = renderChannelCarPost({
    title: `${sellDraft.brand} ${sellDraft.model}`.trim(),
    year: sellDraft.year,
    price: sellDraft.price,
    mileage: sellDraft.mileage,
    location: sellDraft.city,
    status: 'AVAILABLE',
    specs: {
      fuel: sellDraft.fuel,
      transmission: sellDraft.transmission,
      drive: sellDraft.drive,
      condition: sellDraft.condition,
      damage: sellDraft.description || 'не вказано',
      runs: true
    }
  });

  const sent = sellDraft.photos?.[0]
    ? await telegramOutbox.sendPhoto({
      botId: bot.id,
      token: bot.token,
      chatId: String(bot.channelId),
      photo: sellDraft.photos[0],
      caption: card,
      companyId: lead.companyId || ctx.companyId || undefined
    })
    : await telegramOutbox.sendMessage({
      botId: bot.id,
      token: bot.token,
      chatId: String(bot.channelId),
      text: card,
      companyId: lead.companyId || ctx.companyId || undefined
    });

  const sentMessageId = Number((sent as any)?.message_id || 0) || undefined;

  if (params.target === 'cartie') {
    adminState.publishedCartieMessageId = sentMessageId;
    adminState.publishedCartieChannelId = String(bot.channelId);
  } else {
    adminState.publishedB2BMessageId = sentMessageId;
    adminState.publishedB2BChannelId = String(bot.channelId);
  }

  await saveLeadSellState(params.leadId, payload, adminState);
  return { ok: true as const, messageId: sentMessageId, already: false as const };
};

const createB2BRequestFromLead = async (ctx: PipelineContext, leadId: string) => {
  const loaded = await loadLeadSellState(leadId);
  if (!loaded) return { ok: false as const, message: 'Лід не знайдено або неповні дані.' };
  const { lead, sellDraft, adminState, payload } = loaded;

  if (adminState.b2bRequestId) {
    const existing = await prisma.b2bRequest.findUnique({ where: { id: adminState.b2bRequestId } });
    if (existing) {
      return { ok: true as const, already: true as const, requestId: existing.id, publicId: existing.publicId || existing.id };
    }
  }

  const request = await prisma.b2bRequest.create({
    data: {
      title: `Продаж: ${sellDraft.brand} ${sellDraft.model}`.trim(),
      description: sellDraft.description || null,
      budgetMin: sellDraft.price || null,
      budgetMax: sellDraft.price || null,
      yearMin: sellDraft.year || null,
      yearMax: sellDraft.year || null,
      city: sellDraft.city || null,
      language: 'UK',
      payload: {
        source: 'lead_sell_admin',
        contact: sellDraft.phone || null,
        car: sellDraft
      } as any,
      status: 'COLLECTING_VARIANTS',
      type: 'SELL',
      companyId: lead.companyId || ctx.companyId || null,
      botId: lead.botId || ctx.bot?.id || null,
      leadId: lead.id
    }
  });

  adminState.b2bRequestId = request.id;
  await saveLeadSellState(leadId, payload, adminState);
  return { ok: true as const, already: false as const, requestId: request.id, publicId: request.publicId || request.id };
};

export const startLeadSellWizard = async (ctx: PipelineContext) => {
  const draft: LeadSellDraft = {
    step: 1,
    data: {
      brand: '',
      model: '',
      photos: []
    },
    history: [],
    reviewMode: false
  };
  await routeStep(ctx, draft);
};

export const handleLeadSellAdminAction = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
  const leadId = toText(payload);
  if (!leadId) return false;

  if (action === ActionTokens.LS_SAVE) {
    const res = await ensureInventoryFromLead(ctx, leadId);
    if (!res.ok) {
      await sendMessage(ctx, `⚠️ ${res.message}`);
      return true;
    }
    await sendMessage(ctx, res.already
      ? `ℹ️ Вже збережено в інвентар: ${res.carId}`
      : `✅ Додано в інвентар: ${res.carId}`
    );
    return true;
  }

  if (action === ActionTokens.LS_PUB_CARTIE) {
    const res = await publishToChannel(ctx, { leadId, target: 'cartie' });
    if (!res.ok) {
      await sendMessage(ctx, `⚠️ ${res.message}`);
      return true;
    }
    await sendMessage(ctx, res.already
      ? `ℹ️ Вже опубліковано в CarTié (msg: ${res.messageId || '—'}).`
      : `✅ Опубліковано в CarTié (msg: ${res.messageId || '—'}).`
    );
    return true;
  }

  if (action === ActionTokens.LS_PUB_B2B) {
    const res = await publishToChannel(ctx, { leadId, target: 'b2b' });
    if (!res.ok) {
      await sendMessage(ctx, `⚠️ ${res.message}`);
      return true;
    }
    await sendMessage(ctx, res.already
      ? `ℹ️ Вже опубліковано в B2B (msg: ${res.messageId || '—'}).`
      : `✅ Опубліковано в B2B (msg: ${res.messageId || '—'}).`
    );
    return true;
  }

  if (action === ActionTokens.LS_REQ_B2B) {
    const res = await createB2BRequestFromLead(ctx, leadId);
    if (!res.ok) {
      await sendMessage(ctx, `⚠️ ${res.message}`);
      return true;
    }
    await sendMessage(ctx, res.already
      ? `ℹ️ B2B запит вже існує: ${res.publicId}`
      : `✅ Створено B2B запит: ${res.publicId}`
    );
    return true;
  }

  return false;
};

export const handleLeadSellCallback = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
  const draft = readDraft(ctx);
  const lang = resolveLang(ctx);

  if (action === ActionTokens.LB_CANCEL) {
    await clearDraft(ctx, t(lang, 'cancelled'));
    return true;
  }

  if (action === 'ls_edit') {
    await showEditFields(ctx, draft);
    return true;
  }

  if (action === 'ls_j') {
    const step = Number(toText(payload));
    if (!Number.isFinite(step) || step < 1 || step > 13) return true;
    draft.reviewMode = true;
    draft.step = step;
    await routeStep(ctx, draft);
    return true;
  }

  if (action === ActionTokens.LS_SAVE) {
    if (draft.step >= 14 || String(ctx.session?.state || '') === 'LS_REVIEW') {
      await submitLeadSell(ctx, draft);
      return true;
    }
    return false;
  }

  if (action.startsWith('ls_back_')) {
    const step = Number(action.replace('ls_back_', ''));
    if (Number.isFinite(step) && step >= 1 && step <= 13) {
      draft.step = step;
      await routeStep(ctx, draft);
      return true;
    }
    return true;
  }

  if (action === 'lb_e_b_back') {
    draft.step = 1;
    await routeStep(ctx, draft);
    return true;
  }

  if (action === 'ls_skip_ml') {
    draft.data.mileage = null;
    await applyAndNext(ctx, draft, 6);
    return true;
  }

  if (action === 'ls_skip_desc') {
    draft.data.description = null;
    await applyAndNext(ctx, draft, 12);
    return true;
  }

  if (action === 'ls_skip_photo') {
    await applyAndNext(ctx, draft, 13);
    return true;
  }

  if (action === 'lb_e_b') {
    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'LS_BRAND_TXT');
      await sendMessage(ctx, 'Введіть марку текстом:', {
        inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
      });
      return true;
    }
    const value = pickFromList(BRANDS, payload) || toText(payload);
    if (!value) return true;
    if (draft.data.brand !== value) draft.data.model = '';
    draft.data.brand = value;
    await applyAndNext(ctx, draft, 2);
    return true;
  }

  if (action === 'lb_e_m') {
    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'LS_MODEL_TXT');
      await sendMessage(ctx, 'Введіть модель текстом:', {
        inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
      });
      return true;
    }
    const models = BRAND_MODELS[draft.data.brand] || [];
    const value = pickFromList(models, payload) || toText(payload);
    if (!value) return true;
    draft.data.model = value;
    await applyAndNext(ctx, draft, 3);
    return true;
  }

  if (action === 'lb_e_fu') {
    draft.data.fuel = payload === 'SKIP' ? null : (pickFromList(FUEL_OPTIONS, payload) || toText(payload) || null);
    await applyAndNext(ctx, draft, 7);
    return true;
  }

  if (action === 'ls_e_tr') {
    draft.data.transmission = payload === 'SKIP' ? null : (pickFromList(TRANS_OPTIONS, payload) || toText(payload) || null);
    await applyAndNext(ctx, draft, 8);
    return true;
  }

  if (action === 'ls_e_dr') {
    draft.data.drive = payload === 'SKIP' ? null : (pickFromList(DRIVE_OPTIONS, payload) || toText(payload) || null);
    await applyAndNext(ctx, draft, 9);
    return true;
  }

  if (action === 'ls_e_cd') {
    draft.data.condition = payload === 'SKIP' ? null : (pickFromList(COND_OPTIONS, payload) || toText(payload) || null);
    await applyAndNext(ctx, draft, 10);
    return true;
  }

  if (action === 'lb_e_ct') {
    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'LS_CITY_TXT');
      await sendMessage(ctx, 'Введіть місто:', {
        inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
      });
      return true;
    }
    draft.data.city = payload === 'SKIP' ? null : (pickFromList(CITY_OPTIONS, payload) || toText(payload) || null);
    await applyAndNext(ctx, draft, 11);
    return true;
  }

  return false;
};

export const handleLeadSellText = async (ctx: PipelineContext, text: string): Promise<boolean> => {
  const state = String(ctx.session?.state || '');
  const lang = resolveLang(ctx);
  const draft = readDraft(ctx);
  const message = ctx.update?.message;

  if (state === 'LS_BRAND_TXT') {
    const value = toText(text);
    if (value.length < 2) {
      await sendMessage(ctx, '⚠️ Введіть мінімум 2 символи.');
      return true;
    }
    draft.data.brand = value;
    await applyAndNext(ctx, draft, 2);
    return true;
  }

  if (state === 'LS_MODEL_TXT') {
    const value = toText(text);
    if (value.length < 1) {
      await sendMessage(ctx, '⚠️ Вкажіть модель авто.');
      return true;
    }
    draft.data.model = value;
    await applyAndNext(ctx, draft, 3);
    return true;
  }

  if (state === 'LS_YEAR') {
    const parsed = parseYearInput(text);
    if (!parsed) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_year'));
      return true;
    }
    draft.data.year = parsed.min;
    await applyAndNext(ctx, draft, 4);
    return true;
  }

  if (state === 'LS_PRICE') {
    const parsed = parseBudgetUSD(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_budget'));
      return true;
    }
    draft.data.price = parsed;
    await applyAndNext(ctx, draft, 5);
    return true;
  }

  if (state === 'LS_MILEAGE') {
    const parsed = parseMileageKm(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_mileage'));
      return true;
    }
    draft.data.mileage = parsed;
    await applyAndNext(ctx, draft, 6);
    return true;
  }

  if (state === 'LS_CITY_TXT') {
    draft.data.city = toText(text) || null;
    await applyAndNext(ctx, draft, 11);
    return true;
  }

  if (state === 'LS_DESC') {
    if (containsForbiddenContacts(text)) {
      await sendMessage(ctx, t(lang, 'common.err.contacts_forbidden'));
      return true;
    }
    draft.data.description = toText(text) || null;
    await applyAndNext(ctx, draft, 12);
    return true;
  }

  if (state === 'LS_PHOTO') {
    const photos = Array.isArray(draft.data.photos) ? draft.data.photos : [];
    if (message?.photo?.length) {
      const file = message.photo[message.photo.length - 1]?.file_id;
      if (file) {
        photos.push(file);
        draft.data.photos = photos;
        await persistDraft(ctx, draft, 'LS_PHOTO');
        await sendMessage(ctx, `📸 Фото додано (${photos.length}). Надішліть ще або натисніть «Далі».`, {
          inline_keyboard: [[{ text: 'Далі', callback_data: buildCallbackData('ls_skip_photo') }]]
        });
        return true;
      }
    }
    await applyAndNext(ctx, draft, 13);
    return true;
  }

  if (state === 'LS_CONTACT') {
    if (message?.contact?.phone_number) {
      const normalized = normalizePhoneUA(message.contact.phone_number);
      if (!normalized) {
        await sendMessage(ctx, t(lang, 'common.err.invalid_phone'));
        return true;
      }
      draft.data.phone = normalized;
      await showReview(ctx, draft);
      return true;
    }

    if (norm(text) === norm(button(lang, 'common.back')) || norm(text) === 'назад') {
      draft.step = 12;
      await routeStep(ctx, draft);
      return true;
    }

    const normalized = normalizePhoneUA(text);
    if (!normalized) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_phone'));
      return true;
    }
    draft.data.phone = normalized;
    await showReview(ctx, draft);
    return true;
  }

  return false;
};
