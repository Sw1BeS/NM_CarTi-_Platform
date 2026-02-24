import { LeadStatus } from '@prisma/client';
import { prisma } from '../../../../services/prisma.js';
import type { PipelineContext } from '../core/types.js';
import { ScenarioEngine } from '../../bots/scenario.engine.js';
import { telegramOutbox } from '../messaging/outbox/telegramOutbox.js';
import { buildCallbackData, parseCallbackData, ActionTokens } from '../core/utils/callbackUtils.js';
import { button, resolveLang, t } from '../core/utils/telegramText.js';
import { finalizeB2BRequest, finalizeCatalogSell, finalizeClientLead, handleDynamicMenu } from './routeMessage.js';
import { b2bWhitelistService } from '../../../../services/b2bWhitelist.service.js';
import { resolveReplyMarkupForChat } from '../core/utils/telegramReplyMarkup.js';
import { b2bRoutingService } from '../../../../services/b2bRouting.service.js';
import { handleLeadBuyCallback } from './wizards/leadBuyWizard.js';
import { handleLeadSellAdminAction, handleLeadSellCallback } from './wizards/leadSellWizard.js';

const shouldBypassScenarioEngine = (ctx: PipelineContext) => {
  const template = String(ctx.bot?.template || '').toUpperCase();
  return template === 'CLIENT_LEAD' || template === 'B2B';
};

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

export const routeCallback = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return false;
  const cb = ctx.update?.callback_query;
  if (!cb?.data) return false;

  await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id }).catch(() => null);

  if (!shouldBypassScenarioEngine(ctx)) {
    const handledScenario = await ScenarioEngine.handleUpdate(ctx.bot as any, ctx.session, ctx.update).catch(() => false);
    if (handledScenario) return true;
  }

  const data = String(cb.data || '');
  const parsed = parseCallbackData(data);
  const lang = resolveLang(ctx);
  const vars = (ctx.session.variables as any) || {};

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

    switch (parsed.action) {
      case ActionTokens.LB_CANCEL:
        await updateSession(
          ctx,
          ctx.bot?.template === 'B2B' ? 'B2B_MENU' : (ctx.bot?.template === 'CATALOG' ? 'CAT_MENU' : 'CL_MENU'),
          { ...vars, supportDraft: null, b2bRegDraft: null, b2bRequestDraft: null, b2bVariantDraft: null }
        );
        await sendMessage(ctx, t(lang, 'cancelled'), { remove_keyboard: true });
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
        await sendMessage(ctx, t(lang, 'common.tariffs_b2b'));
        return true;
      case 'b2b_inv_prev':
      case 'b2b_inv_next': {
        const view = (vars.b2bInventoryView || {}) as { carIds?: string[]; page?: number; pageSize?: number };
        const ids = Array.isArray(view.carIds) ? view.carIds : [];
        if (!ids.length) {
          await sendMessage(ctx, '🚙 Інвентар порожній.');
          return true;
        }
        const pageSize = Math.max(1, Number(view.pageSize || 3));
        const totalPages = Math.max(1, Math.ceil(ids.length / pageSize));
        let page = Math.max(0, Number(view.page || 0));
        page = parsed.action === 'b2b_inv_next' ? page + 1 : page - 1;
        if (page < 0) page = totalPages - 1;
        if (page >= totalPages) page = 0;

        const pageIds = ids.slice(page * pageSize, page * pageSize + pageSize);
        const cars = await prisma.carListing.findMany({ where: { id: { in: pageIds } } });
        const byId = new Map(cars.map((car) => [car.id, car]));
        for (const id of pageIds) {
          const car = byId.get(id);
          if (!car) continue;
          await sendMessage(ctx, `🚙 <b>${car.title}</b>\n📅 ${car.year || '—'}\n💵 ${car.price || '—'} ${car.currency || 'USD'}\nСтатус: ${car.status || '—'}`);
        }

        await updateSession(ctx, ctx.session?.state || 'B2B_MENU', {
          ...vars,
          b2bInventoryView: {
            ...view,
            page
          }
        });
        await sendMessage(ctx, `Сторінка ${page + 1}/${totalPages}`, {
          inline_keyboard: [[
            { text: '⬅️ Назад', callback_data: buildCallbackData('b2b_inv_prev') },
            { text: 'Показати ще', callback_data: buildCallbackData('b2b_inv_next') }
          ]]
        });
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
      case 'sup_edit_text': {
        const draft = (vars.supportDraft || {}) as Record<string, any>;
        await updateSession(ctx, 'CL_SUPPORT_TEXT', { ...vars, supportDraft: draft });
        await sendMessage(ctx, t(lang, 'support.ask_text'), { remove_keyboard: true });
        return true;
      }
      case 'sup_edit_contact': {
        const draft = (vars.supportDraft || {}) as Record<string, any>;
        await updateSession(ctx, 'CL_SUPPORT_CONTACT', { ...vars, supportDraft: draft });
        await sendMessage(ctx, t(lang, 'support.ask_contact'), {
          keyboard: [[{ text: button(lang, 'common.shareContact'), request_contact: true }], [{ text: button(lang, 'common.back') }]],
          resize_keyboard: true,
          one_time_keyboard: true
        });
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
        await sendMessage(ctx, t(lang, 'support.received'), { remove_keyboard: true });

        if (ctx.bot?.adminChatId) {
          const from = cb.from;
          const userName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || 'Користувач';
          const userLink = from?.username ? ` (@${from.username})` : '';
          await sendMessage(ctx, [
            '🆘 [SUPPORT]',
            `👤 ${userName}${userLink}`,
            `tgId: ${tgUserId}`,
            `📞 Контакт: ${supportContact}`,
            '',
            supportText
          ].join('\n'), undefined, String(ctx.bot.adminChatId));
        }
        return true;
      }
      // --- B2B registration entry points (v7 Wizard) ---
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
                  { text: '✅ Підтвердити', callback_data: buildCallbackData('b2b_access_approve', accessRequestId) },
                  { text: '❌ Відхилити', callback_data: buildCallbackData('b2b_access_reject', accessRequestId) }
                ]
              ]
            }
            : undefined;

          await b2bRoutingService.notifyQueues({
            companyId: ctx.companyId || null,
            sourceBotId: ctx.bot.id,
            sourceBotToken: ctx.bot.token,
            sourceBotAdminChatId: ctx.bot.adminChatId || null,
            text:
              `🟡 [B2B REG] Новий запит на доступ\n` +
              `ID: ${accessRequestId || '—'}\n` +
              `tgUserId: ${from?.id || ctx.userId}\n` +
              `username: ${from?.username ? `@${from.username}` : '—'}\n` +
              `name: ${fullName || '—'}\n` +
              `chatId: ${ctx.chatId || '—'}\n` +
              `chatType: ${ctx.chatType || 'unknown'}`,
            replyMarkup: adminMarkup,
            includeSourceAdminFallback: true
          });
        }
        return true;
      }
      case 'b2b_access_approve':
      case 'b2b_access_reject': {
        const accessRequestId = parsed.id ? String(parsed.id) : '';
        if (!accessRequestId) {
          await sendMessage(ctx, '⚠️ Некоректний запит доступу.');
          return true;
        }

        const decision = parsed.action === 'b2b_access_approve' ? 'APPROVE' : 'REJECT';
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
  if (parts.length === 3 && parts[0] === 'lead') {
    const status = parts[1] as LeadStatus;
    const id = parts[2];
    if (!Object.values(LeadStatus).includes(status)) return false;
    await prisma.lead.update({ where: { id }, data: { status } });
    if (cb.message?.chat?.id && cb.message?.message_id) {
      const currentText = cb.message.text || cb.message.caption || '';
      await telegramOutbox.editMessageText({
        botId: ctx.bot.id,
        token: ctx.bot.token,
        chatId: String(cb.message.chat.id),
        messageId: cb.message.message_id,
        text: `${currentText}\n\n✅ ${status}`,
        replyMarkup: cb.message.reply_markup || undefined,
        companyId: ctx.companyId,
        userId: ctx.userId || undefined
      }).catch(() => null);
    }
    return true;
  }

  return false;
};
