import { renderCarCardForBot } from '../../../../../services/carCardRenderer.v2.js';
import { buildTelegramPhotoMedia, collectCarMediaSources } from '../../../telegram/core/utils/carMedia.js';
import { telegramOutbox } from '../../../telegram/messaging/outbox/telegramOutbox.js';
import { sendMessage, sendPhoto } from '../adapters/telegram.adapter.js';
import type { BotRuntime } from '../types.js';

type SendCarCardParams = {
  bot: BotRuntime;
  chatId: string;
  car: any;
  lang?: string;
  replyMarkup?: any;
  showcaseSlug?: string;
  actionsPromptText?: string;
};

export const sendCarCardWithMedia = async (params: SendCarCardParams) => {
  const caption = await renderCarCardForBot({
    car: params.car,
    lang: params.lang || 'UK',
    companyId: params.bot.companyId || null,
    botId: params.bot.id,
    showcaseSlug: params.showcaseSlug
  });

  const media = collectCarMediaSources(params.car, 10);
  if (media.length > 1) {
    await telegramOutbox.sendMediaGroup({
      botId: params.bot.id,
      token: params.bot.token,
      chatId: params.chatId,
      media: buildTelegramPhotoMedia(media, caption),
      companyId: params.bot.companyId || null
    });

    if (params.replyMarkup) {
      await sendMessage(params.bot, params.chatId, params.actionsPromptText || '⬇️ Дії з авто:', params.replyMarkup);
    }
    return;
  }

  if (media.length === 1) {
    await sendPhoto(params.bot, params.chatId, media[0], caption, params.replyMarkup);
    return;
  }

  await sendMessage(params.bot, params.chatId, caption, params.replyMarkup);
};
