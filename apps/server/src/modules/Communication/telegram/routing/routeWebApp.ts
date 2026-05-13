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
import { requestContractService } from '../../../../services/requestContract.service.js';
import { buildLeadAdminActionMarkup, buildLeadAdminNotificationText } from '../../../../services/leadAdminNotification.js';

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
  const botConfig = (ctx.bot.config as Record<string, unknown>) || {};
    const botSlug = String(
      botConfig.defaultShowcaseSlug
      || botConfig.showcaseSlug
      || botConfig.botUsername
      || botConfig.username
      || ''
    ).trim();
    const template = String(ctx.bot.template || '').toUpperCase();
    const isClientLeadBot = template === 'CLIENT_LEAD';
    const isB2BBot = template === 'B2B';

    if (
      isB2BBot
      && ['interest_click', 'lead_submit', 'lead_submit_multi', 'multi_request_submit', 'sell_submit'].includes(payload.type)
    ) {
      await emitPlatformEvent({
        companyId: ctx.companyId,
        botId: ctx.bot.id,
        eventType: 'miniapp.submitted',
        userId: ctx.userId,
        chatId: ctx.chatId,
        payload: {
          type: payload.type,
          rejected: true,
          reason: 'legacy_web_app_data_not_supported_for_b2b'
        }
      });
      await sendMessage(ctx, '⚠️ Ця стара дія MiniApp більше не підтримується для B2B. Відкрийте кабінет через меню бота та повторіть дію.');
      return true;
    }

    if (
      isClientLeadBot
      && ['interest_click', 'lead_submit', 'lead_submit_multi', 'multi_request_submit', 'sell_submit'].includes(payload.type)
    ) {
      if (payload.type === 'sell_submit') {
        const { startLeadSellWizard } = await import('./wizards/leadSellWizard.js');
        await sendMessage(ctx, '✅ Продаж авто продовжимо в чаті бота, щоб стабільно прийняти контакт і фото.');
        await startLeadSellWizard(ctx);
        return true;
      }

      if (!botSlug || !from?.id) {
        await sendMessage(ctx, '⚠️ Не вдалося звʼязати MiniApp із ботом. Відкрийте MiniApp повторно через меню бота.');
        return true;
      }

      const companyId = ctx.companyId || ctx.bot.companyId;
      const selectedCars = payloadCarIds.length
        ? await prisma.carListing.findMany({
          where: { id: { in: payloadCarIds }, ...(companyId ? { companyId } : {}) },
          select: {
            id: true,
            title: true,
            price: true,
            currency: true,
            year: true,
            mileage: true,
            location: true,
            thumbnail: true,
            mediaUrls: true,
            mediaItems: true,
            specs: true,
            status: true
          }
        })
        : [];
      const selectedCarsMap = new Map(selectedCars.map((car) => [car.id, car]));
      const selectedCarsOrdered = payloadCarIds.map((id) => selectedCarsMap.get(id)).filter((item): item is typeof selectedCars[number] => Boolean(item));
      const requestTitle = String(
        fields.title
        || fields.request
        || [fields.brand, fields.model].filter(Boolean).join(' ')
        || selectedCarsOrdered[0]?.title
        || (payloadCarIds.length > 1 ? `Запит по ${payloadCarIds.length} авто` : '')
        || 'Запит з Mini App'
      ).trim() || 'Запит з Mini App';
      const intentType: 'INTEREST' | 'REQUEST' = payload.type === 'interest_click' && (primaryCarId || payloadCarIds.length)
        ? 'INTEREST'
        : 'REQUEST';
      if (!companyId) {
        await sendMessage(ctx, '⚠️ Не вдалося визначити компанію для звернення.');
        return true;
      }

      const pending = await requestContractService.createPendingLeadIntent({
        slug: botSlug,
        intentType,
        title: requestTitle,
        budgetMax: fields.priceMax || fields.budget || fields.budgetMax,
        yearMin: fields.yearMin || fields.year,
        comment: fields.note || fields.comment,
        carListingId: primaryCarId || undefined,
        carListingIds: payloadCarIds.length ? payloadCarIds : undefined,
        tracking: payload.meta || undefined,
        payload: {
          source: 'legacy_web_app_data',
          legacyPayloadType: payload.type,
          fields,
          criteria: fields,
          sourceView: 'legacy_web_app_data'
        },
        telegram: {
          userId: String(from.id),
          username: telegramUsername,
          name: telegramName
        }
      });

      const knownContact = await requestContractService.findKnownLeadContact({
        companyId,
        botId: pending.botId || ctx.bot.id,
        telegramUserId: String(from.id)
      });

      if (knownContact?.phone) {
        const finalized = await requestContractService.finalizePendingLeadIntent({
          botId: pending.botId || ctx.bot.id,
          companyId,
          telegramUserId: String(from.id),
          phone: knownContact.phone,
          displayName: telegramName || (telegramUsername ? `@${telegramUsername}` : 'Клієнт'),
          telegramUsername,
          telegramName
        });

        await sendMessage(ctx, `✅ Запит отримано. Використали збережений контакт ${knownContact.phone}.`, { remove_keyboard: true });
        if (ctx.bot.adminChatId) {
          const adminText = buildLeadAdminNotificationText({
            header: '🟢 [LEAD] MiniApp legacy submit',
            displayName: telegramName || (telegramUsername ? `@${telegramUsername}` : 'Клієнт'),
            telegramUsername,
            telegramUserId: String(from.id),
            phone: knownContact.phone,
            intentLabel: finalized.intentType === 'REQUEST' ? 'Підбір авто' : 'Інтерес до авто',
            requestPresentationText: finalized.requestPresentation?.telegramText,
            fallbackTitle: finalized.title,
            request: finalized.request,
            source: 'legacy_web_app_data',
            duplicate: Boolean(finalized.isDuplicate)
          });
          await sendMessage(
            ctx,
            adminText,
            buildLeadAdminActionMarkup({
              lead: finalized.lead,
              request: finalized.request,
              telegramUserId: String(from.id)
            }),
            String(ctx.bot.adminChatId)
          );
        }
        return true;
      }

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
          meta: payload.meta || undefined,
          legacyRouted: true
        }
      });

      if ((pending as any).isDuplicate) {
        await sendMessage(ctx, '✅ Запит уже отримано. Якщо бот вже попросив контакт, поділіться ним у чаті.');
        return true;
      }

      await sendMessage(ctx, t(lang, 'miniapp.interest.ask_contact', { car: requestTitle }), {
        keyboard: [[{ text: '📱 Поділитися контактом', request_contact: true }], [{ text: '⬅️ Назад' }]],
        resize_keyboard: true,
        one_time_keyboard: true
      });
      return true;
    }

    if (payload.type === 'interest_click') {
      const selectedCars = payloadCarIds.length
        ? await prisma.carListing.findMany({
          where: { id: { in: payloadCarIds }, ...(ctx.companyId || ctx.bot.companyId ? { companyId: ctx.companyId || ctx.bot.companyId } : {}) },
        select: { id: true, title: true }
      })
      : [];
    const selectedCarsMap = new Map(selectedCars.map((car) => [car.id, car]));
    const selectedCarsOrdered = payloadCarIds.map((id) => selectedCarsMap.get(id)).filter((item): item is typeof selectedCars[number] => Boolean(item));
    const requestTitle = String(
      fields.title
      || fields.request
      || selectedCarsOrdered[0]?.title
      || 'Авто з Mini App'
    ).trim() || 'Авто з Mini App';

    let pendingIntentCreated = false;
    if (botSlug && from?.id) {
      try {
        await requestContractService.createPendingLeadIntent({
          slug: botSlug,
          intentType: 'INTEREST',
          title: requestTitle,
          carListingId: primaryCarId || undefined,
          carListingIds: payloadCarIds.length ? payloadCarIds : undefined,
          tracking: payload.meta || undefined,
          telegram: {
            userId: String(from.id),
            username: telegramUsername,
            name: telegramName
          }
        });
        pendingIntentCreated = true;
      } catch {
        pendingIntentCreated = false;
      }
    }

    if (!pendingIntentCreated) {
      ctx.session = await prisma.botSession.update({
        where: { id: ctx.session.id },
        data: {
          state: 'CL_MINIAPP_CONTACT',
          variables: {
            ...((ctx.session.variables as any) || {}),
            miniappPendingIntent: null,
            miniappInterestDraft: {
              title: requestTitle,
              carId: primaryCarId || undefined,
              carIds: payloadCarIds.length ? payloadCarIds : undefined,
              meta: payload.meta || undefined
            }
          },
          lastActive: new Date()
        }
      });
    }

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
        meta: payload.meta || undefined
      }
    });
    await sendMessage(ctx, t(lang, 'miniapp.interest.ask_contact', { car: requestTitle }), {
      keyboard: [[{ text: '📱 Поділитися контактом', request_contact: true }], [{ text: '⬅️ Назад' }]],
      resize_keyboard: true,
      one_time_keyboard: true
    });
    return true;
  }

  if (payload.type === 'fav_toggle') {
    const tgUserId = String(from?.id || ctx.userId || '').trim();
    const visitorId = String((payload.meta as any)?.visitorId || '').trim();
    if (!tgUserId && !visitorId) {
      await sendMessage(ctx, '⚠️ Не вдалося визначити користувача для обраного.');
      return true;
    }

    if (!primaryCarId) {
      await sendMessage(ctx, '⚠️ Не вказано авто для зміни обраного.');
      return true;
    }

    const listing = await prisma.carListing.findUnique({
      where: { id: primaryCarId },
      select: { id: true, companyId: true }
    });
    if (!listing) {
      await sendMessage(ctx, '⚠️ Авто не знайдено.');
      return true;
    }

    const companyId = ctx.companyId || ctx.bot.companyId || listing.companyId;
    if (!companyId) {
      await sendMessage(ctx, '⚠️ Не вдалося визначити компанію для обраного.');
      return true;
    }

    const existing = await prisma.miniAppFavorite.findFirst({
      where: {
        companyId,
        ...(tgUserId ? { tgUserId } : { visitorId }),
        carListingId: listing.id
      }
    });
    if (existing) {
      await prisma.miniAppFavorite.delete({ where: { id: existing.id } });
      await sendMessage(ctx, '🗑 Авто прибрано з обраного.');
    } else {
      await prisma.miniAppFavorite.create({
        data: {
          companyId,
          tgUserId: tgUserId || null,
          visitorId: visitorId || null,
          carListingId: listing.id
        }
      });
      await sendMessage(ctx, '⭐ Авто додано в обране.');
    }

    await emitPlatformEvent({
      companyId: ctx.companyId,
      botId: ctx.bot.id,
      eventType: 'miniapp.submitted',
      userId: ctx.userId,
      chatId: ctx.chatId,
      payload: {
        type: payload.type,
        carId: primaryCarId,
        visitorId: visitorId || undefined,
        valid: true
      }
    });
    return true;
  }

  const name = fields.name || fields.firstName || fields.fullName || 'Client';
  const phone = normalizePhone(fields.phone || fields.tel || undefined);
  const brand = await normalizeBrand(fields.brand || '', { companyId: ctx.companyId });
  const model = await normalizeModel(fields.model || '', { companyId: ctx.companyId, brand: brand || null });
  const city = await normalizeCity(fields.city || '', { companyId: ctx.companyId });
    const selectedCars = payloadCarIds.length
      ? await prisma.carListing.findMany({
        where: { id: { in: payloadCarIds }, ...(ctx.companyId || ctx.bot.companyId ? { companyId: ctx.companyId || ctx.bot.companyId } : {}) },
      select: { id: true, title: true, price: true, currency: true, year: true }
    })
    : [];
  const selectedCarsMap = new Map(selectedCars.map((car) => [car.id, car]));
  const selectedCarsOrdered = payloadCarIds.map((id) => selectedCarsMap.get(id)).filter((item): item is typeof selectedCars[number] => Boolean(item));

  let requestTitle = [brand, model].filter(Boolean).join(' ').trim();
    if (!requestTitle && primaryCarId) {
      const car = await prisma.carListing.findFirst({
        where: { id: primaryCarId, ...(ctx.companyId || ctx.bot.companyId ? { companyId: ctx.companyId || ctx.bot.companyId } : {}) }
      });
    if (car) requestTitle = car.title || requestTitle;
  }
  if (!requestTitle && selectedCarsOrdered.length === 1) {
    requestTitle = selectedCarsOrdered[0].title || requestTitle;
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
      carIds: payloadCarIds.length ? payloadCarIds : undefined,
      selectedCars: selectedCarsOrdered
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
    const displayName = String(telegramName || name || 'Клієнт').trim() || 'Клієнт';
    const username = String(telegramUsername || '').trim().replace(/^@/, '');
    const tgUserId = String((payload.meta as any)?.tgUserId || from?.id || ctx.userId || ctx.chatId || '').trim();
    const userLink = username ? `https://t.me/${username}` : (tgUserId ? `tg://user?id=${tgUserId}` : '—');
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
    const selectedLines = selectedCarsOrdered.length
      ? [
        '🚗 Обрані авто:',
        ...selectedCarsOrdered.map((car, idx) => `${idx + 1}. ${car.title} ${car.year || ''} — ${car.price || '—'} ${car.currency || 'USD'}`)
      ]
      : (payloadCarIds.length > 1 ? [`🚗 Обрано авто: ${payloadCarIds.length}`] : []);
    await sendMessage(
      ctx,
      [
        header,
        `Тип payload: ${payload.type}`,
        `👤 ${displayName}`,
        `username: ${username ? `@${username}` : '—'}`,
        `tgUserId: ${tgUserId || '—'}`,
        `🔗 ${userLink}`,
        ...selectedLines,
        '',
        leadCard,
        reqCard || ''
      ].filter(Boolean).join('\n'),
      undefined,
      String(ctx.bot.adminChatId)
    );
  }

  return true;
};
