import { prisma } from '../../../../../services/prisma.js';
// @ts-ignore
import { createOrMergeLead } from '../../../telegram/core/leadService.js';
import { renderRequestCard } from '../../../../../services/cardRenderer.js';
import { generateRequestLink } from '../../../../../utils/deeplink.utils.js';
import { parseCarData } from '../../../../../services/enhanced-parsing.utils.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import {
  extractNumber,
  extractYear,
  generatePublicId,
  getBotUsername,
  normalizeOptionalText,
  normalizeRequestType
} from '../runtime/helpers.js';
import { createVariantAndRoute, notifyRequestAdmin } from './b2b.actions.js';
import { startLeadBuyFlow } from './client-buy.actions.js';
import { startLeadSellFlow } from './client-sell.actions.js';
import type { BotRuntime, ScenarioNode } from '../types.js';

export type ActionExecutionResult = 'continue' | 'halt';

interface ExecuteActionNodeContext {
  bot: BotRuntime;
  session: any;
  vars: Record<string, any>;
  node: ScenarioNode;
  text: string;
  scenarioId: string;
}

export const executeActionNode = async ({
  bot,
  session,
  vars,
  node,
  text,
  scenarioId
}: ExecuteActionNodeContext): Promise<ActionExecutionResult> => {
  const actionType = node.content?.actionType;

  if (actionType === 'SET_LANG') {
    const selectedLang = vars.language || vars.lang;
    const clean = String(selectedLang || '').includes('Ukra') || selectedLang === 'UK'
      ? 'UK'
      : String(selectedLang || '').includes('Russ') || selectedLang === 'RU'
        ? 'RU'
        : 'EN';
    vars.language = clean;
  }

  if (actionType === 'START_LEAD_BUY_FORM') {
    await startLeadBuyFlow({
      bot,
      chatId: session.chatId,
      vars
    });
    return 'halt';
  }

  if (actionType === 'START_LEAD_SELL_FORM') {
    await startLeadSellFlow({
      bot,
      chatId: session.chatId,
      vars
    });
    return 'halt';
  }

  if (actionType === 'NORMALIZE_REQUEST') {
    const rawBrand = vars.brandRaw || vars.brand;
    if (rawBrand) vars.brand = String(rawBrand).trim();
    if (vars.model) vars.model = String(vars.model).trim();
    if (vars.city) vars.city = String(vars.city).trim();
    if (vars.clientName) vars.clientName = String(vars.clientName).trim();
    if (vars.companyName) vars.companyName = String(vars.companyName).trim();
  }

  if (actionType === 'CHECK_DAILY_REQUEST_LIMIT') {
    const limitRaw = node.content?.limit || process.env.LEAD_REQUEST_DAILY_LIMIT || 3;
    const limit = Number(limitRaw);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await prisma.b2bRequest.count({
      where: {
        botId: bot.id,
        chatId: session.chatId,
        createdAt: { gte: since }
      }
    });
    vars.limit_reached = Number.isFinite(limit) ? count >= limit : false;
    vars.limit_remaining = Number.isFinite(limit) ? Math.max(limit - count, 0) : undefined;
  }

  if (actionType === 'CREATE_LEAD') {
    const leadTypeRaw = node.content?.leadType || vars.leadType || vars.requestType || vars.type;
    const leadType = normalizeRequestType(leadTypeRaw);
    const leadResult = await createOrMergeLead({
      botId: bot.id,
      companyId: bot.companyId || null,
      chatId: session.chatId,
      userId: vars.__telegramUserId || undefined,
      name: vars.clientName || vars.name || vars.first_name || vars.__telegramFirstName || 'Client',
      telegramUsername: vars.__telegramUsername,
      telegramName: [vars.__telegramFirstName, vars.__telegramLastName].filter(Boolean).join(' ') || undefined,
      phone: vars.phone,
      source: 'TELEGRAM',
      payload: { language: vars.language },
      leadType,
      createRequest: false
    }, bot.config);
    if (leadResult?.lead?.id) vars.leadId = leadResult.lead.id;
  }

  if (actionType === 'CREATE_REQUEST') {
    const requestType = normalizeRequestType(node.content?.requestType || vars.requestType || vars.type);
    const titleOverride = node.content?.requestTitle || vars.requestTitle;
    const baseTitle = `${vars.brand || ''} ${vars.model || ''}`.trim();
    const title = titleOverride || baseTitle || (requestType === 'SELL' ? 'Sell Request' : 'Buy Request');

    const budgetMin = extractNumber(vars.requestBudgetMin ?? vars.budgetMin);
    const budgetMax = extractNumber(vars.requestBudgetMax ?? vars.budgetMax ?? vars.budget ?? vars.price);
    const yearMin = extractYear(vars.requestYearMin ?? vars.yearMin ?? vars.year);
    const yearMax = extractYear(vars.requestYearMax ?? vars.yearMax);
    const city = normalizeOptionalText(vars.requestCity || vars.city);
    const requestContact = normalizeOptionalText(vars.contact || vars.phone);
    const requestCompanyName =
      normalizeOptionalText(vars.companyName || vars.clientName)
      || (vars.__telegramUsername ? `@${vars.__telegramUsername}` : undefined);
    const mileageRaw = normalizeOptionalText(vars.mileage || vars.requestMileage);
    const mileageMin = extractNumber(vars.requestMileageMin ?? vars.mileageMin);
    const mileageMax = extractNumber(vars.requestMileageMax ?? vars.mileageMax);
    const mileageText = normalizeOptionalText(vars.requestMileageText ?? vars.mileageText ?? mileageRaw);
    const fuel = normalizeOptionalText(vars.requestFuel ?? vars.fuel);
    const requestComment = normalizeOptionalText(vars.requestComment ?? vars.comment ?? vars.description);

    const details: string[] = [];
    if (mileageText) details.push(`Mileage: ${mileageText}`);
    if (normalizeOptionalText(vars.vin)) details.push(`VIN: ${normalizeOptionalText(vars.vin)}`);
    if (normalizeOptionalText(vars.color)) details.push(`Color: ${normalizeOptionalText(vars.color)}`);

    const descOverride = node.content?.requestDescription || vars.requestDescription;
    const tgUser = vars.__telegramUsername ? `@${vars.__telegramUsername}` : undefined;
    const tgName = [vars.__telegramFirstName, vars.__telegramLastName].filter(Boolean).join(' ');
    const description = descOverride || [
      `Via Bot. User: ${vars.clientName || vars.name || vars.first_name || tgName || ''}`.trim(),
      tgUser ? `Telegram: ${tgUser}` : null,
      vars.__telegramUserId ? `Telegram ID: ${vars.__telegramUserId}` : null,
      requestComment ? `Comment: ${requestComment}` : null,
      details.length ? details.join(' | ') : null
    ].filter(Boolean).join('\n');

    const status = node.content?.requestStatus || vars.requestStatus || 'COLLECTING_VARIANTS';
    if (!vars.leadId && vars.phone) {
      const leadResult = await createOrMergeLead({
        botId: bot.id,
        companyId: bot.companyId || null,
        chatId: session.chatId,
        userId: vars.__telegramUserId || undefined,
        name: vars.clientName || vars.name || vars.first_name || vars.__telegramFirstName || 'Client',
        telegramUsername: vars.__telegramUsername,
        telegramName: [vars.__telegramFirstName, vars.__telegramLastName].filter(Boolean).join(' ') || undefined,
        phone: vars.phone,
        source: 'TELEGRAM',
        payload: { language: vars.language },
        leadType: requestType,
        createRequest: false
      }, bot.config);
      if (leadResult?.lead?.id) vars.leadId = leadResult.lead.id;
    }

    const request = await prisma.b2bRequest.create({
      data: {
        title,
        description: description || null,
        budgetMin: budgetMin ?? null,
        budgetMax: budgetMax ?? null,
        yearMin: yearMin ?? null,
        yearMax: yearMax ?? null,
        city: city ? String(city) : null,
        type: requestType as any,
        status: status as any,
        chatId: session.chatId,
        language: vars.language,
        publicId: generatePublicId(),
        companyId: bot.companyId || null,
        botId: bot.id,
        leadId: vars.leadId || null,
        payload: {
          source: requestType === 'BUY' ? 'telegram_b2b' : 'telegram_flow',
          contact: requestContact || undefined,
          companyName: requestCompanyName || undefined,
          request: {
            mileageMin: mileageMin ?? undefined,
            mileageMax: mileageMax ?? undefined,
            mileageText: mileageText || undefined,
            fuel: fuel || undefined,
            comment: requestComment || undefined,
            contact: requestContact || undefined,
            companyName: requestCompanyName || undefined
          }
        }
      }
    });

    vars.requestId = request.publicId;
    vars.requestPublicId = request.publicId;
    await notifyRequestAdmin(bot, request);
  }

  if (actionType === 'CREATE_VARIANT') {
    const requestRef = String(
      vars.requestId
      || vars.requestPublicId
      || vars.ref_request_id
      || vars.offerRequestId
      || vars.ref_offer_id
      || ''
    ).trim();

    if (!requestRef) {
      await sendMessage(bot, session.chatId, '⚠️ Не знайдено запит для привʼязки варіанту. Відкрийте форму через кнопку "Є авто".');
      return 'halt';
    }

    const title = normalizeOptionalText(
      vars.offerTitle
      || vars.variantTitle
      || vars.title
      || vars.brand
      || vars.requestTitle
    ) || 'Пропозиція';
    const details = normalizeOptionalText(vars.offerComment || vars.comment || vars.details || vars.description);
    const priceValue = extractNumber(vars.offerPrice ?? vars.price ?? vars.budget);
    const currencyRaw = normalizeOptionalText(vars.offerCurrency || vars.currency);
    const year = extractYear(vars.offerYear ?? vars.year);
    const mileage = extractNumber(vars.offerMileage ?? vars.mileage);
    const fuel = normalizeOptionalText(vars.offerFuel || vars.fuel);
    const condition = normalizeOptionalText(vars.offerCondition || vars.condition);
    const transmission = normalizeOptionalText(vars.offerTransmission || vars.transmission);
    const drive = normalizeOptionalText(vars.offerDrive || vars.drive);
    const engine = normalizeOptionalText(vars.offerEngine || vars.engine);
    const color = normalizeOptionalText(vars.offerColor || vars.color);
    const vin = normalizeOptionalText(vars.offerVin || vars.vin)?.toUpperCase();
    const companyName = normalizeOptionalText(
      vars.offerCompanyName
      || vars.companyName
      || (vars.__telegramUsername ? `@${vars.__telegramUsername}` : undefined)
    );
    const contact = normalizeOptionalText(vars.offerContact || vars.contact || vars.phone);
    const location = normalizeOptionalText(vars.offerLocation || vars.city || vars.location);
    const sourceUrl = normalizeOptionalText(vars.offerUrl || vars.url || vars.sourceUrl);
    const photos = Array.isArray(vars.offerPhotos)
      ? vars.offerPhotos.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 10)
      : [];

    const requestForDup = await prisma.b2bRequest.findFirst({
      where: { OR: [{ id: requestRef }, { publicId: requestRef }] },
      select: { id: true }
    });
    const requestEntityId = requestForDup?.id;

    if (requestEntityId && sourceUrl) {
      const duplicateByUrl = await prisma.requestVariant.findFirst({
        where: { requestId: requestEntityId, sourceUrl }
      });
      if (duplicateByUrl) {
        await sendMessage(bot, session.chatId, '⚠️ Варіант з таким посиланням вже існує для цього запиту.');
        return 'halt';
      }
    }

    if (requestEntityId && vin) {
      const duplicateByVin = await prisma.requestVariant.findFirst({
        where: { requestId: requestEntityId, specs: { path: ['vin'], equals: vin } }
      }).catch(() => null);
      if (duplicateByVin) {
        await sendMessage(bot, session.chatId, '⚠️ Варіант з таким VIN вже існує для цього запиту.');
        return 'halt';
      }
    }

    const parsed = parseCarData([
      title,
      details,
      fuel,
      condition
    ].filter(Boolean).join('\n'));

    const variantRes = await createVariantAndRoute({
      bot,
      requestRef,
      chatId: session.chatId,
      userId: vars.__telegramUserId,
      variantInput: {
        title,
        source: 'DEALER',
        sourceUrl,
        status: 'SUBMITTED',
        specs: {
          note: details,
          vin: vin || parsed.vin,
          fuel: fuel || parsed.fuel,
          condition: condition || parsed.condition,
          transmission: transmission || parsed.transmission,
          drive: drive || parsed.drive,
          engine: engine || parsed.engine,
          color: color || parsed.color
        },
        companyName,
        contact,
        mediaUrls: [],
        mediaItems: photos.map(fileId => ({ tgFileId: fileId, source: 'TELEGRAM_BOT' })),
        year: year || parsed.year,
        price: (priceValue || parsed.price)
          ? { amount: priceValue || parsed.price, currency: currencyRaw || parsed.currency || 'USD' }
          : undefined,
        mileage: mileage || parsed.mileage,
        location: location || parsed.location,
        thumbnail: photos[0]
      },
      textForLog: details || title,
      payloadForLog: {
        fromAction: actionType,
        requestRef,
        vin,
        sourceUrl,
        photos,
        title
      },
      photoFileIds: photos
    });

    if (!variantRes.ok) {
      await sendMessage(bot, session.chatId, '⚠️ Не вдалося зберегти варіант: запит не знайдено.');
      return 'halt';
    }

    vars.variantId = variantRes.variant.id;
    await sendMessage(bot, session.chatId, '✅ Варіант надіслано. Автор запиту отримає картку без контактів.');
  }

  if (actionType === 'B2B_PUBLISH_REQUEST') {
    const requestRef = vars.requestId || vars.requestPublicId;
    const username = getBotUsername(bot);
    const destination = node.content?.destinationId || bot.channelId;
    if (!requestRef || !username || !destination) {
      await sendMessage(bot, session.chatId, '⚠️ Не вдалося опублікувати запит (перевірте channel/username).');
      return 'halt';
    }

    const request = await prisma.b2bRequest.findFirst({
      where: { OR: [{ id: requestRef }, { publicId: requestRef }] }
    });
    if (!request) {
      await sendMessage(bot, session.chatId, '⚠️ Запит не знайдено для публікації.');
      return 'halt';
    }

    const requestText = [
      '📝 <b>Новий запит на авто</b>',
      renderRequestCard(request),
      '',
      'Натисніть кнопку нижче, якщо маєте варіант.'
    ].join('\n');
    const deepLink = generateRequestLink(username, request.publicId || request.id);
    const sent = await sendMessage(bot, String(destination), requestText, {
      inline_keyboard: [[{ text: 'Є авто ✅', url: deepLink }]]
    });

    const messageId = (sent as any)?.message_id;
    if (messageId) {
      await prisma.channelPost.create({
        data: {
          requestId: request.id,
          botId: bot.id,
          channelId: String(destination),
          messageId,
          status: 'ACTIVE',
          payload: {
            deeplink: deepLink,
            publicId: request.publicId || request.id,
            postedAt: new Date().toISOString()
          }
        }
      }).catch(() => null);
    }

    await prisma.messageLog.create({
      data: {
        requestId: request.id,
        botId: bot.id,
        chatId: String(destination),
        direction: 'OUTGOING',
        text: requestText,
        payload: {
          type: 'CHANNEL_PUBLISH',
          messageId: messageId || null,
          deeplink: deepLink
        }
      }
    }).catch(() => null);
  }

  if (actionType === 'LOOKUP_REQUEST') {
    const lookupVar = node.content?.lookupVar || 'lookup';
    const lookupInput = String(vars[lookupVar] || vars.requestId || vars.phone || '').trim();
    let found: any = null;
    if (lookupInput) {
      found = await prisma.b2bRequest.findFirst({
        where: {
          OR: [
            { publicId: lookupInput },
            { chatId: lookupInput },
            { title: { contains: lookupInput, mode: 'insensitive' } },
            { description: { contains: lookupInput, mode: 'insensitive' } }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });
    }
    vars.lookup_found = !!found;
    if (found) {
      vars.requestPublicId = found.publicId || found.id;
      vars.request_status = found.status;
      vars.request_manager = found.assignedTo || '—';
    }
  }

  if (actionType === 'NOTIFY_ADMIN' && bot.adminChatId) {
    const message = text || '🔔 Повідомлення';
    const prefixed = message.includes('[') ? message : `[SUPPORT] ${message}`;
    await sendMessage(bot, bot.adminChatId, prefixed);
  }

  // For unknown or successfully processed action types, proceed with scenario graph.
  return 'continue';
};
