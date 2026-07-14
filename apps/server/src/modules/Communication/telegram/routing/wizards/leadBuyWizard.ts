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
  buildBrandKeyboard,
  buildBudgetKeyboard,
  buildCityKeyboard,
  buildFuelKeyboard,
  buildMileageKeyboard,
  buildModelKeyboard,
  buildYearKeyboard,
  pickFromList
} from '../../core/utils/quickPicks.js';
import {
  containsForbiddenContacts,
  normalizePhoneUA,
  parseBudgetUSD,
  parseMileageKm,
  parseYearInput
} from '../../core/utils/inputValidators.js';
import { buildAfterBatchControls, buildLeadBuyCardButtons, renderLeadBuyCard } from '../../../../../services/cardRenderer.js';
import { createOrMergeLead } from '../../core/leadService.js';
import { externalSearchService } from '../../../../Integrations/external-search/externalSearch.service.js';
import { quotaService } from '../../../../../services/quota.service.js';
import { getEnvInt } from '../../../../../services/featureFlags.js';
import { mergeSessionAttributionPayload } from '../utils/sessionAttribution.js';

type LeadBuyData = {
  brand: string;
  model?: string | null;
  year?: string | null;
  yearMin?: number | null;
  yearMax?: number | null;
  budget?: number | null;
  mileage?: number | null;
  fuel?: string | null;
  city?: string | null;
  comment?: string | null;
  phone?: string | null;
};

type LeadBuyIdentity = {
  displayName: string;
  username: string | null;
  tgUserId: string;
  userLink: string;
};

type LeadBuyResultsState = {
  ids: string[];
  cursor: number;
  pageIds: string[];
  source: 'inventory' | 'external' | null;
  externalRefs?: Array<{ provider: string; url: string }>;
};

type LeadBuyFavoritesState = {
  page: number;
  pageIds: string[];
  total: number;
};

type LeadBuyDraft = {
  step: number;
  data: LeadBuyData;
  history: string[];
  reviewMode?: boolean;
  editField?: string;
  viewMode?: 'results' | 'favorites';
  results?: LeadBuyResultsState;
  favorites?: LeadBuyFavoritesState;
};

const TOTAL_STEPS = 9;

const toText = (value: unknown) => String(value || '').trim();
const norm = (value: unknown) => toText(value).toLowerCase();

const getTgUserId = (ctx: PipelineContext) => {
  return String(
    ctx.update?.callback_query?.from?.id
      || ctx.update?.message?.from?.id
      || ctx.userId
      || ctx.chatId
      || ''
  ).trim();
};

const getCompanyId = (ctx: PipelineContext) => {
  return String(ctx.companyId || ctx.bot?.companyId || '').trim() || null;
};

const stepHeader = (n: number) => `Крок ${n}/${TOTAL_STEPS}`;
const LEAD_BUY_DAILY_LIMIT = Math.max(1, getEnvInt('BOT_LEAD_BUY_DAILY_LIMIT', 5));

const stateByStep: Record<number, string> = {
  1: 'LB_BRAND',
  2: 'LB_MODEL',
  3: 'LB_YEAR',
  4: 'LB_BUDGET',
  5: 'LB_MILEAGE',
  6: 'LB_FUEL',
  7: 'LB_CITY',
  8: 'LB_COMMENT',
  9: 'LB_CONTACT',
  10: 'LB_REVIEW'
};

const readDraft = (ctx: PipelineContext): LeadBuyDraft => {
  const vars = (ctx.session?.variables as any) || {};
  const fromDraft = vars.leadBuyDraft as LeadBuyDraft | undefined;
  if (fromDraft && typeof fromDraft === 'object') {
    const data = (fromDraft.data || {}) as Partial<LeadBuyData>;
    return {
      step: Number(fromDraft.step || 1),
      data: {
        brand: toText(data.brand || ''),
        model: data.model || null,
        year: data.year || null,
        yearMin: typeof data.yearMin === 'number' ? data.yearMin : null,
        yearMax: typeof data.yearMax === 'number' ? data.yearMax : null,
        budget: typeof data.budget === 'number' ? data.budget : null,
        mileage: typeof data.mileage === 'number' ? data.mileage : null,
        fuel: data.fuel || null,
        city: data.city || null,
        comment: data.comment || null,
        phone: data.phone || null
      },
      history: Array.isArray(fromDraft.history) ? fromDraft.history : [],
      reviewMode: Boolean(fromDraft.reviewMode),
      editField: toText(fromDraft.editField) || undefined,
      viewMode: fromDraft.viewMode || 'results',
      results: fromDraft.results,
      favorites: fromDraft.favorites
    };
  }

  const legacy = vars.leadBuy || {};
  return {
    step: Number(legacy.step || 1),
    data: {
      brand: toText(legacy.brand || ''),
      model: legacy.model || null,
      year: legacy.year || legacy.yearDisplay || null,
      budget: typeof legacy.budget === 'number' ? legacy.budget : null,
      mileage: typeof legacy.mileage === 'number' ? legacy.mileage : null,
      fuel: legacy.fuel || null,
      city: legacy.city || null,
      comment: legacy.comment || null,
      phone: legacy.phone || null
    },
    history: [],
    reviewMode: false,
    viewMode: 'results'
  };
};

const persistDraft = async (ctx: PipelineContext, draft: LeadBuyDraft, state?: string) => {
  if (!ctx.session) return;
  const vars = (ctx.session.variables as any) || {};
  const source = draft.results?.source === 'external' ? 'EXTERNAL' : 'INVENTORY';
  const batch = draft.results
    ? {
      carIds: Array.isArray(draft.results.pageIds) ? draft.results.pageIds : [],
      offset: Number(draft.results.cursor || 0),
      totalEstimate: Number((draft.results.ids || []).length || 0),
      source
    }
    : null;
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: state || stateByStep[draft.step] || ctx.session.state,
      variables: {
        ...vars,
        leadBuyDraft: draft,
        leadBuy: {
          ...((vars.leadBuy && typeof vars.leadBuy === 'object') ? vars.leadBuy : {}),
          batch
        }
      },
      lastActive: new Date()
    }
  });
};

const sendMessage = async (ctx: PipelineContext, text: string, replyMarkup?: any) => {
  if (!ctx.chatId || !ctx.bot) return;
  await telegramOutbox.sendMessage({
    botId: ctx.bot.id,
    token: ctx.bot.token,
    chatId: ctx.chatId,
    text,
    replyMarkup,
    companyId: ctx.companyId
  });
};

const sendLeadMenu = async (ctx: PipelineContext) => {
  const lang = resolveLang(ctx);
  await sendMessage(ctx, t(lang, 'lead.menu_title'), {
    keyboard: [
      [{ text: button(lang, 'leadMenu.buy') }],
      [{ text: button(lang, 'leadMenu.stock') }, { text: button(lang, 'leadMenu.transit') }],
      [{ text: button(lang, 'leadMenu.sell') }, { text: button(lang, 'leadMenu.support') }]
    ],
    resize_keyboard: true
  });
};

const clearDraftAndReturnToMenu = async (ctx: PipelineContext, notice?: string) => {
  if (!ctx.session || !ctx.bot) return;
  const vars = (ctx.session.variables as any) || {};
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: 'CL_MENU',
      variables: {
        ...vars,
        leadBuyDraft: null,
        leadBuy: {
          ...((vars.leadBuy && typeof vars.leadBuy === 'object') ? vars.leadBuy : {}),
          batch: null
        }
      },
      lastActive: new Date()
    }
  });
  if (notice) {
    await sendMessage(ctx, notice, { remove_keyboard: true });
  }
  await sendLeadMenu(ctx);
};

const parseYearHint = (data: LeadBuyData) => {
  if (data.yearMin && data.yearMax) {
    return `${data.yearMin}-${data.yearMax}`;
  }
  if (data.yearMin) return String(data.yearMin);
  return data.year || null;
};

const buildReviewSummary = (data: LeadBuyData) => {
  return [
    `Марка: ${data.brand || '—'}`,
    `Модель: ${data.model || '—'}`,
    `Рік: ${parseYearHint(data) || '—'}`,
    `Бюджет: ${data.budget ? `до ${data.budget.toLocaleString('uk-UA')} USD` : '—'}`,
    `Пробіг: ${data.mileage ? `до ${data.mileage.toLocaleString('uk-UA')} км` : '—'}`,
    `Паливо: ${data.fuel || '—'}`,
    `Місто: ${data.city || '—'}`,
    `Коментар: ${data.comment || '—'}`,
    `Контакт: ${data.phone || '—'}`
  ].join('\n');
};

const showReview = async (ctx: PipelineContext, draft: LeadBuyDraft) => {
  const lang = resolveLang(ctx);
  draft.step = 10;
  draft.viewMode = 'results';
  draft.reviewMode = false;
  draft.editField = undefined;
  await persistDraft(ctx, draft, 'LB_REVIEW');
  const summary = buildReviewSummary(draft.data);
  await sendMessage(ctx, t(lang, 'lead.buy.review.title', { summary }), {
    inline_keyboard: [
      [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData(ActionTokens.LB_FAV_SEND) }],
      [{ text: button(lang, 'common.edit'), callback_data: buildCallbackData(ActionTokens.LB_EDIT) }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const showEditFields = async (ctx: PipelineContext, draft: LeadBuyDraft) => {
  const lang = resolveLang(ctx);
  const data = draft.data;
  await persistDraft(ctx, draft, 'LB_REVIEW');
  await sendMessage(ctx, '✏️ Оберіть поле для зміни:', {
    inline_keyboard: [
      [{ text: `Марка: ${data.brand || '—'}`, callback_data: buildCallbackData('lb_j', '1') }],
      [{ text: `Модель: ${data.model || '—'}`, callback_data: buildCallbackData('lb_j', '2') }],
      [{ text: `Рік: ${parseYearHint(data) || '—'}`, callback_data: buildCallbackData('lb_j', '3') }],
      [{ text: `Бюджет: ${data.budget || '—'}`, callback_data: buildCallbackData('lb_j', '4') }],
      [{ text: `Пробіг: ${data.mileage || '—'}`, callback_data: buildCallbackData('lb_j', '5') }],
      [{ text: `Паливо: ${data.fuel || '—'}`, callback_data: buildCallbackData('lb_j', '6') }],
      [{ text: `Місто: ${data.city || '—'}`, callback_data: buildCallbackData('lb_j', '7') }],
      [{ text: `Коментар: ${data.comment || '—'}`, callback_data: buildCallbackData('lb_j', '8') }],
      [{ text: `Контакт: ${data.phone || '—'}`, callback_data: buildCallbackData('lb_j', '9') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const parseStepNumber = (value?: string | null) => {
  const num = Number(String(value || '').trim());
  if (!Number.isFinite(num)) return null;
  if (num < 1 || num > 9) return null;
  return num;
};

const isBackIntent = (text: string, lang: ReturnType<typeof resolveLang>) => {
  const n = norm(text);
  return n === norm(button(lang, 'common.back')) || n === 'назад' || n === 'back';
};

const resolveBackStepFromState = (state: string): number | 'menu' => {
  const map: Record<string, number | 'menu'> = {
    LB_BRAND: 'menu',
    LB_BRAND_TXT: 'menu',
    LB_MODEL: 1,
    LB_MODEL_TXT: 1,
    LB_YEAR: 2,
    LB_YEAR_TXT: 2,
    LB_BUDGET: 3,
    LB_BUDGET_TXT: 3,
    LB_MILEAGE: 4,
    LB_MILEAGE_TXT: 4,
    LB_FUEL: 5,
    LB_CITY: 6,
    LB_CITY_TXT: 6,
    LB_COMMENT: 7,
    LB_CONTACT: 8,
    LB_REVIEW: 9,
    LB_RESULTS: 9,
    LB_FAVORITES: 9
  };
  return map[state] ?? 'menu';
};

const isAllowedLeadBuyActionForState = (state: string, action: string) => {
  if (action === ActionTokens.LB_CANCEL) return true;
  if (!state.startsWith('LB_')) return false;
  if (action.startsWith('lb_back_')) return true;
  if (action === 'lb_back_review') return state === 'LB_REVIEW';

  const allowByState: Record<string, string[]> = {
    LB_BRAND: [ActionTokens.LB_EDIT_BRAND],
    LB_BRAND_TXT: [],
    LB_MODEL: [ActionTokens.LB_EDIT_MODEL],
    LB_MODEL_TXT: [],
    LB_YEAR: [ActionTokens.LB_EDIT_YEAR],
    LB_YEAR_TXT: [],
    LB_BUDGET: [ActionTokens.LB_EDIT_BUDGET],
    LB_BUDGET_TXT: [],
    LB_MILEAGE: [ActionTokens.LB_EDIT_MILEAGE],
    LB_MILEAGE_TXT: [],
    LB_FUEL: [ActionTokens.LB_EDIT_FUEL],
    LB_CITY: [ActionTokens.LB_EDIT_CITY],
    LB_CITY_TXT: [],
    LB_COMMENT: ['lb_s_cmt', 'lb_skip_comment'],
    LB_CONTACT: [],
    LB_REVIEW: [ActionTokens.LB_EDIT, 'lb_j', ActionTokens.LB_FAV_SEND],
    LB_RESULTS: [ActionTokens.LB_NEXT, ActionTokens.LB_INTEREST, ActionTokens.LB_FAV_TOGGLE, ActionTokens.LB_FAV_OPEN, ActionTokens.LB_FAV_SEND],
    LB_FAVORITES: ['lb_fvp', 'lb_fvn', ActionTokens.LB_FAV_TOGGLE, ActionTokens.LB_FAV_DEL, ActionTokens.LB_FAV_SEND]
  };

  if (action === 'lb_e_b_back') {
    return state === 'LB_MODEL' || state === 'LB_MODEL_TXT';
  }

  return (allowByState[state] || []).includes(action);
};

const resolveLeadBuyIdentity = (ctx: PipelineContext): LeadBuyIdentity => {
  const from = ctx.update?.callback_query?.from || ctx.update?.message?.from;
  const tgUserId = String(from?.id || ctx.userId || ctx.chatId || '').trim();
  const displayName = [
    String(from?.first_name || '').trim(),
    String(from?.last_name || '').trim()
  ].filter(Boolean).join(' ') || 'Клієнт';
  const username = String(from?.username || '').trim() || null;
  const userLink = username ? `https://t.me/${username}` : (tgUserId ? `tg://user?id=${tgUserId}` : '—');

  return {
    displayName,
    username,
    tgUserId,
    userLink
  };
};

const getFavoriteIds = async (ctx: PipelineContext): Promise<string[]> => {
  const tgUserId = getTgUserId(ctx);
  const companyId = getCompanyId(ctx);
  if (!tgUserId || !companyId) return [];
  const favorites = await prisma.miniAppFavorite.findMany({
    where: {
      companyId,
      tgUserId
    },
    select: { carListingId: true },
    orderBy: { createdAt: 'desc' }
  });
  return favorites.map((item) => item.carListingId);
};

const toggleFavorite = async (ctx: PipelineContext, carId: string, forceRemove = false) => {
  const tgUserId = getTgUserId(ctx);
  const companyId = getCompanyId(ctx);
  if (!tgUserId || !companyId || !carId) return false;

  const existing = await prisma.miniAppFavorite.findFirst({
    where: {
      companyId,
      tgUserId,
      carListingId: carId
    }
  });

  if (existing) {
    await prisma.miniAppFavorite.delete({ where: { id: existing.id } });
    return false;
  }

  if (forceRemove) return false;

  await prisma.miniAppFavorite.create({
    data: {
      companyId,
      tgUserId,
      carListingId: carId
    }
  });
  return true;
};

const fetchCarsOrdered = async (ids: string[]) => {
  if (!ids.length) return [] as any[];
  const rows = await prisma.carListing.findMany({ where: { id: { in: ids } } });
  const map = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => map.get(id)).filter((row): row is any => Boolean(row));
};

const getLeadBuyRank = (car: any, criteria: LeadBuyData) => {
  const title = norm(car.title);
  const specs = (car.specs || {}) as Record<string, any>;
  const brand = norm(criteria.brand);
  const model = norm(criteria.model || '');
  const carBrand = norm(specs.brand);
  const carModel = norm(specs.model);

  const brandMatch = Boolean(brand) && (title.includes(brand) || carBrand.includes(brand));
  if (!brandMatch) return null;

  const modelMatch = model ? (title.includes(model) || carModel.includes(model)) : false;
  const exactBrandModelRank = model ? (modelMatch ? 1 : 0) : 0;
  const brandRank = brandMatch ? 1 : 0;

  const yearDiff = criteria.yearMin && Number.isFinite(Number(car.year))
    ? Math.abs(Number(car.year) - Number(criteria.yearMin))
    : Number.MAX_SAFE_INTEGER;

  const priceDiff = criteria.budget && Number.isFinite(Number(car.price))
    ? Math.abs(Number(car.price) - Number(criteria.budget))
    : Number.MAX_SAFE_INTEGER;

  const postedAtMs = new Date(car.postedAt || car.updatedAt || car.createdAt || 0).getTime() || 0;

  return {
    exactBrandModelRank,
    brandRank,
    yearDiff,
    priceDiff,
    postedAtMs
  };
};

const findInventoryMatches = async (ctx: PipelineContext, criteria: LeadBuyData) => {
  if (!criteria.brand) return [] as any[];
  const where: Record<string, any> = {
    status: 'AVAILABLE'
  };
  if (ctx.companyId) {
    where.OR = [{ companyId: ctx.companyId }, { companyId: null }];
  }

  const rows = await prisma.carListing.findMany({
    where,
    orderBy: [{ postedAt: 'desc' }, { updatedAt: 'desc' }],
    take: 250
  });

  const ranked = rows
    .map((car) => ({ car, rank: getLeadBuyRank(car, criteria) }))
    .filter((item): item is { car: any; rank: NonNullable<ReturnType<typeof getLeadBuyRank>> } => Boolean(item.rank))
    .sort((a, b) => {
      // 1) exact brand+model match
      if (b.rank.exactBrandModelRank !== a.rank.exactBrandModelRank) {
        return b.rank.exactBrandModelRank - a.rank.exactBrandModelRank;
      }
      // 2) brand match
      if (b.rank.brandRank !== a.rank.brandRank) {
        return b.rank.brandRank - a.rank.brandRank;
      }
      // 3) year closeness to yearMin
      if (a.rank.yearDiff !== b.rank.yearDiff) {
        return a.rank.yearDiff - b.rank.yearDiff;
      }
      // 4) price closeness to budgetMax
      if (a.rank.priceDiff !== b.rank.priceDiff) {
        return a.rank.priceDiff - b.rank.priceDiff;
      }
      // 5) newest postedAt
      return b.rank.postedAtMs - a.rank.postedAtMs;
    })
    .map((item) => item.car);

  return ranked.slice(0, 18);
};

const runExternalFallback = async (ctx: PipelineContext, criteria: LeadBuyData) => {
  const items = await externalSearchService.searchAndPersist({
    brand: criteria.brand,
    model: criteria.model || undefined,
    city: criteria.city || undefined,
    yearMin: criteria.yearMin || undefined,
    budgetMax: criteria.budget || undefined,
    mileageMax: criteria.mileage || undefined,
    fuel: criteria.fuel || undefined
  }, {
    companyId: ctx.companyId || null,
    maxResults: 6
  });
  return items;
};

const notifyAdminExternal = async (ctx: PipelineContext, refs: Array<{ provider: string; url: string }>) => {
  if (!ctx.bot?.adminChatId || refs.length === 0) return;
  const lines = refs.slice(0, 5).map((item) => `• ${item.provider}: ${item.url}`);
  await telegramOutbox.sendMessage({
    botId: ctx.bot.id,
    token: ctx.bot.token,
    chatId: String(ctx.bot.adminChatId),
    text: `🌐 [EXTERNAL]\nЗнайдені зовнішні варіанти:\n${lines.join('\n')}`,
    companyId: ctx.companyId
  }).catch(() => null);
};

const notifyAdminExternalFail = async (ctx: PipelineContext, draft: LeadBuyDraft, reason: string) => {
  if (!ctx.bot?.adminChatId) return;
  const data = draft.data;
  await telegramOutbox.sendMessage({
    botId: ctx.bot.id,
    token: ctx.bot.token,
    chatId: String(ctx.bot.adminChatId),
    text: [
      '🌐 [EXTERNAL]',
      'Не вдалося знайти/розпарсити зовнішні результати.',
      `Причина: ${reason}`,
      `Критерії: ${data.brand || '—'} ${data.model || ''}`.trim(),
      `Контакт: ${data.phone || '—'}`
    ].join('\n'),
    companyId: ctx.companyId
  }).catch(() => null);
};

const getCurrentCarIdsForAction = (draft: LeadBuyDraft) => {
  if (draft.viewMode === 'favorites') {
    return draft.favorites?.pageIds || [];
  }
  return draft.results?.pageIds || [];
};

const sendResultPage = async (ctx: PipelineContext, draft: LeadBuyDraft, startIndex = 0) => {
  const ids = draft.results?.ids || [];
  if (!ids.length) return;

  if (startIndex >= ids.length) {
    startIndex = 0;
  }

  const pageIds = ids.slice(startIndex, startIndex + 3);
  if (!pageIds.length) return;

  const cars = await fetchCarsOrdered(pageIds);
  const favoriteIds = new Set(await getFavoriteIds(ctx));

  for (let idx = 0; idx < cars.length; idx += 1) {
    const car = cars[idx];
    await sendMessage(ctx, renderLeadBuyCard(car), buildLeadBuyCardButtons(car.id, favoriteIds.has(car.id), idx));
  }

  draft.viewMode = 'results';
  draft.results = {
    ...(draft.results || { ids: [], cursor: 0, pageIds: [], source: null }),
    cursor: startIndex + pageIds.length,
    pageIds
  };

  const favCount = favoriteIds.size;
  const hasMore = startIndex + pageIds.length < ids.length;
  await persistDraft(ctx, draft, 'LB_RESULTS');
  await sendMessage(ctx, t(resolveLang(ctx), 'lead.buy.next_actions'), buildAfterBatchControls(favCount, hasMore));
};

const showFavoritesPage = async (ctx: PipelineContext, draft: LeadBuyDraft, page = 0) => {
  const favoriteIds = await getFavoriteIds(ctx);
  if (!favoriteIds.length) {
    await sendMessage(ctx, t(resolveLang(ctx), 'lead.fav.empty'));
    return;
  }

  const pageSize = 3;
  const totalPages = Math.max(1, Math.ceil(favoriteIds.length / pageSize));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const pageIds = favoriteIds.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const cars = await fetchCarsOrdered(pageIds);

  for (let idx = 0; idx < cars.length; idx += 1) {
    const car = cars[idx];
    await sendMessage(ctx, renderLeadBuyCard(car), buildLeadBuyCardButtons(car.id, true, idx));
  }

  draft.viewMode = 'favorites';
  draft.favorites = {
    page: safePage,
    pageIds,
    total: favoriteIds.length
  };
  await persistDraft(ctx, draft, 'LB_FAVORITES');

  await sendMessage(ctx, `⭐ Обране — сторінка ${safePage + 1}/${totalPages}`, {
    inline_keyboard: [
      [
        { text: '⬅️ Назад', callback_data: buildCallbackData('lb_fvp') },
        { text: 'Показати ще', callback_data: buildCallbackData('lb_fvn') }
      ],
      [{ text: 'Звʼязатися по обраному', callback_data: buildCallbackData(ActionTokens.LB_FAV_SEND) }],
      [{ text: button(resolveLang(ctx), 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const createLeadAndNotifyAdmin = async (
  ctx: PipelineContext,
  draft: LeadBuyDraft,
  carIds: string[],
  source: 'single' | 'favorites' | 'no_match'
) => {
  if (!ctx.bot) return false;
  const identity = resolveLeadBuyIdentity(ctx);
  if (identity.tgUserId) {
    const dailyQuota = await quotaService.consume({
      companyId: ctx.companyId || null,
      botId: ctx.bot.id,
      tgUserId: identity.tgUserId,
      scope: 'lead.buy.submit.day',
      limit: LEAD_BUY_DAILY_LIMIT,
      period: 'day'
    });
    if (!dailyQuota.allowed) {
      await sendMessage(ctx, `⛔️ Досягнуто ліміт заявок на добу (${LEAD_BUY_DAILY_LIMIT}). Спробуйте завтра.`);
      return false;
    }
  }

  const data = draft.data;
  const selectedCars = await fetchCarsOrdered(carIds);
  const title = source === 'favorites'
    ? `Обране: ${selectedCars.length} авто`
    : (selectedCars[0]?.title || `Підбір авто: ${data.brand || '—'}`);

  const result = await createOrMergeLead({
    botId: ctx.bot.id,
    companyId: ctx.companyId || null,
    chatId: ctx.chatId,
    userId: identity.tgUserId || getTgUserId(ctx),
    name: identity.displayName,
    telegramUsername: identity.username,
    telegramName: identity.displayName,
    phone: data.phone || undefined,
    request: title,
    source: 'TELEGRAM',
    payload: mergeSessionAttributionPayload(ctx, {
      wizard: 'lead_buy_v7',
      selectedCarIds: carIds,
      selectedCars: selectedCars.map((car) => ({ id: car.id, title: car.title, price: car.price, year: car.year })),
      filters: data
    }),
    leadType: 'BUY',
    createRequest: true,
    requestData: {
      title,
      budgetMax: data.budget || undefined,
      yearMin: data.yearMin || undefined,
      yearMax: data.yearMax || undefined,
      city: data.city || undefined,
      description: data.comment || undefined,
      language: 'UK'
    }
  });

  if (ctx.bot.adminChatId) {
    const carsLine = selectedCars.length
      ? selectedCars.map((car, index) => {
        const marks: string[] = [];
        if (car.partnerCompanyId) marks.push('PARTNER');
        if (car.external || car.source === 'EXTERNAL' || car.sourceProvider) marks.push('EXTERNAL');
        const markText = marks.length ? ` [${marks.join('|')}]` : '';
        const urlText = car.sourceUrl ? ` (${car.sourceUrl})` : '';
        return `${index + 1}. ${car.title} ${car.year || ''} — ${car.price || '—'} ${car.currency || 'USD'}${markText}${urlText}`;
      }).join('\n')
      : '—';
    await telegramOutbox.sendMessage({
      botId: ctx.bot.id,
      token: ctx.bot.token,
      chatId: String(ctx.bot.adminChatId),
      text: [
        '🟢 [LEAD BUY]',
        `Джерело: ${source === 'favorites' ? 'обране' : source === 'single' ? 'картка' : 'без збігів'}`,
        `👤 ${identity.displayName}`,
        `username: ${identity.username ? `@${identity.username}` : '—'}`,
        `tgUserId: ${identity.tgUserId || '—'}`,
        `🔗 ${identity.userLink}`,
        `Марка/модель: ${data.brand || '—'} ${data.model || ''}`.trim(),
        `Рік: ${parseYearHint(data) || '—'}`,
        `Бюджет: ${data.budget ? `${data.budget} USD` : '—'}`,
        `Місто: ${data.city || '—'}`,
        `Коментар: ${data.comment || '—'}`,
        `Контакт: ${data.phone || '—'}`,
        `Обрані авто:\n${carsLine}`,
        `Lead ID: ${result.lead.id}`
      ].join('\n'),
      companyId: ctx.companyId
    }).catch(() => null);
  }

  return true;
};

const submitFavoritesLead = async (ctx: PipelineContext, draft: LeadBuyDraft) => {
  const favoriteIds = await getFavoriteIds(ctx);
  if (!favoriteIds.length) {
    await sendMessage(ctx, t(resolveLang(ctx), 'lead.fav.empty'));
    return;
  }
  const sent = await createLeadAndNotifyAdmin(ctx, draft, favoriteIds, 'favorites');
  if (sent) {
    await sendMessage(ctx, '✅ Запит по обраному передано менеджеру.');
  }
};

const confirmAndSearch = async (ctx: PipelineContext, draft: LeadBuyDraft) => {
  await sendMessage(ctx, t(resolveLang(ctx), 'lead.buy.searching'));

  try {
    const inventory = await findInventoryMatches(ctx, draft.data);
    if (inventory.length > 0) {
      draft.results = {
        ids: inventory.map((item) => item.id),
        cursor: 0,
        pageIds: [],
        source: 'inventory'
      };
      await sendResultPage(ctx, draft, 0);
      return;
    }

    const external = await runExternalFallback(ctx, draft.data);
    if (external.length > 0) {
      const refs = external
        .map((item) => ({ provider: String(item.sourceProvider || 'EXTERNAL'), url: String(item.sourceUrl || '') }))
        .filter((item) => item.url);

      draft.results = {
        ids: external.map((item) => item.id),
        cursor: 0,
        pageIds: [],
        source: 'external',
        externalRefs: refs
      };
      await sendResultPage(ctx, draft, 0);
      await notifyAdminExternal(ctx, refs);
      return;
    }

    await sendMessage(ctx, t(resolveLang(ctx), 'lead.buy.no_matches'));
    await createLeadAndNotifyAdmin(ctx, draft, [], 'no_match');
    await notifyAdminExternalFail(ctx, draft, 'no_matches');
    await clearDraftAndReturnToMenu(ctx);
  } catch (error: any) {
    const reason = error instanceof Error ? error.message : String(error || 'unknown_error');
    await sendMessage(ctx, t(resolveLang(ctx), 'lead.buy.no_matches'));
    await createLeadAndNotifyAdmin(ctx, draft, [], 'no_match');
    await notifyAdminExternalFail(ctx, draft, reason);
    await clearDraftAndReturnToMenu(ctx);
  }
};

const applyAndContinue = async (ctx: PipelineContext, draft: LeadBuyDraft, nextStep: number) => {
  if (draft.reviewMode) {
    await showReview(ctx, draft);
    return;
  }
  draft.step = nextStep;
  await routeStep(ctx, draft);
};

const routeStep = async (ctx: PipelineContext, draft: LeadBuyDraft) => {
  const lang = resolveLang(ctx);
  const data = draft.data;

  if (draft.step <= 1) {
    draft.step = 1;
    await persistDraft(ctx, draft, 'LB_BRAND');
    await sendMessage(
      ctx,
      `${t(lang, 'lead.buy.title')}\n\n${stepHeader(1)}\nОберіть марку авто.\n\n${t(lang, 'common.step_hint_brand')}`,
      {
        inline_keyboard: buildBrandKeyboard(lang, {
          action: ActionTokens.LB_EDIT_BRAND,
          cancelAction: ActionTokens.LB_CANCEL,
          backAction: ActionTokens.LB_CANCEL
        })
      }
    );
    return;
  }

  if (draft.step === 2) {
    await persistDraft(ctx, draft, 'LB_MODEL');
    await sendMessage(
      ctx,
      `${stepHeader(2)}\nОберіть модель.\n\n${t(lang, 'common.step_hint_model')}`,
      { inline_keyboard: buildModelKeyboard(data.brand || '', lang) }
    );
    return;
  }

  if (draft.step === 3) {
    await persistDraft(ctx, draft, 'LB_YEAR');
    await sendMessage(
      ctx,
      `${stepHeader(3)}\nВкажіть рік.\n\n${t(lang, 'common.step_hint_year')}`,
      { inline_keyboard: buildYearKeyboard(lang) }
    );
    return;
  }

  if (draft.step === 4) {
    await persistDraft(ctx, draft, 'LB_BUDGET');
    await sendMessage(
      ctx,
      `${stepHeader(4)}\nВкажіть бюджет.\n\n${t(lang, 'common.step_hint_budget')}`,
      { inline_keyboard: buildBudgetKeyboard(lang) }
    );
    return;
  }

  if (draft.step === 5) {
    await persistDraft(ctx, draft, 'LB_MILEAGE');
    await sendMessage(
      ctx,
      `${stepHeader(5)}\nВкажіть пробіг.\n\n${t(lang, 'common.step_hint_mileage')}`,
      { inline_keyboard: buildMileageKeyboard(lang) }
    );
    return;
  }

  if (draft.step === 6) {
    await persistDraft(ctx, draft, 'LB_FUEL');
    await sendMessage(ctx, `${stepHeader(6)}\nОберіть паливо:`, { inline_keyboard: buildFuelKeyboard(lang) });
    return;
  }

  if (draft.step === 7) {
    await persistDraft(ctx, draft, 'LB_CITY');
    await sendMessage(ctx, `${stepHeader(7)}\nОберіть місто:`, { inline_keyboard: buildCityKeyboard(lang) });
    return;
  }

  if (draft.step === 8) {
    await persistDraft(ctx, draft, 'LB_COMMENT');
    await sendMessage(ctx, `${stepHeader(8)}\nДодайте коментар (необовʼязково):`, {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('lb_s_cmt') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('lb_back_7') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  if (draft.step === 9) {
    await persistDraft(ctx, draft, 'LB_CONTACT');

    if (String(ctx.chatType || '') === 'private') {
      await sendMessage(ctx, `${stepHeader(9)}\n${t(lang, 'support.ask_contact')}`, {
        keyboard: [
          [{ text: button(lang, 'common.shareContact'), request_contact: true }],
          [{ text: button(lang, 'common.back') }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      });
      await sendMessage(ctx, 'Керування кроком:', {
        inline_keyboard: [[
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('lb_back_8') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]]
      });
    } else {
      await sendMessage(ctx, `${stepHeader(9)}\nВведіть номер телефону вручну:`, {
        inline_keyboard: [[
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('lb_back_8') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]]
      });
    }
    return;
  }

  await showReview(ctx, draft);
};

export const startLeadBuyWizard = async (ctx: PipelineContext) => {
  const draft: LeadBuyDraft = {
    step: 1,
    data: { brand: '' },
    history: [],
    reviewMode: false,
    viewMode: 'results'
  };
  await routeStep(ctx, draft);
};

const resolveCarIdByIndex = (draft: LeadBuyDraft, payload?: string) => {
  const idx = Number(String(payload || '').trim());
  if (!Number.isFinite(idx) || idx < 0) return null;
  const ids = getCurrentCarIdsForAction(draft);
  return ids[idx] || null;
};

const parseManualYear = (value: string) => {
  const parsed = parseYearInput(value);
  if (!parsed) return null;
  const normalizedYear = parsed.max ? `${parsed.min}-${parsed.max}` : String(parsed.min);
  return {
    yearMin: parsed.min,
    yearMax: parsed.max,
    year: normalizedYear
  };
};

export const handleLeadBuyCallback = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
  const vars = (ctx.session?.variables as any) || {};
  const hasDraft = Boolean(vars.leadBuyDraft && typeof vars.leadBuyDraft === 'object');
  const state = String(ctx.session?.state || '');
  if (!hasDraft && !state.startsWith('LB_') && action !== ActionTokens.LB_CANCEL) {
    await sendMessage(ctx, '⚠️ Сесія підбору неактивна. Почніть з меню «Купити авто».');
    return true;
  }

  const draft = readDraft(ctx);
  const lang = resolveLang(ctx);

  if (action === ActionTokens.LB_CANCEL) {
    await clearDraftAndReturnToMenu(ctx, t(lang, 'cancelled'));
    return true;
  }

  if (!isAllowedLeadBuyActionForState(state, action)) {
    await sendMessage(ctx, '⚠️ Ця дія недоступна на поточному кроці.');
    return true;
  }

  if (action === ActionTokens.LB_EDIT) {
    await showEditFields(ctx, draft);
    return true;
  }

  if (action === 'lb_j') {
    const step = parseStepNumber(payload);
    if (!step) return true;
    draft.reviewMode = true;
    draft.step = step;
    draft.editField = String(step);
    await routeStep(ctx, draft);
    return true;
  }

  if (action === ActionTokens.LB_NEXT) {
    const next = draft.results?.cursor || 0;
    await sendResultPage(ctx, draft, next);
    return true;
  }

  if (action === 'lb_fvp') {
    const page = Math.max(0, Number(draft.favorites?.page || 0) - 1);
    await showFavoritesPage(ctx, draft, page);
    return true;
  }

  if (action === 'lb_fvn') {
    const page = Number(draft.favorites?.page || 0) + 1;
    await showFavoritesPage(ctx, draft, page);
    return true;
  }

  if (action === ActionTokens.LB_FAV_OPEN) {
    await showFavoritesPage(ctx, draft, 0);
    return true;
  }

  if (action === ActionTokens.LB_FAV_TOGGLE) {
    const carId = resolveCarIdByIndex(draft, payload);
    if (!carId) return true;
    const added = await toggleFavorite(ctx, carId, false);
    await sendMessage(ctx, added ? '⭐ Додано в обране.' : '🗑 Видалено з обраного.');
    return true;
  }

  if (action === ActionTokens.LB_FAV_DEL) {
    const carId = resolveCarIdByIndex(draft, payload);
    if (!carId) return true;
    await toggleFavorite(ctx, carId, true);
    await sendMessage(ctx, '🗑 Видалено з обраного.');
    if (draft.viewMode === 'favorites') {
      await showFavoritesPage(ctx, draft, draft.favorites?.page || 0);
    }
    return true;
  }

  if (action === ActionTokens.LB_INTEREST) {
    const carId = resolveCarIdByIndex(draft, payload);
    if (!carId) return true;
    const sent = await createLeadAndNotifyAdmin(ctx, draft, [carId], 'single');
    if (sent) {
      await sendMessage(ctx, '✅ Запит передано менеджеру.');
    }
    return true;
  }

  if (action === ActionTokens.LB_FAV_SEND) {
    if (ctx.session?.state === 'LB_REVIEW') {
      await confirmAndSearch(ctx, draft);
      return true;
    }
    await submitFavoritesLead(ctx, draft);
    return true;
  }

  if (action === 'lb_back_review') {
    await showReview(ctx, draft);
    return true;
  }

  if (action === 'lb_s_cmt' || action === 'lb_skip_comment') {
    draft.data.comment = null;
    await applyAndContinue(ctx, draft, 9);
    return true;
  }

  if (action === 'lb_e_b_back') {
    draft.step = 1;
    await routeStep(ctx, draft);
    return true;
  }

  if (action.startsWith('lb_back_')) {
    const raw = action.replace('lb_back_', '');
    const map: Record<string, number> = {
      y: 2,
      bg: 3,
      ml: 4,
      fu: 5,
      ct: 6
    };
    const step = map[raw] || parseStepNumber(raw) || 1;
    draft.step = step;
    await routeStep(ctx, draft);
    return true;
  }

  if (action === ActionTokens.LB_EDIT_BRAND || action === 'lb_e_b') {
    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'LB_BRAND_TXT');
      await sendMessage(ctx, 'Введіть марку текстом:', {
        inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
      });
      return true;
    }

    const value = pickFromList(BRANDS, payload) || toText(payload);
    if (!value) return true;

    if (draft.data.brand !== value) {
      draft.data.model = null;
    }
    draft.data.brand = value;
    await applyAndContinue(ctx, draft, 2);
    return true;
  }

  if (action === ActionTokens.LB_EDIT_MODEL || action === 'lb_e_m') {
    if (payload === 'SKIP') {
      draft.data.model = null;
      await applyAndContinue(ctx, draft, 3);
      return true;
    }

    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'LB_MODEL_TXT');
      await sendMessage(ctx, 'Введіть модель текстом:', {
        inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
      });
      return true;
    }

    const models = BRAND_MODELS[draft.data.brand] || [];
    const value = pickFromList(models, payload) || toText(payload);
    draft.data.model = value || null;
    await applyAndContinue(ctx, draft, 3);
    return true;
  }

  if (action === ActionTokens.LB_EDIT_YEAR || action === 'lb_e_y') {
    if (payload === 'SKIP') {
      draft.data.year = null;
      draft.data.yearMin = null;
      draft.data.yearMax = null;
      await applyAndContinue(ctx, draft, 4);
      return true;
    }

    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'LB_YEAR_TXT');
      await sendMessage(ctx, t(lang, 'common.step_hint_year'), {
        inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
      });
      return true;
    }

    const yearMin = Number(payload);
    if (!Number.isFinite(yearMin) || yearMin < 1990) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_year'));
      return true;
    }

    draft.data.year = String(yearMin);
    draft.data.yearMin = yearMin;
    draft.data.yearMax = null;
    await applyAndContinue(ctx, draft, 4);
    return true;
  }

  if (action === ActionTokens.LB_EDIT_BUDGET || action === 'lb_e_bg') {
    if (payload === 'SKIP') {
      draft.data.budget = null;
      await applyAndContinue(ctx, draft, 5);
      return true;
    }

    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'LB_BUDGET_TXT');
      await sendMessage(ctx, t(lang, 'common.step_hint_budget'), {
        inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
      });
      return true;
    }

    const budget = Number(payload);
    if (!Number.isFinite(budget)) return true;
    draft.data.budget = budget;
    await applyAndContinue(ctx, draft, 5);
    return true;
  }

  if (action === ActionTokens.LB_EDIT_MILEAGE || action === 'lb_e_ml') {
    if (payload === 'SKIP') {
      draft.data.mileage = null;
      await applyAndContinue(ctx, draft, 6);
      return true;
    }

    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'LB_MILEAGE_TXT');
      await sendMessage(ctx, t(lang, 'common.step_hint_mileage'), {
        inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
      });
      return true;
    }

    const mileage = Number(payload);
    if (!Number.isFinite(mileage)) return true;
    draft.data.mileage = mileage;
    await applyAndContinue(ctx, draft, 6);
    return true;
  }

  if (action === ActionTokens.LB_EDIT_FUEL || action === 'lb_e_fu') {
    if (payload === 'SKIP') {
      draft.data.fuel = null;
      await applyAndContinue(ctx, draft, 7);
      return true;
    }

    const value = pickFromList(FUEL_OPTIONS, payload) || toText(payload);
    draft.data.fuel = value || null;
    await applyAndContinue(ctx, draft, 7);
    return true;
  }

  if (action === ActionTokens.LB_EDIT_CITY || action === 'lb_e_ct') {
    if (payload === 'SKIP') {
      draft.data.city = null;
      await applyAndContinue(ctx, draft, 8);
      return true;
    }

    if (payload === 'OTHER') {
      await persistDraft(ctx, draft, 'LB_CITY_TXT');
      await sendMessage(ctx, 'Введіть місто:', {
        inline_keyboard: [[{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
      });
      return true;
    }

    const value = pickFromList(CITY_OPTIONS, payload) || toText(payload);
    draft.data.city = value || null;
    await applyAndContinue(ctx, draft, 8);
    return true;
  }

  return false;
};

export const handleLeadBuyText = async (ctx: PipelineContext, text: string): Promise<boolean> => {
  const state = String(ctx.session?.state || '');
  const lang = resolveLang(ctx);
  const vars = (ctx.session?.variables as any) || {};
  const hasDraft = Boolean(vars.leadBuyDraft && typeof vars.leadBuyDraft === 'object');
  if (state.startsWith('LB_') && !hasDraft) {
    await clearDraftAndReturnToMenu(ctx, '⚠️ Сесія підбору втрачена. Почнімо заново.');
    return true;
  }
  const draft = readDraft(ctx);

  if (state.startsWith('LB_') && isBackIntent(text, lang)) {
    const back = resolveBackStepFromState(state);
    if (back === 'menu') {
      await clearDraftAndReturnToMenu(ctx);
      return true;
    }
    draft.step = back;
    await routeStep(ctx, draft);
    return true;
  }

  if (state === 'LB_BRAND_TXT') {
    const value = toText(text);
    if (value.length < 2) {
      await sendMessage(ctx, '⚠️ Введіть мінімум 2 символи.');
      return true;
    }
    if (draft.data.brand !== value) draft.data.model = null;
    draft.data.brand = value;
    await applyAndContinue(ctx, draft, 2);
    return true;
  }

  if (state === 'LB_MODEL_TXT') {
    draft.data.model = toText(text) || null;
    await applyAndContinue(ctx, draft, 3);
    return true;
  }

  if (state === 'LB_YEAR_TXT') {
    const parsed = parseManualYear(text);
    if (!parsed) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_year'));
      return true;
    }
    draft.data.year = parsed.year;
    draft.data.yearMin = parsed.yearMin;
    draft.data.yearMax = parsed.yearMax;
    await applyAndContinue(ctx, draft, 4);
    return true;
  }

  if (state === 'LB_BUDGET_TXT') {
    const parsed = parseBudgetUSD(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_budget'));
      return true;
    }
    draft.data.budget = parsed;
    await applyAndContinue(ctx, draft, 5);
    return true;
  }

  if (state === 'LB_MILEAGE_TXT') {
    const parsed = parseMileageKm(text);
    if (parsed === null) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_mileage'));
      return true;
    }
    draft.data.mileage = parsed;
    await applyAndContinue(ctx, draft, 6);
    return true;
  }

  if (state === 'LB_CITY_TXT') {
    draft.data.city = toText(text) || null;
    await applyAndContinue(ctx, draft, 8);
    return true;
  }

  if (state === 'LB_COMMENT') {
    if (containsForbiddenContacts(text)) {
      await sendMessage(ctx, t(lang, 'common.err.contacts_forbidden'), {
        inline_keyboard: [[{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('lb_s_cmt') }]]
      });
      return true;
    }
    draft.data.comment = toText(text) || null;
    await applyAndContinue(ctx, draft, 9);
    return true;
  }

  if (state === 'LB_CONTACT') {
    const message = ctx.update?.message;
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
      draft.step = 8;
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

  if (state.startsWith('LB_')) {
    await sendMessage(ctx, 'Використайте кнопки під повідомленням або «❌ Скасувати».');
    return true;
  }

  return false;
};
