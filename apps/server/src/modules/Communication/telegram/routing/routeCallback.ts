import { LeadStatus } from '@prisma/client';
import { prisma } from '../../../../services/prisma.js';
import type { PipelineContext } from '../core/types.js';
import { ScenarioEngine } from '../../bots/scenario.engine.js';
import { telegramOutbox } from '../messaging/outbox/telegramOutbox.js';
import { buildCallbackData, parseCallbackData, ActionTokens } from '../core/utils/callbackUtils.js';
import { button, resolveLang, t } from '../core/utils/telegramText.js';
import {
  finalizeB2BRequest,
  finalizeCatalogSell,
  finalizeClientLead,
  handleDynamicMenu,
  openB2BInventory,
  paginateB2BInventory,
  showMenu
} from './routeMessage.js';
import { b2bWhitelistService } from '../../../../services/b2bWhitelist.service.js';
import { resolveReplyMarkupForChat } from '../core/utils/telegramReplyMarkup.js';
import { b2bRoutingService } from '../../../../services/b2bRouting.service.js';
import { handleLeadBuyCallback } from './wizards/leadBuyWizard.js';
import { handleLeadSellAdminAction, handleLeadSellCallback } from './wizards/leadSellWizard.js';
import { handleB2BSellCallback, startB2BSellWizard } from './wizards/b2bSellWizard.js';
import { quotaService } from '../../../../services/quota.service.js';
import { getEnvInt } from '../../../../services/featureFlags.js';
import { renderChannelCarPost } from '../../../../services/cardRenderer.js';
import { normalizeBotConfigChatId } from '../core/utils/telegramChatId.js';
import { assertAdminTestAccess, assertConfiguredAdminActionAccess } from '../core/utils/telegramAdminAccess.js';
import {
  buildTestPanel,
  resolveScenarioFromPanelState,
  runTestScenario
} from './testing/adminTestScenarios.js';

const shouldBypassScenarioEngine = (ctx: PipelineContext) => {
  const template = String(ctx.bot?.template || '').toUpperCase();
  return template === 'CLIENT_LEAD' || template === 'B2B';
};

const TEST_ACTIONS = new Set([
  ActionTokens.AD_TEST,
  ActionTokens.TEST_GO,
  ActionTokens.TEST_REFRESH,
  ActionTokens.TEST_CLOSE
]);

const buildAdminTestPanelMarkup = (lang: ReturnType<typeof resolveLang>, panel: ReturnType<typeof buildTestPanel>) => ({
  inline_keyboard: [
    ...panel.items.map((item, idx) => [{ text: item.label, callback_data: buildCallbackData(ActionTokens.TEST_GO, String(idx)) }]),
    [
      { text: button(lang, 'admin.refresh'), callback_data: buildCallbackData(ActionTokens.TEST_REFRESH) },
      { text: button(lang, 'admin.close'), callback_data: buildCallbackData(ActionTokens.TEST_CLOSE) }
    ]
  ]
});

export const updateSession = async (ctx: PipelineContext, state: string, variables: Record<string, any>) => {
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

const appendStatusLineOnce = (text: string, status: LeadStatus) => {
  const statusLine = `✅ ${status}`;
  const value = String(text || '').trimEnd();
  if (new RegExp(`(^|\\n)\\s*✅\\s+${status}\\s*$`, 'm').test(value)) return value;
  return `${value}\n\n${statusLine}`.trim();
};

const handleLeadStatusCallback = async (ctx: PipelineContext, cb: any, status: LeadStatus, leadId: string) => {
  const updatedLead = await prisma.lead.update({ where: { id: leadId }, data: { status } });
  const adminTgUserId = String(cb.from?.id || ctx.userId || '').trim();
  const adminUsername = String(cb.from?.username || '').trim() || null;
  const messageId = Number(cb.message?.message_id || 0);
  const chatId = cb.message?.chat?.id ? String(cb.message.chat.id) : '';
  const idempotencyKey = [
    'telegram:lead-status',
    leadId,
    status,
    messageId > 0 ? String(messageId) : cb.id || adminTgUserId || 'manual'
  ].join(':');

  await prisma.leadActivity.create({
    data: {
      leadId,
      type: 'ADMIN_STATUS_CHANGED',
      payload: {
        status,
        botId: ctx.bot?.id || null,
        adminTgUserId: adminTgUserId || null,
        adminUsername,
        callbackId: cb.id || null,
        messageId: messageId || null,
        chatId: chatId || null
      } as any
    }
  }).catch(() => null);

  await prisma.integrationEventLog.upsert({
    where: { idempotencyKey },
    create: {
      companyId: ctx.companyId || (updatedLead as any)?.companyId || null,
      integration: 'telegram',
      action: 'lead.status_changed',
      status: 'SUCCESS',
      entityType: 'lead',
      entityId: leadId,
      idempotencyKey,
      message: `Lead marked ${status} from Telegram admin action`,
      meta: {
        status,
        botId: ctx.bot?.id || null,
        adminTgUserId: adminTgUserId || null,
        adminUsername,
        callbackId: cb.id || null,
        messageId: messageId || null,
        chatId: chatId || null
      } as any
    },
    update: {
      status: 'SUCCESS',
      message: `Lead marked ${status} from Telegram admin action`,
      meta: {
        status,
        botId: ctx.bot?.id || null,
        adminTgUserId: adminTgUserId || null,
        adminUsername,
        callbackId: cb.id || null,
        messageId: messageId || null,
        chatId: chatId || null,
        repeatedAt: new Date().toISOString()
      } as any
    }
  }).catch(() => null);

  if (chatId && messageId) {
    const currentText = cb.message.text || cb.message.caption || '';
    await telegramOutbox.editMessageText({
      botId: ctx.bot!.id,
      token: ctx.bot!.token,
      chatId,
      messageId,
      text: appendStatusLineOnce(currentText, status),
      replyMarkup: cb.message.reply_markup || undefined,
      companyId: ctx.companyId,
      userId: ctx.userId || undefined
    }).catch(() => null);
  }

  await telegramOutbox.answerCallback({
    token: ctx.bot!.token,
    callbackId: cb.id,
    text: `✅ ${status}`
  }).catch(() => null);
};

export const routeCallback = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return false;
  const cb = ctx.update?.callback_query;
  if (!cb?.data) return false;

  const data = String(cb.data || '');
  const parsed = parseCallbackData(data);
  const isTestAction = Boolean(parsed.ok && parsed.action && TEST_ACTIONS.has(parsed.action));

  if (!isTestAction) {
    await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id }).catch(() => null);
  }

  if (!shouldBypassScenarioEngine(ctx)) {
    const handledScenario = await ScenarioEngine.handleUpdate(ctx.bot as any, ctx.session, ctx.update).catch(() => false);
    if (handledScenario) return true;
  }

  const lang = resolveLang(ctx);
  const vars = (ctx.session.variables as any) || {};
  const quotaUserId = String(cb.from?.id || ctx.userId || ctx.chatId || '').trim();

  if (quotaUserId) {
    const secondQuota = await quotaService.consume({
      companyId: ctx.companyId || null,
      botId: ctx.bot.id,
      tgUserId: quotaUserId,
      scope: 'bot.action.per_second',
      limit: 1,
      period: 'second'
    });
    if (!secondQuota.allowed) {
      await sendMessage(ctx, t(lang, 'common.err.too_fast'));
      return true;
    }

    const minuteLimit = Math.max(1, getEnvInt('BOT_ACTION_RATE_LIMIT_PER_MIN', 12));
    const minuteQuota = await quotaService.consume({
      companyId: ctx.companyId || null,
      botId: ctx.bot.id,
      tgUserId: quotaUserId,
      scope: 'bot.action.per_minute',
      limit: minuteLimit,
      period: 'minute'
    });
    if (!minuteQuota.allowed) {
      await sendMessage(ctx, t(lang, 'common.err.too_fast'));
      return true;
    }
  }

  if (data.startsWith('set_lang:')) {
    if (shouldBypassScenarioEngine(ctx)) {
      return true;
    }
    const selectedLang = data.split(':')[1];
    await updateSession(ctx, 'DYN_MENU', { ...vars, language: selectedLang, lang: selectedLang });
    await handleDynamicMenu(ctx, '/menu');
    return true;
  }

  if (parsed.ok && parsed.action) {
    if (parsed.action.startsWith('lb_') && parsed.action !== ActionTokens.LB_CANCEL) {
      const handled = await handleLeadBuyCallback(ctx, parsed.action, parsed.id);
      if (handled) return true;
    }
    if (parsed.action.startsWith('ls_')) {
      const handledAdmin = await handleLeadSellAdminAction(ctx, parsed.action, parsed.id);
      if (handledAdmin) return true;
      const handledUser = await handleLeadSellCallback(ctx, parsed.action, parsed.id);
      if (handledUser) return true;
    }
    if (parsed.action.startsWith('br_')) {
      const { handleB2BRegCallback } = await import('./wizards/b2bRegistrationWizard.js');
      const handled = await handleB2BRegCallback(ctx, parsed.action, parsed.id);
      if (handled) return true;
    }
    if (parsed.action.startsWith('bq_')) {
      const { handleB2BReqCallback } = await import('./wizards/b2bRequestWizard.js');
      const handled = await handleB2BReqCallback(ctx, parsed.action, parsed.id);
      if (handled) return true;
    }
    if (parsed.action.startsWith('bv_')) {
      const { handleB2BVariantCallback } = await import('./wizards/b2bVariantWizard.js');
      const handled = await handleB2BVariantCallback(ctx, parsed.action, parsed.id);
      if (handled) return true;
    }
    if (parsed.action.startsWith('bs_') && parsed.action !== 'bs_form' && parsed.action !== 'bs_frominv') {
      const handled = await handleB2BSellCallback(ctx, parsed.action, parsed.id);
      if (handled) return true;
    }

    switch (parsed.action) {
      case ActionTokens.CL_SELL: {
        const { startLeadSellWizard } = await import('./wizards/leadSellWizard.js');
        await startLeadSellWizard(ctx);
        return true;
      }
      case ActionTokens.LB_CANCEL:
        await showMenu(
          ctx,
          lang,
          ctx.bot?.template === 'B2B' ? 'B2B' : (ctx.bot?.template === 'CATALOG' ? 'CATALOG' : 'CLIENT_LEAD'),
          t(lang, 'cancelled')
        );
        return true;
      // --- static info popups ---
      case 'cl_privacy':
        await sendMessage(ctx, t(lang, 'common.privacy'));
        return true;
      case 'cl_info_lead':
        await sendMessage(ctx, t(lang, 'common.info_lead'));
        return true;
      case 'cl_info_b2b':
        await sendMessage(ctx, t(lang, 'common.info_b2b'));
        return true;
      case 'cl_rules':
        await sendMessage(ctx, t(lang, 'common.rules_b2b'));
        return true;
      case 'cl_tariffs':
        await sendMessage(ctx, 'ℹ️ Розділ «Тарифи» тимчасово недоступний.');
        return true;
      case 'ad_help': {
        const scope = String(parsed.id || '').toLowerCase();
        if (scope === 'b2b') {
          await sendMessage(ctx, t(lang, 'admin.b2b.help'));
        } else {
          await sendMessage(ctx, t(lang, 'admin.lead.help'));
        }
        return true;
      }
      case 'ad_cfg':
        await sendMessage(ctx, '⚙️ Налаштування доступні у приватному чаті бота та в CRM.');
        return true;
      case ActionTokens.AD_TEST:
      case ActionTokens.TEST_REFRESH: {
        const access = await assertConfiguredAdminActionAccess(ctx);
        if (!access.ok) {
          await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id, text: access.errorText }).catch(() => null);
          return true;
        }

        const panel = buildTestPanel(String(ctx.bot.template || 'CLIENT_LEAD'));
        const nextVars = {
          ...vars,
          adminTestPanel: {
            template: String(ctx.bot.template || ''),
            chatId: String(ctx.chatId || ''),
            items: panel.items.map((item) => item.code),
            createdAt: new Date().toISOString()
          }
        };
        await updateSession(ctx, String(ctx.session.state || 'START'), nextVars);
        await sendMessage(ctx, `${t(lang, 'admin.test.panel.title', { bot: ctx.bot.name || 'Bot' })}\n\n${t(lang, 'admin.test.panel.hint')}`, buildAdminTestPanelMarkup(lang, panel));
        await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id }).catch(() => null);
        return true;
      }
      case ActionTokens.TEST_CLOSE: {
        const access = await assertAdminTestAccess(ctx);
        if (!access.ok) {
          await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id, text: access.errorText }).catch(() => null);
          return true;
        }
        await updateSession(ctx, String(ctx.session.state || 'START'), {
          ...vars,
          adminTestPanel: null
        });
        await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id, text: t(lang, 'admin.test.panel.closed') }).catch(() => null);
        return true;
      }
      case ActionTokens.TEST_GO: {
        const access = await assertAdminTestAccess(ctx);
        if (!access.ok) {
          await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id, text: access.errorText }).catch(() => null);
          return true;
        }

        if (quotaUserId) {
          const testSecondQuota = await quotaService.consume({
            companyId: ctx.companyId || null,
            botId: ctx.bot.id,
            tgUserId: quotaUserId,
            scope: 'bot.test.action.per_second',
            limit: 1,
            period: 'second'
          });
          if (!testSecondQuota.allowed) {
            await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id, text: t(lang, 'common.err.too_fast') }).catch(() => null);
            return true;
          }

          const testMinuteQuota = await quotaService.consume({
            companyId: ctx.companyId || null,
            botId: ctx.bot.id,
            tgUserId: quotaUserId,
            scope: 'bot.test.action.per_minute',
            limit: 20,
            period: 'minute'
          });
          if (!testMinuteQuota.allowed) {
            await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id, text: t(lang, 'common.err.too_fast') }).catch(() => null);
            return true;
          }
        }

        const idx = Number(String(parsed.id || '').trim());
        const resolved = resolveScenarioFromPanelState(vars.adminTestPanel, idx, String(ctx.chatId || ''));
        if (!resolved.ok) {
          await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id, text: t(lang, 'admin.test.panel.stale') }).catch(() => null);
          return true;
        }

        const displayName = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(' ').trim() || 'Admin';
        const result = await runTestScenario(ctx, resolved.code, {
          tgUserId: String(cb.from?.id || ''),
          username: cb.from?.username || null,
          displayName
        });
        if (!result.ok) {
          await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id, text: t(lang, 'admin.test.err.unavailable') }).catch(() => null);
          return true;
        }
        await sendMessage(ctx, t(lang, 'admin.test.sent'));
        await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id, text: '✅' }).catch(() => null);
        return true;
      }
      case 'bs_frominv':
        await openB2BInventory(ctx, 'publish');
        return true;
      case 'bs_form':
        await startB2BSellWizard(ctx);
        return true;
        case 'b2b_req': {
          const tgUserId = String(ctx.userId || cb.from?.id || '').trim();
          const varsPartnerId = String(vars.b2bPartnerId || '').trim();
          let partnerId = varsPartnerId;
          if (!partnerId && tgUserId) {
            const partnerUser = await prisma.partnerUser.findFirst({
              where: {
                telegramId: tgUserId,
                ...(ctx.companyId ? { companyId: ctx.companyId } : {})
              },
              select: { partnerId: true, partner: { select: { name: true } } }
            });
            partnerId = String(partnerUser?.partnerId || '').trim();
            if (partnerId) {
              await updateSession(ctx, ctx.session.state || 'B2B_MENU', {
                ...vars,
                b2bPartnerId: partnerId,
                b2bPartnerName: partnerUser?.partner?.name || vars.b2bPartnerName
              });
            }
          }
          if (!partnerId) {
            await showMenu(ctx, lang, 'B2B', '🔒 Спочатку завершіть реєстрацію для доступу до сценаріїв.');
            return true;
          }
          const { startB2BRequestWizard } = await import('./wizards/b2bRequestWizard.js');
          await startB2BRequestWizard(ctx);
          return true;
        }
      case 'b2b_ip':
      case 'b2b_is':
      case 'b2b_pub':
      case ActionTokens.B2B_INV_EDIT:
      case ActionTokens.B2B_INV_DELETE: {
        const view = (vars.b2bInventoryView || {}) as { pageIds?: string[] };
        const pageIds = Array.isArray(view.pageIds) ? view.pageIds : [];
        const idx = Number(String(parsed.id || '').trim());
        if (!Number.isFinite(idx) || idx < 0 || idx >= pageIds.length) {
          await sendMessage(ctx, '⚠️ Не вдалося визначити авто для дії.');
          return true;
        }
        const carId = pageIds[idx];
        const partnerId = vars.b2bPartnerId ? String(vars.b2bPartnerId) : '';
        const car = await prisma.carListing.findFirst({
          where: {
            id: carId,
            ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
            ...(partnerId ? { partnerCompanyId: partnerId } : {})
          }
        });
        if (!car) {
          await sendMessage(ctx, '⚠️ Авто не знайдено або недоступне.');
          return true;
        }

        if (parsed.action === ActionTokens.B2B_INV_EDIT) {
          await updateSession(ctx, String(ctx.session?.state || 'B2B_MENU'), {
            ...vars,
            b2bInventoryEditCarId: car.id,
            b2bInventoryDeleteCarId: null
          });
          await startB2BSellWizard(ctx, { mode: 'edit', carId: car.id });
          return true;
        }

        if (parsed.action === ActionTokens.B2B_INV_DELETE) {
          await updateSession(ctx, String(ctx.session?.state || 'B2B_MENU'), {
            ...vars,
            b2bInventoryDeleteCarId: car.id,
            b2bInventoryEditCarId: null
          });
          await sendMessage(ctx, `🗑 Видалити авто з інвентаря?\n${car.title}`, {
            inline_keyboard: [
              [{ text: '✅ Так, видалити', callback_data: buildCallbackData(ActionTokens.B2B_INV_DELETE_CONFIRM) }],
              [{ text: '❌ Скасувати', callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
            ]
          });
          return true;
        }

        if (parsed.action === 'b2b_is') {
          await prisma.carListing.update({
            where: { id: car.id },
            data: { status: 'SOLD' }
          });
          await sendMessage(ctx, `✅ Позначено як продане: ${car.title}`);
          return true;
        }

        if (parsed.action === 'b2b_pub') {
          if (car.status === 'SOLD') {
            await sendMessage(ctx, '⚠️ Продане авто не можна опублікувати.');
            return true;
          }
          const channelId = normalizeBotConfigChatId(ctx.bot?.channelId);
          if (!channelId) {
            await sendMessage(ctx, '⚠️ Канал бота не налаштовано.');
            return true;
          }

          const existingPost = await prisma.channelPost.findFirst({
            where: {
              carId: car.id,
              botId: ctx.bot?.id || undefined,
              channelId: String(channelId),
              status: 'ACTIVE'
            },
            orderBy: { createdAt: 'desc' }
          });
          if (existingPost) {
            await sendMessage(ctx, `ℹ️ Це авто вже опубліковано (msg: ${existingPost.messageId}).`);
            return true;
          }

          const card = renderChannelCarPost(car);
          const firstMedia = String(car.thumbnail || (Array.isArray(car.mediaUrls) ? car.mediaUrls[0] : '') || '').trim();
          const sent = firstMedia
            ? await telegramOutbox.sendPhoto({
              botId: ctx.bot!.id,
              token: ctx.bot!.token,
              chatId: String(channelId),
              photo: firstMedia,
              caption: card,
              companyId: ctx.companyId
            }).catch(() => null as any)
            : await telegramOutbox.sendMessage({
              botId: ctx.bot!.id,
              token: ctx.bot!.token,
              chatId: String(channelId),
              text: card,
              companyId: ctx.companyId
            }).catch(() => null as any);

          const messageId = Number((sent as any)?.message_id || 0);
          if (!Number.isFinite(messageId) || messageId <= 0) {
            await sendMessage(ctx, '⚠️ Не вдалося опублікувати авто у каналі.');
            return true;
          }

          await prisma.channelPost.create({
            data: {
              carId: car.id,
              botId: ctx.bot!.id,
              channelId: String(channelId),
              messageId,
              payload: {
                source: 'telegram_b2b_inventory',
                action: 'publish',
                partnerId: partnerId || null
              } as any
            }
          }).catch(() => null);

          await sendMessage(ctx, `✅ Опубліковано в каналі (msg: ${messageId}).`);
          return true;
        }

        await updateSession(ctx, 'B2B_INV_PRICE', {
          ...vars,
          b2bInvPriceCarId: car.id
        });
        await sendMessage(ctx, `💵 Введіть нову ціну для:\n${car.title}\nПоточна: ${car.price || '—'} ${car.currency || 'USD'}`);
        return true;
      }
      case ActionTokens.B2B_INV_DELETE_CONFIRM: {
        const carId = String(vars.b2bInventoryDeleteCarId || '').trim();
        const partnerId = vars.b2bPartnerId ? String(vars.b2bPartnerId) : '';
        if (!carId) {
          await sendMessage(ctx, '⚠️ Не вдалося визначити авто для видалення.');
          return true;
        }
        const updated = await prisma.carListing.updateMany({
          where: {
            id: carId,
            ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
            ...(partnerId ? { partnerCompanyId: partnerId } : {})
          },
          data: { status: 'HIDDEN' }
        });
        if (!updated.count) {
          await sendMessage(ctx, '⚠️ Авто не знайдено або вже недоступне.');
          return true;
        }
        await updateSession(ctx, String(ctx.session?.state || 'B2B_MENU'), {
          ...vars,
          b2bInventoryDeleteCarId: null,
          b2bInventoryEditCarId: null
        });
        await sendMessage(ctx, '✅ Авто видалено з інвентаря.');
        const mode = String((vars.b2bInventoryView || {}).mode || 'manage').toLowerCase() === 'publish' ? 'publish' : 'manage';
        await openB2BInventory(ctx, mode);
        return true;
      }
      case 'b2b_inv_prev':
      case 'b2b_inv_next': {
        await paginateB2BInventory(ctx, parsed.action === 'b2b_inv_next' ? 'next' : 'prev');
        return true;
      }
      // --- support supplement / new ---
      case 'sup_add': {
        await updateSession(ctx, 'CL_SUPPORT_TEXT', { ...vars, supportDraft: { mode: 'append' } });
        await sendMessage(ctx, t(lang, 'support.ask_text'), { remove_keyboard: true });
        return true;
      }
      case 'sup_new': {
        // close existing open ticket then start fresh
        const tgUserId = String(ctx.update?.callback_query?.from?.id || ctx.userId || ctx.chatId || '');
        if (tgUserId && ctx.bot?.id) {
          await prisma.supportTicket.updateMany({
            where: { tgUserId, botId: ctx.bot.id, status: 'OPEN' },
            data: { status: 'CLOSED', closedAt: new Date() }
          });
        }
        await updateSession(ctx, 'CL_SUPPORT_TEXT', { ...vars, supportDraft: { mode: 'new' } });
        await sendMessage(ctx, t(lang, 'support.ask_text'), { remove_keyboard: true });
        return true;
      }
      case 'sup_etxt':
      case 'sup_edit_text': {
        const draft = (vars.supportDraft || {}) as Record<string, any>;
        await updateSession(ctx, 'CL_SUPPORT_TEXT', { ...vars, supportDraft: draft });
        await sendMessage(ctx, t(lang, 'support.ask_text'), { remove_keyboard: true });
        return true;
      }
      case 'sup_econt':
      case 'sup_edit_contact': {
        const draft = (vars.supportDraft || {}) as Record<string, any>;
        await updateSession(ctx, 'CL_SUPPORT_CONTACT', { ...vars, supportDraft: draft });
        if (String(ctx.chatType || '') === 'private') {
          await sendMessage(ctx, t(lang, 'support.ask_contact'), {
            keyboard: [[{ text: button(lang, 'common.shareContact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
            resize_keyboard: true,
            one_time_keyboard: true
          });
        } else {
          await sendMessage(ctx, `${t(lang, 'support.ask_contact')}\n\nВведіть номер вручну:`);
        }
        return true;
      }
      case 'sup_submit': {
        const draft = (vars.supportDraft || {}) as Record<string, any>;
        const supportText = String(draft.text || '').trim();
        const supportContact = String(draft.contact || '').trim();
        const tgUserId = String(ctx.update?.callback_query?.from?.id || ctx.userId || ctx.chatId || '');
        if (!supportText || !supportContact || !tgUserId) {
          await sendMessage(ctx, '⚠️ Неможливо відправити звернення. Заповніть форму ще раз.');
          await updateSession(ctx, 'CL_SUPPORT_TEXT', { ...vars, supportDraft: { mode: 'new' } });
          await sendMessage(ctx, t(lang, 'support.ask_text'), { remove_keyboard: true });
          return true;
        }

        const existing = await prisma.supportTicket.findFirst({
          where: { tgUserId, status: 'OPEN', botId: ctx.bot.id },
          orderBy: { createdAt: 'desc' }
        });

        const threadItem = { text: supportText, contact: supportContact, date: new Date().toISOString(), from: 'user' };
        if (existing) {
          const thread = Array.isArray(existing.thread) ? existing.thread : [];
          thread.push(threadItem);
          await prisma.supportTicket.update({
            where: { id: existing.id },
            data: {
              text: supportText,
              context: { contact: supportContact } as any,
              thread: thread as any
            }
          });
        } else {
          await prisma.supportTicket.create({
            data: {
              tgUserId,
              botId: ctx.bot.id,
              companyId: ctx.companyId,
              chatId: String(ctx.chatId || ''),
              text: supportText,
              context: { contact: supportContact } as any,
              thread: [threadItem] as any,
              status: 'OPEN'
            }
          });
        }

        await updateSession(ctx, 'CL_MENU', { ...vars, supportDraft: null });

        if (ctx.bot?.adminChatId) {
          const from = cb.from;
          const userName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || 'Користувач';
          const userLink = from?.username ? ` (@${from.username})` : '';
          const tgIdLink = from?.username ? '' : `\n🔗 tg://user?id=${tgUserId}`;
          await sendMessage(ctx, [
            '🆘 [SUPPORT]',
            `👤 ${userName}${userLink}`,
            `tgId: ${tgUserId}`,
            tgIdLink ? tgIdLink.trim() : '',
            `📞 Контакт: ${supportContact}`,
            '',
            supportText
          ].filter(Boolean).join('\n'), undefined, String(ctx.bot.adminChatId));
        }
        await showMenu(
          ctx,
          lang,
          ctx.bot?.template === 'B2B' ? 'B2B' : (ctx.bot?.template === 'CATALOG' ? 'CATALOG' : 'CLIENT_LEAD'),
          t(lang, 'support.received')
        );
        return true;
      }
      // --- B2B registration entry points (v7 Wizard) ---
      case 'br_new':
      case 'br_new_partner': {
        const { routeB2BRegStep } = await import('./wizards/b2bRegistrationWizard.js');
        await routeB2BRegStep(ctx, {
          type: 'PARTNER',
          step: 1,
          data: {},
          history: []
        } as any);
        return true;
      }
      case 'br_agent': {
        const { routeB2BRegStep } = await import('./wizards/b2bRegistrationWizard.js');
        await routeB2BRegStep(ctx, {
          type: 'AGENT',
          step: 1,
          data: {},
          history: []
        } as any);
        return true;
      }
      case 'cl_lead_send':
        await finalizeClientLead(ctx);
        return true;
      case 'cl_lead_back':
        await updateSession(ctx, 'CL_CONTACT', vars);
        await sendMessage(ctx, t(lang, 'askContact'), {
          keyboard: [[{ text: button(lang, 'common.contact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
          resize_keyboard: true
        });
        return true;
      case 'cat_sell_send':
        await finalizeCatalogSell(ctx);
        return true;
      case 'cat_sell_back':
        await updateSession(ctx, 'CAT_SELL_CAR', vars);
        await sendMessage(ctx, t(lang, 'catalogSellCar'));
        return true;
      case 'b2b_req_send':
        await finalizeB2BRequest(ctx);
        return true;
      case 'b2b_req_back':
        await updateSession(ctx, 'B2B_REQ_COMPANY', vars);
        await sendMessage(ctx, t(lang, 'b2bAskCompany'));
        return true;
      case 'ba_req':
      case 'b2b_access_request': {
        const from = cb.from;
        const fullName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || undefined;
        const reason = [
          'telegram_callback_request_access',
          ctx.chatId ? `chatId=${ctx.chatId}` : '',
          ctx.chatType ? `chatType=${ctx.chatType}` : ''
        ].filter(Boolean).join(';');
        const result = await b2bWhitelistService.ensureAccess({
          tgUserId: String(from?.id || ctx.userId || ctx.chatId || ''),
          username: from?.username || null,
          fullName: fullName || null
        }, {
          companyId: ctx.companyId || null,
          botId: ctx.bot.id
        }, reason);

        if (result.allowed) {
          await sendMessage(ctx, '✅ Доступ вже активний. Скористайтесь меню для створення запиту.');
        } else {
          await sendMessage(ctx, '✅ Запит на доступ надіслано адміну. Очікуйте підтвердження.');

          const accessRequestId = result.accessRequest?.id || '';
          const adminMarkup = accessRequestId
            ? {
              inline_keyboard: [
                [
                  { text: '✅ Підтвердити', callback_data: buildCallbackData('ba_ap', accessRequestId) },
                  { text: '❌ Відхилити', callback_data: buildCallbackData('ba_rj', accessRequestId) }
                ]
              ]
            }
            : undefined;

          const requesterTgId = String(from?.id || ctx.userId || ctx.chatId || '').trim();
          const requesterLink = from?.username
            ? `https://t.me/${String(from.username).replace(/^@/, '')}`
            : `tg://user?id=${requesterTgId || ctx.chatId || ''}`;
          await b2bRoutingService.notifyQueues({
            companyId: ctx.companyId || null,
            sourceBotId: ctx.bot.id,
            sourceBotToken: ctx.bot.token,
            sourceBotAdminChatId: ctx.bot.adminChatId || null,
            text:
              `🟡 [B2B REG] Новий запит на доступ\n` +
              `ID: ${accessRequestId || '—'}\n` +
              `tgUserId: ${requesterTgId || '—'}\n` +
              `username: ${from?.username ? `@${from.username}` : '—'}\n` +
              `name: ${fullName || '—'}\n` +
              `🔗 ${requesterLink}\n` +
              `chatId: ${ctx.chatId || '—'}\n` +
              `chatType: ${ctx.chatType || 'unknown'}`,
            replyMarkup: adminMarkup,
            includeSourceAdminFallback: true
          });
        }
        return true;
      }
      case 'ba_ap':
      case 'ba_rj':
      case 'b2b_access_approve':
      case 'b2b_access_reject': {
        const accessRequestId = parsed.id ? String(parsed.id) : '';
        if (!accessRequestId) {
          await sendMessage(ctx, '⚠️ Некоректний запит доступу.');
          return true;
        }

        const decision = parsed.action === 'ba_ap' || parsed.action === 'b2b_access_approve' ? 'APPROVE' : 'REJECT';
        const access = await assertAdminTestAccess(ctx);
        if (!access.ok) {
          await sendMessage(ctx, access.errorText);
          return true;
        }
        const reviewedBy = String(cb.from?.id || ctx.userId || 'unknown');
        const reviewed = await b2bWhitelistService.reviewAccessRequest({
          accessRequestId,
          decision,
          reviewedBy
        });

        if (!reviewed) {
          await sendMessage(ctx, '⚠️ Запит доступу не знайдено.');
          return true;
        }

        const targetUserId = String(reviewed.accessRequest.tgUserId || '').trim();
        if (decision === 'APPROVE') {
          await sendMessage(ctx, `✅ Доступ підтверджено: ${accessRequestId}`);
          if (targetUserId) {
            await sendMessage(ctx, '✅ Ваш доступ до B2B підтверджено. Скористайтесь меню бота.', undefined, targetUserId);
          }
        } else {
          await sendMessage(ctx, `❌ Доступ відхилено: ${accessRequestId}`);
          if (targetUserId) {
            await sendMessage(ctx, '❌ Запит на доступ до B2B відхилено. Зверніться до адміністратора.', undefined, targetUserId);
          }
        }

        const message = cb.message;
        if (message?.chat?.id && message?.message_id) {
          const statusLine = decision === 'APPROVE' ? '✅ ПІДТВЕРДЖЕНО' : '❌ ВІДХИЛЕНО';
          const baseText = String(message.text || message.caption || '').split('\\n\\n').slice(0, 1).join('\\n');
          await telegramOutbox.editMessageText({
            botId: ctx.bot.id,
            token: ctx.bot.token,
            chatId: String(message.chat.id),
            messageId: message.message_id,
            text: `${baseText}\\n${statusLine}`,
            companyId: ctx.companyId,
            userId: ctx.userId || undefined
          }).catch(() => null);
        }
        return true;
      }
      default:
        break;
    }
  }

  if (data === 'LEAD_CONFIRM_SEND') {
    await finalizeClientLead(ctx);
    return true;
  }
  if (data === 'LEAD_CONFIRM_BACK') {
    await updateSession(ctx, 'CL_CONTACT', vars);
    await sendMessage(ctx, t(lang, 'askContact'), {
      keyboard: [[{ text: button(lang, 'common.contact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
      resize_keyboard: true
    });
    return true;
  }

  const parts = data.split('_');
  if (parts.length >= 3 && parts[0] === 'lead') {
    const status = parts[1] as LeadStatus;
    const id = parts.slice(2).join('_');
    if (!Object.values(LeadStatus).includes(status)) return false;
    await handleLeadStatusCallback(ctx, cb, status, id);
    return true;
  }

  return false;
};
