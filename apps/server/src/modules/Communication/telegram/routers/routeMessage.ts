import { prisma } from '../../../../services/prisma.js';
import type { PipelineContext } from '../types.js';
import { ScenarioEngine } from '../../bots/scenario.engine.js';
import { telegramOutbox } from '../outbox/telegramOutbox.js';
import { normalizeBrand } from '../../../Inventory/normalization/normalizeBrand.js';
import { normalizeModel } from '../../../Inventory/normalization/normalizeModel.js';
import { normalizeCity } from '../../../Inventory/normalization/normalizeCity.js';
import { normalizePhone } from '../../../Inventory/normalization/normalizePhone.js';
import { createOrMergeLead } from '../services/leadService.js';
import { renderLeadCard, renderRequestCard } from '../../../../services/cardRenderer.js';
import { generateRequestLink } from '../../../../utils/deeplink.utils.js';
import { buildMiniAppUrl } from '../utils/miniappUrl.js';
import { generatePublicId, mapRequestInput } from '../../../../services/dto.js';
import { buildCallbackData } from '../utils/callbackUtils.js';
import { button, isCommand, resolveLang, t, type Lang } from '../utils/telegramText.js';


const parseRange = (input: string) => {
  const nums = (input.match(/\d{2,}/g) || []).map(v => Number(v));
  if (!nums.length) return { min: undefined, max: undefined };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  const min = Math.min(nums[0], nums[1]);
  const max = Math.max(nums[0], nums[1]);
  return { min, max };
};

const parsePrice = (input: string) => {
  const nums = (input.match(/\d{2,}/g) || []).map(v => Number(v));
  if (!nums.length) return { min: undefined, max: undefined };
  if (nums.length === 1) return { min: undefined, max: nums[0] };
  const min = Math.min(nums[0], nums[1]);
  const max = Math.max(nums[0], nums[1]);
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
      const range = parseRange(text);
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
      const range = parseRange(text);
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
    await updateSession(ctx, 'B2B_REQ_CITY', { ...vars, b2bFlow: flow });
    await sendMessage(ctx, t(lang, 'b2bAskCity'));
    return true;
  }

  if (state === 'B2B_REQ_CITY') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_BUDGET', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskBudget'));
      return true;
    }
    if (!isSkip) flow.city = await normalizeCity(text, { companyId: ctx.companyId });
    await updateSession(ctx, 'B2B_REQ_DESC', { ...vars, b2bFlow: flow });
    await sendMessage(ctx, t(lang, 'b2bAskDesc'));
    return true;
  }

  if (state === 'B2B_REQ_DESC') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_CITY', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskCity'));
      return true;
    }
    flow.description = text;
    await updateSession(ctx, 'B2B_REQ_CONFIRM', { ...vars, b2bFlow: flow });
    const summary = [
      `🚗 ${flow.title}`,
      flow.yearMin ? `📅 ${flow.yearMin}${flow.yearMax ? `-${flow.yearMax}` : ''}` : undefined,
      flow.budgetMax ? `💰 до ${flow.budgetMax}` : undefined,
      flow.city ? `📍 ${flow.city}` : undefined,
      flow.description ? `📝 ${flow.description}` : undefined
    ].filter(Boolean).join('\n');
    await sendConfirm(ctx, lang, `${t(lang, 'b2bConfirm')}\n\n${summary}`, 'b2b_req_send', 'b2b_req_back');
    return true;
  }

  if (state === 'B2B_REQ_CONFIRM') {
    if (isBack) {
      await updateSession(ctx, 'B2B_REQ_DESC', { ...vars, b2bFlow: flow });
      await sendMessage(ctx, t(lang, 'b2bAskDesc'));
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

export const routeMessage = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return false;

  const handledScenario = await ScenarioEngine.handleUpdate(ctx.bot as any, ctx.session, ctx.update).catch(() => false);
  if (handledScenario) return true;

  const message = ctx.update?.message;
  const text = message?.text || '';

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

  const result = await createOrMergeLead({
    botId: ctx.bot.id,
    companyId: ctx.companyId,
    chatId: ctx.chatId,
    userId: ctx.userId,
    name: flow.name || 'Client',
    phone: flow.phone,
    request: flow.car || '',
    source: ctx.bot.name || 'Telegram',
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

  const result = await createOrMergeLead({
    botId: ctx.bot.id,
    companyId: ctx.companyId,
    chatId: ctx.chatId,
    userId: ctx.userId,
    name: flow.name || 'Seller',
    phone: flow.phone,
    request: flow.car || '',
    source: ctx.bot.name || 'Telegram',
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

  const mapped = mapRequestInput({
    title: flow.title || 'Request',
    yearMin: flow.yearMin,
    yearMax: flow.yearMax,
    budgetMin: flow.budgetMin,
    budgetMax: flow.budgetMax,
    city: flow.city,
    description: flow.description,
    status: 'COLLECTING_VARIANTS',
    language: lang,
    clientChatId: ctx.chatId,
    source: 'TELEGRAM'
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

  const managerChatId = (ctx.bot.config as any)?.b2bManagerChatId || ctx.bot.adminChatId;
  if (managerChatId) {
    const requestCard = renderRequestCard(request);
    const botUsername = (ctx.bot.config as any)?.username;
    const link = botUsername ? generateRequestLink(botUsername, request.publicId || request.id) : '';
    const header = `📝 New B2B request ${request.publicId || request.id}`;
    const msg = link ? `${header}\n${requestCard}\n\n🔗 ${link}` : `${header}\n${requestCard}`;
    await sendMessage(ctx, msg, undefined, String(managerChatId));
  }

  await showMenu(ctx, lang, 'B2B');
};
