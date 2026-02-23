import { prisma } from '../../../../../services/prisma.js';
// @ts-ignore
import { createOrMergeLead } from '../../../telegram/core/leadService.js';
import { externalSearchService } from '../../../../Integrations/external-search/externalSearch.service.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import { sendCarCardWithMedia } from './car-card.actions.js';
import { startFormFlow, type FormSubmission } from './form.actions.js';
import type { BotRuntime } from '../types.js';

type LeadBuyCriteria = {
  brand: string;
  model?: string;
  yearMin?: number;
  budgetMax?: number;
  mileageMax?: number;
  fuel?: string;
  comment?: string;
  contact: string;
};

type LeadBuyState = {
  criteria: LeadBuyCriteria;
  resultIds: string[];
  cursor: number;
  favorites: string[];
};

const toNum = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const cleanText = (value: unknown) => String(value || '').trim();

const readState = (vars: Record<string, any>): LeadBuyState | null => {
  const raw = vars.leadBuyState;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Array.isArray(raw.resultIds) || !Array.isArray(raw.favorites)) return null;
  return raw as LeadBuyState;
};

const writeState = (vars: Record<string, any>, state: LeadBuyState) => {
  vars.leadBuyState = state;
};

const mapListingToCard = (car: any) => ({
  canonicalId: car.id,
  sourceId: car.sourceMessageId || undefined,
  source: car.source,
  sourceUrl: car.sourceUrl,
  title: car.title,
  price: { amount: car.price || 0, currency: car.currency || 'USD' },
  year: car.year || 0,
  mileage: car.mileage || 0,
  location: car.location || '',
  thumbnail: car.thumbnail || '',
  mediaUrls: car.mediaUrls || [],
  mediaItems: car.mediaItems || [],
  specs: car.specs || {},
  status: car.status || 'AVAILABLE',
  postedAt: car.postedAt?.toISOString?.() || car.createdAt?.toISOString?.() || new Date().toISOString()
});

const inlineCardActions = (carId: string) => ({
  inline_keyboard: [
    [{ text: '✅ Цікавить це авто', callback_data: `LEADBUY:INTEREST:${carId}` }],
    [{ text: '⭐ Додати в обране', callback_data: `LEADBUY:FAV:${carId}` }]
  ]
});

const inlineBatchControls = {
  inline_keyboard: [
    [
      { text: 'Показати ще', callback_data: 'LEADBUY:MORE' },
      { text: 'Список обраних', callback_data: 'LEADBUY:FAVORITES' }
    ],
    [
      { text: 'Звʼязатися по обраних авто', callback_data: 'LEADBUY:CONTACT_FAVORITES' }
    ],
    [
      { text: 'Шукати ще', callback_data: 'LEADBUY:SEARCH_AGAIN' }
    ]
  ]
};

const inlineFavoriteDelete = (carId: string) => ({
  inline_keyboard: [[{ text: '🗑 Видалити з обраного', callback_data: `LEADBUY:DEL_FAV:${carId}` }]]
});

const loadCarsInOrder = async (ids: string[]) => {
  if (!ids.length) return [];
  const records = await prisma.carListing.findMany({
    where: { id: { in: ids } },
    include: {
      partnerCompany: {
        select: {
          id: true,
          name: true,
          crmUrl: true
        }
      }
    }
  });
  const map = new Map(records.map((item) => [item.id, item]));
  return ids.map((id) => map.get(id)).filter(Boolean) as any[];
};

const sendBatch = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
  batchSize?: number;
}) => {
  const state = readState(params.vars);
  if (!state) {
    await sendMessage(params.bot, params.chatId, '⚠️ Немає активного пошуку. Натисніть «Купити авто» ще раз.');
    return;
  }

  const batchSize = Math.max(1, Math.min(3, Number(params.batchSize || 3)));
  const batchIds = state.resultIds.slice(state.cursor, state.cursor + batchSize);

  if (!batchIds.length) {
    await sendMessage(params.bot, params.chatId, 'Більше варіантів не знайдено. Спробуйте «Шукати ще».', inlineBatchControls);
    return;
  }

  const batchCars = await loadCarsInOrder(batchIds);
  for (const car of batchCars) {
    await sendCarCardWithMedia({
      bot: params.bot,
      chatId: params.chatId,
      car: mapListingToCard(car),
      lang: 'UK',
      replyMarkup: inlineCardActions(car.id),
      actionsPromptText: 'Оберіть дію по авто:'
    });
  }

  state.cursor += batchCars.length;
  writeState(params.vars, state);
  await sendMessage(params.bot, params.chatId, 'Керування результатами:', inlineBatchControls);
};

const notifyLeadBuyAdmin = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  criteria: LeadBuyCriteria;
  selectedIds: string[];
  reason: 'INTEREST' | 'FAVORITES';
}) => {
  if (!params.bot.adminChatId) return;

  const selectedCars = await loadCarsInOrder(params.selectedIds);
  if (!selectedCars.length) return;

  const lines: string[] = [
    '[LEAD BUY]',
    params.reason === 'FAVORITES' ? '📥 Запит на звʼязок по обраних авто' : '📥 Клієнт зацікавився авто',
    `Chat ID: ${params.chatId}`,
    params.userId ? `TG User ID: ${params.userId}` : '',
    params.criteria.contact ? `Контакт: ${params.criteria.contact}` : '',
    `Параметри: ${params.criteria.brand}${params.criteria.model ? ` ${params.criteria.model}` : ''}`,
    params.criteria.yearMin ? `Рік від: ${params.criteria.yearMin}` : '',
    params.criteria.budgetMax ? `Бюджет до: ${params.criteria.budgetMax}` : '',
    params.criteria.mileageMax ? `Пробіг до: ${params.criteria.mileageMax}` : '',
    params.criteria.fuel ? `Пальне: ${params.criteria.fuel}` : '',
    params.criteria.comment ? `Коментар: ${params.criteria.comment}` : '',
    '',
    'Авто:'
  ].filter(Boolean);

  const crmButtons: any[] = [];

  selectedCars.forEach((car, index) => {
    const number = index + 1;
    lines.push(`${number}. ${car.title} (${car.year || '—'}) • ${car.price || 0} ${car.currency || 'USD'}`);

    if (car.partnerCompanyId && car.partnerCompany?.name) {
      lines.push(`   🤝 Партнер: ${car.partnerCompany.name}`);
      if (car.partnerCompany.crmUrl) {
        crmButtons.push([{ text: `CRM ${car.partnerCompany.name}`, url: car.partnerCompany.crmUrl }]);
      }
    }

    if (car.external) {
      lines.push(`   [EXTERNAL] SOURCE: ${car.sourceProvider || 'N/A'}`);
      if (car.sourceUrl) lines.push(`   URL: ${car.sourceUrl}`);
    }
  });

  const markup = crmButtons.length ? { inline_keyboard: crmButtons.slice(0, 8) } : undefined;
  await sendMessage(params.bot, String(params.bot.adminChatId), lines.join('\n'), markup);
};

const findInventoryMatches = async (bot: BotRuntime, criteria: LeadBuyCriteria) => {
  const records = await prisma.carListing.findMany({
    where: {
      status: 'AVAILABLE',
      ...(bot.companyId ? { companyId: bot.companyId } : {}),
      title: { contains: criteria.brand, mode: 'insensitive' },
      ...(criteria.yearMin ? { year: { gte: criteria.yearMin } } : {}),
      ...(criteria.budgetMax ? { price: { lte: criteria.budgetMax } } : {}),
      ...(criteria.mileageMax ? { mileage: { lte: criteria.mileageMax } } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: 40
  });

  return records.filter((item) => {
    if (criteria.model && !item.title.toLowerCase().includes(criteria.model.toLowerCase())) return false;
    if (criteria.fuel) {
      const fuel = String((item.specs as any)?.fuel || '').toLowerCase();
      if (fuel && !fuel.includes(criteria.fuel.toLowerCase())) return false;
    }
    return true;
  });
};

const createLeadForBuy = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  criteria: LeadBuyCriteria;
}) => {
  await createOrMergeLead({
    botId: params.bot.id,
    companyId: params.bot.companyId || null,
    chatId: params.chatId,
    userId: params.userId,
    name: `User ${params.chatId}`,
    phone: params.criteria.contact,
    request: `${params.criteria.brand} ${params.criteria.model || ''}`.trim(),
    source: 'TELEGRAM',
    payload: {
      yearMin: params.criteria.yearMin,
      budgetMax: params.criteria.budgetMax,
      mileageMax: params.criteria.mileageMax,
      fuel: params.criteria.fuel,
      comment: params.criteria.comment
    },
    leadType: 'BUY',
    createRequest: false
  }, params.bot.config);
};

export const startLeadBuyFlow = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
}) => {
  delete params.vars.leadBuyState;

  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'lead_buy_form',
    namespace: 'LEADBUY',
    title: 'Купити авто',
    confirmAction: 'LEADBUY:FORM_SUBMIT',
    fields: [
      { key: 'brand', label: 'Марка', prompt: 'Вкажіть марку авто:', type: 'text' },
      { key: 'model', label: 'Модель', prompt: 'Вкажіть модель (або виберіть швидку кнопку):', type: 'text', optional: true, manualLabel: 'Ввести вручну' },
      { key: 'yearMin', label: 'Рік від', prompt: 'Рік від (або Пропустити):', type: 'text', optional: true },
      { key: 'budgetMax', label: 'Бюджет до', prompt: 'Бюджет до (або Пропустити):', type: 'text', optional: true },
      { key: 'mileageMax', label: 'Пробіг до', prompt: 'Пробіг до (або Пропустити):', type: 'text', optional: true },
      { key: 'fuel', label: 'Тип пального', prompt: 'Тип пального (або Пропустити):', type: 'text', optional: true },
      { key: 'comment', label: 'Коментар', prompt: 'Коментар (або Пропустити):', type: 'text', optional: true },
      { key: 'contact', label: 'Контакт', prompt: 'Поділіться контактом або введіть номер телефону:', type: 'contact' }
    ]
  });
};

export const submitLeadBuyForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
  submission: FormSubmission;
}) => {
  if (params.submission.namespace !== 'LEADBUY') return false;

  if (params.submission.status === 'CANCELLED') {
    delete params.vars.leadBuyState;
    return true;
  }

  const values = params.submission.values || {};
  const criteria: LeadBuyCriteria = {
    brand: cleanText(values.brand),
    model: cleanText(values.model) || undefined,
    yearMin: toNum(values.yearMin),
    budgetMax: toNum(values.budgetMax),
    mileageMax: toNum(values.mileageMax),
    fuel: cleanText(values.fuel) || undefined,
    comment: cleanText(values.comment) || undefined,
    contact: cleanText(values.contact)
  };

  if (!criteria.brand || !criteria.contact) {
    await sendMessage(params.bot, params.chatId, '⚠️ Для пошуку потрібні щонайменше марка і контакт.');
    return true;
  }

  await createLeadForBuy({
    bot: params.bot,
    chatId: params.chatId,
    userId: params.userId,
    criteria
  });

  const internal = await findInventoryMatches(params.bot, criteria);
  let merged = internal;

  if (internal.length < 6) {
    const external = await externalSearchService.searchAndPersist({
      brand: criteria.brand,
      model: criteria.model,
      city: undefined,
      yearMin: criteria.yearMin,
      budgetMax: criteria.budgetMax,
      mileageMax: criteria.mileageMax,
      fuel: criteria.fuel
    }, {
      companyId: params.bot.companyId || null,
      maxResults: 8
    });

    const externalRecords = await prisma.carListing.findMany({
      where: { id: { in: external.map((item) => item.id) } }
    });

    const seen = new Set(internal.map((item) => item.id));
    for (const item of externalRecords) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item as any);
    }
  }

  const state: LeadBuyState = {
    criteria,
    resultIds: merged.slice(0, 30).map((item) => item.id),
    cursor: 0,
    favorites: []
  };
  writeState(params.vars, state);

  if (!state.resultIds.length) {
    await sendMessage(params.bot, params.chatId, 'Наразі варіантів не знайдено. Натисніть «Шукати ще», щоб змінити критерії.', inlineBatchControls);
    return true;
  }

  await sendBatch({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars,
    batchSize: 3
  });

  return true;
};

export const handleLeadBuyCallback = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
  callbackData: string;
}) => {
  const data = params.callbackData;
  if (!data.startsWith('LEADBUY:')) return false;

  const state = readState(params.vars);
  const [_, action, ...rest] = data.split(':');
  const carId = rest.join(':');

  if (action === 'FORM_SUBMIT') return true;

  if (!state && action !== 'SEARCH_AGAIN') {
    await sendMessage(params.bot, params.chatId, '⚠️ Сесія пошуку завершилась. Натисніть «Купити авто» ще раз.');
    return true;
  }

  if (action === 'MORE') {
    await sendBatch({ bot: params.bot, chatId: params.chatId, vars: params.vars, batchSize: 3 });
    return true;
  }

  if (action === 'SEARCH_AGAIN') {
    await startLeadBuyFlow({ bot: params.bot, chatId: params.chatId, vars: params.vars });
    return true;
  }

  if (!state) return true;

  if (action === 'FAV' && carId) {
    if (!state.favorites.includes(carId)) {
      state.favorites.push(carId);
      writeState(params.vars, state);
      await sendMessage(params.bot, params.chatId, '⭐ Авто додано в обране.');
    } else {
      await sendMessage(params.bot, params.chatId, 'ℹ️ Це авто вже в обраному.');
    }
    return true;
  }

  if (action === 'FAVORITES') {
    if (!state.favorites.length) {
      await sendMessage(params.bot, params.chatId, 'У вас поки немає обраних авто.');
      return true;
    }

    const favorites = await loadCarsInOrder(state.favorites);
    for (const car of favorites) {
      await sendCarCardWithMedia({
        bot: params.bot,
        chatId: params.chatId,
        car: mapListingToCard(car),
        lang: 'UK',
        replyMarkup: inlineFavoriteDelete(car.id),
        actionsPromptText: 'Оберіть дію по обраному авто:'
      });
    }
    return true;
  }

  if (action === 'DEL_FAV' && carId) {
    state.favorites = state.favorites.filter((id) => id !== carId);
    writeState(params.vars, state);
    await sendMessage(params.bot, params.chatId, '🗑 Видалено з обраного.');
    return true;
  }

  if (action === 'CONTACT_FAVORITES') {
    if (!state.favorites.length) {
      await sendMessage(params.bot, params.chatId, 'Спочатку додайте авто в обране.');
      return true;
    }

    await notifyLeadBuyAdmin({
      bot: params.bot,
      chatId: params.chatId,
      userId: params.userId,
      criteria: state.criteria,
      selectedIds: state.favorites,
      reason: 'FAVORITES'
    });

    await sendMessage(params.bot, params.chatId, '✅ Запит передано менеджеру по всіх обраних авто.');
    return true;
  }

  if (action === 'INTEREST' && carId) {
    await notifyLeadBuyAdmin({
      bot: params.bot,
      chatId: params.chatId,
      userId: params.userId,
      criteria: state.criteria,
      selectedIds: [carId],
      reason: 'INTEREST'
    });

    await sendMessage(params.bot, params.chatId, '✅ Передано менеджеру. Ми звʼяжемось з вами.');
    return true;
  }

  return true;
};
