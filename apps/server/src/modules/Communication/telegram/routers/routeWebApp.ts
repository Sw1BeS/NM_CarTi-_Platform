import { prisma } from '../../../../services/prisma.js';
import type { PipelineContext } from '../types.js';
import { parseMiniAppPayload } from '../utils/miniappPayload.js';
import { normalizeBrand } from '../../../Inventory/normalization/normalizeBrand.js';
import { normalizeModel } from '../../../Inventory/normalization/normalizeModel.js';
import { normalizeCity } from '../../../Inventory/normalization/normalizeCity.js';
import { normalizePhone } from '../../../Inventory/normalization/normalizePhone.js';
import { createOrMergeLead } from '../services/leadService.js';
import { telegramOutbox } from '../outbox/telegramOutbox.js';
import { renderLeadCard, renderRequestCard } from '../../../../services/cardRenderer.js';
import { emitPlatformEvent } from '../events/eventEmitter.js';
import { ScenarioEngine } from '../../bots/scenario.engine.js';
import { resolveLang, t } from '../utils/telegramText.js';

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

export const routeWebApp = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return false;
  const message = ctx.update?.message;
  const rawData = message?.web_app_data?.data;
  if (!rawData) return false;

  let parsedRaw: any;
  try {
    parsedRaw = JSON.parse(rawData);
  } catch (e) {
    await emitPlatformEvent({
      companyId: ctx.companyId,
      botId: ctx.bot.id,
      eventType: 'miniapp.submitted',
      userId: ctx.userId,
      chatId: ctx.chatId,
      payload: { valid: false, error: 'invalid_json' }
    });
    await sendMessage(ctx, t(resolveLang(ctx), 'miniappInvalid'));
    return true;
  }

  const parsed = parseMiniAppPayload(parsedRaw);
  if (!parsed.ok) {
    const legacyHandled = await ScenarioEngine.handleUpdate(ctx.bot as any, ctx.session, ctx.update).catch(() => false);
    if (legacyHandled) return true;

    await emitPlatformEvent({
      companyId: ctx.companyId,
      botId: ctx.bot.id,
      eventType: 'miniapp.submitted',
      userId: ctx.userId,
      chatId: ctx.chatId,
      payload: { valid: false, error: parsed.error }
    });
    await sendMessage(ctx, t(resolveLang(ctx), 'miniappInvalid'));
    return true;
  }

  const payload = parsed.payload;
  const fields = payload.fields || {};
  const langOverride = (payload.meta as any)?.lang || fields.lang || fields.language;
  const lang = langOverride
    ? resolveLang({ ...ctx, locale: String(langOverride) } as PipelineContext)
    : resolveLang(ctx);

  if (payload.type === 'interest_click') {
    await emitPlatformEvent({
      companyId: ctx.companyId,
      botId: ctx.bot.id,
      eventType: 'miniapp.opened',
      userId: ctx.userId,
      chatId: ctx.chatId,
      payload: { type: payload.type, carId: payload.carId || undefined, meta: payload.meta || undefined }
    });
    return true;
  }

  const name = fields.name || fields.firstName || fields.fullName || 'Client';
  const phone = normalizePhone(fields.phone || fields.tel || undefined);
  const brand = await normalizeBrand(fields.brand || '', { companyId: ctx.companyId });
  const model = await normalizeModel(fields.model || '', { companyId: ctx.companyId, brand: brand || null });
  const city = await normalizeCity(fields.city || '', { companyId: ctx.companyId });

  let requestTitle = [brand, model].filter(Boolean).join(' ').trim();
  if (!requestTitle && payload.carId) {
    const car = await prisma.carListing.findUnique({ where: { id: payload.carId } });
    if (car) requestTitle = car.title || requestTitle;
  }

  const leadResult = await createOrMergeLead({
    botId: ctx.bot.id,
    companyId: ctx.companyId,
    chatId: ctx.chatId,
    userId: ctx.userId,
    name: String(name || 'Client'),
    phone: phone || fields.phone || undefined,
    request: requestTitle || undefined,
    source: ctx.bot.name || 'Telegram',
    payload: {
      brand,
      model,
      city,
      meta: payload.meta || undefined,
      carId: payload.carId || undefined
    },
    leadType: payload.type === 'sell_submit' ? 'SELL' : 'BUY',
    createRequest: payload.type !== 'sell_submit',
    requestData: {
      title: requestTitle || undefined,
      budgetMin: fields.priceMin || fields.budgetMin || undefined,
      budgetMax: fields.priceMax || fields.budget || fields.budgetMax || undefined,
      yearMin: fields.yearMin || fields.year || undefined,
      yearMax: fields.yearMax || undefined,
      city: city || undefined,
      description: fields.note || fields.comment || undefined,
      language: lang
    }
  }, ctx.bot.config);

  await emitPlatformEvent({
    companyId: ctx.companyId,
    botId: ctx.bot.id,
    eventType: 'miniapp.submitted',
    userId: ctx.userId,
    chatId: ctx.chatId,
    payload: { type: payload.type, carId: payload.carId || undefined, valid: true }
  });

  if (leadResult.isDuplicate) {
    await sendMessage(ctx, t(lang, 'leadDuplicate'));
  } else {
    await sendMessage(ctx, t(lang, 'miniappReceived'));
  }

  if (ctx.bot.adminChatId) {
    const leadCard = renderLeadCard({
      clientName: name,
      phone: phone || fields.phone,
      request: requestTitle || undefined,
      payload: { brand, model, city }
    });
    const reqCard = leadResult.request ? renderRequestCard(leadResult.request) : '';
    const header = leadResult.isDuplicate
      ? '♻️ Duplicate lead merged'
      : (payload.type === 'sell_submit' ? '💵 MiniApp Sell' : '📥 MiniApp Lead');
    await sendMessage(ctx, `${header}\n\n${leadCard}${reqCard ? `\n\n${reqCard}` : ''}`, undefined, String(ctx.bot.adminChatId));
  }

  return true;
};
