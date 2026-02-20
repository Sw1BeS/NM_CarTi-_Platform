import { prisma } from '../../../../../services/prisma.js';
import { renderCarCardForBot } from '../../../../../services/carCardRenderer.v2.js';
import {
  createDeepLinkKeyboard,
  generateOfferLink,
  generateRequestLink
} from '../../../../../utils/deeplink.utils.js';
// @ts-ignore
import { searchAutoRia } from '../../../../Integrations/autoria.service.js';
import { sendMessage, sendPhoto } from '../adapters/telegram.adapter.js';
import { getBotUsername, mapRequestForMessage } from '../runtime/helpers.js';
import { mapDbCar } from './b2b.actions.js';
import type { BotRuntime, ScenarioNode } from '../types.js';

export type NodeExecutionResult = 'continue' | 'halt';

interface ScenarioNodeContext {
  bot: BotRuntime;
  session: any;
  vars: Record<string, any>;
  node: ScenarioNode;
  text: string;
  lang: string;
  scenarioId: string;
}

export const executeSearchCarsNode = async ({ vars }: Pick<ScenarioNodeContext, 'vars'>) => {
  const filter = {
    brand: vars.brand,
    model: vars.model,
    priceMax: Number(vars.budget || 0),
    yearMin: Number(vars.year || 0)
  };

  const internal = await prisma.carListing.findMany({
    where: {
      status: 'AVAILABLE',
      ...(filter.brand ? { title: { contains: String(filter.brand), mode: 'insensitive' } } : {}),
      ...(filter.priceMax ? { price: { lte: filter.priceMax } } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  let mapped = internal.map(mapDbCar);
  if (filter.model) {
    const key = String(filter.model).toLowerCase();
    mapped = mapped.filter(car => car.title.toLowerCase().includes(key));
  }

  let merged = mapped;
  if (mapped.length < 3) {
    const external = await searchAutoRia(filter);
    const seen = new Set(mapped.map(c => c.canonicalId || c.sourceUrl));
    const deduped = external.filter((car: any) => {
      const key = car.canonicalId || car.sourceUrl;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    merged = [...mapped, ...deduped];
  }

  vars.__tempResults = merged.slice(0, 5);
  vars.found_count = merged.length;
};

export const executeSearchFallbackNode = async ({ vars }: Pick<ScenarioNodeContext, 'vars'>) => {
  const filter = {
    brand: vars.brand,
    model: vars.model,
    priceMax: Number(vars.budget || 0),
    yearMin: Number(vars.year || 0)
  };

  const external = await searchAutoRia(filter);
  vars.__tempResults = external.slice(0, 5);
  vars.found_count = external.length;
};

export const executeChannelPostNode = async ({
  bot,
  session,
  vars,
  node,
  text,
  lang,
  scenarioId
}: ScenarioNodeContext): Promise<NodeExecutionResult> => {
  const destination = node.content?.destinationId
    || (node.content?.destinationVar ? vars[node.content.destinationVar] : undefined)
    || bot.channelId
    || bot.adminChatId;
  const imageUrl = node.content?.imageUrl
    || (node.content?.imageVar ? vars[node.content.imageVar] : undefined);
  const scheduledAt = node.content?.scheduledAt
    || (node.content?.scheduledAtVar ? vars[node.content.scheduledAtVar] : undefined);

  const fallbackCar = Array.isArray(vars.__tempResults) ? vars.__tempResults[0] : null;
  const postText = text || (fallbackCar ? await renderCarCardForBot({
    car: fallbackCar,
    lang,
    companyId: bot.companyId || null,
    botId: bot.id
  }) : '');

  if (!destination || !postText) {
    await sendMessage(bot, session.chatId, '⚠️ Channel post missing destination or text.');
    return 'halt';
  }

  if (scheduledAt) {
    await prisma.draft.create({
      data: {
        source: 'MANUAL',
        title: 'Scenario Post',
        description: postText,
        url: imageUrl || null,
        destination,
        scheduledAt: new Date(scheduledAt),
        status: 'SCHEDULED',
        botId: bot.id,
        metadata: { scenarioId, nodeId: node.id }
      }
    });
    await sendMessage(bot, session.chatId, '✅ Post scheduled.');
    return 'continue';
  }

  if (imageUrl) await sendPhoto(bot, destination, imageUrl, postText);
  else await sendMessage(bot, destination, postText);

  await prisma.draft.create({
    data: {
      source: 'MANUAL',
      title: 'Scenario Post',
      description: postText,
      url: imageUrl || null,
      destination,
      status: 'POSTED',
      postedAt: new Date(),
      botId: bot.id,
      metadata: { scenarioId, nodeId: node.id }
    }
  });

  return 'continue';
};

export const executeRequestBroadcastNode = async ({
  bot,
  session,
  vars,
  node,
  text
}: Omit<ScenarioNodeContext, 'lang' | 'scenarioId'> & Pick<ScenarioNodeContext, 'text'>): Promise<NodeExecutionResult> => {
  const destination = node.content?.destinationId
    || (node.content?.destinationVar ? vars[node.content.destinationVar] : undefined)
    || bot.channelId;
  const requestVar = node.content?.requestIdVar || 'requestId';
  const requestRef = vars[requestVar] || vars.requestId || vars.requestPublicId;
  const username = getBotUsername(bot);
  if (!destination || !requestRef || !username) {
    await sendMessage(bot, session.chatId, '⚠️ Broadcast missing destination, requestId, or bot username.');
    return 'halt';
  }

  const req = await prisma.b2bRequest.findFirst({
    where: { OR: [{ id: requestRef }, { publicId: requestRef }] },
    include: { variants: true }
  });
  if (!req) {
    await sendMessage(bot, session.chatId, '⚠️ Запит не знайдено.');
    return 'halt';
  }

  const messageText = text || mapRequestForMessage(req);
  const buttonText = node.content?.buttonText || '💼 Подати пропозицію';
  const link = generateRequestLink(username, req.publicId || req.id);
  const keyboard = createDeepLinkKeyboard([{ text: buttonText, link }]);
  const sent = await sendMessage(bot, destination, messageText, keyboard);
  const messageId = (sent as any)?.message_id;

  if (messageId) {
    await prisma.channelPost.create({
      data: {
        requestId: req.id,
        botId: bot.id,
        channelId: String(destination),
        messageId,
        status: 'ACTIVE',
        payload: {
          deeplink: link,
          source: 'scenario_request_broadcast'
        }
      }
    }).catch(() => null);
  }

  return 'continue';
};

export const executeOfferCollectNode = async ({
  bot,
  session,
  vars,
  node,
  text
}: Omit<ScenarioNodeContext, 'lang' | 'scenarioId'> & Pick<ScenarioNodeContext, 'text'>): Promise<NodeExecutionResult> => {
  const destination = node.content?.destinationId
    || (node.content?.dealerChatVar ? vars[node.content.dealerChatVar] : undefined)
    || (node.content?.destinationVar ? vars[node.content.destinationVar] : undefined);
  const requestVar = node.content?.requestIdVar || 'requestId';
  const requestRef = vars[requestVar] || vars.requestId || vars.requestPublicId;
  const username = getBotUsername(bot);
  if (!destination || !requestRef || !username) {
    await sendMessage(bot, session.chatId, '⚠️ Offer collect missing destination, requestId, or bot username.');
    return 'halt';
  }

  const req = await prisma.b2bRequest.findFirst({
    where: { OR: [{ id: requestRef }, { publicId: requestRef }] },
    include: { variants: true }
  });
  if (!req) {
    await sendMessage(bot, session.chatId, '⚠️ Запит не знайдено.');
    return 'halt';
  }

  const messageText = text || `💰 Запит: ${req.title}\n${req.description || ''}`.trim();
  const buttonText = node.content?.buttonText || '💰 Надіслати пропозицію';
  const link = generateOfferLink(username, req.publicId || req.id);
  const keyboard = createDeepLinkKeyboard([{ text: buttonText, link }]);
  await sendMessage(bot, destination, messageText, keyboard);

  return 'continue';
};
