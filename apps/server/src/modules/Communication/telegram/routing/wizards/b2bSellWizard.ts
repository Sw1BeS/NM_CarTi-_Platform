import { prisma } from '../../../../../services/prisma.js';
import type { PipelineContext } from '../../core/types.js';
import { resolveLang, t, button } from '../../core/utils/telegramText.js';
import { telegramOutbox } from '../../messaging/outbox/telegramOutbox.js';
import { ActionTokens, buildCallbackData } from '../../core/utils/callbackUtils.js';
import {
  BRANDS,
  BRAND_MODELS,
  CITY_OPTIONS,
  FUEL_OPTIONS,
  TRANS_OPTIONS,
  DRIVE_OPTIONS,
  COND_OPTIONS,
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
import { renderChannelCarPost } from '../../../../../services/cardRenderer.js';
import { normalizeBotConfigChatId } from '../../core/utils/telegramChatId.js';

type B2BSellMode = 'create' | 'edit';

type B2BSellData = {
  brand: string;
  model: string;
  year?: number | null;
  mileage?: number | null;
  fuel?: string | null;
  transmission?: string | null;
  drive?: string | null;
  condition?: string | null;
  damage?: string | null;
  price?: number | null;
  city?: string | null;
  photos: string[];
  contact?: string | null;
};

type B2BSellDraft = {
  step: number;
  data: B2BSellData;
  history: string[];
  reviewMode?: boolean;
  mode?: B2BSellMode;
  carId?: string | null;
};

type StartB2BSellOptions = {
  mode?: B2BSellMode;
  carId?: string;
};

const TOTAL_STEPS = 13;
const toText = (value: unknown) => String(value || '').trim();
const norm = (value: unknown) => toText(value).toLowerCase();
const stepHeader = (step: number) => `Крок ${step}/${TOTAL_STEPS}`;
const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

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

const stepStateMap: Record<number, string> = {
  1: 'BS_BRAND',
  2: 'BS_MODEL',
  3: 'BS_YEAR',
  4: 'BS_MILEAGE',
  5: 'BS_FUEL',
  6: 'BS_TRANS',
  7: 'BS_DRIVE',
  8: 'BS_COND',
  9: 'BS_DAMAGE',
  10: 'BS_PRICE',
  11: 'BS_CITY',
  12: 'BS_PHOTO',
  13: 'BS_CONTACT',
  14: 'BS_REVIEW'
};

const readDraft = (ctx: PipelineContext): B2BSellDraft | null => {
  const vars = (ctx.session?.variables as any) || {};
  const draft = vars.b2bSellDraft as B2BSellDraft | undefined;
  if (!draft || typeof draft !== 'object') return null;
  const data = (draft.data || {}) as Partial<B2BSellData>;
  return {
    step: Number(draft.step || 1),
    data: {
      brand: toText(data.brand || ''),
      model: toText(data.model || ''),
      year: typeof data.year === 'number' ? data.year : null,
      mileage: typeof data.mileage === 'number' ? data.mileage : null,
      fuel: data.fuel || null,
      transmission: data.transmission || null,
      drive: data.drive || null,
      condition: data.condition || null,
      damage: data.damage || null,
      price: typeof data.price === 'number' ? data.price : null,
      city: data.city || null,
      photos: Array.isArray(data.photos) ? data.photos.filter(Boolean).slice(0, 10) : [],
      contact: data.contact || null
    },
    history: Array.isArray(draft.history) ? draft.history : [],
    reviewMode: Boolean(draft.reviewMode),
    mode: draft.mode === 'edit' ? 'edit' : 'create',
    carId: draft.carId ? String(draft.carId) : null
  };
};

const persistDraft = async (ctx: PipelineContext, draft: B2BSellDraft, state?: string) => {
  if (!ctx.session) return;
  const vars = (ctx.session.variables as any) || {};
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: state || stepStateMap[draft.step] || `BS_STEP_${draft.step}`,
      variables: {
        ...vars,
        b2bSellDraft: draft
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
        b2bSellDraft: null,
        b2bInventoryEditCarId: null,
        b2bInventoryDeleteCarId: null
      },
      lastActive: new Date()
    }
  });
};

const resolvePartnerContext = async (ctx: PipelineContext) => {
  const vars = (ctx.session?.variables as any) || {};
  const tgUserId = String(ctx.update?.callback_query?.from?.id || ctx.update?.message?.from?.id || ctx.userId || '').trim();

  if (vars.b2bPartnerId) {
    return {
      partnerId: String(vars.b2bPartnerId),
      partnerName: String(vars.b2bPartnerName || 'Партнер')
    };
  }

  if (!tgUserId) return null;
  const partnerUser = await prisma.partnerUser.findFirst({
    where: {
      telegramId: tgUserId,
      ...(ctx.companyId ? { companyId: ctx.companyId } : {})
    },
    include: { partner: true }
  });
  if (!partnerUser?.partner?.id) return null;
  return {
    partnerId: partnerUser.partner.id,
    partnerName: String(partnerUser.partner.name || 'Партнер')
  };
};

const applyAndNext = async (ctx: PipelineContext, draft: B2BSellDraft, nextStep: number) => {
  if (draft.reviewMode) {
    draft.reviewMode = false;
    draft.step = 14;
    await routeStep(ctx, draft);
    return;
  }
  draft.step = nextStep;
  await routeStep(ctx, draft);
};

const showReview = async (ctx: PipelineContext, draft: B2BSellDraft) => {
  const lang = resolveLang(ctx);
  draft.step = 14;
  draft.reviewMode = false;
  await persistDraft(ctx, draft, 'BS_REVIEW');
  const d = draft.data;
  const summary = [
    `Марка: ${d.brand || '—'}`,
    `Модель: ${d.model || '—'}`,
    `Рік: ${d.year || '—'}`,
    `Пробіг: ${d.mileage ? `${d.mileage} км` : '—'}`,
    `Паливо: ${d.fuel || '—'}`,
    `КПП: ${d.transmission || '—'}`,
    `Привід: ${d.drive || '—'}`,
    `Стан: ${d.condition || '—'}`,
    `Пошкодження/примітка: ${d.damage || '—'}`,
    `Ціна: ${d.price ? `${d.price} USD` : '—'}`,
    `Місто: ${d.city || '—'}`,
    `Фото: ${d.photos.length ? `${d.photos.length} шт.` : '—'}`,
    `Контакт: ${d.contact || '—'}`
  ].join('\n');

  const primaryAction = draft.mode === 'edit' ? '💾 Оновити' : '💾 В інвентар';
  const publishAction = draft.mode === 'edit' ? '📣 Оновити і опублікувати' : '📣 Опублікувати';
  await sendMessage(ctx, t(lang, 'b2b.sell.review.title', { summary }), {
    inline_keyboard: [
      [{ text: primaryAction, callback_data: buildCallbackData('bs_save') }],
      [{ text: publishAction, callback_data: buildCallbackData('bs_pub') }],
      [{ text: button(lang, 'common.edit'), callback_data: buildCallbackData('bs_edit') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const showEditFields = async (ctx: PipelineContext, draft: B2BSellDraft) => {
  const lang = resolveLang(ctx);
  const d = draft.data;
  await persistDraft(ctx, draft, 'BS_REVIEW');
  await sendMessage(ctx, '✏️ Оберіть поле для зміни:', {
    inline_keyboard: [
      [{ text: `Марка: ${d.brand || '—'}`, callback_data: buildCallbackData('bs_j', '1') }],
      [{ text: `Модель: ${d.model || '—'}`, callback_data: buildCallbackData('bs_j', '2') }],
      [{ text: `Рік: ${d.year || '—'}`, callback_data: buildCallbackData('bs_j', '3') }],
      [{ text: `Пробіг: ${d.mileage ? `${d.mileage} км` : '—'}`, callback_data: buildCallbackData('bs_j', '4') }],
      [{ text: `Паливо: ${d.fuel || '—'}`, callback_data: buildCallbackData('bs_j', '5') }],
      [{ text: `КПП: ${d.transmission || '—'}`, callback_data: buildCallbackData('bs_j', '6') }],
      [{ text: `Привід: ${d.drive || '—'}`, callback_data: buildCallbackData('bs_j', '7') }],
      [{ text: `Стан: ${d.condition || '—'}`, callback_data: buildCallbackData('bs_j', '8') }],
      [{ text: `Пошкодження: ${d.damage || '—'}`, callback_data: buildCallbackData('bs_j', '9') }],
      [{ text: `Ціна: ${d.price ? `${d.price} USD` : '—'}`, callback_data: buildCallbackData('bs_j', '10') }],
      [{ text: `Місто: ${d.city || '—'}`, callback_data: buildCallbackData('bs_j', '11') }],
      [{ text: `Фото: ${d.photos.length ? `${d.photos.length} шт.` : '—'}`, callback_data: buildCallbackData('bs_j', '12') }],
      [{ text: `Контакт: ${d.contact || '—'}`, callback_data: buildCallbackData('bs_j', '13') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const routeStep = async (ctx: PipelineContext, draft: B2BSellDraft) => {
  const lang = resolveLang(ctx);
  if (draft.step <= 1) {
    draft.step = 1;
    await persistDraft(ctx, draft, 'BS_BRAND');
    const rows = buildBrandKeyboard(lang, {
      action: 'bs_b',
      cancelAction: ActionTokens.LB_CANCEL,
      backAction: 'bs_back_0'
    });
    await sendMessage(ctx, `${stepHeader(1)}\nОберіть марку авто:`, { inline_keyboard: rows });
    return;
  }

  if (draft.step === 2) {
    await persistDraft(ctx, draft, 'BS_MODEL');
    await sendMessage(ctx, `${stepHeader(2)}\nОберіть модель авто:`, {
      inline_keyboard: buildModelKeyboard(draft.data.brand || '', lang, {
        action: 'bs_m',
        backAction: 'bs_back_1',
        cancelAction: ActionTokens.LB_CANCEL
      })
    });
    return;
  }

  if (draft.step === 3) {
    await persistDraft(ctx, draft, 'BS_YEAR');
    await sendMessage(ctx, `${stepHeader(3)}\nВкажіть рік (обовʼязково):`, {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_2') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 4) {
    await persistDraft(ctx, draft, 'BS_MILEAGE');
    await sendMessage(ctx, `${stepHeader(4)}\nВкажіть пробіг (необовʼязково):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bs_skip_ml') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_3') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 5) {
    await persistDraft(ctx, draft, 'BS_FUEL');
    await sendMessage(ctx, `${stepHeader(5)}\nОберіть паливо (необовʼязково):`, {
      inline_keyboard: buildFuelKeyboard(lang, {
        action: 'bs_fu',
        backAction: 'bs_back_4',
        cancelAction: ActionTokens.LB_CANCEL
      })
    });
    return;
  }

  if (draft.step === 6) {
    await persistDraft(ctx, draft, 'BS_TRANS');
    await sendMessage(ctx, `${stepHeader(6)}\nОберіть КПП (необовʼязково):`, {
      inline_keyboard: buildTransmissionKeyboard({
        action: 'bs_tr',
        backAction: 'bs_back_5',
        cancelAction: ActionTokens.LB_CANCEL
      })
    });
    return;
  }

  if (draft.step === 7) {
    await persistDraft(ctx, draft, 'BS_DRIVE');
    await sendMessage(ctx, `${stepHeader(7)}\nОберіть привід (необовʼязково):`, {
      inline_keyboard: buildDriveKeyboard({
        action: 'bs_dr',
        backAction: 'bs_back_6',
        cancelAction: ActionTokens.LB_CANCEL
      })
    });
    return;
  }

  if (draft.step === 8) {
    await persistDraft(ctx, draft, 'BS_COND');
    await sendMessage(ctx, `${stepHeader(8)}\nОберіть стан авто (необовʼязково):`, {
      inline_keyboard: buildConditionKeyboard({
        action: 'bs_cd',
        backAction: 'bs_back_7',
        cancelAction: ActionTokens.LB_CANCEL
      })
    });
    return;
  }

  if (draft.step === 9) {
    await persistDraft(ctx, draft, 'BS_DAMAGE');
    await sendMessage(ctx, `${stepHeader(9)}\nВкажіть пошкодження/примітку (необовʼязково, без контактів):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('bs_skip_dmg') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_8') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 10) {
    await persistDraft(ctx, draft, 'BS_PRICE');
    await sendMessage(ctx, `${stepHeader(10)}\nВкажіть ціну в USD (обовʼязково):`, {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_9') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 11) {
    await persistDraft(ctx, draft, 'BS_CITY');
    await sendMessage(ctx, `${stepHeader(11)}\nОберіть місто (необовʼязково):`, {
      inline_keyboard: buildCityKeyboard(lang, {
        action: 'bs_ct',
        backAction: 'bs_back_10',
        cancelAction: ActionTokens.LB_CANCEL
      })
    });
    return;
  }

  if (draft.step === 12) {
    await persistDraft(ctx, draft, 'BS_PHOTO');
    const rows: any[][] = [];
    if (draft.data.photos.length > 0) {
      rows.push([{ text: '✅ Завершити фото', callback_data: buildCallbackData('bs_dphoto') }]);
    }
    rows.push([
      { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_11') },
      { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
    ]);
    await sendMessage(ctx, `${stepHeader(12)}\nНадішліть мінімум 1 фото (лише фото):`, {
      inline_keyboard: rows
    });
    return;
  }

  if (draft.step === 13) {
    await persistDraft(ctx, draft, 'BS_CONTACT');
    if (String(ctx.chatType || '') === 'private') {
      await sendMessage(ctx, `${stepHeader(13)}\nДодайте контакт для адміністратора:`, {
        keyboard: [
          [{ text: button(lang, 'common.shareContact'), request_contact: true }],
          [{ text: button(lang, 'common.back') }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      });
      await sendMessage(ctx, 'Керування кроком:', {
        inline_keyboard: [[
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_12') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]]
      });
    } else {
      await sendMessage(ctx, `${stepHeader(13)}\nВведіть номер вручну:`, {
        inline_keyboard: [[
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_12') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]]
      });
    }
    return;
  }

  await showReview(ctx, draft);
};

const buildSpecs = (draft: B2BSellDraft, existingSpecs?: Record<string, any>) => {
  const prev = asRecord(existingSpecs);
  const d = draft.data;
  return {
    ...prev,
    brand: d.brand || prev.brand || null,
    model: d.model || prev.model || null,
    fuel: d.fuel || null,
    transmission: d.transmission || null,
    drive: d.drive || null,
    condition: d.condition || null,
    damage: d.damage || null,
    ownerContact: d.contact || null,
    runs: typeof prev.runs === 'boolean' ? prev.runs : true
  } as any;
};

const publishCarToChannel = async (
  ctx: PipelineContext,
  car: any,
  partnerId?: string | null
): Promise<{ ok: boolean; messageId?: number; reason?: string; already?: boolean }> => {
  if (!ctx.bot) return { ok: false, reason: 'bot_not_found' };
  const channelId = normalizeBotConfigChatId(ctx.bot.channelId);
  if (!channelId) return { ok: false, reason: 'channel_not_configured' };
  if (car.status === 'SOLD') return { ok: false, reason: 'car_sold' };

  const existingPost = await prisma.channelPost.findFirst({
    where: {
      carId: car.id,
      botId: ctx.bot.id,
      channelId: String(channelId),
      status: 'ACTIVE'
    },
    orderBy: { createdAt: 'desc' }
  });
  if (existingPost) {
    return { ok: true, already: true, messageId: existingPost.messageId };
  }

  const cardText = renderChannelCarPost(car);
  const firstMedia = toText(car.thumbnail || (Array.isArray(car.mediaUrls) ? car.mediaUrls[0] : ''));
  const sent = firstMedia
    ? await telegramOutbox.sendPhoto({
      botId: ctx.bot.id,
      token: ctx.bot.token,
      chatId: String(channelId),
      photo: firstMedia,
      caption: cardText,
      companyId: ctx.companyId
    }).catch(() => null as any)
    : await telegramOutbox.sendMessage({
      botId: ctx.bot.id,
      token: ctx.bot.token,
      chatId: String(channelId),
      text: cardText,
      companyId: ctx.companyId
    }).catch(() => null as any);

  const messageId = Number((sent as any)?.message_id || 0);
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return { ok: false, reason: 'send_failed' };
  }

  await prisma.channelPost.create({
    data: {
      carId: car.id,
      botId: ctx.bot.id,
      channelId: String(channelId),
      messageId,
      payload: {
        source: 'telegram_b2b_sell',
        partnerId: partnerId || null
      } as any
    }
  }).catch(() => null);

  return { ok: true, messageId };
};

const submitSell = async (ctx: PipelineContext, draft: B2BSellDraft, publishToChannel: boolean) => {
  if (!ctx.bot) return;
  const partnerCtx = await resolvePartnerContext(ctx);
  if (!partnerCtx?.partnerId) {
    await sendMessage(ctx, '⛔️ Потрібна активна реєстрація партнера.');
    await clearDraft(ctx);
    await sendRegisteredMenu(ctx);
    return;
  }

  if (!draft.data.brand || !draft.data.model || !draft.data.year || !draft.data.price || !draft.data.contact) {
    await sendMessage(ctx, '⚠️ Не всі обовʼязкові поля заповнено.');
    await showReview(ctx, draft);
    return;
  }
  if (!draft.data.photos.length) {
    await sendMessage(ctx, '⚠️ Додайте мінімум 1 фото.');
    draft.step = 12;
    await routeStep(ctx, draft);
    return;
  }

  const uniquePhotos = Array.from(new Set(draft.data.photos.filter(Boolean))).slice(0, 10);
  const commonUpdate = {
    title: `${draft.data.brand} ${draft.data.model}`.trim(),
    year: Math.round(Number(draft.data.year || 0)),
    mileage: Math.max(0, Math.round(Number(draft.data.mileage || 0))),
    price: Math.round(Number(draft.data.price || 0)),
    currency: 'USD',
    location: draft.data.city || null,
    thumbnail: uniquePhotos[0] || null,
    mediaUrls: uniquePhotos,
    description: draft.data.damage || null,
    specs: buildSpecs(draft)
  };

  let car: any = null;
  if (draft.mode === 'edit' && draft.carId) {
    const existing = await prisma.carListing.findFirst({
      where: {
        id: String(draft.carId),
        ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
        partnerCompanyId: partnerCtx.partnerId
      }
    });
    if (!existing) {
      await sendMessage(ctx, '⚠️ Авто для редагування не знайдено.');
      await clearDraft(ctx);
      await sendRegisteredMenu(ctx);
      return;
    }

    await prisma.carListing.update({
      where: { id: existing.id },
      data: {
        ...commonUpdate,
        specs: buildSpecs(draft, asRecord(existing.specs)),
        postedAt: existing.postedAt || new Date()
      }
    });
    car = await prisma.carListing.findUnique({ where: { id: existing.id } });
  } else {
    const carId = `b2b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    car = await prisma.carListing.create({
      data: {
        id: carId,
        source: 'MANUAL',
        status: 'AVAILABLE',
        companyId: ctx.companyId || null,
        partnerCompanyId: partnerCtx.partnerId,
        postedAt: new Date(),
        ...commonUpdate
      }
    });
  }

  if (!car) {
    await sendMessage(ctx, '⚠️ Не вдалося зберегти авто.');
    return;
  }

  let publishResult: { ok: boolean; messageId?: number; reason?: string; already?: boolean } = { ok: true };
  if (publishToChannel) {
    publishResult = await publishCarToChannel(ctx, car, partnerCtx.partnerId);
  }

  const from = ctx.update?.callback_query?.from || ctx.update?.message?.from;
  const tgUserId = String(from?.id || ctx.userId || ctx.chatId || '');
  const displayName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || 'Партнер';
  const username = from?.username ? `@${from.username}` : '—';
  const profileLink = from?.username ? `https://t.me/${from.username}` : `tg://user?id=${tgUserId}`;

  if (ctx.bot.adminChatId) {
    const publishedLine = !publishToChannel
      ? 'ні'
      : publishResult.ok
        ? (publishResult.already ? `вже був у каналі (msg ${publishResult.messageId || '—'})` : `так (msg ${publishResult.messageId || '—'})`)
        : `помилка (${publishResult.reason || 'unknown'})`;
    await sendMessage(ctx, [
      draft.mode === 'edit' ? '🟣 [B2B SELL EDIT]' : '🟣 [B2B SELL]',
      `Компанія: ${partnerCtx.partnerName}`,
      `👤 ${displayName}`,
      `username: ${username}`,
      `tgUserId: ${tgUserId || '—'}`,
      `🔗 ${profileLink}`,
      `Авто: ${car.title} ${car.year || ''}`.trim(),
      `Ціна: ${car.price || '—'} ${car.currency || 'USD'}`,
      `Пробіг: ${car.mileage ? `${car.mileage} км` : '—'}`,
      `Місто: ${car.location || '—'}`,
      `Контакт: ${draft.data.contact || '—'}`,
      `Публікація в канал: ${publishedLine}`,
      `Car ID: ${car.id}`
    ].join('\n'), undefined, String(ctx.bot.adminChatId));
  }

  await clearDraft(ctx);
  const lang = resolveLang(ctx);
  if (publishToChannel) {
    if (publishResult.ok && publishResult.already) {
      await sendRegisteredMenu(ctx, '✅ Авто оновлено. Публікація в каналі вже існує.');
      return;
    }
    if (publishResult.ok) {
      await sendRegisteredMenu(ctx, draft.mode === 'edit' ? '✅ Авто оновлено та опубліковано в каналі.' : t(lang, 'b2b.sell.published'));
      return;
    }
    await sendRegisteredMenu(ctx, `⚠️ Авто збережено, але не опубліковано в канал (${publishResult.reason || 'помилка'}).`);
    return;
  }

  await sendRegisteredMenu(ctx, draft.mode === 'edit' ? '✅ Авто оновлено у вашому інвентарі.' : t(lang, 'b2b.sell.saved'));
};

const parseStep = (payload?: string) => {
  const step = Number(toText(payload));
  if (!Number.isFinite(step) || step < 1 || step > 13) return null;
  return step;
};

const isBackIntent = (text: string, lang: ReturnType<typeof resolveLang>) => {
  const n = norm(text);
  return n === norm(button(lang, 'common.back')) || n === 'назад' || n === 'back';
};

const resolveBackStepFromState = (state: string): number | 'menu' => {
  const map: Record<string, number | 'menu'> = {
    BS_BRAND: 'menu',
    BS_BRAND_TXT: 'menu',
    BS_MODEL: 1,
    BS_MODEL_TXT: 1,
    BS_YEAR: 2,
    BS_MILEAGE: 3,
    BS_FUEL: 4,
    BS_TRANS: 5,
    BS_DRIVE: 6,
    BS_COND: 7,
    BS_DAMAGE: 8,
    BS_PRICE: 9,
    BS_CITY: 10,
    BS_CITY_TXT: 10,
    BS_PHOTO: 11,
    BS_CONTACT: 12,
    BS_REVIEW: 13
  };
  return map[state] ?? 'menu';
};

const isAllowedActionForState = (state: string, action: string) => {
  if (action === ActionTokens.LB_CANCEL) return true;
  if (!state.startsWith('BS_')) return false;

  if (action === 'bs_edit' || action === 'bs_save' || action === 'bs_pub') {
    return state === 'BS_REVIEW';
  }
  if (action === 'bs_j') return state === 'BS_REVIEW';

  if (action.startsWith('bs_back_')) return true;

  const allowed: Record<string, string[]> = {
    BS_BRAND: ['bs_b'],
    BS_BRAND_TXT: [],
    BS_MODEL: ['bs_m'],
    BS_MODEL_TXT: [],
    BS_YEAR: [],
    BS_MILEAGE: ['bs_skip_ml'],
    BS_FUEL: ['bs_fu'],
    BS_TRANS: ['bs_tr'],
    BS_DRIVE: ['bs_dr'],
    BS_COND: ['bs_cd'],
    BS_DAMAGE: ['bs_skip_dmg'],
    BS_PRICE: [],
    BS_CITY: ['bs_ct'],
    BS_CITY_TXT: [],
    BS_PHOTO: ['bs_dphoto'],
    BS_CONTACT: [],
    BS_REVIEW: ['bs_edit', 'bs_save', 'bs_pub', 'bs_j']
  };
  return (allowed[state] || []).includes(action);
};

const prefillDraftFromCar = (car: any): B2BSellDraft => {
  const specs = asRecord(car?.specs);
  const title = toText(car?.title || '');
  const titleParts = title.split(/\s+/).filter(Boolean);
  const brand = toText(specs.brand || (titleParts[0] || ''));
  const model = toText(specs.model || (titleParts.slice(1).join(' ') || ''));
  const photosRaw = [
    toText(car?.thumbnail || ''),
    ...(Array.isArray(car?.mediaUrls) ? car.mediaUrls.map((item: unknown) => toText(item)) : [])
  ].filter(Boolean);
  const photos = Array.from(new Set(photosRaw)).slice(0, 10);
  return {
    step: 14,
    data: {
      brand,
      model,
      year: Number.isFinite(Number(car?.year)) ? Number(car.year) : null,
      mileage: Number.isFinite(Number(car?.mileage)) ? Number(car.mileage) : null,
      fuel: toText(specs.fuel) || null,
      transmission: toText(specs.transmission) || null,
      drive: toText(specs.drive) || null,
      condition: toText(specs.condition) || null,
      damage: toText(specs.damage || car?.description) || null,
      price: Number.isFinite(Number(car?.price)) ? Number(car.price) : null,
      city: toText(car?.location) || null,
      photos,
      contact: toText(specs.ownerContact) || null
    },
    history: [],
    reviewMode: false,
    mode: 'edit',
    carId: String(car.id)
  };
};

export const startB2BSellWizard = async (ctx: PipelineContext, options?: StartB2BSellOptions) => {
  const mode = options?.mode === 'edit' ? 'edit' : 'create';
  if (mode === 'edit') {
    const carId = toText(options?.carId);
    if (!carId) {
      await sendMessage(ctx, '⚠️ Не вдалося визначити авто для редагування.');
      await clearDraft(ctx);
      await sendRegisteredMenu(ctx);
      return;
    }
    const partner = await resolvePartnerContext(ctx);
    if (!partner?.partnerId) {
      await sendMessage(ctx, '⛔️ Потрібна активна реєстрація партнера.');
      await clearDraft(ctx);
      await sendRegisteredMenu(ctx);
      return;
    }
    const car = await prisma.carListing.findFirst({
      where: {
        id: carId,
        ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
        partnerCompanyId: partner.partnerId,
        status: { not: 'HIDDEN' }
      }
    });
    if (!car) {
      await sendMessage(ctx, '⚠️ Авто не знайдено або недоступне для редагування.');
      await clearDraft(ctx);
      await sendRegisteredMenu(ctx);
      return;
    }
    const draft = prefillDraftFromCar(car);
    await showReview(ctx, draft);
    return;
  }

  const draft: B2BSellDraft = {
    step: 1,
    data: {
      brand: '',
      model: '',
      photos: []
    },
    history: [],
    reviewMode: false,
    mode: 'create',
    carId: null
  };
  await routeStep(ctx, draft);
};

export const handleB2BSellCallback = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
  const vars = (ctx.session?.variables as any) || {};
  const hasDraft = Boolean(vars.b2bSellDraft && typeof vars.b2bSellDraft === 'object');
  const state = String(ctx.session?.state || '');
  const lang = resolveLang(ctx);

  if (action === ActionTokens.LB_CANCEL) {
    await clearDraft(ctx);
    await sendRegisteredMenu(ctx, t(lang, 'cancelled'));
    return true;
  }

  if (!hasDraft) {
    await sendMessage(ctx, '⚠️ Сесія продажу неактивна. Оберіть «Продати авто» в меню.');
    return true;
  }

  if (!isAllowedActionForState(state, action)) {
    await sendMessage(ctx, '⚠️ Ця дія недоступна на поточному кроці.');
    return true;
  }

  const draft = readDraft(ctx);
  if (!draft) {
    await sendMessage(ctx, '⚠️ Сесію не знайдено. Почніть продаж ще раз.');
    return true;
  }

  if (action === 'bs_edit') {
    await showEditFields(ctx, draft);
    return true;
  }

  if (action === 'bs_j') {
    const step = parseStep(payload);
    if (!step) return true;
    draft.reviewMode = true;
    draft.step = step;
    await routeStep(ctx, draft);
    return true;
  }

  if (action.startsWith('bs_back_')) {
    const step = Number(action.replace('bs_back_', ''));
    if (!Number.isFinite(step) || step < 0) return true;
    if (step === 0) {
      await clearDraft(ctx);
      await sendRegisteredMenu(ctx);
      return true;
    }
    draft.step = step;
    await routeStep(ctx, draft);
    return true;
  }

  if (action === 'bs_skip_ml') {
    draft.data.mileage = null;
    await applyAndNext(ctx, draft, 5);
    return true;
  }

  if (action === 'bs_skip_dmg') {
    draft.data.damage = null;
    await applyAndNext(ctx, draft, 10);
    return true;
  }

  if (action === 'bs_dphoto') {
    if (!draft.data.photos.length) {
      await sendMessage(ctx, '⚠️ Додайте мінімум 1 фото.');
      await routeStep(ctx, draft);
      return true;
    }
    await applyAndNext(ctx, draft, 13);
    return true;
  }

  if (action === 'bs_b') {
    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'BS_BRAND_TXT');
      await sendMessage(ctx, 'Введіть марку текстом:', {
        inline_keyboard: [[
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_0') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]]
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

  if (action === 'bs_m') {
    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'BS_MODEL_TXT');
      await sendMessage(ctx, 'Введіть модель текстом:', {
        inline_keyboard: [[
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_1') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]]
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

  if (action === 'bs_fu') {
    draft.data.fuel = payload === 'SKIP' ? null : (pickFromList(FUEL_OPTIONS, payload) || toText(payload) || null);
    await applyAndNext(ctx, draft, 6);
    return true;
  }

  if (action === 'bs_tr') {
    draft.data.transmission = payload === 'SKIP' ? null : (pickFromList(TRANS_OPTIONS, payload) || toText(payload) || null);
    await applyAndNext(ctx, draft, 7);
    return true;
  }

  if (action === 'bs_dr') {
    draft.data.drive = payload === 'SKIP' ? null : (pickFromList(DRIVE_OPTIONS, payload) || toText(payload) || null);
    await applyAndNext(ctx, draft, 8);
    return true;
  }

  if (action === 'bs_cd') {
    draft.data.condition = payload === 'SKIP' ? null : (pickFromList(COND_OPTIONS, payload) || toText(payload) || null);
    await applyAndNext(ctx, draft, 9);
    return true;
  }

  if (action === 'bs_ct') {
    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'BS_CITY_TXT');
      await sendMessage(ctx, 'Введіть місто:', {
        inline_keyboard: [[
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_10') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]]
      });
      return true;
    }
    draft.data.city = payload === 'SKIP' ? null : (pickFromList(CITY_OPTIONS, payload) || toText(payload) || null);
    await applyAndNext(ctx, draft, 12);
    return true;
  }

  if (action === 'bs_save') {
    await submitSell(ctx, draft, false);
    return true;
  }

  if (action === 'bs_pub') {
    await submitSell(ctx, draft, true);
    return true;
  }

  return false;
};

export const handleB2BSellText = async (ctx: PipelineContext, text: string): Promise<boolean> => {
  const state = String(ctx.session?.state || '');
  const vars = (ctx.session?.variables as any) || {};
  const hasDraft = Boolean(vars.b2bSellDraft && typeof vars.b2bSellDraft === 'object');
  const lang = resolveLang(ctx);
  const message = ctx.update?.message;

  if (state.startsWith('BS_') && !hasDraft) {
    await clearDraft(ctx);
    await sendRegisteredMenu(ctx, '⚠️ Сесія продажу втрачена. Почнімо заново.');
    return true;
  }

  const draft = readDraft(ctx);
  if (!draft) return false;

  if (isBackIntent(text, lang) && state.startsWith('BS_')) {
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

  if (state === 'BS_BRAND_TXT') {
    const value = toText(text);
    if (value.length < 2) {
      await sendMessage(ctx, '⚠️ Введіть мінімум 2 символи.');
      return true;
    }
    draft.data.brand = value;
    await applyAndNext(ctx, draft, 2);
    return true;
  }

  if (state === 'BS_MODEL_TXT') {
    const value = toText(text);
    if (value.length < 1) {
      await sendMessage(ctx, '⚠️ Вкажіть модель.');
      return true;
    }
    draft.data.model = value;
    await applyAndNext(ctx, draft, 3);
    return true;
  }

  if (state === 'BS_YEAR') {
    const parsed = parseYearInput(text);
    if (!parsed) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_year'));
      return true;
    }
    draft.data.year = parsed.min;
    await applyAndNext(ctx, draft, 4);
    return true;
  }

  if (state === 'BS_MILEAGE') {
    const parsed = parseMileageKm(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_mileage'));
      return true;
    }
    draft.data.mileage = parsed;
    await applyAndNext(ctx, draft, 5);
    return true;
  }

  if (state === 'BS_DAMAGE') {
    if (containsForbiddenContacts(text)) {
      await sendMessage(ctx, t(lang, 'common.err.contacts_forbidden'));
      return true;
    }
    draft.data.damage = toText(text) || null;
    await applyAndNext(ctx, draft, 10);
    return true;
  }

  if (state === 'BS_PRICE') {
    const parsed = parseBudgetUSD(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_budget'));
      return true;
    }
    draft.data.price = parsed;
    await applyAndNext(ctx, draft, 11);
    return true;
  }

  if (state === 'BS_CITY_TXT') {
    draft.data.city = toText(text) || null;
    await applyAndNext(ctx, draft, 12);
    return true;
  }

  if (state === 'BS_PHOTO') {
    const photos = Array.isArray(draft.data.photos) ? draft.data.photos : [];
    if (message?.photo?.length) {
      const file = message.photo[message.photo.length - 1]?.file_id;
      if (file) {
        photos.push(file);
        draft.data.photos = Array.from(new Set(photos)).slice(0, 10);
        await persistDraft(ctx, draft, 'BS_PHOTO');
        await sendMessage(ctx, `📸 Фото додано (${draft.data.photos.length}). Надішліть ще або натисніть «Завершити фото».`, {
          inline_keyboard: [
            [{ text: '✅ Завершити фото', callback_data: buildCallbackData('bs_dphoto') }],
            [
              { text: button(lang, 'common.back'), callback_data: buildCallbackData('bs_back_11') },
              { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
            ]
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

  if (state === 'BS_CONTACT') {
    const source = message?.contact?.phone_number || text;
    const normalized = normalizePhoneUA(source);
    if (!normalized) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_phone'));
      return true;
    }
    draft.data.contact = normalized;
    await showReview(ctx, draft);
    return true;
  }

  if (state.startsWith('BS_')) {
    await sendMessage(ctx, 'Використайте кнопки під повідомленням або «❌ Скасувати».');
    return true;
  }

  return false;
};
