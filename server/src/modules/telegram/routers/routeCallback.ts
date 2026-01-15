import { LeadStatus } from '@prisma/client';
import { prisma } from '../../../services/prisma.js';
import type { PipelineContext } from '../types.js';
import { ScenarioEngine } from '../../bots/scenario.engine.js';
import { telegramOutbox } from '../outbox/telegramOutbox.js';
import { parseCallbackData } from '../utils/callbackUtils.js';
import { button, resolveLang, t } from '../utils/telegramText.js';
import { finalizeB2BRequest, finalizeCatalogSell, finalizeClientLead } from './routeMessage.js';

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

const sendMessage = async (ctx: PipelineContext, text: string, replyMarkup?: any) => {
  if (!ctx.bot || !ctx.chatId) return;
  await telegramOutbox.sendMessage({
    botId: ctx.bot.id,
    token: ctx.bot.token,
    chatId: ctx.chatId,
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

  const handledScenario = await ScenarioEngine.handleUpdate(ctx.bot as any, ctx.session, ctx.update).catch(() => false);
  if (handledScenario) return true;

  const data = String(cb.data || '');
  const parsed = parseCallbackData(data);
  const lang = resolveLang(ctx);
  const vars = (ctx.session.variables as any) || {};

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
        await updateSession(ctx, 'B2B_REQ_DESC', vars);
        await sendMessage(ctx, t(lang, 'b2bAskDesc'));
        return true;
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
