import { prisma } from '../../../../services/prisma.js';
import type { PipelineContext } from '../core/types.js';
import { parseMiniAppPayload } from '../core/utils/miniappPayload.js';
import { normalizeBrand } from '../../../Inventory/normalization/normalizeBrand.js';
import { normalizeModel } from '../../../Inventory/normalization/normalizeModel.js';
import { normalizeCity } from '../../../Inventory/normalization/normalizeCity.js';
import { normalizePhone } from '../../../Inventory/normalization/normalizePhone.js';
import { createOrMergeLead } from '../core/leadService.js';
import { telegramOutbox } from '../messaging/outbox/telegramOutbox.js';
import { renderLeadCard, renderRequestCard } from '../../../../services/cardRenderer.js';
import { emitPlatformEvent } from '../core/events/eventEmitter.js';
import { ScenarioEngine } from '../../bots/scenario.engine.js';
import { resolveLang, t } from '../core/utils/telegramText.js';

const shouldBypassScenarioEngine = (ctx: PipelineContext) => {
  const template = String(ctx.bot?.template || '').toUpperCase();
  return template === 'CLIENT_LEAD' || template === 'B2B';
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
    await sendMessage(ctx, '⚠️ Дані MiniApp пошкоджені. Спробуйте ще раз.');
    return true;
  }

  const parsed = parseMiniAppPayload(parsedRaw);
  if (!parsed.ok) {
    if (!shouldBypassScenarioEngine(ctx)) {
      const legacyHandled = await ScenarioEngine.handleUpdate(ctx.bot as any, ctx.session, ctx.update).catch(() => false);
      if (legacyHandled) return true;
    }

    await emitPlatformEvent({
      companyId: ctx.companyId,
      botId: ctx.bot.id,
      eventType: 'miniapp.submitted',
      userId: ctx.userId,
      chatId: ctx.chatId,
      payload: { valid: false, error: parsed.error }
    });
    await sendMessage(ctx, '⚠️ Дані MiniApp не підтримуються. Оновіть MiniApp і повторіть спробу.');
    return true;
  }

  const payload = parsed.payload;
  const fields = payload.fields || {};
  const payloadCarIds = Array.isArray(payload.carIds) ? payload.carIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  const primaryCarId = payload.carId || payloadCarIds[0];
  const langOverride = (payload.meta as any)?.lang || fields.lang || fields.language;
  const lang = langOverride
    ? resolveLang({ ...ctx, locale: String(langOverride) } as PipelineContext)
    : resolveLang(ctx);
  const from = ctx.update?.message?.from;
  const telegramUsername = String((payload.meta as any)?.username || from?.username || '').trim() || undefined;
  const telegramName = String((payload.meta as any)?.name || [from?.first_name, from?.last_name].filter(Boolean).join(' ') || '').trim() || undefined;

  if (payload.type === 'interest_click') {
    await emitPlatformEvent({
      companyId: ctx.companyId,
      botId: ctx.bot.id,
      eventType: 'miniapp.opened',
      userId: ctx.userId,
      chatId: ctx.chatId,
      payload: {
        type: payload.type,
        carId: primaryCarId || undefined,
        carIds: payloadCarIds.length ? payloadCarIds : undefined,
        meta: payload.meta || undefined
      }
    });
    return true;
  }

  const name = fields.name || fields.firstName || fields.fullName || 'Client';
  const phone = normalizePhone(fields.phone || fields.tel || undefined);
  const brand = await normalizeBrand(fields.brand || '', { companyId: ctx.companyId });
  const model = await normalizeModel(fields.model || '', { companyId: ctx.companyId, brand: brand || null });
  const city = await normalizeCity(fields.city || '', { companyId: ctx.companyId });

  let requestTitle = [brand, model].filter(Boolean).join(' ').trim();
  if (!requestTitle && primaryCarId) {
    const car = await prisma.carListing.findUnique({ where: { id: primaryCarId } });
    if (car) requestTitle = car.title || requestTitle;
  }
  if (!requestTitle && payloadCarIds.length > 1) {
    requestTitle = `Запит по ${payloadCarIds.length} авто`;
  }

  const leadResult = await createOrMergeLead({
    botId: ctx.bot.id,
    companyId: ctx.companyId,
    chatId: ctx.chatId,
    userId: ctx.userId,
    name: String(name || 'Client'),
    telegramUsername,
    telegramName,
    phone: phone || fields.phone || undefined,
    request: requestTitle || undefined,
    source: 'TELEGRAM',
    payload: {
      brand,
      model,
      city,
      meta: payload.meta || undefined,
      carId: primaryCarId || undefined,
      carIds: payloadCarIds.length ? payloadCarIds : undefined
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
    payload: {
      type: payload.type,
      carId: primaryCarId || undefined,
      carIds: payloadCarIds.length ? payloadCarIds : undefined,
      valid: true
    }
  });

  if (leadResult.isDuplicate) {
    await sendMessage(ctx, '✅ Запит уже існує, ми оновили звернення.');
  } else {
    await sendMessage(ctx, '✅ Дякуємо! Запит із MiniApp отримано.');
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
      ? (payload.type === 'sell_submit' ? '🟣 [LEAD SELL] ♻️ Дублікат обʼєднано' : '🟢 [LEAD BUY] ♻️ Дублікат обʼєднано')
      : (payload.type === 'sell_submit' ? '🟣 [LEAD SELL] MiniApp' : '🟢 [LEAD BUY] MiniApp');
    const selectedLine = payloadCarIds.length > 1 ? `\n🚗 Обрано авто: ${payloadCarIds.length}` : '';
    await sendMessage(ctx, `${header}${selectedLine}\n\n${leadCard}${reqCard ? `\n\n${reqCard}` : ''}`, undefined, String(ctx.bot.adminChatId));
  }

  return true;
};
