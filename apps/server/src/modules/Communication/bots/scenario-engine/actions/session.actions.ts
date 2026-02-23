import { prisma } from '../../../../../services/prisma.js';
import { mapVariantInput } from '../../../../../services/dto.js';
import { createDeepLinkKeyboard, generateRequestLink } from '../../../../../utils/deeplink.utils.js';
// @ts-ignore
import { createOrMergeLead } from '../../../telegram/core/leadService.js';
import { externalSearchService } from '../../../../Integrations/external-search/externalSearch.service.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import { createCarCardKeyboard } from './b2b.actions.js';
import { sendCarCardWithMedia } from './car-card.actions.js';
import { getBotUsername, getLanguage, mapRequestForMessage } from '../runtime/helpers.js';
import type { BotRuntime } from '../types.js';

export const resolveRequestId = async (vars: Record<string, any>) => {
  const refId = vars.requestId || vars.requestPublicId || vars.ref_request_id;
  if (!refId) return null;
  const request = await prisma.b2bRequest.findFirst({
    where: { OR: [{ id: refId }, { publicId: refId }] }
  });
  return request?.id || null;
};

export const handleCarSelection = async (
  bot: BotRuntime,
  chatId: string,
  vars: Record<string, any>,
  carId: string,
  userId?: string
) => {
  const inventory = await prisma.carListing.findMany({ where: { id: carId } });
  const car = inventory[0];
  await createOrMergeLead({
    botId: bot.id,
    companyId: bot.companyId || null,
    chatId,
    userId,
    name: vars.name || vars.first_name || `User ${chatId}`,
    phone: vars.phone,
    request: car?.title || carId,
    source: 'TELEGRAM',
    payload: { goal: `Selected: ${car?.title || carId}`, language: vars.language },
    leadType: 'BUY',
    createRequest: false
  }, bot.config);
  const lang = getLanguage(vars);
  const msg = lang === 'UK' ? '✅ Заявку прийнято!' : '✅ Request received!';
  await sendMessage(bot, chatId, msg);
};

export const handleAddToRequest = async (
  bot: BotRuntime,
  chatId: string,
  vars: Record<string, any>,
  carId: string
) => {
  const lang = getLanguage(vars);
  const requestId = await resolveRequestId(vars);
  if (!requestId) {
    const msg = lang === 'UK' ? '⚠️ Немає активного запиту для додавання авто.' : '⚠️ No active request to attach this car.';
    await sendMessage(bot, chatId, msg);
    return;
  }

  const temp = Array.isArray(vars.__tempResults) ? vars.__tempResults : [];
  const fromResults = temp.find((c: any) => c.canonicalId === carId);
  const car = fromResults || await prisma.carListing.findUnique({ where: { id: carId } });
  if (!car) {
    await sendMessage(bot, chatId, '⚠️ Car not found.');
    return;
  }

  const mapped = mapVariantInput({
    title: car.title,
    price: car.price?.amount ?? car.price,
    year: car.year,
    mileage: car.mileage,
    location: car.location,
    thumbnail: car.thumbnail,
    mediaUrls: car.mediaUrls || [],
    mediaItems: car.mediaItems || [],
    url: car.sourceUrl,
    sourceUrl: car.sourceUrl,
    source: car.source,
    specs: car.specs,
    status: 'PENDING',
    statusHistory: [{ status: 'PENDING', at: new Date().toISOString(), by: chatId }]
  });

  await prisma.requestVariant.create({
    data: {
      ...mapped,
      requestId
    }
  });

  const msg = lang === 'UK' ? '✅ Додано в запит.' : '✅ Added to request.';
  await sendMessage(bot, chatId, msg);
};

export const handleAddToCatalog = async (
  bot: BotRuntime,
  chatId: string,
  vars: Record<string, any>,
  carId: string
) => {
  const lang = getLanguage(vars);
  const existing = await prisma.carListing.findUnique({ where: { id: carId } });
  if (existing) {
    const msg = lang === 'UK' ? 'ℹ️ Авто вже в каталозі.' : 'ℹ️ Car is already in catalog.';
    await sendMessage(bot, chatId, msg);
    return;
  }

  const temp = Array.isArray(vars.__tempResults) ? vars.__tempResults : [];
  const fromResults = temp.find((c: any) => c.canonicalId === carId);
  if (!fromResults) {
    await sendMessage(bot, chatId, '⚠️ Car not found.');
    return;
  }

  await prisma.carListing.create({
    data: {
      id: fromResults.canonicalId,
      source: fromResults.source || 'MANUAL',
      sourceUrl: fromResults.sourceUrl || null,
      title: fromResults.title,
      price: typeof fromResults.price === 'object' ? fromResults.price?.amount || 0 : fromResults.price || 0,
      currency: typeof fromResults.price === 'object' ? fromResults.price?.currency || 'USD' : 'USD',
      year: fromResults.year || 0,
      mileage: fromResults.mileage || 0,
      location: fromResults.location || null,
      thumbnail: fromResults.thumbnail || null,
      mediaUrls: fromResults.mediaUrls || [],
      specs: fromResults.specs || {},
      status: 'AVAILABLE',
      companyId: bot.companyId || null
    }
  });

  const msg = lang === 'UK' ? '✅ Додано в каталог.' : '✅ Added to catalog.';
  await sendMessage(bot, chatId, msg);
};

export const handleManagerRequestAction = async (
  bot: BotRuntime,
  session: any,
  data: string,
  _userId?: string
) => {
  const [_, reqId, action] = data.split(':');
  const chatId = session.chatId;

  if (action === 'CLOSE') {
    await prisma.b2bRequest.update({
      where: { id: reqId },
      data: { status: 'CLOSED' as any }
    });
    await sendMessage(bot, chatId, '✅ Request closed.');
    return;
  }

  if (action === 'POST') {
    const req = await prisma.b2bRequest.findUnique({ where: { id: reqId } });
    if (!req) return;

    const text = mapRequestForMessage(req);
    if (bot.channelId) {
      const username = getBotUsername(bot) || 'CarTieBot';
      const link = generateRequestLink(username, req.publicId || req.id);
      const keyboard = createDeepLinkKeyboard([{ text: '💼 Створити пропозицію', link }]);
      await sendMessage(bot, bot.channelId, text, keyboard);
      await sendMessage(bot, chatId, '✅ Posted to channel.');
    } else {
      await sendMessage(bot, chatId, '⚠️ Channel ID not configured.');
    }
    return;
  }

  if (action === 'FIND') {
    const req = await prisma.b2bRequest.findUnique({ where: { id: reqId } });
    if (!req) return;

    await sendMessage(bot, chatId, '🔍 Шукаю варіанти...');
    const [brandRaw, modelRaw] = String(req.title || '').split(/\\s+/);
    const results = await externalSearchService.searchAndPersist({
      brand: brandRaw,
      model: modelRaw,
      city: req.city || undefined,
      yearMin: req.yearMin || undefined,
      budgetMax: req.budgetMax || undefined
    }, {
      companyId: bot.companyId || null,
      maxResults: 6
    });

    if (results.length === 0) {
      await sendMessage(bot, chatId, '⚠️ Нічого не знайдено.');
      return;
    }

    for (const item of results.slice(0, 3)) {
      const car = {
        canonicalId: item.id,
        sourceId: undefined,
        source: item.source,
        sourceUrl: item.sourceUrl,
        title: item.title,
        price: { amount: item.price, currency: item.currency || 'USD' },
        year: item.year,
        mileage: item.mileage,
        location: item.location,
        thumbnail: item.thumbnail,
        mediaUrls: item.mediaUrls || [],
        specs: item.specs || {},
        status: item.status || 'HIDDEN',
        postedAt: new Date().toISOString()
      };
      const keyboard = createCarCardKeyboard(car, 'UK');
      await sendCarCardWithMedia({
        bot,
        chatId,
        car,
        lang: 'UK',
        replyMarkup: keyboard
      });
    }
  }
};
