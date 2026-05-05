import { prisma } from '../../../../services/prisma.js';
import type { PipelineContext } from '../core/types.js';
import { ScenarioEngine } from '../../bots/scenario.engine.js';
import { telegramOutbox } from '../messaging/outbox/telegramOutbox.js';
import { normalizeBrand } from '../../../Inventory/normalization/normalizeBrand.js';
import { normalizeModel } from '../../../Inventory/normalization/normalizeModel.js';
import { normalizeCity } from '../../../Inventory/normalization/normalizeCity.js';
import { normalizePhone } from '../../../Inventory/normalization/normalizePhone.js';
import { createOrMergeLead } from '../core/leadService.js';
import { renderCarCardForBot } from '../../../../services/carCardRenderer.v2.js';
import { renderLeadCard, renderRequestCard } from '../../../../services/cardRenderer.js';
import { generateRequestLink } from '../../../../utils/deeplink.utils.js';
import { buildMiniAppUrl } from '../core/utils/miniappUrl.js';
import { generatePublicId, mapRequestInput } from '../../../../services/dto.js';
import { ActionTokens, buildCallbackData } from '../core/utils/callbackUtils.js';
import { button, isCommand, resolveLang, t, type Lang } from '../core/utils/telegramText.js';
import { publicIdService } from '../../../../services/publicId.service.js';
import { b2bWhitelistService } from '../../../../services/b2bWhitelist.service.js';
import { quotaService } from '../../../../services/quota.service.js';
import { requestContractService } from '../../../../services/requestContract.service.js';
import { getEnvInt, isEnvFlagEnabled } from '../../../../services/featureFlags.js';
import { logger } from '../../../../utils/logger.js';
import { buildTelegramChannelPostUrl, normalizeBotConfigChatId } from '../core/utils/telegramChatId.js';
import { buildTelegramPhotoMedia, collectCarMediaSources } from '../core/utils/carMedia.js';
import { resolveReplyMarkupForChat } from '../core/utils/telegramReplyMarkup.js';
import { DEFAULT_CLIENT_LEAD_MENU_BUTTONS, buildMenuButtonKeyboard } from '../core/utils/botMenuMapper.js';
import { b2bRoutingService } from '../../../../services/b2bRouting.service.js';
import { startLeadBuyWizard, handleLeadBuyText } from './wizards/leadBuyWizard.js';
import { startLeadSellWizard, handleLeadSellText } from './wizards/leadSellWizard.js';
import { startB2BSellWizard, handleB2BSellText } from './wizards/b2bSellWizard.js';


const shouldBypassScenarioEngine = (ctx: PipelineContext) => {
  const template = String(ctx.bot?.template || '').toUpperCase();
  return template === 'CLIENT_LEAD' || template === 'B2B';
};

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

const sendCarCardToChat = async (
  ctx: PipelineContext,
  car: any,
  options: {
    lang: Lang;
    targetChatId?: string;
    replyMarkup?: any;
  }
) => {
  if (!ctx.bot) return;
  const chatId = options.targetChatId || ctx.chatId;
  if (!chatId) return;

  const caption = await renderCarCardForBot({
    car,
    lang: options.lang,
    companyId: ctx.companyId || null,
    botId: ctx.bot.id
  });
  const media = collectCarMediaSources(car, 10);

  if (media.length > 1) {
    await telegramOutbox.sendMediaGroup({
      botId: ctx.bot.id,
      token: ctx.bot.token,
      chatId,
      media: buildTelegramPhotoMedia(media, caption),
      companyId: ctx.companyId,
      userId: ctx.userId || undefined
    });
    if (options.replyMarkup) {
      await sendMessage(ctx, '⬇️ Оберіть дію:', options.replyMarkup, chatId);
    }
    return;
  }

  if (media.length === 1) {
    await sendPhoto(ctx, media[0], caption, options.replyMarkup, chatId);
    return;
  }

  await sendMessage(ctx, caption, options.replyMarkup, chatId);
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

export const showMenu = async (ctx: PipelineContext, lang: Lang, template: string, notice?: string) => {
  if (!ctx.bot) return;
  const botName = ctx.bot?.name || 'CarTie';
  const baseVars = (ctx.session?.variables as any) || {};
  const currentChatId = String(
    ctx.chatId
    || ctx.update?.message?.chat?.id
    || ctx.update?.callback_query?.message?.chat?.id
    || ''
  ).trim();
  if (notice) await sendMessage(ctx, notice);

  const isPrivate = String(ctx.chatType) === 'private';

  if (template === 'CLIENT_LEAD') {
    if (!isPrivate) {
      const adminChatId = normalizeBotConfigChatId(ctx.bot.adminChatId);
      const isConfiguredAdminGroup = Boolean(adminChatId && String(adminChatId) === currentChatId);
      const rows: any[] = [[
        { text: 'ℹ️ Інструкція', callback_data: buildCallbackData('ad_help', 'lead') },
        { text: 'Налаштування', callback_data: buildCallbackData('ad_cfg', 'lead') }
      ]];
      if (isConfiguredAdminGroup) {
        rows.push([{ text: button(lang, 'admin.testPanel'), callback_data: buildCallbackData(ActionTokens.AD_TEST) }]);
      }
      await sendMessage(ctx, t(lang, 'admin.lead.help'), {
        inline_keyboard: rows
      });
      await updateSession(ctx, 'CL_MENU', {
        ...baseVars,
        leadFlow: {},
        leadBuyDraft: null,
        leadSellDraft: null,
        supportDraft: null,
        miniappPendingIntent: null,
        miniappInterestDraft: null,
        adminTestPanel: null
      });
      return;
    }

    const leadKeyboard = buildMenuButtonKeyboard(ctx.bot, DEFAULT_CLIENT_LEAD_MENU_BUTTONS);

    await sendMessage(ctx, t(lang, 'common.welcome_lead', { bot: botName }), {
      keyboard: leadKeyboard,
      resize_keyboard: true
    });
    await updateSession(ctx, 'CL_MENU', {
      ...baseVars,
      leadFlow: {},
      leadBuyDraft: null,
      leadSellDraft: null,
      supportDraft: null,
      miniappPendingIntent: null,
      miniappInterestDraft: null
    });
    return;
  }

  if (template === 'CATALOG') {
    if (!isPrivate) return;
    await sendMessage(ctx, t(lang, 'catalogMenu', { bot: botName }), {
      keyboard: [[{ text: button(lang, 'catalog.find') }, { text: button(lang, 'catalog.sell') }]],
      resize_keyboard: true
    });
    await updateSession(ctx, 'CAT_MENU', { ...baseVars, catalogFlow: {} });
    return;
  }

  if (template === 'B2B') {
    if (!isPrivate) {
      const adminChatId = normalizeBotConfigChatId(ctx.bot.adminChatId);
      const isConfiguredAdminGroup = Boolean(adminChatId && String(adminChatId) === currentChatId);
      const rows: any[] = [[
        { text: 'ℹ️ Інструкція', callback_data: buildCallbackData('ad_help', 'b2b') },
        { text: 'Налаштування', callback_data: buildCallbackData('ad_cfg', 'b2b') }
      ]];
      if (isConfiguredAdminGroup) {
        rows.push([{ text: button(lang, 'admin.testPanel'), callback_data: buildCallbackData(ActionTokens.AD_TEST) }]);
      }
      await sendMessage(ctx, t(lang, 'admin.b2b.help'), {
        inline_keyboard: rows
      });
      await updateSession(ctx, 'B2B_MENU', { ...baseVars, b2bFlow: {}, adminTestPanel: null });
      return;
    }

    const tgUserId = String(ctx.userId || ctx.chatId || '').trim();
    const identityName = [
      ctx.update?.message?.from?.first_name,
      ctx.update?.message?.from?.last_name
    ].filter(Boolean).join(' ').trim() || null;

    let partnerId = String(baseVars.b2bPartnerId || '').trim();
    let partnerName = String(baseVars.b2bPartnerName || '').trim();

    if (!partnerId && tgUserId) {
      const partnerUser = await prisma.partnerUser.findFirst({
        where: {
          telegramId: tgUserId,
          ...(ctx.companyId ? { companyId: ctx.companyId } : {})
        },
        include: { partner: true }
      });
      if (partnerUser?.partnerId) {
        partnerId = String(partnerUser.partnerId);
        partnerName = String(partnerUser.partner?.name || '').trim() || partnerName;
      }
    }

    if (!partnerId && tgUserId && b2bWhitelistService.isEnforced()) {
      const participant = await b2bWhitelistService.resolveParticipant({
        tgUserId,
        username: ctx.update?.message?.from?.username || null,
        fullName: identityName
      }, {
        companyId: ctx.companyId || null,
        botId: ctx.bot.id
      }).catch(() => null);

      if (participant?.allowed && participant.partnerCompany?.id) {
        partnerId = String(participant.partnerCompany.id);
        partnerName = String(participant.partnerCompany.name || '').trim() || partnerName;
      }
    }

    const isUnregistered = !partnerId;
    const enrichedVars = {
      ...baseVars,
      b2bUnregistered: isUnregistered,
      ...(partnerId ? { b2bPartnerId: partnerId, b2bPartnerName: partnerName || baseVars.b2bPartnerName } : {}),
      b2bRequestDraft: null,
      b2bVariantDraft: null,
      b2bSellDraft: null,
      b2bRegDraft: null,
      b2bReqFlow: null
    };

    if (isUnregistered) {
      await sendMessage(ctx, t(lang, 'common.welcome_b2b_unregistered'), {
        inline_keyboard: [
          [{ text: button(lang, 'b2b.regNewPartner'), callback_data: buildCallbackData('br_new') },
          { text: button(lang, 'b2b.regAgent'), callback_data: buildCallbackData('br_agent') }],
          [{ text: button(lang, 'common.rules'), callback_data: buildCallbackData('cl_rules') },
          { text: button(lang, 'common.info'), callback_data: buildCallbackData('cl_info_b2b') }],
          [{ text: button(lang, 'common.privacy'), callback_data: buildCallbackData('cl_privacy') }]
        ]
      });
      await updateSession(ctx, 'B2B_UNREG', enrichedVars);
      return;
    }

    // Registered B2B menu: request / sell / inventory / info.
    await sendMessage(ctx, t(lang, 'common.welcome_b2b_registered', { bot: botName }), {
      keyboard: [
        [{ text: button(lang, 'b2bMenu.newRequest') }, { text: button(lang, 'b2bMenu.sell') }],
        [{ text: button(lang, 'b2bMenu.myInventory') }, { text: button(lang, 'common.info') }]
      ],
      resize_keyboard: true
    });
    await updateSession(ctx, 'B2B_MENU', { ...enrichedVars, b2bFlow: {} });
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

const sanitizeChannelField = (value: unknown, maxLen = 220) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const sanitized = raw
    .replace(/(?:\+?\d[\d\s()\-]{6,}\d)/g, '[hidden]')
    .replace(/@[a-zA-Z0-9_]{3,}/g, '@hidden')
    .replace(/(?:https?:\/\/)?(?:t\.me|wa\.me)\/\S+/gi, '[hidden-link]')
    .replace(/\b(?:telegram|телеграм|viber|вайбер|whatsapp|ватсап)\b/gi, '[hidden]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized) return '';
  return sanitized.length > maxLen ? `${sanitized.slice(0, maxLen)}…` : sanitized;
};

const formatB2bRequestChannelCard = (request: any) => {
  const payload = (request?.payload || {}) as Record<string, any>;
  const reqPayload = (payload.request || {}) as Record<string, any>;
  const requesterCompany = sanitizeChannelField(reqPayload.companyName || payload.companyName || 'Компанія не вказана', 80) || 'Компанія не вказана';
  const yearLine = request.yearMin
    ? `${request.yearMin}${request.yearMax ? `-${request.yearMax}` : ''}`
    : '—';
  const budgetLine = request.budgetMin || request.budgetMax
    ? `${request.budgetMin || 0}-${request.budgetMax || '∞'} USD`
    : '—';
  const mileageLine = sanitizeChannelField(reqPayload.mileageText || reqPayload.mileageMax || reqPayload.mileageMin || '—', 80) || '—';
  const fuelLine = sanitizeChannelField(reqPayload.fuel || '—', 60) || '—';
  const noteLine = sanitizeChannelField(request.description || reqPayload.comment || '—', 200) || '—';

  return [
    `🔵 <b>Запит #${request.publicId || request.id}</b>`,
    `🚗 ${sanitizeChannelField(request.title || '—', 100) || '—'}`,
    `📅 Рік: ${yearLine}`,
    `💰 Бюджет: ${budgetLine}`,
    `🛣 Пробіг: ${mileageLine}`,
    `⛽ Паливо: ${fuelLine}`,
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
  const flowV2 = getFlowVersion();

  const isLeaveRequest = isCommand(text, ['/buy', button(lang, 'leadMenu.buy'), 'Купити авто']);
  const isSellRequest = isCommand(text, ['/sell', button(lang, 'leadMenu.sell'), 'Продати авто']);
  const isSupport = isCommand(text, [button(lang, 'leadMenu.support'), 'Підтримка']);
  const isInfo = isCommand(text, [button(lang, 'common.info')]);
  const isCatalog = isCommand(text, [button(lang, 'common.openMiniApp'), 'Каталог авто']);
  const isStockCatalog = isCommand(text, [button(lang, 'leadMenu.stock'), 'Авто в наявності']);
  const isTransitCatalog = isCommand(text, [button(lang, 'leadMenu.transit'), 'Авто в дорозі']);
  const isContacts = isCommand(text, ['Контакти']);
  const isCancel = isCommand(text, ['cancel', 'stop', 'відміна', 'отмена', button(lang, 'common.cancel')]);
  const isBack = isCommand(text, ['back', 'назад', '⬅️ back', '⬅️ назад', button(lang, 'common.back')]);
  const isMenu = isCommand(text, ['/start', '/menu', 'menu', 'reset']);
  const isTopLevelIntent = isLeaveRequest || isSellRequest || isSupport || isInfo || isCatalog || isStockCatalog || isTransitCatalog || isContacts || isCancel || isMenu;

  if (state !== 'CL_MENU' && isSessionTimedOut(ctx.session.lastActive as Date | undefined)) {
    // If user pressed a top-level intent, silently reset stale wizard and execute the intent.
    if (!isTopLevelIntent) {
      await showMenu(ctx, lang, 'CLIENT_LEAD', '⌛️ Сесія завершена через неактивність. Почнімо спочатку.');
      return true;
    }

    await updateSession(ctx, 'CL_MENU', {
      ...vars,
      leadFlow: {},
      leadBuyDraft: null,
      leadSellDraft: null,
      supportDraft: null,
      miniappPendingIntent: null,
      miniappInterestDraft: null
    });
  }

  if (text.startsWith('/start ')) {
    const startPayload = text.split(' ')[1]?.trim().toLowerCase();
    if (startPayload === 'sell') {
      await startLeadSellWizard(ctx);
      return true;
    }
    if (startPayload === 'stock' || startPayload === 'available' || startPayload === 'catalog') {
      const url = buildMiniAppUrl(ctx.bot, { entry: 'inventory', status: 'AVAILABLE' });
      if (url) {
        await sendMessage(ctx, '🚘 Відкрийте каталог авто:', {
          inline_keyboard: [[{ text: button(lang, 'common.openMiniApp'), web_app: { url } }]]
        });
        return true;
      }
    }
    if (startPayload === 'transit' || startPayload === 'pending') {
      const url = buildMiniAppUrl(ctx.bot, { entry: 'inventory', status: 'PENDING' });
      if (url) {
        await sendMessage(ctx, '🚚 Відкрийте авто в дорозі:', {
          inline_keyboard: [[{ text: button(lang, 'common.openMiniApp'), web_app: { url } }]]
        });
        return true;
      }
    }
  }

  if (isMenu) {
    await showMenu(ctx, lang, 'CLIENT_LEAD');
    return true;
  }

  if (isCancel) {
    await showMenu(ctx, lang, 'CLIENT_LEAD', t(lang, 'cancelled'));
    return true;
  }

  const isPrivateChat = String(ctx.chatType || '') === 'private';
  if (!isPrivateChat) {
    const hasLeadFlowState = state.startsWith('LB_')
      || state.startsWith('LS_')
      || state.startsWith('CL_SUPPORT');
    if (isLeaveRequest || isSellRequest || isSupport || isInfo || isCatalog || isContacts || hasLeadFlowState) {
      await showMenu(
        ctx,
        lang,
        'CLIENT_LEAD',
        hasLeadFlowState ? '⚠️ Користувацькі сценарії доступні лише у приватному чаті з ботом.' : undefined
      );
      return true;
    }
    return false;
  }

  // Do not consume top-level menu commands as wizard field values.
  if (!isTopLevelIntent) {
    if (state.startsWith('LB_')) {
      if (await handleLeadBuyText(ctx, text)) return true;
    }
    if (state.startsWith('LS_')) {
      if (await handleLeadSellText(ctx, text)) return true;
    }
  }

  if (isInfo) {
    await sendMessage(ctx, t(lang, 'common.info_lead'));
    return true;
  }

  if (state === 'CL_MENU' && (isCatalog || isStockCatalog || isTransitCatalog)) {
    const url = buildMiniAppUrl(ctx.bot, {
      entry: 'inventory',
      status: isTransitCatalog ? 'PENDING' : 'AVAILABLE'
    });
    if (url) {
      await sendMessage(ctx, isTransitCatalog ? '🚚 Авто в дорозі доступні в Mini App:' : '🚘 Каталог авто доступний у Mini App:', {
        inline_keyboard: [[{ text: button(lang, 'common.openMiniApp'), web_app: { url } }]]
      });
    } else {
      await sendMessage(ctx, '⚠️ URL MiniApp не налаштовано.');
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

  if (state === 'CL_MENU' && !isLeaveRequest && !isSellRequest && !isSupport && !isCatalog && !isStockCatalog && !isTransitCatalog && !isContacts && !isInfo) {
    await showMenu(ctx, lang, 'CLIENT_LEAD', t(lang, 'fallback'));
    return true;
  }

  if (state === 'CL_MINIAPP_CONTACT') {
    if (isBack || isCancel || isMenu) {
      await showMenu(ctx, lang, 'CLIENT_LEAD', isCancel ? t(lang, 'cancelled') : undefined);
      return true;
    }
    const phoneRaw = message?.contact?.phone_number || text;
    const phone = normalizePhone(phoneRaw || undefined);
    if (!phone) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_phone'));
      return true;
    }
    const from = message?.from;
    const telegramUsername = from?.username ? String(from.username) : undefined;
    const telegramName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || undefined;
    const displayName = telegramName || (telegramUsername ? `@${telegramUsername}` : 'Клієнт');
    const tgUserId = from?.id ? String(from.id) : (ctx.userId || ctx.chatId || 'unknown');
    const companyId = ctx.companyId || ctx.bot.companyId;
    if (!companyId) {
      await sendMessage(ctx, '⚠️ Не вдалося визначити компанію для звернення.');
      return true;
    }

    const finalized = await requestContractService.finalizePendingLeadIntent({
      botId: ctx.bot.id,
      companyId,
      telegramUserId: tgUserId,
      phone,
      displayName,
      telegramUsername,
      telegramName
    });

    const requestPublicId = finalized.request?.publicId || finalized.request?.id;
    await sendMessage(
      ctx,
      finalized.isDuplicate
        ? `✅ Інтерес зафіксовано. ${requestPublicId ? `Запит ${requestPublicId} оновлено.` : 'Менеджер вже бачить ваше звернення.'}`
        : `✅ Дякуємо! ${requestPublicId ? `Запит ${requestPublicId} отримано.` : 'Запит отримано.'} Менеджер звʼяжеться з вами найближчим часом.`,
      { remove_keyboard: true }
    );

    if (ctx.bot.adminChatId) {
      const userLink = telegramUsername
        ? `https://t.me/${telegramUsername.replace(/^@/, '')}`
        : `tg://user?id=${tgUserId}`;
      const selectedCarsText = finalized.selectedCars.length
        ? finalized.selectedCars.map((car, index) => `${index + 1}. ${car.title}${car.year ? ` ${car.year}` : ''}`).join('\n')
        : '—';
      const adminLines = [
        '🟢 [LEAD BUY] MiniApp інтерес',
        `👤 ${displayName}`,
        `username: ${telegramUsername ? `@${telegramUsername.replace(/^@/, '')}` : '—'}`,
        `tgUserId: ${tgUserId}`,
        `🔗 ${userLink}`,
        `Контакт: ${phone}`,
        `Тип: ${finalized.intentType === 'REQUEST' ? 'Підбір авто' : 'Інтерес до авто'}`,
        `Авто: ${finalized.title}`,
        `Обрані авто:\n${selectedCarsText}`,
        finalized.request ? `Request ID: ${finalized.request.publicId || finalized.request.id}` : null
      ].filter(Boolean);
      await sendMessage(ctx, adminLines.join('\n'), undefined, String(ctx.bot.adminChatId));
    }

    await showMenu(ctx, lang, 'CLIENT_LEAD');
    return true;
  }

    if (isSupport || state === 'CL_SUPPORT' || state === 'CL_SUPPORT_WAIT' || state === 'CL_SUPPORT_TEXT' || state === 'CL_SUPPORT_CONTACT' || state === 'CL_SUPPORT_REVIEW') {
    if (!['CL_SUPPORT', 'CL_SUPPORT_WAIT', 'CL_SUPPORT_TEXT', 'CL_SUPPORT_CONTACT', 'CL_SUPPORT_REVIEW'].includes(state)) {
      const tgUserId = String(ctx.userId || message?.from?.id);
      const existing = await prisma.supportTicket.findFirst({
        where: { tgUserId, status: 'OPEN', botId: ctx.bot.id }
      });
      if (existing) {
        // §6.4 — if open ticket exists, offer Supplement / New inline actions
        await sendMessage(ctx, t(lang, 'support.has_open'), {
          inline_keyboard: [[
            { text: button(lang, 'common.supplement'), callback_data: buildCallbackData('sup_add') },
            { text: button(lang, 'common.newTicket'), callback_data: buildCallbackData('sup_new') }
          ]]
        });
        await updateSession(ctx, 'CL_SUPPORT_WAIT', vars);
        return true;
      }
      await updateSession(ctx, 'CL_SUPPORT_TEXT', { ...vars, supportDraft: { mode: 'new' } });
      await sendMessage(ctx, t(lang, 'support.ask_text'), { remove_keyboard: true });
      return true;
    }

    if (state === 'CL_SUPPORT_WAIT') {
      // waiting for inline button — ignore plain text
      return true;
    }

    const supportDraft = (vars.supportDraft || {}) as Record<string, any>;

      if (state === 'CL_SUPPORT_TEXT') {
      if (isCancel || isBack || isMenu) {
        await showMenu(ctx, lang, 'CLIENT_LEAD');
        return true;
      }
      const supportText = String(text || '').trim();
      if (supportText.length < 4) {
        await sendMessage(ctx, t(lang, 'support.ask_text'));
        return true;
      }
      await updateSession(ctx, 'CL_SUPPORT_CONTACT', { ...vars, supportDraft: { ...supportDraft, text: supportText } });
      if (String(ctx.chatType || '') === 'private') {
        await sendMessage(ctx, t(lang, 'support.ask_contact'), {
          keyboard: [[{ text: button(lang, 'common.shareContact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
          resize_keyboard: true,
          one_time_keyboard: true
        });
      } else {
        await sendMessage(ctx, `${t(lang, 'support.ask_contact')}\n\nВведіть номер вручну:`, {
          inline_keyboard: [[{ text: button(lang, 'common.back'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]]
        });
      }
      return true;
    }

    if (state === 'CL_SUPPORT_CONTACT') {
      if (isBack) {
        await updateSession(ctx, 'CL_SUPPORT_TEXT', vars);
        await sendMessage(ctx, t(lang, 'support.ask_text'), { remove_keyboard: true });
        return true;
      }

      const contactRaw = message?.contact?.phone_number || text;
      const contact = normalizePhone(contactRaw || undefined);
      if (!contact) {
        await sendMessage(ctx, t(lang, 'common.err.invalid_phone'));
        return true;
      }

      const nextDraft: Record<string, any> = { ...(supportDraft as Record<string, any>), contact };
      const summary = [
        `Текст: ${String(nextDraft.text || '—')}`,
        `Контакт: ${String(nextDraft.contact || '—')}`,
        'Все вірно?'
      ].join('\n');

      await updateSession(ctx, 'CL_SUPPORT_REVIEW', { ...vars, supportDraft: nextDraft });
      await sendMessage(ctx, `✅ <b>Перевірте звернення</b>\n\n${summary}`, {
        inline_keyboard: [
          [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData('sup_submit') }],
          [{ text: '✏️ Змінити текст', callback_data: buildCallbackData('sup_etxt') }],
          [{ text: '✏️ Змінити контакт', callback_data: buildCallbackData('sup_econt') }],
          [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
        ]
      });
      return true;
    }

    if (state === 'CL_SUPPORT_REVIEW') {
      // Waiting for inline confirmation/edit callbacks.
      return true;
    }

    if (isCancel || isBack || isMenu) {
      await showMenu(ctx, lang, 'CLIENT_LEAD');
      return true;
    }

    const tgUserId = String(ctx.userId || message?.from?.id);
    const ticket = await prisma.supportTicket.findFirst({
      where: { tgUserId, status: 'OPEN', botId: ctx.bot.id }
    });

    const threadItem = { text, date: new Date().toISOString(), from: 'user' };

    if (ticket) {
      const thread = Array.isArray(ticket.thread) ? ticket.thread : [];
      thread.push(threadItem);
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { thread: thread as any }
      });
    } else {
      await prisma.supportTicket.create({
        data: {
          tgUserId,
          botId: ctx.bot.id,
          companyId: ctx.companyId,
          chatId: String(ctx.chatId),
          text: text,
          thread: [threadItem] as any,
          status: 'OPEN'
        }
      });
    }

    // §6.4 — correct UK text key + prefix §4
    await sendMessage(ctx, t(lang, 'support.received'));
    if (ctx.bot?.adminChatId) {
      const userName = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(' ') || 'User';
      const userLink = message?.from?.username ? ` (@${message.from.username})` : '';
      const tgIdLink = message?.from?.username ? '' : `\n🔗 tg://user?id=${tgUserId}`;
      const legacyContact = normalizePhone((supportDraft as any)?.contact || message?.contact?.phone_number || undefined);
      const contactLine = `📞 Контакт: ${legacyContact || '—'}`;
      await sendMessage(ctx,
        `🆘 [SUPPORT]\n👤 ${userName}${userLink}\ntgId: ${tgUserId}${tgIdLink}\n${contactLine}\n\n${text}`,
        undefined,
        String(ctx.bot.adminChatId)
      );
    }
    await showMenu(ctx, lang, 'CLIENT_LEAD');
    return true;
  }

  if (isLeaveRequest) {
    await startLeadBuyWizard(ctx);
    return true;
  }

  if (isSellRequest) {
    await startLeadSellWizard(ctx);
    return true;
  }

  // Fallback
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
        await sendCarCardToChat(ctx, car, { lang });
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

export type B2BInventoryMode = 'manage' | 'publish';

const resolveB2BInventoryMode = (value: unknown): B2BInventoryMode =>
  String(value || '').trim().toLowerCase() === 'publish' ? 'publish' : 'manage';

const buildB2BInventoryControls = (mode: B2BInventoryMode, idx: number) => {
  const rows: any[][] = [];
  if (mode === 'publish') {
    rows.push([{ text: '📣 Опублікувати', callback_data: buildCallbackData('b2b_pub', String(idx)) }]);
  }
  rows.push([
    { text: '💵 Змінити ціну', callback_data: buildCallbackData('b2b_ip', String(idx)) },
    { text: '✅ Продано', callback_data: buildCallbackData('b2b_is', String(idx)) }
  ]);
  rows.push([
    { text: '✏️ Змінити деталі', callback_data: buildCallbackData(ActionTokens.B2B_INV_EDIT, String(idx)) },
    { text: '🗑 Видалити', callback_data: buildCallbackData(ActionTokens.B2B_INV_DELETE, String(idx)) }
  ]);
  return { inline_keyboard: rows };
};

const showB2BInventoryByIds = async (
  ctx: PipelineContext,
  input: { carIds: string[]; page: number; pageSize: number; mode: B2BInventoryMode }
) => {
  if (!ctx.session) return true;
  const vars = (ctx.session.variables as any) || {};
  const lang = resolveLang(ctx);
  const ids = Array.isArray(input.carIds) ? input.carIds : [];

  if (!ids.length) {
    await sendMessage(ctx, '🚙 У вашому інвентарі ще немає авто.');
    return true;
  }

  const pageSize = Math.max(1, Number(input.pageSize || 3));
  const totalPages = Math.max(1, Math.ceil(ids.length / pageSize));
  const safePage = Math.max(0, Math.min(Number(input.page || 0), totalPages - 1));
  const pageIds = ids.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const cars = await prisma.carListing.findMany({ where: { id: { in: pageIds } } });
  const byId = new Map(cars.map((car) => [car.id, car]));

  for (let idx = 0; idx < pageIds.length; idx += 1) {
    const id = pageIds[idx];
    const car = byId.get(id);
    if (!car) continue;
    await sendCarCardToChat(ctx, car, { lang });
    await sendMessage(ctx, 'Керування авто:', buildB2BInventoryControls(input.mode, idx));
  }

  await updateSession(ctx, 'B2B_MENU', {
    ...vars,
    b2bInventoryView: {
      carIds: ids,
      pageIds,
      page: safePage,
      pageSize,
      mode: input.mode
    }
  });

  const modeLine = input.mode === 'publish'
    ? 'Режим продажу: оберіть авто для публікації.'
    : 'Керування інвентарем.';
  await sendMessage(ctx, `${modeLine}\nСторінка ${safePage + 1}/${totalPages}`, {
    inline_keyboard: [[
      { text: '⬅️ Назад', callback_data: buildCallbackData('b2b_inv_prev') },
      { text: 'Показати ще', callback_data: buildCallbackData('b2b_inv_next') }
    ]]
  });

  return true;
};

export const openB2BInventory = async (ctx: PipelineContext, mode: B2BInventoryMode = 'manage') => {
  if (!ctx.session) return true;
  const vars = (ctx.session.variables as any) || {};
  const partnerId = String(vars.b2bPartnerId || '').trim();
  if (!partnerId) {
    await sendMessage(ctx, '⛔️ Потрібна реєстрація партнера.');
    return true;
  }

  const cars = await prisma.carListing.findMany({
    where: {
      companyId: ctx.companyId || undefined,
      partnerCompanyId: partnerId,
      status: { not: 'HIDDEN' }
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 60
  });

  return showB2BInventoryByIds(ctx, {
    carIds: cars.map((car) => car.id),
    page: 0,
    pageSize: 3,
    mode
  });
};

export const paginateB2BInventory = async (ctx: PipelineContext, direction: 'prev' | 'next') => {
  if (!ctx.session) return true;
  const vars = (ctx.session.variables as any) || {};
  const view = (vars.b2bInventoryView || {}) as { carIds?: string[]; page?: number; pageSize?: number; mode?: string };
  const ids = Array.isArray(view.carIds) ? view.carIds : [];
  if (!ids.length) {
    await sendMessage(ctx, '🚙 Інвентар порожній.');
    return true;
  }

  const pageSize = Math.max(1, Number(view.pageSize || 3));
  const totalPages = Math.max(1, Math.ceil(ids.length / pageSize));
  let page = Math.max(0, Number(view.page || 0));
  page = direction === 'next' ? page + 1 : page - 1;
  if (page < 0) page = totalPages - 1;
  if (page >= totalPages) page = 0;

  return showB2BInventoryByIds(ctx, {
    carIds: ids,
    page,
    pageSize,
    mode: resolveB2BInventoryMode(view.mode)
  });
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

  const isNewRequest = isCommand(text, [
    '/request',
    '📝 Створити запит',
    button(lang, 'b2bMenu.newRequest')
  ]);
  const isMyInventory = isCommand(text, [
    '/inventory',
    '🚙 Мій інвентар',
    button(lang, 'b2bMenu.myInventory')
  ]);
  const isSellCar = isCommand(text, [
    '/sell',
    '💰 Продати авто',
    button(lang, 'b2bMenu.sell')
  ]);
  const isRules = isCommand(text, [button(lang, 'common.rules')]);
  const isInfo = isCommand(text, [button(lang, 'common.info')]);
  const isCancel = isCommand(text, ['cancel', 'stop', 'відміна', 'отмена', 'скасувати', button(lang, 'common.cancel')]);
  const isBack = isCommand(text, ['back', 'назад', '⬅️ back', '⬅️ назад', button(lang, 'common.back')]);
  const isMenu = isCommand(text, ['/start', '/menu', 'menu', 'reset']);
  const isTopLevelIntent = isMenu || isCancel || isRules || isInfo || isNewRequest || isMyInventory || isSellCar;

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
      await showMenu(ctx, lang, 'B2B');
      return true;
    }

    if (!vars.b2bPartnerId && participant.partnerCompany?.id) {
      vars.b2bPartnerId = participant.partnerCompany.id;
      vars.b2bPartnerName = participant.partnerCompany.name;
      await updateSession(ctx, state, vars);
    }
  }

  if (text.startsWith('/start ')) {
    const startPayload = text.split(' ')[1]?.trim();
    if (startPayload && startPayload.startsWith('b2bv_')) {
      const publicId = startPayload.replace('b2bv_', '');
      const { startB2BVariantWizard } = await import('./wizards/b2bVariantWizard.js');
      await startB2BVariantWizard(ctx, publicId);
      return true;
    }

    if (startPayload && startPayload.startsWith('CDL-') && whitelistEnforced) {
      const inviteCode = startPayload;
      const company = await prisma.partnerCompany.findUnique({ where: { inviteCode } });
      if (company) {
        const result = await b2bWhitelistService.ensureAccess({
          tgUserId,
          username: message?.from?.username || null,
          fullName: identityName || null
        }, {
          companyId: ctx.companyId || null,
          botId: ctx.bot.id
        }, `telegram_start_invite;inviteCode=${inviteCode}`);

        if (result.allowed) {
          await sendMessage(ctx, '✅ Ви вже є учасником мережі.');
        } else {
          await sendMessage(ctx, `✅ Запит на приєднання до ${company.name} надіслано адміністратору.`);

          const accessRequestId = result.accessRequest?.id || '';
	          if (accessRequestId) {
	            await b2bRoutingService.notifyQueues({
              companyId: ctx.companyId || null,
              sourceBotId: ctx.bot.id,
              sourceBotToken: ctx.bot.token,
              sourceBotAdminChatId: ctx.bot.adminChatId || null,
	              text: `🔐 Новий запит по інвайту ${inviteCode}\nКомпанія: ${company.name}\nКористувач: ${identityName || '—'}\nusername: ${message?.from?.username ? `@${message.from.username}` : '—'}`,
	              replyMarkup: {
	                inline_keyboard: [[
	                  { text: '✅ Підтвердити', callback_data: buildCallbackData('ba_ap', accessRequestId) },
	                  { text: '❌ Відхилити', callback_data: buildCallbackData('ba_rj', accessRequestId) }
	                ]]
	              },
	              includeSourceAdminFallback: true
            });
          }
        }
        return true;
      }
    }
  }

  if (isMenu) {
    await showMenu(ctx, lang, 'B2B');
    return true;
  }

  if (isCancel) {
    await showMenu(ctx, lang, 'B2B', t(lang, 'cancelled'));
    return true;
  }

  if (isRules) {
    await sendMessage(ctx, t(lang, 'common.rules_b2b'));
    return true;
  }

  if (isInfo) {
    await sendMessage(ctx, t(lang, 'common.info_b2b'));
    return true;
  }

  const partnerId = String(vars.b2bPartnerId || '').trim();
  const isUnregisteredSession = state === 'B2B_UNREG' || !partnerId;
  if (isUnregisteredSession && (isNewRequest || isMyInventory || isSellCar)) {
    await showMenu(ctx, lang, 'B2B', '🔒 Спочатку завершіть реєстрацію для доступу до сценаріїв.');
    return true;
  }

  if (isSellCar) {
    await sendMessage(ctx, t(lang, 'b2b.sell.choose'), {
      inline_keyboard: [
        [{ text: button(lang, 'b2b.sellFromInventory'), callback_data: buildCallbackData('bs_frominv') }],
        [{ text: button(lang, 'b2b.sellByForm'), callback_data: buildCallbackData('bs_form') }],
        [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
      ]
    });
    return true;
  }

  // Do not consume top-level intents as wizard field values.
  if (!isTopLevelIntent) {
    if (state.startsWith('B2B_REG_') || state.startsWith('BR_P_') || state.startsWith('BR_A_')) {
      const { handleB2BRegText } = await import('./wizards/b2bRegistrationWizard.js');
      if (await handleB2BRegText(ctx, text)) return true;
    }
    if (state.startsWith('BQ_')) {
      const { handleB2BReqText } = await import('./wizards/b2bRequestWizard.js');
      if (await handleB2BReqText(ctx, text)) return true;
    }
    if (state.startsWith('BV_')) {
      const { handleB2BVariantText } = await import('./wizards/b2bVariantWizard.js');
      if (await handleB2BVariantText(ctx, text)) return true;
    }
    if (state.startsWith('BS_')) {
      if (await handleB2BSellText(ctx, text)) return true;
    }
  }

  if (state === 'B2B_INV_PRICE') {
    const carId = String(vars.b2bInvPriceCarId || '').trim();
    if (!carId) {
      await updateSession(ctx, 'B2B_MENU', { ...vars, b2bInvPriceCarId: null });
      await showMenu(ctx, lang, 'B2B');
      return true;
    }

    if (isCancel || isBack || isMenu) {
      await updateSession(ctx, 'B2B_MENU', { ...vars, b2bInvPriceCarId: null });
      await showMenu(ctx, lang, 'B2B', t(lang, 'cancelled'));
      return true;
    }

    const numeric = Number(String(text || '').replace(/[^\d]/g, ''));
    if (!Number.isFinite(numeric) || numeric < 100 || numeric > 300000) {
      await sendMessage(ctx, '⚠️ Вкажіть коректну ціну (USD), наприклад: 20000.');
      return true;
    }

    const updated = await prisma.carListing.updateMany({
      where: {
        id: carId,
        ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
        ...(vars.b2bPartnerId ? { partnerCompanyId: String(vars.b2bPartnerId) } : {})
      },
      data: {
        price: Math.round(numeric)
      }
    });
    if (!updated.count) {
      await sendMessage(ctx, '⚠️ Не вдалося оновити ціну для цього авто.');
      await updateSession(ctx, 'B2B_MENU', { ...vars, b2bInvPriceCarId: null });
      return true;
    }

    await updateSession(ctx, 'B2B_MENU', { ...vars, b2bInvPriceCarId: null });
    await sendMessage(ctx, `✅ Ціну оновлено: ${Math.round(numeric)} USD.`);
    return true;
  }

  if (isMyInventory) {
    await openB2BInventory(ctx, 'manage');
    return true;
  }

  if (state === 'B2B_MENU' && !isNewRequest && !isMyInventory && !isRules && !isInfo && !isSellCar) {
    await showMenu(ctx, lang, 'B2B', t(lang, 'fallback'));
    return true;
  }

  if (state === 'B2B_UNREG' && !isNewRequest && !isMyInventory && !isRules && !isInfo && !isSellCar) {
    await showMenu(ctx, lang, 'B2B', t(lang, 'fallback'));
    return true;
  }

  if (isNewRequest) {
    const { startB2BRequestWizard } = await import('./wizards/b2bRequestWizard.js');
    await startB2BRequestWizard(ctx);
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

  if (!shouldBypassScenarioEngine(ctx)) {
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
  }

  const message = ctx.update?.message;
  const text = message?.text || '';
  const perMinuteLimit = Math.max(1, getEnvInt('BOT_STEP_RATE_LIMIT_PER_MIN', 12));
  const quotaUserId = ctx.userId || ctx.chatId || '';
  if (quotaUserId) {
    const stepSecondQuota = await quotaService.consume({
      companyId: ctx.companyId || null,
      botId: ctx.bot.id,
      tgUserId: quotaUserId,
      scope: 'bot.step.per_second',
      limit: 1,
      period: 'second'
    });
    if (!stepSecondQuota.allowed) {
      await sendMessage(ctx, t(resolveLang(ctx), 'common.err.too_fast'));
      return true;
    }

    const stepQuota = await quotaService.consume({
      companyId: ctx.companyId || null,
      botId: ctx.bot.id,
      tgUserId: quotaUserId,
      scope: 'bot.step.per_minute',
      limit: perMinuteLimit,
      period: 'minute'
    });
    if (!stepQuota.allowed) {
      await sendMessage(ctx, t(resolveLang(ctx), 'common.err.too_fast'));
      return true;
    }
  }

  // 2. Dynamic Menu Logic (disabled for v7 template bots: CLIENT_LEAD/B2B)
  if (!shouldBypassScenarioEngine(ctx)) {
    const isDynamicHandled = await handleDynamicMenu(ctx, text);
    if (isDynamicHandled) return true;
  }

  // 3. Legacy Templates (Fallback)
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
    await sendMessage(ctx, '✅ Запит вже існує, ми оновили звернення.', { remove_keyboard: true });
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
        '🟢 [LEAD BUY] Нова заявка',
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
      const header = result.isDuplicate ? '🟢 [LEAD BUY] ♻️ Дублікат заявки обʼєднано' : '🟢 [LEAD BUY] Нова заявка';
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
    await sendMessage(ctx, '✅ Запит вже існує, ми оновили звернення.');
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
    const header = result.isDuplicate ? '🟣 [LEAD SELL] ♻️ Дублікат обʼєднано' : '🟣 [LEAD SELL] Нова заявка на продаж';
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
      await sendMessage(ctx, '⛔️ Доступ лише для учасників мережі.', {
        inline_keyboard: [[{ text: 'Запросити доступ', callback_data: buildCallbackData('ba_req') }]]
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

      // Generate deep-link with new Telegram-safe format: b2bv_{publicId}
      const deeplink = `https://t.me/${botUsername}?start=b2bv_${request.publicId || request.id}`;

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
            [{ text: 'Є варіант', url: deeplink }]
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
  // Partner queue is an admin queue, so contacts must remain visible there.
  const requestCardPartner = renderRequestCard({
    ...request,
    payload: {
      ...(request.payload as any || {}),
      companyName: requesterCompanyName || flow.companyName
    }
  }, { includeContact: true });
  const requestCardAdmin = renderRequestCard({
    ...request,
    payload: {
      ...(request.payload as any || {}),
      companyName: requesterCompanyName || flow.companyName
    }
  }, { includeContact: true });
  const botUsername = (ctx.bot.config as any)?.botUsername || (ctx.bot.config as any)?.username;
  const link = botUsername ? generateRequestLink(botUsername, request.publicId || request.id) : '';
  const header = `🔵 [B2B REQUEST] #${request.publicId || request.id}`;
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
