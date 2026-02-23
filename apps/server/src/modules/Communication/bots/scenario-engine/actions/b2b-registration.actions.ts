import { b2bRegistrationService } from '../../../../../services/b2bRegistration.service.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import { startFormFlow, type FormSubmission } from './form.actions.js';
import type { BotRuntime } from '../types.js';
import { telegramInviteService } from '../../../telegram/core/telegramInvite.service.js';

type RegistrationDraft = {
  mode?: 'new_partner' | 'agent';
  companyName?: string;
  companyCity?: string | null;
  companyPhone?: string | null;
  companyNote?: string | null;
  partnerCode?: string;
  partnerName?: string;
};

const clean = (value: unknown) => String(value || '').trim();

const ensureDraft = (vars: Record<string, any>) => {
  if (!vars.b2bRegDraft || typeof vars.b2bRegDraft !== 'object' || Array.isArray(vars.b2bRegDraft)) {
    vars.b2bRegDraft = {};
  }
  return vars.b2bRegDraft as RegistrationDraft;
};

const clearDraft = (vars: Record<string, any>) => {
  delete vars.b2bRegDraft;
};

const assignParticipantVars = (vars: Record<string, any>, participant: {
  partnerCompany?: { id: string; name: string | null } | null;
  partnerUser?: { id: string; role: string | null } | null;
}) => {
  if (participant.partnerCompany?.id) vars.b2bPartnerId = participant.partnerCompany.id;
  if (participant.partnerCompany?.name) vars.b2bPartnerName = participant.partnerCompany.name;
  if (participant.partnerUser?.id) vars.b2bPartnerUserId = participant.partnerUser.id;
  if (participant.partnerUser?.role) vars.b2bPartnerRole = participant.partnerUser.role;
};

const getIdentity = (params: {
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
}) => ({
  tgUserId: clean(params.userId || params.vars.__telegramUserId || params.chatId),
  username: params.vars.__telegramUsername ? clean(params.vars.__telegramUsername) : null,
  firstName: params.vars.__telegramFirstName ? clean(params.vars.__telegramFirstName) : null,
  lastName: params.vars.__telegramLastName ? clean(params.vars.__telegramLastName) : null,
  chatId: clean(params.chatId)
});

const registrationChoiceKeyboard = {
  inline_keyboard: [
    [{ text: 'Я новий партнер', callback_data: 'B2BREG:START_NEW' }],
    [{ text: 'Я представник партнера', callback_data: 'B2BREG:START_AGENT' }]
  ]
};

const startNewPartnerCompanyForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
}) => {
  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'b2b_reg_company',
    namespace: 'B2BREG',
    title: 'Реєстрація партнера',
    confirmAction: 'B2BREG:COMPANY_SUBMIT',
    fields: [
      { key: 'companyName', label: 'Назва компанії', prompt: 'Вкажіть назву компанії:' },
      { key: 'companyCity', label: 'Місто', prompt: 'Вкажіть місто:' },
      { key: 'companyPhone', label: 'Телефон компанії', prompt: 'Вкажіть телефон компанії або надішліть контакт:', type: 'contact' },
      { key: 'companyNote', label: 'Примітка', prompt: 'Додайте примітку (необовʼязково):', optional: true }
    ]
  });
};

const startNewPartnerUserForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
}) => {
  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'b2b_reg_owner',
    namespace: 'B2BREG',
    title: 'Дані представника',
    confirmAction: 'B2BREG:NEW_USER_SUBMIT',
    fields: [
      { key: 'firstName', label: 'Імʼя', prompt: 'Вкажіть імʼя:' },
      { key: 'lastName', label: 'Прізвище', prompt: 'Вкажіть прізвище:' },
      { key: 'contact', label: 'Контакт', prompt: 'Надішліть контакт або введіть номер телефону:', type: 'contact' }
    ]
  });
};

const startPartnerCodeForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
}) => {
  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'b2b_reg_code',
    namespace: 'B2BREG',
    title: 'Код партнера',
    confirmAction: 'B2BREG:CODE_SUBMIT',
    fields: [
      { key: 'partnerCode', label: 'Partner Code', prompt: 'Введіть код партнера:' }
    ]
  });
};

const startAgentUserForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
  partnerName?: string;
}) => {
  const partnerSuffix = clean(params.partnerName);
  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'b2b_reg_agent',
    namespace: 'B2BREG',
    title: partnerSuffix ? `Представник: ${partnerSuffix}` : 'Дані представника',
    confirmAction: 'B2BREG:AGENT_USER_SUBMIT',
    fields: [
      { key: 'firstName', label: 'Імʼя', prompt: 'Вкажіть імʼя:' },
      { key: 'lastName', label: 'Прізвище', prompt: 'Вкажіть прізвище:' },
      { key: 'contact', label: 'Контакт', prompt: 'Надішліть контакт або введіть номер телефону:', type: 'contact' }
    ]
  });
};

const resolveInviteHint = async (bot: BotRuntime) => {
  const cfg = ((bot.config || {}) as Record<string, any>);
  const direct = clean(cfg?.b2bInviteLink || cfg?.inviteLink || cfg?.b2b?.inviteLink);
  if (direct) return direct;

  const inviteChatId = clean(
    cfg?.b2b?.channelId
    || cfg?.b2bChannelId
    || bot.channelId
  );
  if (!inviteChatId) return '';

  return telegramInviteService.buildBestEffortInviteLink({
    token: bot.token,
    chatId: inviteChatId,
    createsJoinRequest: true,
    name: 'B2B Partner Invite'
  }).catch(() => '');
};

const notifyRegistrationAdmin = async (params: {
  bot: BotRuntime;
  accessRequestId: string;
  text: string;
}) => {
  if (!params.bot.adminChatId) return;
  await sendMessage(params.bot, String(params.bot.adminChatId), params.text, {
    inline_keyboard: [
      [{ text: '✅ Підтвердити', callback_data: `B2BREG:APPROVE:${params.accessRequestId}` }],
      [{ text: '❌ Відхилити', callback_data: `B2BREG:REJECT:${params.accessRequestId}` }],
      [{ text: '💬 Написати', callback_data: `B2BREG:CONTACT:${params.accessRequestId}` }]
    ]
  });
};

export const promptB2BRegistration = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
  reason?: string;
}) => {
  const hint = clean(params.reason);
  const message = [
    '🔐 Для роботи в B2B потрібна реєстрація.',
    hint ? `Дія: ${hint}` : null,
    '',
    'Оберіть варіант:'
  ].filter(Boolean).join('\n');
  await sendMessage(params.bot, params.chatId, message, registrationChoiceKeyboard);
};

export const ensureB2BRegistrationGate = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
  reason?: string;
}) => {
  if (!b2bRegistrationService.isB2BBot(params.bot)) return false;
  if (params.bot.adminChatId && clean(params.chatId) === clean(params.bot.adminChatId)) return false;

  const identity = getIdentity({ chatId: params.chatId, userId: params.userId, vars: params.vars });
  if (!identity.tgUserId) return false;

  const participant = await b2bRegistrationService.resolveParticipant({
    tgUserId: identity.tgUserId,
    companyId: params.bot.companyId || null
  });

  if (participant.allowed) {
    assignParticipantVars(params.vars, {
      partnerCompany: participant.partnerCompany
        ? { id: participant.partnerCompany.id, name: participant.partnerCompany.name || null }
        : null,
      partnerUser: participant.partnerUser
        ? { id: participant.partnerUser.id, role: String(participant.partnerUser.role || '') || null }
        : null
    });
    return false;
  }

  await promptB2BRegistration({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars,
    reason: params.reason
  });
  return true;
};

export const handleB2BRegistrationCallback = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
  callbackData: string;
}) => {
  if (!params.callbackData.startsWith('B2BREG:')) return false;

  if (params.callbackData === 'B2BREG:START_NEW') {
    clearDraft(params.vars);
    const draft = ensureDraft(params.vars);
    draft.mode = 'new_partner';
    await startNewPartnerCompanyForm(params);
    return true;
  }

  if (params.callbackData === 'B2BREG:START_AGENT') {
    clearDraft(params.vars);
    const draft = ensureDraft(params.vars);
    draft.mode = 'agent';
    await startPartnerCodeForm(params);
    return true;
  }

  if (params.callbackData.startsWith('B2BREG:APPROVE:')) {
    if (!params.bot.adminChatId || clean(params.chatId) !== clean(params.bot.adminChatId)) {
      await sendMessage(params.bot, params.chatId, '⚠️ Дія доступна лише адміну.');
      return true;
    }
    const accessRequestId = clean(params.callbackData.split('B2BREG:APPROVE:')[1]);
    if (!accessRequestId) return true;

    const reviewedBy = clean(params.userId || params.vars.__telegramUserId || params.chatId);
    const approved = await b2bRegistrationService.approveNewPartnerRequest({
      accessRequestId,
      reviewedBy
    }).catch(async (error) => {
      await sendMessage(params.bot, params.chatId, `⚠️ Не вдалося підтвердити заявку: ${String(error?.message || error)}`);
      return null;
    });

    if (!approved) {
      await sendMessage(params.bot, params.chatId, '⚠️ Заявку не знайдено.');
      return true;
    }

    const payload = approved.payload;
    const applicantChatId = clean(payload?.chatId || approved.accessRequest.tgUserId);
    const partnerCode = clean(approved.partnerCompany.partnerCode);
    const inviteHint = await resolveInviteHint(params.bot);

    if (applicantChatId) {
      const ownerMessage = [
        '✅ Реєстрацію партнера підтверджено.',
        `Компанія: ${approved.partnerCompany.name}`,
        partnerCode ? `Код партнера: ${partnerCode}` : null,
        inviteHint ? `Посилання в канал: ${inviteHint}` : 'Посилання в канал надішле менеджер.'
      ].filter(Boolean).join('\n');
      await sendMessage(params.bot, applicantChatId, ownerMessage).catch(() => null);
    }

    await sendMessage(
      params.bot,
      params.chatId,
      `[B2B REG] ✅ Підтверджено\nКомпанія: ${approved.partnerCompany.name}\nOWNER: ${approved.partnerUser.name}\nPartnerCode: ${partnerCode || '—'}`
    );
    return true;
  }

  if (params.callbackData.startsWith('B2BREG:REJECT:')) {
    if (!params.bot.adminChatId || clean(params.chatId) !== clean(params.bot.adminChatId)) {
      await sendMessage(params.bot, params.chatId, '⚠️ Дія доступна лише адміну.');
      return true;
    }
    const accessRequestId = clean(params.callbackData.split('B2BREG:REJECT:')[1]);
    if (!accessRequestId) return true;

    const reviewedBy = clean(params.userId || params.vars.__telegramUserId || params.chatId);
    const rejected = await b2bRegistrationService.rejectAccessRequest({
      accessRequestId,
      reviewedBy
    });
    if (!rejected) {
      await sendMessage(params.bot, params.chatId, '⚠️ Заявку не знайдено.');
      return true;
    }

    const applicantChatId = clean(rejected.payload?.chatId || rejected.accessRequest.tgUserId);
    if (applicantChatId) {
      await sendMessage(params.bot, applicantChatId, '❌ Заявку на реєстрацію відхилено. Напишіть у підтримку для уточнення.').catch(() => null);
    }

    await sendMessage(params.bot, params.chatId, `[B2B REG] ❌ Відхилено заявку ${accessRequestId}`);
    return true;
  }

  if (params.callbackData.startsWith('B2BREG:CONTACT:')) {
    if (!params.bot.adminChatId || clean(params.chatId) !== clean(params.bot.adminChatId)) {
      await sendMessage(params.bot, params.chatId, '⚠️ Дія доступна лише адміну.');
      return true;
    }
    const accessRequestId = clean(params.callbackData.split('B2BREG:CONTACT:')[1]);
    if (!accessRequestId) return true;

    const request = await b2bRegistrationService.getAccessRequestById(accessRequestId);
    if (!request) {
      await sendMessage(params.bot, params.chatId, '⚠️ Заявку не знайдено.');
      return true;
    }

    const username = clean(request.accessRequest.username);
    const contactText = [
      '[B2B REG] 💬 Контакт заявника',
      username ? `Telegram: @${username.replace(/^@/, '')}` : null,
      `TG User ID: ${request.accessRequest.tgUserId}`,
      request.payload?.chatId ? `Chat ID: ${request.payload.chatId}` : null
    ].filter(Boolean).join('\n');

    await sendMessage(params.bot, params.chatId, contactText);
    return true;
  }

  return false;
};

export const submitB2BRegistrationForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
  submission: FormSubmission;
}) => {
  if (params.submission.namespace !== 'B2BREG') return false;

  if (params.submission.status === 'CANCELLED') {
    clearDraft(params.vars);
    await sendMessage(params.bot, params.chatId, '❌ Реєстрацію скасовано.');
    return true;
  }

  const action = clean(params.submission.confirmAction);
  const values = params.submission.values || {};
  const draft = ensureDraft(params.vars);
  const identity = getIdentity({ chatId: params.chatId, userId: params.userId, vars: params.vars });

  if (action === 'B2BREG:COMPANY_SUBMIT') {
    draft.mode = 'new_partner';
    draft.companyName = clean(values.companyName);
    draft.companyCity = clean(values.companyCity) || null;
    draft.companyPhone = clean(values.companyPhone) || null;
    draft.companyNote = clean(values.companyNote) || null;

    if (!draft.companyName || !draft.companyPhone) {
      await sendMessage(params.bot, params.chatId, '⚠️ Вкажіть назву та телефон компанії.');
      await startNewPartnerCompanyForm(params);
      return true;
    }

    await startNewPartnerUserForm(params);
    return true;
  }

  if (action === 'B2BREG:NEW_USER_SUBMIT') {
    const contact = clean(values.contact);
    const firstName = clean(values.firstName) || identity.firstName || '';
    const lastName = clean(values.lastName) || identity.lastName || '';
    if (!draft.companyName || !contact) {
      await sendMessage(params.bot, params.chatId, '⚠️ Заповніть форму повністю.');
      await startNewPartnerCompanyForm(params);
      return true;
    }

    const accessRequest = await b2bRegistrationService.createNewPartnerRequest({
      identity: {
        ...identity,
        firstName,
        lastName
      },
      context: {
        companyId: params.bot.companyId || null,
        botId: params.bot.id
      },
      companyName: draft.companyName,
      city: draft.companyCity || null,
      phone: draft.companyPhone || null,
      note: draft.companyNote || null,
      userContact: contact
    });

    const adminText = [
      '[B2B REG REQUEST]',
      `Request: ${accessRequest.id}`,
      `Компанія: ${draft.companyName}`,
      draft.companyCity ? `Місто: ${draft.companyCity}` : null,
      draft.companyPhone ? `Телефон компанії: ${draft.companyPhone}` : null,
      draft.companyNote ? `Примітка: ${draft.companyNote}` : null,
      '',
      `Представник: ${firstName} ${lastName}`.trim(),
      `Контакт: ${contact}`,
      identity.username ? `Telegram: @${identity.username.replace(/^@/, '')}` : null,
      `TG User ID: ${identity.tgUserId}`
    ].filter(Boolean).join('\n');

    await notifyRegistrationAdmin({
      bot: params.bot,
      accessRequestId: accessRequest.id,
      text: adminText
    });

    clearDraft(params.vars);
    await sendMessage(params.bot, params.chatId, '✅ Заявку на реєстрацію надіслано адміну. Очікуйте підтвердження.');
    return true;
  }

  if (action === 'B2BREG:CODE_SUBMIT') {
    const partnerCode = clean(values.partnerCode).toUpperCase();
    const partnerCompany = await b2bRegistrationService.findCompanyByPartnerCode(partnerCode);
    if (!partnerCompany) {
      await sendMessage(params.bot, params.chatId, '⚠️ Невірний код партнера. Перевірте код і спробуйте ще раз.');
      await startPartnerCodeForm(params);
      return true;
    }

    draft.mode = 'agent';
    draft.partnerCode = partnerCode;
    draft.partnerName = partnerCompany.name;
    await startAgentUserForm({
      ...params,
      partnerName: partnerCompany.name
    });
    return true;
  }

  if (action === 'B2BREG:AGENT_USER_SUBMIT') {
    const partnerCode = clean(draft.partnerCode).toUpperCase();
    const firstName = clean(values.firstName) || identity.firstName || '';
    const lastName = clean(values.lastName) || identity.lastName || '';
    const contact = clean(values.contact);
    if (!partnerCode || !contact) {
      await sendMessage(params.bot, params.chatId, '⚠️ Заповніть форму повністю.');
      await startPartnerCodeForm(params);
      return true;
    }

    const registered = await b2bRegistrationService.registerAgentByPartnerCode({
      partnerCode,
      identity: {
        ...identity,
        firstName,
        lastName
      },
      context: {
        companyId: params.bot.companyId || null,
        botId: params.bot.id
      },
      contact
    });

    if (!registered.ok) {
      await sendMessage(params.bot, params.chatId, '⚠️ Невірний або неактивний код партнера.');
      await startPartnerCodeForm(params);
      return true;
    }

    assignParticipantVars(params.vars, {
      partnerCompany: { id: registered.partnerCompany.id, name: registered.partnerCompany.name || null },
      partnerUser: { id: registered.partnerUser.id, role: String(registered.partnerUser.role || '') || null }
    });

    const adminText = [
      '[B2B AGENT]',
      `Партнер: ${registered.partnerCompany.name}`,
      `Код: ${partnerCode}`,
      `Представник: ${firstName} ${lastName}`.trim(),
      `Контакт: ${contact}`,
      identity.username ? `Telegram: @${identity.username.replace(/^@/, '')}` : null,
      `TG User ID: ${identity.tgUserId}`
    ].filter(Boolean).join('\n');

    if (params.bot.adminChatId) {
      await sendMessage(params.bot, String(params.bot.adminChatId), adminText);
    }

    clearDraft(params.vars);
    await sendMessage(params.bot, params.chatId, `✅ Вас підключено до партнера "${registered.partnerCompany.name}". Доступ активовано.`);
    return true;
  }

  return false;
};
