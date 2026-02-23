import { prisma } from '../../../../../services/prisma.js';
import { mapVariantInput } from '../../../../../services/dto.js';
import { managerActionsKeyboard, renderRequestCard, renderVariantCard } from '../../../../../services/cardRenderer.js';
import { buildTelegramPhotoMedia, collectCarMediaSources } from '../../../telegram/core/utils/carMedia.js';
import { telegramOutbox } from '../../../telegram/messaging/outbox/telegramOutbox.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import type { BotRuntime } from '../types.js';
import { b2bRoutingService } from '../../../../../services/b2bRouting.service.js';

export const notifyRequestAdmin = async (bot: BotRuntime, request: any) => {
  const partnerText = `[B2B REQUEST]\n📄 Новий запит\n${renderRequestCard(request, { includeContact: false })}`;
  const adminText = `[B2B REQUEST]\n📄 Новий запит\n${renderRequestCard(request, { includeContact: true })}`;
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔍 Znayty Variant', callback_data: `REQ:${request.id}:FIND` }],
      [{ text: '📢 Post to Channel', callback_data: `REQ:${request.id}:POST` }],
      [{ text: '❌ Close', callback_data: `REQ:${request.id}:CLOSE` }]
    ]
  };
  await b2bRoutingService.notifyQueues({
    companyId: bot.companyId || null,
    sourceBotId: bot.id,
    sourceBotToken: bot.token,
    sourceBotAdminChatId: bot.adminChatId || null,
    requesterPartnerId: request.requesterPartnerId || null,
    text: partnerText,
    centralText: adminText,
    sourceAdminText: adminText,
    replyMarkup: keyboard,
    includeSourceAdminFallback: true
  });
};

export const createCarCardKeyboard = (car: any, lang: string) => {
  const t = {
    EN: { addToRequest: '➕ Додати в запит', viewCatalog: '📋 В каталог', openSource: '🔗 Відкрити джерело (URL)' },
    UK: { addToRequest: '➕ Додати в запит', viewCatalog: '📋 В каталог', openSource: '🔗 Відкрити джерело (URL)' },
    RU: { addToRequest: '➕ Добавить в запрос', viewCatalog: '📋 В каталог', openSource: '🔗 Открыть источник (URL)' }
  } as const;

  const loc = t[lang as keyof typeof t] || t.EN;
  return {
    inline_keyboard: [
      [{ text: loc.addToRequest, callback_data: `CAR:ADD_REQUEST:${car.canonicalId}` }],
      [
        { text: loc.viewCatalog, callback_data: `CAR:ADD_CATALOG:${car.canonicalId}` },
        { text: loc.openSource, url: car.sourceUrl }
      ]
    ]
  };
};

export const mapDbCar = (car: any) => ({
  canonicalId: car.id,
  sourceId: car.sourceId || undefined,
  source: car.source || 'INTERNAL',
  sourceUrl: car.sourceUrl || '',
  title: car.title,
  price: { amount: car.price, currency: car.currency || 'USD' },
  year: car.year,
  mileage: car.mileage,
  location: car.location || '',
  thumbnail: car.thumbnail || '',
  mediaUrls: car.mediaUrls || [],
  specs: car.specs || {},
  status: car.status || 'AVAILABLE',
  postedAt: car.postedAt?.toISOString?.() || car.createdAt?.toISOString?.() || new Date().toISOString()
});

export const createVariantAndRoute = async (params: {
  bot: BotRuntime;
  requestRef: string;
  chatId: string;
  userId?: string;
  variantInput: Record<string, any>;
  textForLog?: string;
  payloadForLog?: Record<string, any>;
  photoFileIds?: string[];
}) => {
  const request = await prisma.b2bRequest.findFirst({
    where: {
      OR: [{ id: params.requestRef }, { publicId: params.requestRef }]
    }
  });

  if (!request) {
    return { ok: false as const, reason: 'REQUEST_NOT_FOUND' };
  }

  const mapped = mapVariantInput({
    ...params.variantInput,
    status: params.variantInput.status || 'SUBMITTED',
    statusHistory: params.variantInput.statusHistory || [
      { status: 'SUBMITTED', at: new Date().toISOString(), by: params.userId || params.chatId }
    ]
  });

  const variant = await prisma.requestVariant.create({
    data: {
      ...mapped,
      requestId: request.id
    }
  });

  await prisma.messageLog.create({
    data: {
      requestId: request.id,
      variantId: variant.id,
      botId: params.bot.id,
      chatId: params.chatId,
      direction: 'INCOMING',
      text: params.textForLog || '',
      payload: params.payloadForLog || {}
    }
  }).catch(() => null);

  const mergeUniqueMedia = (...groups: string[][]) => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const group of groups) {
      for (const raw of group) {
        const item = String(raw || '').trim();
        if (!item || seen.has(item)) continue;
        seen.add(item);
        merged.push(item);
        if (merged.length >= 10) return merged;
      }
    }
    return merged;
  };

  const submittedMedia = (params.photoFileIds || []).map(v => String(v || '').trim()).filter(Boolean);
  const variantMedia = mergeUniqueMedia(
    submittedMedia,
    collectCarMediaSources({
      thumbnail: (variant as any).thumbnail,
      mediaUrls: (variant as any).mediaUrls || [],
      mediaItems: (variant as any).mediaItems || []
    }, 10)
  );

  if (request.chatId) {
    const specsWithoutContact = variant.specs
      ? { ...(variant.specs as any), contact: undefined, companyName: undefined }
      : {};
    const requesterCard = renderVariantCard({
      ...variant,
      contact: undefined,
      companyName: undefined,
      specs: specsWithoutContact
    } as any);
    const requesterActions = {
      inline_keyboard: [
        [
          { text: '✅ Підходить', callback_data: `B2BVAR:${variant.id}:FIT` },
          { text: '❌ Не підходить', callback_data: `B2BVAR:${variant.id}:NO` }
        ]
      ]
    };

    const requesterCaption = `🚗 Новий варіант для вашого запиту "${request.title}":\n\n${requesterCard}`;
    const requesterChatId = String(request.chatId);
    if (variantMedia.length > 1) {
      await telegramOutbox.sendMediaGroup({
        botId: params.bot.id,
        token: params.bot.token,
        chatId: requesterChatId,
        media: buildTelegramPhotoMedia(variantMedia, requesterCaption),
        companyId: params.bot.companyId || null
      });
      await sendMessage(params.bot, requesterChatId, '⬇️ Оберіть рішення по варіанту:', requesterActions);
    } else if (variantMedia.length === 1) {
      await telegramOutbox.sendPhoto({
        botId: params.bot.id,
        token: params.bot.token,
        chatId: requesterChatId,
        photo: variantMedia[0],
        caption: requesterCaption,
        replyMarkup: requesterActions,
        companyId: params.bot.companyId || null
      });
    } else {
      await sendMessage(params.bot, requesterChatId, requesterCaption, requesterActions);
    }
  }

  if (params.bot.adminChatId) {
    const adminCaption = `[B2B REQUEST]\n📨 Новий варіант по запиту ${request.publicId || request.id}\n${renderVariantCard(variant as any, { includeContact: true })}`;
    if (variantMedia.length > 1) {
      await telegramOutbox.sendMediaGroup({
        botId: params.bot.id,
        token: params.bot.token,
        chatId: String(params.bot.adminChatId),
        media: buildTelegramPhotoMedia(variantMedia, adminCaption),
        companyId: params.bot.companyId || null
      }).catch(() => null);
      await sendMessage(params.bot, String(params.bot.adminChatId), 'Дії з варіантом:', managerActionsKeyboard(variant.id));
    } else if (variantMedia.length === 1) {
      await telegramOutbox.sendPhoto({
        botId: params.bot.id,
        token: params.bot.token,
        chatId: String(params.bot.adminChatId),
        photo: variantMedia[0],
        caption: adminCaption,
        replyMarkup: managerActionsKeyboard(variant.id),
        companyId: params.bot.companyId || null
      }).catch(() => null);
    } else {
      await sendMessage(params.bot, String(params.bot.adminChatId), adminCaption, managerActionsKeyboard(variant.id));
    }
  }

  const partnerCaption = `[B2B REQUEST]\n📨 Новий варіант по запиту ${request.publicId || request.id}\n${renderVariantCard(variant as any, { includeContact: false })}`;
  const adminCaption = `[B2B REQUEST]\n📨 Новий варіант по запиту ${request.publicId || request.id}\n${renderVariantCard(variant as any, { includeContact: true })}`;
  await b2bRoutingService.notifyQueues({
    companyId: params.bot.companyId || null,
    sourceBotId: params.bot.id,
    sourceBotToken: params.bot.token,
    requesterPartnerId: request.requesterPartnerId || null,
    text: partnerCaption,
    centralText: adminCaption,
    sourceAdminText: adminCaption,
    replyMarkup: managerActionsKeyboard(variant.id)
  });

  return {
    ok: true as const,
    request,
    variant
  };
};
