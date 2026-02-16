import { prisma } from '../../../../services/prisma.js';
import type { PipelineContext } from '../core/types.js';
import { ScenarioEngine } from '../../bots/scenario.engine.js';
import { telegramOutbox } from '../messaging/outbox/telegramOutbox.js';
import { normalizeBrand } from '../../../Inventory/normalization/normalizeBrand.js';
import { normalizeModel } from '../../../Inventory/normalization/normalizeModel.js';
import { normalizeCity } from '../../../Inventory/normalization/normalizeCity.js';
import { normalizePhone } from '../../../Inventory/normalization/normalizePhone.js';
import { createOrMergeLead } from '../core/leadService.js';
import { renderLeadCard, renderRequestCard } from '../../../../services/cardRenderer.js';
import { generateRequestLink } from '../../../../utils/deeplink.utils.js';
import { buildMiniAppUrl } from '../core/utils/miniappUrl.js';
import { generatePublicId, mapRequestInput } from '../../../../services/dto.js';
import { buildCallbackData } from '../core/utils/callbackUtils.js';
import { button, isCommand, resolveLang, t, type Lang } from '../core/utils/telegramText.js';


const parseRange = (input: string) => {
  const nums = (input.match(/\d{2,}/g) || []).map(v => Number(v));
  if (!nums.length) return { min: undefined, max: undefined };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  const min = Math.min(nums[0], nums[1]);
  const max = Math.max(nums[0], nums[1]);
  return { min, max };
};

const normalizeShortYear = (value: number, pivotYear?: number) => {
  if (value >= 1000) return value;
  if (typeof pivotYear === 'number' && pivotYear >= 1000) {
    const century = Math.floor(pivotYear / 100) * 100;
    return century + value;
  }
  return value <= 30 ? 2000 + value : 1900 + value;
};

const parseYearRange = (input: string) => {
  const nums = (input.match(/\d{2,4}/g) || []).slice(0, 2).map(v => Number(v));
  if (!nums.length) return { min: undefined, max: undefined };
  if (nums.length === 1) {
    const year = normalizeShortYear(nums[0]);
    return year >= 1900 && year <= 2100 ? { min: year, max: year } : { min: undefined, max: undefined };
  }
  const first = normalizeShortYear(nums[0], nums[1] >= 1000 ? nums[1] : undefined);
  const second = normalizeShortYear(nums[1], nums[0] >= 1000 ? nums[0] : first);
  const candidates = [first, second].filter(v => v >= 1900 && v <= 2100);
  if (!candidates.length) return { min: undefined, max: undefined };
  if (candidates.length === 1) return { min: candidates[0], max: candidates[0] };
  return { min: Math.min(candidates[0], candidates[1]), max: Math.max(candidates[0], candidates[1]) };
};

const parsePrice = (input: string) => {
  const nums = (input.match(/\d{2,}/g) || []).map(v => Number(v));
  if (!nums.length) return { min: undefined, max: undefined };
  if (nums.length === 1) return { min: undefined, max: nums[0] };
  const min = Math.min(nums[0], nums[1]);
  const max = Math.max(nums[0], nums[1]);
  return { min, max };
};

const parseMileage = (input: string) => {
  const raw = input.toLowerCase();
  const nums = (raw.match(/\d{2,}/g) || []).map(v => Number(v));
  if (!nums.length) return { min: undefined, max: undefined };
  let min = nums[0];
  let max = nums.length > 1 ? nums[1] : nums[0];
  const usesThousands = raw.includes('k') || raw.includes('к') || raw.includes('тыс') || raw.includes('тис');
  if (usesThousands || (min < 1000 && max < 1000)) {
    min *= 1000;
    max *= 1000;
  }
  if (min > max) [min, max] = [max, min];
  return { min, max };
};

const formatPrice = (price?: number | null, currency?: string | null) => {
  if (!price) return '';
  const curr = currency || 'USD';
  return `${price.toLocaleString()} ${curr}`;
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
    companyId: ctx.companyId,
    userId: ctx.userId || undefined
  });
};

const sendPhoto = async (ctx: PipelineContext, photo: string, caption: string, replyMarkup?: any, targetChatId?: string) => {
  if (!ctx.bot) return;
  const chatId = targetChatId || ctx.chatId;
  if (!chatId) return;
  await telegramOutbox.sendPhoto({
    botId: ctx.bot.id,
    token: ctx.bot.token,
    chatId,
    photo,
    caption,
    replyMarkup,
    companyId: ctx.companyId,
    userId: ctx.userId || undefined
  });
};

const updateSession = async (ctx: PipelineContext, state: string, variables: Record<string, any>) => {
  if (!ctx.session) return;
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state,
      variables,
      lastActive: new Date()
    }
  });
};

const showMenu = async (ctx: PipelineContext, lang: Lang, template: string, notice?: string) => {
  const botName = ctx.bot?.name || 'CarTie';
  const baseVars = (ctx.session?.variables as any) || {};
  if (notice) await sendMessage(ctx, notice);

  if (template === 'CLIENT_LEAD') {
    await sendMessage(ctx, t(lang, 'clientMenu', { bot: botName }), {
      keyboard: [[{ text: button(lang, 'clientLead.lead') }], [{ text: button(lang, 'clientLead.support') }]],
      resize_keyboard: true
    });
    await updateSession(ctx, 'CL_MENU', { ...baseVars, leadFlow: {} });
    return;
  }

  if (template === 'CATALOG') {
    await sendMessage(ctx, t(lang, 'catalogMenu', { bot: botName }), {
      keyboard: [[{ text: button(lang, 'catalog.find') }, { text: button(lang, 'catalog.sell') }]],
      resize_keyboard: true
    });
    await updateSession(ctx, 'CAT_MENU', { ...baseVars, catalogFlow: {} });
    return;
  }

  if (template === 'B2B') {
    await sendMessage(ctx, t(lang, 'b2bMenu', { bot: botName }), {
      keyboard: [[{ text: button(lang, 'b2b.request') }]],
      resize_keyboard: true
    });
    await updateSession(ctx, 'B2B_MENU', { ...baseVars, b2bFlow: {} });
  }
};

const sendConfirm = async (ctx: PipelineContext, lang: Lang, text: string, confirmAction: string, backAction: string) => {
  await sendMessage(ctx, text, {
    inline_keyboard: [[
      { text: button(lang, 'common.confirm'), callback_data: buildCallbackData(confirmAction) },
      { text: button(lang, 'common.back'), callback_data: buildCallbackData(backAction) }
    ]]
  });
};

const handleClientLead = async (ctx: PipelineContext, text: string) => {
  if (!ctx.bot || !ctx.session) return false;
  const lang = resolveLang(ctx);
  const message = ctx.update?.message;
  const state = ctx.session.state || 'CL_MENU';
  const vars = (ctx.session.variables as any) || {};
  const flow = vars.leadFlow || {};

  const isLeaveRequest = isCommand(text, ['/buy', button(lang, 'clientLead.lead')]);
  const isSupport = isCommand(text, [button(lang, 'clientLead.support')]);
  const isCancel = isCommand(text, ['cancel', 'stop', 'відміна', 'отмена', button(lang, 'common.cancel')]);
  const isBack = isCommand(text, ['back', 'назад', '⬅️ back', '⬅️ назад', button(lang, 'common.back')]);
  const isMenu = isCommand(text, ['/start', '/menu', 'menu', 'reset']);

  if (isMenu) {
    await showMenu(ctx, lang, 'CLIENT_LEAD');
    return true;
  }

  if (isCancel) {
    await showMenu(ctx, lang, 'CLIENT_LEAD', t(lang, 'cancelled'));
    return true;
  }

  if (state === 'CL_MENU' && !isLeaveRequest && !isSupport) {
    await showMenu(ctx, lang, 'CLIENT_LEAD', t(lang, 'fallback'));
    return true;
  }

  if (isSupport || state === 'CL_SUPPORT') {
    if (state !== 'CL_SUPPORT') {
      await updateSession(ctx, 'CL_SUPPORT', vars);
      await sendMessage(ctx, t(lang, 'supportAsk'), { remove_keyboard: true });
      return true;
    }
    await sendMessage(ctx, t(lang, 'supportReceived'));
    if (ctx.bot?.adminChatId) {
      await sendMessage(ctx, `🆘 Support request from ${message?.from?.first_name || 'User'}: ${text}`);
    }
    await showMenu(ctx, lang, 'CLIENT_LEAD');
    return true;
  }

  if (isLeaveRequest || state === 'CL_MENU') {
    if (isBack) {
      await showMenu(ctx, lang, 'CLIENT_LEAD');
      return true;
    }
    await updateSession(ctx, 'CL_NAME', { ...vars, leadFlow: {} });
    await sendMessage(ctx, t(lang, 'askName'), { remove_keyboard: true });
    return true;
  }

  if (state === 'CL_NAME') {
    if (isBack) {
      await showMenu(ctx, lang, 'CLIENT_LEAD');
      return true;
    }
    if (!text || text.length < 2) {
      await sendMessage(ctx, t(lang, 'invalidName'));
      return true;
    }
    flow.name = text;
    await updateSession(ctx, 'CL_CAR', { ...vars, leadFlow: flow });
    await sendMessage(ctx, t(lang, 'askCar'));
    return true;
  }

  if (state === 'CL_CAR') {
    if (isBack) {
      await updateSession(ctx, 'CL_NAME', { ...vars, leadFlow: flow });
      await sendMessage(ctx, t(lang, 'askName'));
      return true;
    }
    if (text.length < 3) {
      await sendMessage(ctx, t(lang, 'invalidCar'));
      return true;
    }
    flow.car = text;
    await updateSession(ctx, 'CL_BUDGET', { ...vars, leadFlow: flow });
    await sendMessage(ctx, t(lang, 'askBudget'));
    return true;
  }

  if (state === 'CL_BUDGET') {
    if (isBack) {
      await updateSession(ctx, 'CL_CAR', { ...vars, leadFlow: flow });
      await sendMessage(ctx, t(lang, 'askCar'));
      return true;
    }
    if (isCommand(text, ['skip', button(lang, 'common.skip')])) {
      flow.budget = undefined;
    } else {
      const budget = parseInt(text.replace(/[^\d]/g, ''), 10) || 0;
      if (!budget) {
        await sendMessage(ctx, t(lang, 'invalidBudget'));
        return true;
      }
      flow.budget = budget;
    }
    await updateSession(ctx, 'CL_CITY', { ...vars, leadFlow: flow });
    await sendMessage(ctx, t(lang, 'askCity'));
    return true;
  }

  if (state === 'CL_CITY') {
    if (isBack) {
      await updateSession(ctx, 'CL_BUDGET', { ...vars, leadFlow: flow });
      await sendMessage(ctx, t(lang, 'askBudget'));
      return true;
    }
    if (isCommand(text, ['skip', button(lang, 'common.skip')])) {
      flow.city = undefined;
    } else {
      flow.city = await normalizeCity(text, { companyId: ctx.companyId });
    }
    await updateSession(ctx, 'CL_CONTACT', { ...vars, leadFlow: flow });
    await sendMessage(ctx, t(lang, 'askContact'), {
      keyboard: [[{ text: button(lang, 'common.contact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
      resize_keyboard: true
    });
    return true;
  }

  if (state === 'CL_CONTACT') {
    if (isBack) {
      await updateSession(ctx, 'CL_CITY', { ...vars, leadFlow: flow });
      await sendMessage(ctx, t(lang, 'askCity'));
      return true;
    }
    const phoneRaw = message?.contact?.phone_number || text;
    const phone = normalizePhone(phoneRaw || undefined);
    if (!phone) {
      await sendMessage(ctx, t(lang, 'invalidPhone'));
      return true;
    }
    flow.phone = phone;
    await updateSession(ctx, 'CL_CONFIRM', { ...vars, leadFlow: flow });
    const summary = [
      `🙋 ${flow.name}`,
      `🚗 ${flow.car}`,
      flow.budget ? `💰 $${flow.budget}` : undefined,
      flow.city ? `📍 ${flow.city}` : undefined,
      `📞 ${flow.phone}`
    ].filter(Boolean).join('\n');
    await sendConfirm(ctx, lang, `${t(lang, 'leadConfirm')}\n\n${summary}`, 'cl_lead_send', 'cl_lead_back');
    return true;
  }

  if (state === 'CL_CONFIRM') {
    if (isBack) {
      await updateSession(ctx, 'CL_CONTACT', { ...vars, leadFlow: flow });
      await sendMessage(ctx, t(lang, 'askContact'), {
        keyboard: [[{ text: button(lang, 'common.contact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
        resize_keyboard: true
      });
      return true;
    }
    if (isCancel) {
      await showMenu(ctx, lang, 'CLIENT_LEAD', t(lang, 'cancelled'));
      return true;
    }
    await sendMessage(ctx, t(lang, 'fallback'));
    return true;
  }

  return false;
};

const handleCatalog = async (ctx: PipelineContext, text: string) => {
  if (!ctx.bot || !ctx.session) return false;
  const lang = resolveLang(ctx);
  const message = ctx.update?.message;
  const state = ctx.session.state || 'CAT_MENU';
  const vars = (ctx.session.variables as any) || {};
  const flow = vars.catalogFlow || {};

  const isFind = isCommand(text, ['/find', button(lang, 'catalog.find')]);
  const isSell = isCommand(text, ['/sell', button(lang, 'catalog.sell')]);
  const isCancel = isCommand(text, ['cancel', 'stop', 'відміна', 'отмена', button(lang, 'common.cancel')]);
  const isBack = isCommand(text, ['back', 'назад', '⬅️ back', '⬅️ назад', button(lang, 'common.back')]);
  const isMenu = isCommand(text, ['/start', '/menu', 'menu', 'reset']);
  const isSkip = isCommand(text, ['skip', button(lang, 'common.skip')]);

  if (isMenu) {
    await showMenu(ctx, lang, 'CATALOG');
    return true;
  }

  if (isCancel) {
    await showMenu(ctx, lang, 'CATALOG', t(lang, 'cancelled'));
    return true;
  }

  if (state === 'CAT_MENU' && !isFind && !isSell) {
    await showMenu(ctx, lang, 'CATALOG', t(lang, 'fallback'));
    return true;
  }

  if (isFind) {
    await updateSession(ctx, 'CAT_FIND_BRAND', { ...vars, catalogFlow: {} });
    await sendMessage(ctx, t(lang, 'catalogAskBrand'), {
      keyboard: [[{ text: button(lang, 'common.skip') }], [{ text: button(lang, 'common.cancel') }]],
      resize_keyboard: true
    });
    return true;
  }

  if (state === 'CAT_FIND_BRAND') {
    if (isBack) {
      await showMenu(ctx, lang, 'CATALOG');
      return true;
    }
    if (!isSkip) flow.brand = await normalizeBrand(text, { companyId: ctx.companyId });
    await updateSession(ctx, 'CAT_FIND_MODEL', { ...vars, catalogFlow: flow });
    await sendMessage(ctx, t(lang, 'catalogAskModel'), {
      keyboard: [[{ text: button(lang, 'common.skip') }], [{ text: button(lang, 'common.back') }]],
      resize_keyboard: true
    });
    return true;
  }

  if (state === 'CAT_FIND_MODEL') {
    if (isBack) {
      await updateSession(ctx, 'CAT_FIND_BRAND', { ...vars, catalogFlow: flow });
      await sendMessage(ctx, t(lang, 'catalogAskBrand'));
      return true;
    }
    if (!isSkip) flow.model = await normalizeModel(text, { companyId: ctx.companyId, brand: flow.brand || null });
    await updateSession(ctx, 'CAT_FIND_YEAR', { ...vars, catalogFlow: flow });
    await sendMessage(ctx, t(lang, 'catalogAskYear'), {
      keyboard: [[{ text: button(lang, 'common.skip') }], [{ text: button(lang, 'common.back') }]],
      resize_keyboard: true
    });
    return true;
  }

  if (state === 'CAT_FIND_YEAR') {
    if (isBack) {
      await updateSession(ctx, 'CAT_FIND_MODEL', { ...vars, catalogFlow: flow });
      await sendMessage(ctx, t(lang, 'catalogAskModel'));
      return true;
    }
    if (!isSkip) {
      const range = parseYearRange(text);
      flow.yearMin = range.min;
      flow.yearMax = range.max;
    }
    await updateSession(ctx, 'CAT_FIND_PRICE', { ...vars, catalogFlow: flow });
    await sendMessage(ctx, t(lang, 'catalogAskPrice'), {
      keyboard: [[{ text: button(lang, 'common.skip') }], [{ text: button(lang, 'common.back') }]],
      resize_keyboard: true
    });
    return true;
  }

  if (state === 'CAT_FIND_PRICE') {
    if (isBack) {
      await updateSession(ctx, 'CAT_FIND_YEAR', { ...vars, catalogFlow: flow });
      await sendMessage(ctx, t(lang, 'catalogAskYear'));
      return true;
    }
    if (!isSkip) {
      const range = parsePrice(text);
      flow.priceMin = range.min;
      flow.priceMax = range.max;
    }
    await updateSession(ctx, 'CAT_FIND_CITY', { ...vars, catalogFlow: flow });
    await sendMessage(ctx, t(lang, 'catalogAskCity'), {
      keyboard: [[{ text: button(lang, 'common.skip') }], [{ text: button(lang, 'common.back') }]],
      resize_keyboard: true
    });
    return true;
  }

  if (state === 'CAT_FIND_CITY') {
    if (isBack) {
      await updateSession(ctx, 'CAT_FIND_PRICE', { ...vars, catalogFlow: flow });
      await sendMessage(ctx, t(lang, 'catalogAskPrice'));
      return true;
    }
    if (!isSkip) flow.city = await normalizeCity(text, { companyId: ctx.companyId });

    await updateSession(ctx, 'CAT_RESULTS', { ...vars, catalogFlow: flow });

    const filters: any[] = [];
    if (flow.brand) filters.push({ title: { contains: flow.brand, mode: 'insensitive' } });
    if (flow.model) filters.push({ title: { contains: flow.model, mode: 'insensitive' } });
    if (flow.yearMin || flow.yearMax) {
      filters.push({ year: { gte: flow.yearMin || undefined, lte: flow.yearMax || undefined } });
    }
    if (flow.priceMin || flow.priceMax) {
      filters.push({ price: { gte: flow.priceMin || undefined, lte: flow.priceMax || undefined } });
    }
    if (flow.city) {
      filters.push({ location: { contains: flow.city, mode: 'insensitive' } });
    }

    const companyFilter = ctx.companyId
      ? { OR: [{ companyId: ctx.companyId }, { companyId: null }] }
      : {};

    const cars = await prisma.carListing.findMany({
      where: {
        status: 'AVAILABLE',
        ...(filters.length ? { AND: filters } : {}),
        ...companyFilter
      },
      orderBy: { postedAt: 'desc' },
      take: 5
    });

    if (!cars.length) {
      await sendMessage(ctx, t(lang, 'catalogNoResults'));
    } else {
      await sendMessage(ctx, t(lang, 'catalogResults'));
      for (const car of cars) {
        const title = car.title || 'Car';
        const price = formatPrice(car.price, car.currency || 'USD');
        const details = [
          `🚗 <b>${title}</b>`,
          car.year ? `📅 ${car.year}` : undefined,
          price ? `💰 ${price}` : undefined,
          car.location ? `📍 ${car.location}` : undefined
        ].filter(Boolean).join('\n');
        if (car.thumbnail) {
          await sendPhoto(ctx, car.thumbnail, details);
        } else {
          await sendMessage(ctx, details);
        }
      }
    }

    const url = buildMiniAppUrl(ctx.bot, {
      brand: flow.brand,
      model: flow.model,
      yearMin: flow.yearMin,
      yearMax: flow.yearMax,
      priceMin: flow.priceMin,
      priceMax: flow.priceMax,
      city: flow.city
    });

    if (url) {
      await sendMessage(ctx, button(lang, 'common.openMiniApp'), {
        inline_keyboard: [[{ text: button(lang, 'common.openMiniApp'), web_app: { url } }]]
      });
    }

    await showMenu(ctx, lang, 'CATALOG');
    return true;
  }

  if (isSell) {
    await updateSession(ctx, 'CAT_SELL_CONTACT', { ...vars, catalogFlow: {} });
    await sendMessage(ctx, t(lang, 'catalogSellContact'), {
      keyboard: [[{ text: button(lang, 'common.contact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
      resize_keyboard: true
    });
    return true;
  }

  if (state === 'CAT_SELL_CONTACT') {
    if (isBack) {
      await showMenu(ctx, lang, 'CATALOG');
      return true;
    }
    const phoneRaw = message?.contact?.phone_number || text;
    const phone = normalizePhone(phoneRaw || undefined);
    if (!phone) {
      await sendMessage(ctx, t(lang, 'invalidPhone'));
      return true;
    }
    flow.phone = phone;
    await updateSession(ctx, 'CAT_SELL_CAR', { ...vars, catalogFlow: flow });
    await sendMessage(ctx, t(lang, 'catalogSellCar'), { remove_keyboard: true });
    return true;
  }

  if (state === 'CAT_SELL_CAR') {
    if (isBack) {
      await updateSession(ctx, 'CAT_SELL_CONTACT', { ...vars, catalogFlow: flow });
      await sendMessage(ctx, t(lang, 'catalogSellContact'));
      return true;
    }
    if (text.length < 3) {
      await sendMessage(ctx, t(lang, 'invalidCar'));
      return true;
    }
    flow.car = text;
    await updateSession(ctx, 'CAT_SELL_CONFIRM', { ...vars, catalogFlow: flow });
    const summary = [`🚗 ${flow.car}`, `📞 ${flow.phone}`].join('\n');
    await sendConfirm(ctx, lang, `${t(lang, 'catalogSellConfirm')}\n\n${summary}`, 'cat_sell_send', 'cat_sell_back');
    return true;
  }

  if (state === 'CAT_SELL_CONFIRM') {
    if (isBack) {
      await updateSession(ctx, 'CAT_SELL_CAR', { ...vars, catalogFlow: flow });
      await sendMessage(ctx, t(lang, 'catalogSellCar'));
      return true;
    }
    if (isCancel) {
      await showMenu(ctx, lang, 'CATALOG', t(lang, 'cancelled'));
      return true;
    }
    await sendMessage(ctx, t(lang, 'fallback'));
    return true;
  }

  return false;
};

const handleB2B = async (ctx: PipelineContext, text: string) => {
  if (!ctx.bot || !ctx.session) return false;
  const lang = resolveLang(ctx);
  const message = ctx.update?.message;
  const state = ctx.session.state || 'B2B_MENU';
  const vars = (ctx.session.variables as any) || {};
  const flow = vars.b2bFlow || {};

  const isNewRequest = isCommand(text, ['/request', button(lang, 'b2b.request')]);
  const isCancel = isCommand(text, ['cancel', 'stop', 'відміна', 'отмена', button(lang, 'common.cancel')]);
  const isBack = isCommand(text, ['back', 'назад', '⬅️ back', '⬅️ назад', button(lang, 'common.back')]);
  const isMenu = isCommand(text, ['/start', '/menu', 'menu', 'reset']);
  const isSkip = isCommand(text, ['skip', button(lang, 'common.skip')]);

  if (isMenu) {
    await showMenu(ctx, lang, 'B2B');
    return true;
  }

  if (isCancel) {
    await showMenu(ctx, lang, 'B2B', t(lang, 'cancelled'));
    return true;
  }

  if (state === 'B2B_MENU' && !isNewRequest) {
    await showMenu(ctx, lang, 'B2B', t(lang, 'fallback'));
    return true;
  }

  if (isNewRequest || state === 'B2B_MENU') {
    await updateSession(ctx, 'B2B_REQ_TITLE', { ...vars, b2bFlow: {} });
    await sendMessage(ctx, t(lang, 'b2bAskTitle'), { remove_keyboard: true });
    return true;
  }

  if (state === 'B2B_REQ_TITLE') {
    if (isBack) {
      await showMenu(ctx, lang, 'B2B');
      return true;
    }
    if (text.length < 3) {
      await sendMessage(ctx, t(lang, 'invalidCar'));
      return true;
    }
    flow.title = text;
    await updateSession(ctx, 'B2B_REQ_YEAR', { ...vars, b2bFlow: flow });
    await sendMessage(ctx, t(lang, 'b2bAskYear'));
    return true;
  }

  if (state === 'B2B_REQ_YEAR') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_TITLE', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskTitle'));
      return true;
    }
    if (!isSkip) {
      const range = parseYearRange(text);
      flow.yearMin = range.min;
      flow.yearMax = range.max;
    }
    await updateSession(ctx, 'B2B_REQ_BUDGET', { ...vars, b2bFlow: flow });
    await sendMessage(ctx, t(lang, 'b2bAskBudget'));
    return true;
  }

  if (state === 'B2B_REQ_BUDGET') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_YEAR', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskYear'));
      return true;
    }
    if (!isSkip) {
      const range = parsePrice(text);
      flow.budgetMin = range.min;
      flow.budgetMax = range.max;
    }
    await updateSession(ctx, 'B2B_REQ_MILEAGE', { ...vars, b2bFlow: flow });
    await sendMessage(ctx, t(lang, 'b2bAskMileage'));
    return true;
  }

  if (state === 'B2B_REQ_MILEAGE') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_BUDGET', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskBudget'));
      return true;
    }
    if (!isSkip) {
      const range = parseMileage(text);
      flow.mileageMin = range.min;
      flow.mileageMax = range.max;
      flow.mileageText = text.trim();
    }
    await updateSession(ctx, 'B2B_REQ_FUEL', { ...vars, b2bFlow: flow });
    await sendMessage(ctx, t(lang, 'b2bAskFuel'));
    return true;
  }

  if (state === 'B2B_REQ_FUEL') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_MILEAGE', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskMileage'));
      return true;
    }
    if (!isSkip) flow.fuel = text.trim();
    await updateSession(ctx, 'B2B_REQ_DESC', { ...vars, b2bFlow: flow });
    await sendMessage(ctx, t(lang, 'b2bAskDesc'));
    return true;
  }

  if (state === 'B2B_REQ_DESC') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_FUEL', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskFuel'));
      return true;
    }
    flow.description = text;
    await updateSession(ctx, 'B2B_REQ_CONTACT', { ...vars, b2bFlow: flow });
    await sendMessage(ctx, t(lang, 'b2bAskContact'), {
      keyboard: [[{ text: button(lang, 'common.contact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
      resize_keyboard: true
    });
    return true;
  }

  if (state === 'B2B_REQ_CONTACT') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_DESC', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskDesc'));
      return true;
    }
    const phoneRaw = message?.contact?.phone_number || text;
    const normalized = normalizePhone(phoneRaw || undefined);
    const contact = normalized || (phoneRaw ? String(phoneRaw).trim() : '');
    if (!contact) {
      await sendMessage(ctx, t(lang, 'invalidPhone'));
      return true;
    }
    flow.contact = contact;
    await updateSession(ctx, 'B2B_REQ_COMPANY', { ...vars, b2bFlow: flow });
    await sendMessage(ctx, t(lang, 'b2bAskCompany'));
    return true;
  }

  if (state === 'B2B_REQ_COMPANY') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_CONTACT', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskContact'), {
        keyboard: [[{ text: button(lang, 'common.contact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
        resize_keyboard: true
      });
      return true;
    }
    if (!isSkip && text.trim().length < 2) {
      await sendMessage(ctx, t(lang, 'invalidName'));
      return true;
    }
    const fallbackName = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(' ').trim();
    const fallbackCompany = message?.from?.username ? `@${message.from.username}` : (fallbackName || undefined);
    flow.companyName = isSkip ? (fallbackCompany || flow.companyName) : text.trim();
    await updateSession(ctx, 'B2B_REQ_CONFIRM', { ...vars, b2bFlow: flow });
    const summary = [
      `🚗 ${flow.title}`,
      flow.yearMin ? `📅 ${flow.yearMin}${flow.yearMax ? `-${flow.yearMax}` : ''}` : undefined,
      flow.budgetMax ? `💰 до ${flow.budgetMax}` : undefined,
      flow.mileageMin || flow.mileageMax ? `🛣 ${flow.mileageText || flow.mileageMax || flow.mileageMin}` : undefined,
      flow.fuel ? `⛽ ${flow.fuel}` : undefined,
      flow.description ? `📝 ${flow.description}` : undefined,
      flow.companyName ? `🏢 ${flow.companyName}` : undefined,
      flow.contact ? `📞 ${flow.contact}` : undefined
    ].filter(Boolean).join('\n');
    await sendConfirm(ctx, lang, `${t(lang, 'b2bConfirm')}\n\n${summary}`, 'b2b_req_send', 'b2b_req_back');
    return true;
  }

  if (state === 'B2B_REQ_CONFIRM') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_COMPANY', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskCompany'));
      return true;
    }
    if (isCancel) {
      await showMenu(ctx, lang, 'B2B', t(lang, 'cancelled'));
      return true;
    }
    await sendMessage(ctx, t(lang, 'fallback'));
    return true;
  }

  return false;
};

export const handleDynamicMenu = async (ctx: PipelineContext, text: string) => {
  if (!ctx.bot || !ctx.session) return false;

  const config = ctx.bot.config as any;
  const menuConfig = config?.menuConfig;
  const buttons = Array.isArray(menuConfig?.buttons) ? menuConfig.buttons : [];

  // If no dynamic configuration, skip
  if (!buttons.length) return false;

  const lang = resolveLang(ctx);
  // Commands that trigger the menu display
  const isMenu = isCommand(text, ['/start', '/menu', 'menu', 'reset', 'start']);

  // 1. Show Menu
  if (isMenu) {
    // LANGUAGE CHECK - Bootstrap Flow
    const sessionVars = (ctx.session.variables as any) || {};
    if (!sessionVars.language && !sessionVars.lang) {
      await sendMessage(ctx, 'Please select your language / Оберіть мову:', {
        inline_keyboard: [
          [{ text: '🇺🇦 Українська', callback_data: 'set_lang:UK' }],
          [{ text: '🇺🇸 English', callback_data: 'set_lang:EN' }],
          [{ text: '🇷🇺 Русский', callback_data: 'set_lang:RU' }]
        ]
      });
      return true;
    }

    const welcome = menuConfig.welcomeMessage || t(lang, 'clientMenu', { bot: ctx.bot.name || 'Bot' });

    // Group buttons into rows
    const rows: any[][] = [];
    // Sort by row/col just in case, though frontend usually saves them ordered? 
    // Better to trust the row/col properties.
    const sorted = [...buttons].sort((a, b) => (a.row - b.row) || (a.col - b.col));

    for (const btn of sorted) {
      if (!rows[btn.row]) rows[btn.row] = [];

      const label = btn[`label_${lang}`] || btn.label || 'Button';

      if (btn.type === 'WEB_APP') {
        rows[btn.row].push({ text: label, web_app: { url: btn.value } });
      } else if (btn.type === 'LINK') {
        // Links are usually inline buttons, but in a keyboard they fail. 
        // We will simple show text for now or maybe this is intended for inline?
        // The Hub UI seems to build a persistent keyboard (ReplyKeyboardMarkup).
        // ReplyKeyboard buttons cannot be links. They are just text triggers.
        // So for LINK/WEB_APP types in ReplyKeyboard:
        // WEB_APP is supported.
        // LINK is NOT supported directly in ReplyKeyboardMarkup (must be Inline).
        // If the user configured a LINK button in a persistent menu, we can't render it as a link button.
        // We render it as text, and when clicked, we send the link?
        rows[btn.row].push({ text: label });
      } else {
        rows[btn.row].push({ text: label });
      }
    }

    // Fill gaps if strictly row-based array
    const keyboard = rows.filter(r => Array.isArray(r) && r.length > 0);

    await sendMessage(ctx, welcome, {
      keyboard,
      resize_keyboard: true
    });

    // Reset flow state
    await updateSession(ctx, 'DYN_MENU', { ...((ctx.session.variables as any) || {}), currentFlow: undefined });
    return true;
  }

  // 2. Handle Button Clicks (Text Match)
  // Find button that matches the text
  const matchedBtn = buttons.find((btn: any) => {
    const label = btn.label || '';
    const labelUk = btn.label_uk || '';
    const labelRu = btn.label_ru || '';
    return isCommand(text, [label, labelUk, labelRu].filter(Boolean));
  });

  if (matchedBtn) {
    if (matchedBtn.type === 'SCENARIO') {
      const scenarioId = matchedBtn.value;
      if (scenarioId) {
        // Check if scenario exists and force run it
        // We can delegate to ScenarioEngine or just trigger it by forcing the session/context
        // Easier: Let the ScenarioEngine pick it up? 
        // ScenarioEngine.handleUpdate usually checks for trigger commands.
        // But here we have an ID.

        // We can try to load the scenario and run its first node?
        // Or easier: update the session to point to the scenario entry?

        // Let's use the ScenarioEngine if possible.
        // ScenarioEngine doesn't seem to expose "runById".

        // Hack/Workaround: If we know the scenario trigger command, we can pretend the user sent it?
        // But we have the ID.

        // Let's look for the scenario by ID
        const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } });
        if (scenario && scenario.isActive) {
          // We need to trigger the engine.
          // We can manually call 'ScenarioEngine.startScenario(ctx, scenario)' if it was exposed.
          // It's not imported here.

          // Let's check ScenarioEngine availability.
          return await ScenarioEngine.startScenario(ctx.bot, ctx.session, scenarioId, ctx.update);
        }
      }
    }

    if (matchedBtn.type === 'TEXT') {
      await sendMessage(ctx, matchedBtn.value || 'Hello!');
      return true;
    }

    if (matchedBtn.type === 'LINK') {
      await sendMessage(ctx, `🔗 ${matchedBtn.value}`);
      return true;
    }

    // WEB_APP usually opens on client side, but we might receive data if specific event?
    // If it's just a text click, we do nothing or re-open menu.
    return true;
  }

  // If we are in DYN_MENU state and text didn't match anything, 
  // we could fallback to other logic, OR show the menu again if it looks like navigation?

  return false;
};

export const routeMessage = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return false;

  const sessionVars = (ctx.session.variables as any) || {};
  const isB2BTemplate = ctx.bot.template === 'B2B';
  const hasActiveScenario = !!sessionVars.__activeScenarioId;
  const isDealerFlow = sessionVars.role === 'DEALER'
    || !!sessionVars.dealer_state
    || !!sessionVars.dealer_invite_id
    || !!sessionVars.ref_request_id;

  // 1. Prioritize Scenarios (Triggers)
  // For B2B template, skip scenario routing unless we're already inside a scenario
  // or handling dealer flow to avoid menu/flow mismatch.
  if (!isB2BTemplate || hasActiveScenario || isDealerFlow) {
    const handledScenario = await ScenarioEngine.handleUpdate(ctx.bot as any, ctx.session, ctx.update);
    if (handledScenario) return true;
  }

  const message = ctx.update?.message;
  const text = message?.text || '';

  // 2. Dynamic Menu Logic (Prioritized over legacy templates)
  const isDynamicHandled = isB2BTemplate ? false : await handleDynamicMenu(ctx, text);
  if (isDynamicHandled) return true;

  // 3. Legacy Templates (Fallback)
  // If modern scenarios exist for this bot/company, do not fall back to legacy template flows
  // (Logic preserved from original file)
  const companyId = (ctx as any).companyId || ctx.bot.companyId;
  /* 
   NOTE: We relaxed this check slightly. If handleDynamicMenu returned false, 
   it means user is not interacting with the menu. 
   We still want to allow legacy templates if they are active?
   BUT: If the user has a "Dynamic Menu", they likely don't want "CLIENT_LEAD" hardcoded behavior 
   interfering (e.g. asking for name immediately if not matched).
   
   However, we should still allow the "Legacy" flows to run if the user hasn't fully migrated.
   The implementation plan says: "If present, delegate".
   We did checks at top.
  */

  if (companyId && !isB2BTemplate) {
    const hasScenarios = await prisma.scenario.findFirst({
      where: {
        companyId,
        status: 'PUBLISHED',
        isActive: true,
        OR: [{ botId: ctx.bot.id }, { botId: null }]
      },
      select: { id: true }
    });
    if (hasScenarios) return true;
  }

  if (ctx.bot.template === 'CLIENT_LEAD') return handleClientLead(ctx, text);
  if (ctx.bot.template === 'CATALOG') return handleCatalog(ctx, text);
  if (ctx.bot.template === 'B2B') return handleB2B(ctx, text);

  return false;
};

export const finalizeClientLead = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return;
  const lang = resolveLang(ctx);
  const vars = (ctx.session.variables as any) || {};
  const flow = vars.leadFlow || {};
  const from = ctx.update?.message?.from;
  const telegramUsername = from?.username ? String(from.username) : undefined;
  const telegramName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || undefined;

  const result = await createOrMergeLead({
    botId: ctx.bot.id,
    companyId: ctx.companyId,
    chatId: ctx.chatId,
    userId: ctx.userId,
    name: flow.name || 'Client',
    telegramUsername,
    telegramName,
    phone: flow.phone,
    request: flow.car || '',
    source: 'TELEGRAM',
    payload: {
      budget: flow.budget,
      city: flow.city,
      language: lang
    },
    leadType: 'BUY',
    createRequest: true,
    requestData: {
      title: flow.car || 'Request',
      budgetMax: flow.budget || undefined,
      city: flow.city || undefined,
      description: `Via Bot. User: ${flow.name || ''}`.trim(),
      language: lang
    }
  }, ctx.bot.config);

  if (result.isDuplicate) {
    await sendMessage(ctx, t(lang, 'leadDuplicate'), { remove_keyboard: true });
  } else {
    // A2: Write to MessageLog if request created
    if (result.request) {
      await prisma.messageLog.create({
        data: {
          requestId: result.request.id,
          chatId: ctx.chatId || '',
          direction: 'INCOMING',
          text: `[Client Lead] ${flow.car}`,
          payload: { flow: vars.leadFlow }
        }
      });
    }
    await sendMessage(ctx, t(lang, 'leadReceived'), { remove_keyboard: true });
  }

  if (ctx.bot.adminChatId) {
    const leadCard = renderLeadCard({
      clientName: flow.name,
      phone: flow.phone,
      request: flow.car,
      payload: { city: flow.city, budget: flow.budget }
    });
    const reqCard = result.request ? renderRequestCard(result.request) : '';
    const header = result.isDuplicate ? '♻️ Duplicate lead merged' : '🔥 New lead';
    await sendMessage(ctx, `${header}\n\n${leadCard}${reqCard ? `\n\n${reqCard}` : ''}`, undefined, String(ctx.bot.adminChatId));
  }

  await showMenu(ctx, lang, 'CLIENT_LEAD');
};

export const finalizeCatalogSell = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return;
  const lang = resolveLang(ctx);
  const vars = (ctx.session.variables as any) || {};
  const flow = vars.catalogFlow || {};
  const from = ctx.update?.message?.from;
  const telegramUsername = from?.username ? String(from.username) : undefined;
  const telegramName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || undefined;

  const result = await createOrMergeLead({
    botId: ctx.bot.id,
    companyId: ctx.companyId,
    chatId: ctx.chatId,
    userId: ctx.userId,
    name: flow.name || 'Seller',
    telegramUsername,
    telegramName,
    phone: flow.phone,
    request: flow.car || '',
    source: 'TELEGRAM',
    payload: {
      language: lang,
      leadType: 'SELL'
    },
    leadType: 'SELL',
    createRequest: false
  }, ctx.bot.config);

  if (result.isDuplicate) {
    await sendMessage(ctx, t(lang, 'leadDuplicate'));
  } else {
    await sendMessage(ctx, t(lang, 'catalogSellReceived'));
  }

  if (ctx.bot.adminChatId) {
    const leadCard = renderLeadCard({
      clientName: flow.name || 'Seller',
      phone: flow.phone,
      request: flow.car,
      payload: { leadType: 'SELL' }
    });
    const header = result.isDuplicate ? '♻️ Duplicate sell lead merged' : '💵 New sell lead';
    await sendMessage(ctx, `${header}\n\n${leadCard}`, undefined, String(ctx.bot.adminChatId));
  }

  await showMenu(ctx, lang, 'CATALOG');
};

export const finalizeB2BRequest = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return;
  const lang = resolveLang(ctx);
  const vars = (ctx.session.variables as any) || {};
  const flow = vars.b2bFlow || {};

  const payload = {
    source: 'telegram_b2b',
    contact: flow.contact || undefined,
    companyName: flow.companyName || undefined,
    request: {
      mileageMin: flow.mileageMin ?? undefined,
      mileageMax: flow.mileageMax ?? undefined,
      mileageText: flow.mileageText ?? undefined,
      fuel: flow.fuel || undefined,
      comment: flow.description || undefined,
      contact: flow.contact || undefined,
      companyName: flow.companyName || undefined
    }
  };

  const mapped = mapRequestInput({
    title: flow.title || 'Request',
    yearMin: flow.yearMin,
    yearMax: flow.yearMax,
    budgetMin: flow.budgetMin,
    budgetMax: flow.budgetMax,
    description: flow.description,
    status: 'COLLECTING_VARIANTS',
    language: lang,
    clientChatId: ctx.chatId,
    source: 'TELEGRAM',
    payload
  });

  const request = await prisma.b2bRequest.create({
    data: {
      ...mapped,
      publicId: generatePublicId(),
      companyId: ctx.companyId || null
    }
  });

  // A2: Write to MessageLog
  await prisma.messageLog.create({
    data: {
      requestId: request.id,
      chatId: ctx.chatId || '',
      direction: 'INCOMING',
      text: `[B2B Request] ${request.title}`,
      payload: { flow: vars.b2bFlow }
    }
  });

  await sendMessage(ctx, t(lang, 'b2bSent'));

  // AUTO-POST TO CHANNEL (Task B)
  const channelId = ctx.bot.channelId;

  if (channelId) {
    try {
      // Fetch bot username if not in config
      let botUsername = (ctx.bot.config as any)?.botUsername || (ctx.bot.config as any)?.username;

      if (!botUsername) {
        // Auto-fetch via getMe
        const getMeResp = await fetch(`https://api.telegram.org/bot${ctx.bot.token}/getMe`);
        const getMeData = await getMeResp.json();
        if (getMeData.ok && getMeData.result?.username) {
          botUsername = getMeData.result.username;

          // Store in config for reuse
          await prisma.botConfig.update({
            where: { id: ctx.bot.id },
            data: {
              config: {
                ...(ctx.bot.config as any || {}),
                botUsername,
                username: botUsername
              } as any
            }
          });
        }
      }

      if (!botUsername) {
        throw new Error('Unable to fetch bot username');
      }

      // Generate deep-link with new Telegram-safe format: request_{publicId}
      const deeplink = `https://t.me/${botUsername}?start=request_${request.publicId || request.id}`;

      // Build structured message
      const requestCard = renderRequestCard(request);
      const channelMessage = `📝 Пошук авто\n\n${requestCard}`;

      // Send to channel with "Є авто ✅" button
      const sent: any = await telegramOutbox.sendMessage({
        botId: ctx.bot.id,
        token: ctx.bot.token,
        chatId: String(channelId),
        text: channelMessage,
        replyMarkup: {
          inline_keyboard: [[
            { text: 'Є авто ✅', url: deeplink }
          ]]
        },
        companyId: ctx.companyId
      });

      // Create ChannelPost record for tracking
      if (sent?.message_id) {
        await prisma.channelPost.create({
          data: {
            requestId: request.id,
            botId: ctx.bot.id,
            channelId: String(channelId),
            messageId: sent.message_id,
            status: 'ACTIVE',
            payload: {
              deeplink,
              publicId: request.publicId,
              postedAt: new Date().toISOString()
            }
          }
        });
      }
    } catch (err: any) {
      // Log error but don't block flow
      console.error('[finalizeB2BRequest] Channel post failed:', err.message);

      // Notify requester about issue
      await sendMessage(ctx,
        `⚠️ Запит створено, але не опубліковано у канал. Зверніться до адміністратора.`,
        undefined,
        ctx.chatId
      );
    }
  } else {
    // No channel configured - warn user and suggest /setup_channel
    await sendMessage(ctx,
      `⚠️ Канал не налаштовано. Запит створено, але не опубліковано.\n\n` +
      `Адміністратор може налаштувати канал командою /setup_channel у боті.`,
      undefined,
      ctx.chatId
    );
  }

  // Notify admin (existing logic)
  const managerChatId = (ctx.bot.config as any)?.b2bManagerChatId || ctx.bot.adminChatId;
  if (managerChatId) {
    const requestCard = renderRequestCard(request, { includeContact: true });
    const botUsername = (ctx.bot.config as any)?.botUsername || (ctx.bot.config as any)?.username;
    const link = botUsername ? generateRequestLink(botUsername, request.publicId || request.id) : '';
    const header = `📝 New B2B request ${request.publicId || request.id}`;
    const msg = link ? `${header}\n${requestCard}\n\n🔗 ${link}` : `${header}\n${requestCard}`;
    await sendMessage(ctx, msg, undefined, String(managerChatId));
  }

  await showMenu(ctx, lang, 'B2B');
};
