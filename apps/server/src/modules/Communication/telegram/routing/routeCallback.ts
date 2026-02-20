import { LeadStatus } from '@prisma/client';
import { prisma } from '../../../../services/prisma.js';
import type { PipelineContext } from '../core/types.js';
import { ScenarioEngine } from '../../bots/scenario.engine.js';
import { telegramOutbox } from '../messaging/outbox/telegramOutbox.js';
import { parseCallbackData } from '../core/utils/callbackUtils.js';
import { button, resolveLang, t } from '../core/utils/telegramText.js';
import { finalizeB2BRequest, finalizeCatalogSell, finalizeClientLead, handleDynamicMenu } from './routeMessage.js';
import { b2bWhitelistService } from '../../../../services/b2bWhitelist.service.js';

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

export const routeCallback = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return false;
  const cb = ctx.update?.callback_query;
  if (!cb?.data) return false;

  await telegramOutbox.answerCallback({ token: ctx.bot.token, callbackId: cb.id }).catch(() => null);

  const isB2BTemplate = ctx.bot.template === 'B2B';
  const legacyB2BFallbackEnabled = String(process.env.TELEGRAM_B2B_LEGACY_FALLBACK || 'false').toLowerCase() === 'true';
  if (!(isB2BTemplate && legacyB2BFallbackEnabled)) {
    const handledScenario = await ScenarioEngine.handleUpdate(ctx.bot as any, ctx.session, ctx.update).catch(() => false);
    if (handledScenario) return true;
  }

  const data = String(cb.data || '');
  const parsed = parseCallbackData(data);
  const lang = resolveLang(ctx);
  const vars = (ctx.session.variables as any) || {};

  if (data.startsWith('set_lang:')) {
    const selectedLang = data.split(':')[1];
    await updateSession(ctx, 'DYN_MENU', { ...vars, language: selectedLang, lang: selectedLang });
    await handleDynamicMenu(ctx, '/menu');
    return true;
  }

  if (parsed.ok && parsed.action) {
    switch (parsed.action) {
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
        const result = await b2bWhitelistService.ensureAccess({
          tgUserId: String(from?.id || ctx.userId || ctx.chatId || ''),
          username: from?.username || null,
          fullName: fullName || null
        }, {
          companyId: ctx.companyId || null,
          botId: ctx.bot.id
        }, 'telegram_callback_request_access');

        if (result.allowed) {
          await sendMessage(ctx, '✅ Доступ вже активний. Скористайтесь меню для створення запиту.');
        } else {
          await sendMessage(ctx, '✅ Запит на доступ надіслано адміну. Очікуйте підтвердження.');
          if (ctx.bot.adminChatId) {
          await sendMessage(
              ctx,
              `🔐 Новий запит на доступ B2B\n` +
              `ID: ${result.accessRequest?.id}\n` +
              `tgUserId: ${from?.id || ctx.userId}\n` +
              `username: ${from?.username ? `@${from.username}` : '—'}\n` +
              `name: ${fullName || '—'}`,
              undefined,
              String(ctx.bot.adminChatId)
            );
          }
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
