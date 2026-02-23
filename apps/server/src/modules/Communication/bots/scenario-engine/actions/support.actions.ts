import { supportTicketService } from '../../../../../services/supportTicket.service.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import { startFormFlow, type FormSubmission } from './form.actions.js';
import type { BotRuntime } from '../types.js';

const cleanText = (value: unknown) => String(value || '').trim();

const supportChoiceKeyboard = {
  inline_keyboard: [
    [{ text: 'Доповнити попередній', callback_data: 'SUPPORT:APPEND' }],
    [{ text: 'Створити новий', callback_data: 'SUPPORT:NEW' }]
  ]
};

const ensureSupportContext = (vars: Record<string, any>) => {
  if (!vars.supportContext || typeof vars.supportContext !== 'object' || Array.isArray(vars.supportContext)) {
    vars.supportContext = {};
  }
  return vars.supportContext as Record<string, any>;
};

const startSupportForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
  mode: 'append' | 'new';
}) => {
  const ctx = ensureSupportContext(params.vars);
  ctx.mode = params.mode;

  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'support_form',
    namespace: 'SUPPORT',
    title: params.mode === 'append' ? 'Підтримка (доповнення)' : 'Підтримка (новий тікет)',
    confirmAction: 'SUPPORT:FORM_SUBMIT',
    fields: [
      { key: 'message', label: 'Текст звернення', prompt: 'Опишіть проблему або питання:', type: 'text' },
      { key: 'contact', label: 'Контакт', prompt: 'Поділіться контактом або введіть номер телефону:', type: 'contact' }
    ]
  });
};

export const startSupportFlow = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
  userId?: string;
}) => {
  const tgUserId = cleanText(params.userId || params.vars.__telegramUserId || params.chatId);
  const open = await supportTicketService.findOpenByTgUser({
    companyId: params.bot.companyId || null,
    tgUserId
  });

  const ctx = ensureSupportContext(params.vars);
  ctx.openTicketId = open?.id || null;

  if (open) {
    await sendMessage(
      params.bot,
      params.chatId,
      `У вас вже є відкритий тікет #${open.id}. Оберіть дію:`,
      supportChoiceKeyboard
    );
    return;
  }

  await startSupportForm({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars,
    mode: 'new'
  });
};

export const handleSupportCallback = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
  callbackData: string;
}) => {
  if (!params.callbackData.startsWith('SUPPORT:')) return false;

  if (params.callbackData === 'SUPPORT:APPEND') {
    await startSupportForm({
      bot: params.bot,
      chatId: params.chatId,
      vars: params.vars,
      mode: 'append'
    });
    return true;
  }

  if (params.callbackData === 'SUPPORT:NEW') {
    await startSupportForm({
      bot: params.bot,
      chatId: params.chatId,
      vars: params.vars,
      mode: 'new'
    });
    return true;
  }

  return false;
};

export const submitSupportForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
  submission: FormSubmission;
}) => {
  if (params.submission.namespace !== 'SUPPORT') return false;

  if (params.submission.status === 'CANCELLED') {
    await sendMessage(params.bot, params.chatId, 'Звернення в підтримку скасовано.');
    return true;
  }

  const values = params.submission.values || {};
  const message = cleanText(values.message);
  const contact = cleanText(values.contact);
  if (!message || !contact) {
    await sendMessage(params.bot, params.chatId, '⚠️ Вкажіть текст звернення і контакт.');
    return true;
  }

  const tgUserId = cleanText(params.userId || params.vars.__telegramUserId || params.chatId);
  const context = ensureSupportContext(params.vars);

  let ticket;
  if (context.mode === 'append' && context.openTicketId) {
    ticket = await supportTicketService.appendTicket({
      ticketId: String(context.openTicketId),
      text: message,
      context: {
        contact,
        tgUserId,
        chatId: params.chatId
      }
    });
  }

  if (!ticket) {
    ticket = await supportTicketService.createTicket({
      companyId: params.bot.companyId || null,
      botId: params.bot.id,
      tgUserId,
      chatId: params.chatId,
      text: message,
      context: {
        contact,
        tgUserId,
        chatId: params.chatId
      }
    });
  }

  await sendMessage(params.bot, params.chatId, `✅ Звернення прийнято. ID тікета: ${ticket.id}`);

  if (params.bot.adminChatId) {
    const adminText = [
      '[SUPPORT]',
      `Ticket: ${ticket.id}`,
      `TG User ID: ${tgUserId}`,
      `Chat ID: ${params.chatId}`,
      `Контакт: ${contact}`,
      '',
      message
    ].join('\n');

    await sendMessage(params.bot, String(params.bot.adminChatId), adminText);
  }

  delete params.vars.supportContext;
  return true;
};
