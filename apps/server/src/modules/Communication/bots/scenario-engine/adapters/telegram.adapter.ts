import { telegramOutbox } from '../../../telegram/messaging/outbox/telegramOutbox.js';
import type { BotRuntime, ReplyKeyboardButton } from '../types.js';
import { resolveReplyMarkupForChat } from '../../../telegram/core/utils/telegramReplyMarkup.js';

export const sendMessage = async (bot: BotRuntime, chatId: string, text: string, replyMarkup?: any) => {
  const normalizedReplyMarkup = resolveReplyMarkupForChat({
    replyMarkup,
    bot,
    chatId
  });
  return telegramOutbox.sendMessage({
    botId: bot.id,
    token: bot.token,
    chatId,
    text,
    replyMarkup: normalizedReplyMarkup,
    companyId: bot.companyId || null
  });
};

export const sendPhoto = async (bot: BotRuntime, chatId: string, photo: string, caption: string, replyMarkup?: any) => {
  const normalizedReplyMarkup = resolveReplyMarkupForChat({
    replyMarkup,
    bot,
    chatId
  });
  return telegramOutbox.sendPhoto({
    botId: bot.id,
    token: bot.token,
    chatId,
    photo,
    caption,
    replyMarkup: normalizedReplyMarkup,
    companyId: bot.companyId || null
  });
};

export const answerCallback = async (bot: BotRuntime, callbackId: string, text?: string) => {
  await telegramOutbox.answerCallback({ token: bot.token, callbackId, text });
};

export const sendChatAction = async (bot: BotRuntime, chatId: string, action = 'typing') => {
  await telegramOutbox.sendChatAction({
    botId: bot.id,
    token: bot.token,
    chatId,
    action,
    companyId: bot.companyId || null
  });
};

export const sendReplyKeyboard = async (bot: BotRuntime, chatId: string, text: string, keyboard: ReplyKeyboardButton[][]) => {
  if (!keyboard.length) {
    return sendMessage(bot, chatId, text);
  }
  return sendMessage(bot, chatId, text, { keyboard, resize_keyboard: true, one_time_keyboard: false });
};

export const sendContactRequest = async (bot: BotRuntime, chatId: string, text: string) => {
  return sendMessage(bot, chatId, text, {
    keyboard: [[{ text: '📱 Share Contact', request_contact: true }]],
    resize_keyboard: true
  });
};

export const sendChoices = async (bot: BotRuntime, chatId: string, text: string, choices: any[], lang: string, hasBack = false) => {
  const inline_keyboard = (choices || []).map(choice => {
    const label = (lang === 'UK' && choice.label_uk) ? choice.label_uk :
      (lang === 'RU' && choice.label_ru) ? choice.label_ru : choice.label;
    return [{ text: label || choice.label, callback_data: `SCN:CHOICE:${choice.value}` }];
  });

  if (hasBack) {
    const backTxt = lang === 'UK' ? '⬅️ Назад' : lang === 'RU' ? '⬅️ Назад' : '⬅️ Назад';
    inline_keyboard.push([{ text: backTxt, callback_data: 'CMD:BACK' }]);
  }

  return sendMessage(bot, chatId, text, { inline_keyboard });
};
