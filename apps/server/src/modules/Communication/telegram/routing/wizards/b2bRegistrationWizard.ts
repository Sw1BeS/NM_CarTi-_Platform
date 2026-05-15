import { prisma } from '../../../../../services/prisma.js';
import type { PipelineContext } from '../../core/types.js';
import { resolveLang, t, button } from '../../core/utils/telegramText.js';
import { telegramOutbox } from '../../messaging/outbox/telegramOutbox.js';
import { ActionTokens, buildCallbackData } from '../../core/utils/callbackUtils.js';
import { normalizePhoneUA } from '../../core/utils/inputValidators.js';
import { b2bRegistrationService } from '../../../../../services/b2bRegistration.service.js';
import { b2bRoutingService } from '../../../../../services/b2bRouting.service.js';
import { assertConfiguredAdminGroupActionAccess } from '../../core/utils/telegramAdminAccess.js';

type RegistrationType = 'PARTNER' | 'AGENT';

type B2BRegistrationDraft = {
  type: RegistrationType;
  step: number;
  data: {
    companyName?: string;
    city?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    note?: string | null;
    inviteCode?: string;
    partnerId?: string;
  };
  history: string[];
};

const toText = (value: unknown) => String(value || '').trim();
const isBackIntent = (text: string, lang: ReturnType<typeof resolveLang>) => {
  const normalized = toText(text).toLowerCase();
  return normalized === toText(button(lang, 'common.back')).toLowerCase() || normalized === 'назад' || normalized === 'back';
};

const resolveBackStepFromState = (state: string): number | 'menu' => {
  const map: Record<string, number | 'menu'> = {
    B2B_REG_COMPANY: 'menu',
    BR_P_CITY: 1,
    BR_P_NAME: 2,
    BR_P_CONTACT: 3,
    BR_P_NOTE: 4,
    BR_P_REVIEW: 5,
    B2B_REG_AGENT_CODE: 'menu',
    BR_A_NAME: 1,
    BR_A_CONTACT: 2,
    BR_A_REVIEW: 3
  };
  return map[state] ?? 'menu';
};

const isAllowedActionForState = (state: string, action: string) => {
  if (action === ActionTokens.LB_CANCEL || action === ActionTokens.BR_APPROVE || action === ActionTokens.BR_REJECT) return true;
  if (!(state.startsWith('BR_') || state.startsWith('B2B_REG_'))) return false;
  if (action.startsWith('br_back_')) return true;
  if (action === 'br_edit' || action === 'br_j') return state === 'BR_P_REVIEW' || state === 'BR_A_REVIEW';
  if (action === 'br_p_submit') return state === 'BR_P_REVIEW';
  if (action === 'br_a_submit') return state === 'BR_A_REVIEW';
  if (action === 'br_ps_nt' || action === 'br_p_skip_note') return state === 'BR_P_NOTE';
  return false;
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
    companyId: ctx.companyId
  });
};

const sendUnregisteredMenu = async (ctx: PipelineContext, notice?: string) => {
  const lang = resolveLang(ctx);
  if (notice) {
    await sendMessage(ctx, notice, { remove_keyboard: true });
  }
  await sendMessage(ctx, t(lang, 'common.welcome_b2b_unregistered'), {
    inline_keyboard: [
      [{ text: button(lang, 'b2b.regNewPartner'), callback_data: buildCallbackData('br_new') },
      { text: button(lang, 'b2b.regAgent'), callback_data: buildCallbackData('br_agent') }],
      [{ text: button(lang, 'common.rules'), callback_data: buildCallbackData('cl_rules') },
      { text: button(lang, 'common.info'), callback_data: buildCallbackData('cl_info_b2b') }],
      [{ text: button(lang, 'common.privacy'), callback_data: buildCallbackData('cl_privacy') }]
    ]
  });
};

const readDraft = (ctx: PipelineContext): B2BRegistrationDraft => {
  const vars = (ctx.session?.variables as any) || {};
  const draft = vars.b2bRegDraft as B2BRegistrationDraft | undefined;
  if (draft && typeof draft === 'object') {
    return {
      type: draft.type === 'AGENT' ? 'AGENT' : 'PARTNER',
      step: Number(draft.step || 1),
      data: { ...(draft.data || {}) },
      history: Array.isArray(draft.history) ? draft.history : []
    };
  }

  const legacy = vars.b2bReg || {};
  return {
    type: legacy.type === 'AGENT' ? 'AGENT' : 'PARTNER',
    step: Number(legacy.step || 1),
    data: {
      companyName: legacy.companyName,
      city: legacy.city,
      firstName: legacy.firstName,
      lastName: legacy.lastName,
      phone: legacy.phone,
      note: legacy.note,
      inviteCode: legacy.partnerCode,
      partnerId: legacy.partnerId
    },
    history: []
  };
};

const persistDraft = async (ctx: PipelineContext, draft: B2BRegistrationDraft, state?: string) => {
  if (!ctx.session) return;
  const vars = (ctx.session.variables as any) || {};
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: state || (draft.type === 'AGENT' ? `BR_A_${draft.step}` : `BR_P_${draft.step}`),
      variables: {
        ...vars,
        b2bRegDraft: draft,
        b2bReg: null
      },
      lastActive: new Date()
    }
  });
};

const clearDraft = async (ctx: PipelineContext, nextState = 'B2B_UNREG', addVars: Record<string, unknown> = {}) => {
  if (!ctx.session) return;
  const vars = (ctx.session.variables as any) || {};
  ctx.session = await prisma.botSession.update({
    where: { id: ctx.session.id },
    data: {
      state: nextState,
      variables: {
        ...vars,
        b2bRegDraft: null,
        b2bReg: null,
        ...addVars
      },
      lastActive: new Date()
    }
  });
};

const routePartnerStep = async (ctx: PipelineContext, draft: B2BRegistrationDraft) => {
  const lang = resolveLang(ctx);
  const d = draft.data;

  if (draft.step <= 1) {
    draft.step = 1;
    await persistDraft(ctx, draft, 'B2B_REG_COMPANY');
    await sendMessage(ctx, `🏢 <b>Реєстрація партнера</b>\n\nКрок 1/5\nВведіть назву компанії (майданчика):`, {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('br_back_0') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 2) {
    await persistDraft(ctx, draft, 'BR_P_CITY');
    await sendMessage(ctx, 'Крок 2/5\nВкажіть місто компанії:', {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('br_back_1') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 3) {
    await persistDraft(ctx, draft, 'BR_P_NAME');
    await sendMessage(ctx, 'Крок 3/5\nВкажіть імʼя та прізвище представника:', {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('br_back_2') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 4) {
    await persistDraft(ctx, draft, 'BR_P_CONTACT');
    if (String(ctx.chatType || '') === 'private') {
      await sendMessage(ctx, 'Крок 4/5\nДодайте контактний номер:', {
        keyboard: [
          [{ text: button(lang, 'common.shareContact'), request_contact: true }],
          [{ text: button(lang, 'common.back') }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      });
    } else {
      await sendMessage(ctx, 'Крок 4/5\nВведіть контактний номер вручну:');
    }
    await sendMessage(ctx, 'Керування кроком:', {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('br_back_3') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 5) {
    await persistDraft(ctx, draft, 'BR_P_NOTE');
    await sendMessage(ctx, 'Крок 5/5\nНотатка (необовʼязково):', {
      inline_keyboard: [
        [{ text: button(lang, 'common.skip'), callback_data: buildCallbackData('br_ps_nt') }],
        [
          { text: button(lang, 'common.back'), callback_data: buildCallbackData('br_back_4') },
          { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
        ]
      ]
    });
    return;
  }

  await persistDraft(ctx, draft, 'BR_P_REVIEW');
  const summary = [
    `🏢 Компанія: ${d.companyName || '—'}`,
    `📍 Місто: ${d.city || '—'}`,
    `👤 Представник: ${[d.firstName, d.lastName].filter(Boolean).join(' ') || '—'}`,
    `📞 Контакт: ${d.phone || '—'}`,
    `📝 Примітка: ${d.note || '—'}`
  ].join('\n');

  await sendMessage(ctx, `✅ <b>Перевірте дані реєстрації</b>\n\n${summary}\n\nНадіслати заявку адміністратору?`, {
    inline_keyboard: [
      [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData('br_p_submit') }],
      [{ text: button(lang, 'common.edit'), callback_data: buildCallbackData('br_edit') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const routeAgentStep = async (ctx: PipelineContext, draft: B2BRegistrationDraft) => {
  const lang = resolveLang(ctx);
  const d = draft.data;

  if (draft.step <= 1) {
    draft.step = 1;
    await persistDraft(ctx, draft, 'B2B_REG_AGENT_CODE');
    await sendMessage(ctx, '👤 <b>Реєстрація представника партнера</b>\n\nКрок 1/3\nВведіть код партнера (CDL-XXXXXX):', {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('br_back_0') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 2) {
    await persistDraft(ctx, draft, 'BR_A_NAME');
    await sendMessage(ctx, 'Крок 2/3\nВкажіть імʼя та прізвище:', {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('br_back_1') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  if (draft.step === 3) {
    await persistDraft(ctx, draft, 'BR_A_CONTACT');
    if (String(ctx.chatType || '') === 'private') {
      await sendMessage(ctx, 'Крок 3/3\nДодайте контактний номер:', {
        keyboard: [
          [{ text: button(lang, 'common.shareContact'), request_contact: true }],
          [{ text: button(lang, 'common.back') }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      });
    } else {
      await sendMessage(ctx, 'Крок 3/3\nВведіть контактний номер вручну:');
    }
    await sendMessage(ctx, 'Керування кроком:', {
      inline_keyboard: [[
        { text: button(lang, 'common.back'), callback_data: buildCallbackData('br_back_2') },
        { text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
      ]]
    });
    return;
  }

  await persistDraft(ctx, draft, 'BR_A_REVIEW');
  const summary = [
    `Код партнера: ${d.inviteCode || '—'}`,
    `👤 Представник: ${[d.firstName, d.lastName].filter(Boolean).join(' ') || '—'}`,
    `📞 Контакт: ${d.phone || '—'}`
  ].join('\n');

  await sendMessage(ctx, `✅ <b>Перевірте дані представника</b>\n\n${summary}\n\nЗавершити реєстрацію?`, {
    inline_keyboard: [
      [{ text: button(lang, 'common.confirm'), callback_data: buildCallbackData('br_a_submit') }],
      [{ text: button(lang, 'common.edit'), callback_data: buildCallbackData('br_edit') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

const showEditFields = async (ctx: PipelineContext, draft: B2BRegistrationDraft) => {
  const lang = resolveLang(ctx);
  if (draft.type === 'AGENT') {
    await persistDraft(ctx, draft, 'BR_A_REVIEW');
    await sendMessage(ctx, '✏️ Оберіть поле для зміни:', {
      inline_keyboard: [
        [{ text: `Код партнера: ${draft.data.inviteCode || '—'}`, callback_data: buildCallbackData('br_j', '1') }],
        [{ text: `Імʼя/прізвище: ${[draft.data.firstName, draft.data.lastName].filter(Boolean).join(' ') || '—'}`, callback_data: buildCallbackData('br_j', '2') }],
        [{ text: `Контакт: ${draft.data.phone || '—'}`, callback_data: buildCallbackData('br_j', '3') }],
        [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
      ]
    });
    return;
  }

  await persistDraft(ctx, draft, 'BR_P_REVIEW');
  await sendMessage(ctx, '✏️ Оберіть поле для зміни:', {
    inline_keyboard: [
      [{ text: `Компанія: ${draft.data.companyName || '—'}`, callback_data: buildCallbackData('br_j', '1') }],
      [{ text: `Місто: ${draft.data.city || '—'}`, callback_data: buildCallbackData('br_j', '2') }],
      [{ text: `Імʼя/прізвище: ${[draft.data.firstName, draft.data.lastName].filter(Boolean).join(' ') || '—'}`, callback_data: buildCallbackData('br_j', '3') }],
      [{ text: `Контакт: ${draft.data.phone || '—'}`, callback_data: buildCallbackData('br_j', '4') }],
      [{ text: `Нотатка: ${draft.data.note || '—'}`, callback_data: buildCallbackData('br_j', '5') }],
      [{ text: button(lang, 'common.cancel'), callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }]
    ]
  });
};

export const routeB2BRegStep = async (ctx: PipelineContext, draft: B2BRegistrationDraft) => {
  if (draft.type === 'AGENT') {
    await routeAgentStep(ctx, draft);
    return;
  }
  await routePartnerStep(ctx, draft);
};

const parseNameParts = (text: string) => {
  const parts = toText(text).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

export const handleB2BRegText = async (ctx: PipelineContext, text: string): Promise<boolean> => {
  const state = String(ctx.session?.state || '');
  const lang = resolveLang(ctx);
  const vars = (ctx.session?.variables as any) || {};
  const hasDraft = Boolean(vars.b2bRegDraft && typeof vars.b2bRegDraft === 'object');
  if ((state.startsWith('BR_') || state.startsWith('B2B_REG_')) && !hasDraft) {
    await clearDraft(ctx, 'B2B_UNREG', { b2bUnregistered: true });
    await sendUnregisteredMenu(ctx, '⚠️ Сесія реєстрації втрачена. Почніть ще раз.');
    return true;
  }
  const draft = readDraft(ctx);
  const message = ctx.update?.message;

  if ((state.startsWith('BR_') || state.startsWith('B2B_REG_')) && isBackIntent(text, lang)) {
    const back = resolveBackStepFromState(state);
    if (back === 'menu') {
      await clearDraft(ctx, 'B2B_UNREG', { b2bUnregistered: true });
      await sendUnregisteredMenu(ctx);
      return true;
    }
    draft.step = back;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (state === 'B2B_REG_COMPANY') {
    const companyName = toText(text);
    if (companyName.length < 2) {
      await sendMessage(ctx, '⚠️ Занадто коротка назва. Введіть ще раз.');
      return true;
    }
    draft.type = 'PARTNER';
    draft.data.companyName = companyName;
    draft.step = 2;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (state === 'B2B_REG_AGENT_CODE') {
    const inviteCode = toText(text).toUpperCase();
    const company = await b2bRegistrationService.findCompanyByPartnerCode(inviteCode);
    if (!company) {
      await sendMessage(ctx, '⚠️ Код партнера не знайдено. Перевірте та введіть ще раз.');
      return true;
    }
    draft.type = 'AGENT';
    draft.data.inviteCode = inviteCode;
    draft.data.partnerId = company.id;
    draft.step = 2;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (state === 'BR_P_CITY') {
    draft.data.city = toText(text);
    draft.step = 3;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (state === 'BR_P_NAME') {
    const parsed = parseNameParts(text);
    if (!parsed.firstName) {
      await sendMessage(ctx, '⚠️ Вкажіть імʼя та прізвище.');
      return true;
    }
    draft.data.firstName = parsed.firstName;
    draft.data.lastName = parsed.lastName;
    draft.step = 4;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (state === 'BR_P_CONTACT') {
    const source = message?.contact?.phone_number || text;
    const normalized = normalizePhoneUA(source);
    if (!normalized) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_phone'));
      return true;
    }
    draft.data.phone = normalized;
    draft.step = 5;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (state === 'BR_P_NOTE') {
    draft.data.note = toText(text) || null;
    draft.step = 6;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (state === 'BR_A_NAME') {
    const parsed = parseNameParts(text);
    if (!parsed.firstName) {
      await sendMessage(ctx, '⚠️ Вкажіть імʼя та прізвище.');
      return true;
    }
    draft.data.firstName = parsed.firstName;
    draft.data.lastName = parsed.lastName;
    draft.step = 3;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (state === 'BR_A_CONTACT') {
    const source = message?.contact?.phone_number || text;
    const normalized = normalizePhoneUA(source);
    if (!normalized) {
      await sendMessage(ctx, t(lang, 'common.err.invalid_phone'));
      return true;
    }
    draft.data.phone = normalized;
    draft.step = 4;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (state.startsWith('BR_') || state.startsWith('B2B_REG_')) {
    await sendMessage(ctx, 'Використайте кнопки під повідомленням або «❌ Скасувати».');
    return true;
  }

  return false;
};

const notifyPartnerRegistrationToAdmin = async (ctx: PipelineContext, accessRequestId: string, draft: B2BRegistrationDraft) => {
  if (!ctx.bot) return;
  const from = ctx.update?.message?.from || ctx.update?.callback_query?.from;
  const tgUserId = String(from?.id || ctx.userId || ctx.chatId || '').trim();
  const displayName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || 'Користувач';
  const username = from?.username ? `@${from.username}` : '—';
  const profileLink = from?.username ? `https://t.me/${from.username}` : `tg://user?id=${tgUserId || ctx.chatId || ''}`;
  const text = [
    '🟡 [B2B REG]',
    `Заявка на реєстрацію партнера`,
    `👤 ${displayName}`,
    `username: ${username}`,
    `tgUserId: ${tgUserId || '—'}`,
    `🔗 ${profileLink}`,
    `Компанія: ${draft.data.companyName || '—'}`,
    `Місто: ${draft.data.city || '—'}`,
    `Представник: ${[draft.data.firstName, draft.data.lastName].filter(Boolean).join(' ') || '—'}`,
    `Контакт: ${draft.data.phone || '—'}`,
    `Нотатка: ${draft.data.note || '—'}`,
    `ID заявки: ${accessRequestId}`
  ].join('\n');

  await b2bRoutingService.notifyQueues({
    companyId: ctx.companyId || null,
    sourceBotId: ctx.bot.id,
    sourceBotToken: ctx.bot.token,
    sourceBotAdminChatId: ctx.bot.adminChatId || null,
    text,
    replyMarkup: {
      inline_keyboard: [[
        { text: '✅ Підтвердити', callback_data: buildCallbackData(ActionTokens.BR_APPROVE, accessRequestId) },
        { text: '❌ Відхилити', callback_data: buildCallbackData(ActionTokens.BR_REJECT, accessRequestId) }
      ]]
    },
    includeSourceAdminFallback: true
  });
};

export const handleB2BRegCallback = async (ctx: PipelineContext, action: string, payload?: string): Promise<boolean> => {
  const vars = (ctx.session?.variables as any) || {};
  const hasDraft = Boolean(vars.b2bRegDraft && typeof vars.b2bRegDraft === 'object');
  const lang = resolveLang(ctx);
  const state = String(ctx.session?.state || '');

  if (action === 'br_new' || action === 'br_new_partner') {
    await routeB2BRegStep(ctx, {
      type: 'PARTNER',
      step: 1,
      data: {},
      history: []
    });
    return true;
  }

  if (action === 'br_agent') {
    await routeB2BRegStep(ctx, {
      type: 'AGENT',
      step: 1,
      data: {},
      history: []
    });
    return true;
  }

  if (action === ActionTokens.LB_CANCEL) {
    await clearDraft(ctx, 'B2B_UNREG', { b2bUnregistered: true });
    await sendUnregisteredMenu(ctx, t(lang, 'cancelled'));
    return true;
  }

  if (!hasDraft && action !== ActionTokens.BR_APPROVE && action !== ActionTokens.BR_REJECT) {
    await sendMessage(ctx, '⚠️ Сесія реєстрації неактивна. Почніть реєстрацію з меню.');
    return true;
  }

  if (action !== ActionTokens.BR_APPROVE && action !== ActionTokens.BR_REJECT) {
    if (!isAllowedActionForState(state, action)) {
      await sendMessage(ctx, '⚠️ Ця дія недоступна на поточному кроці.');
      return true;
    }
  }

  const draft = readDraft(ctx);

  if (action.startsWith('br_back_')) {
    const step = Number(action.replace('br_back_', ''));
    if (Number.isFinite(step) && step === 0) {
      await clearDraft(ctx, 'B2B_UNREG', { b2bUnregistered: true });
      await sendUnregisteredMenu(ctx);
      return true;
    }
    if (!Number.isFinite(step) || step < 1) return true;
    draft.step = step;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (action === 'br_edit') {
    await showEditFields(ctx, draft);
    return true;
  }

  if (action === 'br_j') {
    const step = Number(toText(payload));
    if (!Number.isFinite(step) || step < 1) return true;
    draft.step = step;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (action === 'br_ps_nt' || action === 'br_p_skip_note') {
    draft.data.note = null;
    draft.step = 6;
    await routeB2BRegStep(ctx, draft);
    return true;
  }

  if (action === 'br_p_submit') {
    if (!ctx.bot) return true;
    const from = ctx.update?.callback_query?.from;

    const accessRequest = await b2bRegistrationService.createNewPartnerRequest({
      identity: {
        tgUserId: String(from?.id || ctx.userId || ctx.chatId || ''),
        username: from?.username || null,
        firstName: draft.data.firstName || from?.first_name || null,
        lastName: draft.data.lastName || from?.last_name || null,
        chatId: ctx.chatId || null
      },
      context: {
        companyId: ctx.companyId || null,
        botId: ctx.bot.id
      },
      companyName: draft.data.companyName || '',
      city: draft.data.city || null,
      phone: draft.data.phone || null,
      note: draft.data.note || null,
      userContact: draft.data.phone || ''
    });

    await clearDraft(ctx, 'B2B_UNREG', { b2bUnregistered: true });
    await sendMessage(ctx, t(lang, 'b2b.reg.submitted'), { remove_keyboard: true });
    await notifyPartnerRegistrationToAdmin(ctx, accessRequest.id, draft);
    return true;
  }

  if (action === 'br_a_submit') {
    const from = ctx.update?.callback_query?.from;
    const result = await b2bRegistrationService.registerAgentByPartnerCode({
      partnerCode: draft.data.inviteCode || '',
      identity: {
        tgUserId: String(from?.id || ctx.userId || ctx.chatId || ''),
        username: from?.username || null,
        firstName: draft.data.firstName || from?.first_name || null,
        lastName: draft.data.lastName || from?.last_name || null,
        chatId: ctx.chatId || null
      },
      context: {
        companyId: ctx.companyId || null,
        botId: ctx.bot?.id || null
      },
      contact: draft.data.phone || ''
    });

    if (!result.ok) {
      await sendMessage(ctx, '⚠️ Код партнера некоректний або неактивний.');
      return true;
    }

    await clearDraft(ctx, 'B2B_MENU', { b2bUnregistered: false, b2bPartnerId: result.partnerCompany.id, b2bPartnerName: result.partnerCompany.name });
    await sendMessage(ctx, '✅ Ви успішно приєднані як представник партнера.', {
      keyboard: [
        [{ text: button(lang, 'b2bMenu.newRequest') }, { text: button(lang, 'b2bMenu.sell') }],
        [{ text: button(lang, 'b2bMenu.myInventory') }, { text: button(lang, 'common.info') }]
      ],
      resize_keyboard: true
    });

    if (ctx.bot?.adminChatId) {
      const from = ctx.update?.message?.from || ctx.update?.callback_query?.from;
      const tgUserId = String(from?.id || ctx.userId || ctx.chatId || '').trim();
      const username = from?.username ? `@${from.username}` : '—';
      const profileLink = from?.username ? `https://t.me/${from.username}` : `tg://user?id=${tgUserId || ctx.chatId || ''}`;
      await sendMessage(ctx, [
        '🟡 [B2B REG]',
        'Додано нового представника партнера',
        `username: ${username}`,
        `tgUserId: ${tgUserId || '—'}`,
        `🔗 ${profileLink}`,
        `Компанія: ${result.partnerCompany.name}`,
        `Код: ${draft.data.inviteCode || '—'}`,
        `Представник: ${[draft.data.firstName, draft.data.lastName].filter(Boolean).join(' ') || '—'}`,
        `Контакт: ${draft.data.phone || '—'}`
      ].join('\n'), undefined, String(ctx.bot.adminChatId));
    }
    return true;
  }

  if (action === ActionTokens.BR_APPROVE || action === ActionTokens.BR_REJECT) {
    const access = await assertConfiguredAdminGroupActionAccess(ctx);
    if (!access.ok) {
      await sendMessage(ctx, access.errorText);
      return true;
    }

    const accessRequestId = toText(payload);
    if (!accessRequestId) {
      await sendMessage(ctx, '⚠️ Некоректний ID заявки.');
      return true;
    }

    const reviewedBy = access.actorId;
    if (action === ActionTokens.BR_APPROVE) {
      const approved = await b2bRegistrationService.approveNewPartnerRequest({
        accessRequestId,
        reviewedBy
      });
      if (!approved) {
        await sendMessage(ctx, '⚠️ Заявку не знайдено.');
        return true;
      }

      await sendMessage(ctx, `✅ Реєстрацію підтверджено: ${approved.partnerCompany.name}`);
      const tgUserId = approved.accessRequest.tgUserId;
      if (tgUserId) {
        const channelId = String(ctx.bot?.channelId || '').trim();
        const joinLink = channelId.startsWith('@')
          ? `https://t.me/${channelId.replace(/^@/, '')}`
          : channelId.startsWith('-100')
            ? `https://t.me/c/${channelId.slice(4)}`
            : '';
        const approvalText = t(lang, 'b2b.reg.approved', { code: approved.partnerCompany.inviteCode || '—' })
          + (joinLink ? `\n\n🔗 ${joinLink}` : '');
        await sendMessage(ctx, approvalText, undefined, String(tgUserId));
      }
      return true;
    }

    const rejected = await b2bRegistrationService.rejectAccessRequest({
      accessRequestId,
      reviewedBy
    });
    if (!rejected) {
      await sendMessage(ctx, '⚠️ Заявку не знайдено.');
      return true;
    }

    await sendMessage(ctx, `❌ Реєстрацію відхилено: ${accessRequestId}`);
    if (rejected.accessRequest.tgUserId) {
      await sendMessage(ctx, t(lang, 'b2b.reg.rejected'), undefined, String(rejected.accessRequest.tgUserId));
    }
    return true;
  }

  return false;
};
