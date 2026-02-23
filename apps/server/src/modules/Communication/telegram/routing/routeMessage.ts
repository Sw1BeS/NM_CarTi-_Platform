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
import { publicIdService } from '../../../../services/publicId.service.js';
import { b2bWhitelistService } from '../../../../services/b2bWhitelist.service.js';
import { quotaService } from '../../../../services/quota.service.js';
import { getEnvInt, isEnvFlagEnabled } from '../../../../services/featureFlags.js';
import { logger } from '../../../../utils/logger.js';
import { buildTelegramChannelPostUrl, normalizeBotConfigChatId } from '../core/utils/telegramChatId.js';
import { resolveReplyMarkupForChat } from '../core/utils/telegramReplyMarkup.js';
import { b2bRoutingService } from '../../../../services/b2bRouting.service.js';


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
  const effectiveChatType = targetChatId ? (String(targetChatId).startsWith('-') ? 'supergroup' : 'private') : ctx.chatType;
  const normalizedReplyMarkup = resolveReplyMarkupForChat({
    replyMarkup,
    bot: ctx.bot,
    chatType: effectiveChatType,
    chatId
  });
  await telegramOutbox.sendMessage({
    botId: ctx.bot.id,
    token: ctx.bot.token,
    chatId,
    text,
    replyMarkup: normalizedReplyMarkup,
    companyId: ctx.companyId,
    userId: ctx.userId || undefined
  });
};

const sendPhoto = async (ctx: PipelineContext, photo: string, caption: string, replyMarkup?: any, targetChatId?: string) => {
  if (!ctx.bot) return;
  const chatId = targetChatId || ctx.chatId;
  if (!chatId) return;
  const effectiveChatType = targetChatId ? (String(targetChatId).startsWith('-') ? 'supergroup' : 'private') : ctx.chatType;
  const normalizedReplyMarkup = resolveReplyMarkupForChat({
    replyMarkup,
    bot: ctx.bot,
    chatType: effectiveChatType,
    chatId
  });
  await telegramOutbox.sendPhoto({
    botId: ctx.bot.id,
    token: ctx.bot.token,
    chatId,
    photo,
    caption,
    replyMarkup: normalizedReplyMarkup,
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
    if (getFlowVersion()) {
      await sendMessage(ctx, t(lang, 'clientMenu', { bot: botName }), {
        keyboard: [
          [{ text: BOT_A_V2_BUTTONS.lead }],
          [{ text: BOT_A_V2_BUTTONS.catalog }],
          [{ text: BOT_A_V2_BUTTONS.contacts }]
        ],
        resize_keyboard: true
      });
    } else {
      await sendMessage(ctx, t(lang, 'clientMenu', { bot: botName }), {
        keyboard: [[{ text: button(lang, 'clientLead.lead') }], [{ text: button(lang, 'clientLead.support') }]],
        resize_keyboard: true
      });
    }
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

const BOT_A_V2_BUTTONS = {
  lead: 'Залишити заявку',
  catalog: 'Каталог/Авто',
  contacts: 'Контакти'
};

const BOT_A_INTEREST_OPTIONS: Record<string, string> = {
  stock: 'в наявності',
  transit: 'в дорозі',
  pickup: 'підбір і пригін'
};

const getFlowVersion = () => isEnvFlagEnabled('FF_BOT_A_FLOW_V2', false);

const resolveFlowTimeoutMs = () => {
  const minutes = Math.max(5, getEnvInt('BOT_FLOW_TIMEOUT_MINUTES', 30));
  return minutes * 60_000;
};

const isSessionTimedOut = (lastActive: Date | null | undefined) => {
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() > resolveFlowTimeoutMs();
};

const resolveLeadInterest = (value: string) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('наяв') || raw.includes('наявн') || raw.includes('stock')) return 'stock';
  if (raw.includes('дороз') || raw.includes('transit')) return 'transit';
  if (raw.includes('підбір') || raw.includes('пригін') || raw.includes('pickup')) return 'pickup';
  return null;
};

const formatB2bRequestChannelCard = (request: any) => {
  const payload = (request?.payload || {}) as Record<string, any>;
  const reqPayload = (payload.request || {}) as Record<string, any>;
  const requesterCompany = String(reqPayload.companyName || payload.companyName || 'Компанія не вказана');
  const yearLine = request.yearMin
    ? `${request.yearMin}${request.yearMax ? `-${request.yearMax}` : ''}`
    : '—';
  const budgetLine = request.budgetMin || request.budgetMax
    ? `${request.budgetMin || 0}-${request.budgetMax || '∞'} USD`
    : '—';
  const mileageLine = reqPayload.mileageText || reqPayload.mileageMax || reqPayload.mileageMin || '—';
  const fuelLine = reqPayload.fuel || '—';
  const noteLine = request.description || reqPayload.comment || '—';

  return [
    `📝 Запит ${request.publicId || request.id}`,
    `🚗 Марка/модель: ${request.title || '—'}`,
    `📅 Рік: ${yearLine}`,
    `💰 Бюджет: ${budgetLine}`,
    `🛣 Пробіг: ${mileageLine}`,
    `⛽ Тип пального: ${fuelLine}`,
    `📝 Примітка: ${noteLine}`,
    `🏢 Хто шукає: ${requesterCompany}`
  ].join('\n');
};

const handleClientLead = async (ctx: PipelineContext, text: string) => {
  if (!ctx.bot || !ctx.session) return false;
  const lang = resolveLang(ctx);
  const message = ctx.update?.message;
  const state = ctx.session.state || 'CL_MENU';
  const vars = (ctx.session.variables as any) || {};
  const flow = vars.leadFlow || {};
  const flowV2 = getFlowVersion();
  const isLeaveRequest = isCommand(text, ['/buy', button(lang, 'clientLead.lead'), BOT_A_V2_BUTTONS.lead]);
  const isSupport = !flowV2 && isCommand(text, [button(lang, 'clientLead.support')]);
  const isCatalog = flowV2 && isCommand(text, [BOT_A_V2_BUTTONS.catalog]);
  const isContacts = flowV2 && isCommand(text, [BOT_A_V2_BUTTONS.contacts]);
  const isCancel = isCommand(text, ['cancel', 'stop', 'відміна', 'отмена', button(lang, 'common.cancel')]);
  const isBack = isCommand(text, ['back', 'назад', '⬅️ back', '⬅️ назад', button(lang, 'common.back')]);
  const isMenu = isCommand(text, ['/start', '/menu', 'menu', 'reset']);

  if (state !== 'CL_MENU' && isSessionTimedOut(ctx.session.lastActive as Date | undefined)) {
    await showMenu(ctx, lang, 'CLIENT_LEAD', '⌛️ Сесія завершена через неактивність. Почнімо спочатку.');
    return true;
  }

  if (isMenu) {
    await showMenu(ctx, lang, 'CLIENT_LEAD');
    return true;
  }

  if (isCancel) {
    await showMenu(ctx, lang, 'CLIENT_LEAD', t(lang, 'cancelled'));
    return true;
  }

  if (flowV2 && state === 'CL_MENU' && isCatalog) {
    const url = buildMiniAppUrl(ctx.bot, {});
    if (url) {
      await sendMessage(ctx, '📱 Каталог доступний у Mini App:', {
        inline_keyboard: [[{ text: 'Відкрити Mini App', web_app: { url } }]]
      });
    } else {
      await sendMessage(ctx, '⚠️ Mini App URL не налаштовано.');
    }
    return true;
  }

  if (flowV2 && state === 'CL_MENU' && isContacts) {
    const cfg = (ctx.bot.config as any)?.cardSettings || {};
    const manager1Phone = cfg.manager1Phone || '+380000000001';
    const manager1Name = cfg.manager1Name || 'Менеджер 1';
    const manager2Phone = cfg.manager2Phone || '+380000000002';
    const manager2Name = cfg.manager2Name || 'Менеджер 2';
    await sendMessage(ctx, [
      '☎️ Контакти:',
      `${manager1Phone} - ${manager1Name}`,
      `${manager2Phone} - ${manager2Name}`
    ].join('\n'));
    return true;
  }

  if (state === 'CL_MENU' && !isLeaveRequest && !isSupport && !isCatalog && !isContacts) {
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
      await sendMessage(ctx, `🆘 Support request from ${message?.from?.first_name || 'User'}: ${text}`, undefined, String(ctx.bot.adminChatId));
    }
    await showMenu(ctx, lang, 'CLIENT_LEAD');
    return true;
  }

  if (isLeaveRequest || state === 'CL_MENU') {
    if (isBack) {
      await showMenu(ctx, lang, 'CLIENT_LEAD');
      return true;
    }
    if (flowV2) {
      await updateSession(ctx, 'CL_INTENT', { ...vars, leadFlow: {} });
      await sendMessage(ctx, 'Що цікавить?', {
        keyboard: [
          [{ text: 'в наявності' }],
          [{ text: 'в дорозі' }],
          [{ text: 'підбір і пригін' }],
          [{ text: button(lang, 'common.cancel') }]
        ],
        resize_keyboard: true
      });
      return true;
    }

    await updateSession(ctx, 'CL_NAME', { ...vars, leadFlow: {} });
    await sendMessage(ctx, t(lang, 'askName'), { remove_keyboard: true });
    return true;
  }

  if (flowV2 && state === 'CL_INTENT') {
    if (isBack) {
      await showMenu(ctx, lang, 'CLIENT_LEAD');
      return true;
    }
    const interest = resolveLeadInterest(text);
    if (!interest) {
      await sendMessage(ctx, 'Оберіть один із варіантів: в наявності / в дорозі / підбір і пригін.');
      return true;
    }
    flow.interest = interest;
    await updateSession(ctx, 'CL_CAR', { ...vars, leadFlow: flow });
    await sendMessage(ctx, 'Яка марка/модель цікавить? (можна пропустити)');
    return true;
  }

  if (flowV2 && state === 'CL_CAR') {
    if (isBack) {
      await updateSession(ctx, 'CL_INTENT', { ...vars, leadFlow: flow });
      await sendMessage(ctx, 'Що цікавить?', {
        keyboard: [
          [{ text: 'в наявності' }],
          [{ text: 'в дорозі' }],
          [{ text: 'підбір і пригін' }]
        ],
        resize_keyboard: true
      });
      return true;
    }
    if (isCommand(text, ['skip', button(lang, 'common.skip')])) {
      flow.car = undefined;
    } else if (text.length < 2) {
      await sendMessage(ctx, t(lang, 'invalidCar'));
      return true;
    } else {
      flow.car = text;
    }
    await updateSession(ctx, 'CL_BUDGET', { ...vars, leadFlow: flow });
    await sendMessage(ctx, t(lang, 'askBudget'));
    return true;
  }

  if (flowV2 && state === 'CL_BUDGET') {
    if (isBack) {
      await updateSession(ctx, 'CL_CAR', { ...vars, leadFlow: flow });
      await sendMessage(ctx, 'Яка марка/модель цікавить? (можна пропустити)');
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

  if (flowV2 && state === 'CL_CITY') {
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
    await updateSession(ctx, 'CL_COMMENT', { ...vars, leadFlow: flow });
    await sendMessage(ctx, 'Додайте коментар або примітку (можна "skip").');
    return true;
  }

  if (flowV2 && state === 'CL_COMMENT') {
    if (isBack) {
      await updateSession(ctx, 'CL_CITY', { ...vars, leadFlow: flow });
      await sendMessage(ctx, t(lang, 'askCity'));
      return true;
    }
    flow.comment = isCommand(text, ['skip', button(lang, 'common.skip')]) ? undefined : text;
    await updateSession(ctx, 'CL_CONTACT', { ...vars, leadFlow: flow });
    await sendMessage(ctx, t(lang, 'askContact'), {
      keyboard: [[{ text: button(lang, 'common.contact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
      resize_keyboard: true
    });
    return true;
  }

  if (flowV2 && state === 'CL_CONTACT') {
    if (isBack) {
      await updateSession(ctx, 'CL_COMMENT', { ...vars, leadFlow: flow });
      await sendMessage(ctx, 'Додайте коментар або примітку (можна "skip").');
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
      `🔎 Цікавить: ${BOT_A_INTEREST_OPTIONS[flow.interest as string] || '—'}`,
      `🚗 Марка/модель: ${flow.car || '—'}`,
      flow.budget ? `💰 Бюджет: ${flow.budget}$` : '💰 Бюджет: —',
      `📍 Місто: ${flow.city || '—'}`,
      `📝 Коментар: ${flow.comment || '—'}`,
      `📞 Контакт: ${flow.phone}`
    ].join('\n');
    await sendConfirm(ctx, lang, `${t(lang, 'leadConfirm')}\n\n${summary}`, 'cl_lead_send', 'cl_lead_back');
    return true;
  }

  if (flowV2 && state === 'CL_CONFIRM') {
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
  const state = (ctx.session.state === 'START' ? 'B2B_MENU' : ctx.session.state) || 'B2B_MENU';
  const vars = (ctx.session.variables as any) || {};
  const flow = vars.b2bFlow || {};
  const whitelistEnforced = b2bWhitelistService.isEnforced();
  const tgUserId = ctx.userId || ctx.chatId || '';
  const identityName = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(' ').trim() || undefined;

  if (whitelistEnforced && tgUserId) {
    const participant = await b2bWhitelistService.resolveParticipant({
      tgUserId,
      username: message?.from?.username || null,
      fullName: identityName || null
    }, {
      companyId: ctx.companyId || null,
      botId: ctx.bot.id
    });

    if (!participant.allowed) {
      await sendMessage(ctx, '⛔️ доступ тільки для учасників', {
        inline_keyboard: [[{ text: 'Запросити доступ', callback_data: buildCallbackData('b2b_access_request') }]]
      });
      return true;
    }

    if (!vars.b2bPartnerId && participant.partnerCompany?.id) {
      vars.b2bPartnerId = participant.partnerCompany.id;
      vars.b2bPartnerName = participant.partnerCompany.name;
      await updateSession(ctx, state, vars);
    }
  }

  const isNewRequest = isCommand(text, [
    '/request',
    button(lang, 'b2b.request'),
    '📝 Створити запит',
    '📝 Новий запит',
    '📝 Создать запрос'
  ]);
  const isCancel = isCommand(text, ['cancel', 'stop', 'відміна', 'отмена', 'скасувати', button(lang, 'common.cancel')]);
  const isBack = isCommand(text, ['back', 'назад', '⬅️ back', '⬅️ назад', button(lang, 'common.back')]);
  const isMenu = isCommand(text, ['/start', '/menu', 'menu', 'reset']);
  const isSkip = isCommand(text, ['skip', 'пропустити', 'пропустить', button(lang, 'common.skip')]);

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
    if (whitelistEnforced && vars.b2bPartnerName) {
      flow.companyName = vars.b2bPartnerName;
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
    // Force Ukrainian-only surface.
    const sessionVars = (ctx.session.variables as any) || {};
    if (sessionVars.language !== 'UK' || sessionVars.lang !== 'UK') {
      await updateSession(ctx, ctx.session.state || 'DYN_MENU', { ...sessionVars, language: 'UK', lang: 'UK' });
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

  const handledScenario = await ScenarioEngine.handleUpdate(ctx.bot as any, ctx.session, ctx.update).catch((error) => {
    logger.error('[TelegramRoute] ScenarioEngine error', {
      botId: ctx.bot?.id,
      template: ctx.bot?.template,
      chatId: ctx.chatId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  });
  if (handledScenario) return true;

  const message = ctx.update?.message;
  const text = message?.text || '';
  const rateLimit = Math.max(1, getEnvInt('BOT_STEP_RATE_LIMIT_PER_MIN', 30));
  const quotaUserId = ctx.userId || ctx.chatId || '';
  if (quotaUserId) {
    const stepQuota = await quotaService.consume({
      companyId: ctx.companyId || null,
      botId: ctx.bot.id,
      tgUserId: quotaUserId,
      scope: 'bot.step.per_minute',
      limit: rateLimit,
      period: 'minute'
    });
    if (!stepQuota.allowed) {
      await sendMessage(ctx, '⏱ Забагато дій за хвилину. Спробуйте ще раз за 1 хвилину.');
      return true;
    }
  }

  // 2. Dynamic Menu Logic (Prioritized over legacy templates)
  const isDynamicHandled = await handleDynamicMenu(ctx, text);
  if (isDynamicHandled) return true;

  // 3. Legacy Templates (Fallback)
  if (ctx.bot.template === 'CLIENT_LEAD') return handleClientLead(ctx, text);
  if (ctx.bot.template === 'CATALOG') return handleCatalog(ctx, text);

  return false;
};

export const finalizeClientLead = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return;
  const lang = resolveLang(ctx);
  const vars = (ctx.session.variables as any) || {};
  const flow = vars.leadFlow || {};
  const flowV2 = getFlowVersion();
  const from = ctx.update?.message?.from;
  const telegramUsername = from?.username ? String(from.username) : undefined;
  const telegramName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || undefined;
  const leadName = flow.name || telegramName || (telegramUsername ? `@${telegramUsername}` : 'Client');
  const tgUserId = from?.id ? String(from.id) : (ctx.userId || ctx.chatId || 'unknown');

  if (flowV2) {
    const dailyLimit = Math.max(1, getEnvInt('BOT_A_DAILY_LEAD_LIMIT', 5));
    const quota = await quotaService.consume({
      companyId: ctx.companyId || null,
      botId: ctx.bot.id,
      tgUserId,
      scope: 'bot_a.lead.daily',
      limit: dailyLimit,
      period: 'day'
    });

    if (!quota.allowed) {
      await sendMessage(ctx, '⛔️ Ви перевищили ліміт заявок на добу. Спробуйте завтра.');
      await showMenu(ctx, lang, 'CLIENT_LEAD');
      return;
    }
  }

  const result = await createOrMergeLead({
    botId: ctx.bot.id,
    companyId: ctx.companyId,
    chatId: ctx.chatId,
    userId: ctx.userId,
    name: leadName,
    telegramUsername,
    telegramName,
    phone: flow.phone,
    request: flow.car || flow.intent || '',
    source: 'TELEGRAM',
    payload: {
      budget: flow.budget,
      city: flow.city,
      language: lang,
      interest: flow.interest,
      comment: flow.comment
    },
    leadType: 'BUY',
    createRequest: true,
    requestData: {
      title: flow.car || (flow.interest ? `Запит (${BOT_A_INTEREST_OPTIONS[flow.interest] || flow.interest})` : 'Request'),
      budgetMax: flow.budget || undefined,
      city: flow.city || undefined,
      description: [
        `Через бот. Користувач: ${leadName}`,
        flow.interest ? `Інтерес: ${BOT_A_INTEREST_OPTIONS[flow.interest] || flow.interest}` : null,
        flow.comment ? `Коментар: ${flow.comment}` : null
      ].filter(Boolean).join('\n'),
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
    if (flowV2) {
      const userLink = telegramUsername
        ? `https://t.me/${telegramUsername}`
        : `tg://user?id=${tgUserId}`;
      const summary = [
        '📥 Нова заявка Bot A',
        `🔎 Що цікавить: ${BOT_A_INTEREST_OPTIONS[flow.interest as string] || '—'}`,
        `🚗 Марка/модель: ${flow.car || '—'}`,
        `💰 Бюджет: ${flow.budget ? `${flow.budget}$` : '—'}`,
        `📍 Місто: ${flow.city || '—'}`,
        `📝 Коментар: ${flow.comment || '—'}`,
        `📞 Контакт: ${flow.phone || '—'}`,
        `👤 User: ${leadName}`,
        `🔗 Telegram: ${userLink}`,
        `🆔 Telegram ID: ${tgUserId}`,
        `🌐 Джерело: telegram_bot`,
        `🕒 Час: ${new Date().toISOString()}`
      ].join('\n');
      await sendMessage(ctx, summary, undefined, String(ctx.bot.adminChatId));
    } else {
      const leadCard = renderLeadCard({
        clientName: flow.name,
        phone: flow.phone,
        request: flow.car,
        payload: { city: flow.city, budget: flow.budget }
      });
      const reqCard = result.request ? renderRequestCard(result.request) : '';
      const header = result.isDuplicate ? '♻️ Дублікат заявки обʼєднано' : '🔥 Нова заявка';
      await sendMessage(ctx, `${header}\n\n${leadCard}${reqCard ? `\n\n${reqCard}` : ''}`, undefined, String(ctx.bot.adminChatId));
    }
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
      clientName: flow.name || 'Продавець',
      phone: flow.phone,
      request: flow.car,
      payload: { leadType: 'SELL' }
    });
    const header = result.isDuplicate ? '♻️ Дублікат заявки на продаж обʼєднано' : '💵 Нова заявка на продаж';
    await sendMessage(ctx, `${header}\n\n${leadCard}`, undefined, String(ctx.bot.adminChatId));
  }

  await showMenu(ctx, lang, 'CATALOG');
};

export const finalizeB2BRequest = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return;
  const lang = resolveLang(ctx);
  const vars = (ctx.session.variables as any) || {};
  const flow = vars.b2bFlow || {};
  const whitelistEnforced = b2bWhitelistService.isEnforced();
  const tgUserId = ctx.userId || ctx.chatId || '';
  const from = ctx.update?.message?.from;
  const fallbackName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim();

  let requesterPartnerId: string | undefined;
  let requesterCompanyName = flow.companyName || undefined;
  if (whitelistEnforced && tgUserId) {
    const participant = await b2bWhitelistService.resolveParticipant({
      tgUserId,
      username: from?.username || null,
      fullName: fallbackName || null
    }, {
      companyId: ctx.companyId || null,
      botId: ctx.bot.id
    });

    if (!participant.allowed || !participant.partnerCompany) {
      await sendMessage(ctx, '⛔️ доступ тільки для учасників', {
        inline_keyboard: [[{ text: 'Запросити доступ', callback_data: buildCallbackData('b2b_access_request') }]]
      });
      return;
    }
    requesterPartnerId = participant.partnerCompany.id;
    requesterCompanyName = participant.partnerCompany.name;
  }

  let publicId: string;
  try {
    publicId = await publicIdService.nextB2bRequestId('CD');
  } catch {
    publicId = generatePublicId();
  }

  const payload = {
    source: 'telegram_b2b',
    contact: flow.contact || undefined,
    companyName: requesterCompanyName || undefined,
    request: {
      mileageMin: flow.mileageMin ?? undefined,
      mileageMax: flow.mileageMax ?? undefined,
      mileageText: flow.mileageText ?? undefined,
      fuel: flow.fuel || undefined,
      comment: flow.description || undefined,
      contact: flow.contact || undefined,
      companyName: requesterCompanyName || undefined
    }
  };

  const mapped = mapRequestInput({
    title: flow.title || 'Запит',
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
      publicId,
      companyId: ctx.companyId || null,
      requesterPartnerId: requesterPartnerId || null
    }
  });

  await prisma.integrationEventLog.create({
    data: {
      companyId: ctx.companyId || null,
      integration: 'telegram',
      action: 'request.created',
      status: 'SUCCESS',
      entityType: 'b2b_request',
      entityId: request.id,
      idempotencyKey: `request.created:${request.id}`,
      message: 'B2B request created from telegram flow'
    }
  }).catch(() => null);

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
  const channelId = normalizeBotConfigChatId(ctx.bot.channelId);

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

      // Build structured message (without contacts)
      const channelMessage = formatB2bRequestChannelCard(request);

      // Send to channel with required CTA buttons
      const sent: any = await telegramOutbox.sendMessage({
        botId: ctx.bot.id,
        token: ctx.bot.token,
        chatId: String(channelId),
        text: channelMessage,
        replyMarkup: {
          inline_keyboard: [
            [{ text: 'Є авто', url: deeplink }],
            [{ text: 'Відкрити в боті', url: deeplink }]
          ]
        },
        companyId: ctx.companyId
      });

      // Create ChannelPost record for tracking
      if (sent?.message_id) {
        const channelPostUrl = buildTelegramChannelPostUrl({
          chatId: String(channelId),
          messageId: sent.message_id,
          username: botUsername
        }) || `https://t.me/${botUsername}/${sent.message_id}`;

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
              channelPostUrl,
              postedAt: new Date().toISOString()
            }
          }
        });

        await prisma.b2bRequest.update({
          where: { id: request.id },
          data: { channelPostUrl }
        }).catch(() => null);

        await prisma.integrationEventLog.create({
          data: {
            companyId: ctx.companyId || null,
            integration: 'telegram',
            action: 'request.channel_published',
            status: 'SUCCESS',
            entityType: 'b2b_request',
            entityId: request.id,
            idempotencyKey: `request.channel_published:${request.id}`,
            message: 'B2B request published to channel',
            meta: {
              channelId: String(channelId),
              messageId: sent.message_id,
              channelPostUrl
            }
          }
        }).catch(() => null);
      }
    } catch (err: any) {
      // Log error but don't block flow
      console.error('[finalizeB2BRequest] Channel post failed:', err.message);

      await prisma.integrationEventLog.create({
        data: {
          companyId: ctx.companyId || null,
          integration: 'telegram',
          action: 'request.channel_published',
          status: 'FAILED',
          entityType: 'b2b_request',
          entityId: request.id,
          idempotencyKey: `request.channel_published:${request.id}`,
          message: err?.message || 'Channel publish failed'
        }
      }).catch(() => null);

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

  // Notify partner queue + central queue (relay), with source-admin fallback.
  const managerChatId = (ctx.bot.config as any)?.b2bManagerChatId || ctx.bot.adminChatId;
  const requestCardPartner = renderRequestCard({
    ...request,
    payload: {
      ...(request.payload as any || {}),
      companyName: requesterCompanyName || flow.companyName
    }
  }, { includeContact: false });
  const requestCardAdmin = renderRequestCard({
    ...request,
    payload: {
      ...(request.payload as any || {}),
      companyName: requesterCompanyName || flow.companyName
    }
  }, { includeContact: true });
  const botUsername = (ctx.bot.config as any)?.botUsername || (ctx.bot.config as any)?.username;
  const link = botUsername ? generateRequestLink(botUsername, request.publicId || request.id) : '';
  const header = `📝 New B2B request ${request.publicId || request.id}`;
  const partnerMsg = link ? `${header}\n${requestCardPartner}\n\n🔗 ${link}` : `${header}\n${requestCardPartner}`;
  const adminMsg = link ? `${header}\n${requestCardAdmin}\n\n🔗 ${link}` : `${header}\n${requestCardAdmin}`;
  const adminReplyMarkup = link
    ? { inline_keyboard: [[{ text: 'Відкрити в CRM', url: link }]] }
    : undefined;

  await b2bRoutingService.notifyQueues({
    companyId: ctx.companyId || null,
    sourceBotId: ctx.bot.id,
    sourceBotToken: ctx.bot.token,
    sourceBotAdminChatId: managerChatId ? String(managerChatId) : null,
    requesterPartnerId: requesterPartnerId || null,
    text: partnerMsg,
    centralText: adminMsg,
    sourceAdminText: adminMsg,
    replyMarkup: adminReplyMarkup,
    includeSourceAdminFallback: true
  });

  await showMenu(ctx, lang, 'B2B');
};
