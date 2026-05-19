import { buildCallbackData } from '../modules/Communication/telegram/core/utils/callbackUtils.js';
import { createAdminActionToken } from './telegramAdminActionToken.service.js';

const DEFAULT_PUBLIC_BASE_URL = 'https://cartie2.umanoff-analytics.space';

const toText = (value: unknown) => String(value || '').trim();

const publicBaseUrl = () =>
  String(process.env.PUBLIC_BASE_URL || process.env.MINIAPP_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');

const absolutePublicUrl = (url?: string | null) => {
  const value = toText(url);
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${publicBaseUrl()}${value}`;
  return `${publicBaseUrl()}/${value.replace(/^\/+/, '')}`;
};

const leadContactedCallback = (leadId?: string | null) => {
  const id = toText(leadId);
  return id ? `lead_CONTACTED_${id}` : undefined;
};

const tokenizedLeadContactedCallback = async (params: {
  leadId?: string | null;
  botId?: string | null;
  companyId?: string | null;
  requestId?: string | null;
}) => {
  const leadId = toText(params.leadId);
  if (!leadId) return undefined;
  let token: string | undefined;
  try {
    token = await createAdminActionToken({
      action: 'lead.CONTACTED',
      targetType: 'lead',
      targetId: leadId,
      botId: params.botId || null,
      companyId: params.companyId || null,
      requestId: params.requestId || null
    });
  } catch {
    return undefined;
  }
  return token ? buildCallbackData('aa', token) : undefined;
};

const tokenizedSalesDriveSyncCallback = async (params: {
  requestId?: string | null;
  botId?: string | null;
  companyId?: string | null;
}) => {
  const requestId = toText(params.requestId);
  if (!requestId) return undefined;
  let token: string | undefined;
  try {
    token = await createAdminActionToken({
      action: 'salesdrive.REQUEST_SYNC',
      targetType: 'request',
      targetId: requestId,
      botId: params.botId || null,
      companyId: params.companyId || null,
      requestId
    });
  } catch {
    return undefined;
  }
  return token ? buildCallbackData('aa', token) : undefined;
};

const requestSearchUrl = (request?: { id?: string | null; publicId?: string | null } | null) => {
  const value = toText(request?.publicId) || toText(request?.id);
  if (!value) return undefined;
  return `${publicBaseUrl()}/requests?search=${encodeURIComponent(value)}`;
};

const leadSearchUrl = (lead?: { id?: string | null; leadCode?: string | null } | null) => {
  const value = toText(lead?.leadCode) || toText(lead?.id);
  if (!value) return undefined;
  return `${publicBaseUrl()}/leads?search=${encodeURIComponent(value)}`;
};

export const buildLeadAdminActionMarkup = (params: {
  lead?: { id?: string | null; leadCode?: string | null } | null;
  request?: { id?: string | null; publicId?: string | null } | null;
  telegramUserId?: string | null;
  selectedCars?: Array<{ id?: string | null; title?: string | null; publicUrl?: string | null }> | null;
}) => {
  return buildLeadAdminActionMarkupWithCallback(params, leadContactedCallback(params.lead?.id));
};

const buildLeadAdminActionMarkupWithCallback = (params: {
  lead?: { id?: string | null; leadCode?: string | null } | null;
  request?: { id?: string | null; publicId?: string | null } | null;
  telegramUserId?: string | null;
  selectedCars?: Array<{ id?: string | null; title?: string | null; publicUrl?: string | null }> | null;
}, contacted?: string) => {
  const rows: any[][] = [];
  const crmUrl = requestSearchUrl(params.request) || leadSearchUrl(params.lead);
  if (crmUrl) {
    rows.push([{ text: 'Відкрити в CRM', url: crmUrl }]);
  }

  const carButtons = (params.selectedCars || [])
    .map((car, index) => {
      const url = absolutePublicUrl(car?.publicUrl);
      if (!url) return null;
      return {
        text: params.selectedCars?.length === 1 ? 'Відкрити авто' : `Авто ${index + 1}`,
        url
      };
    })
    .filter(Boolean)
    .slice(0, 4);
  for (let i = 0; i < carButtons.length; i += 2) {
    rows.push(carButtons.slice(i, i + 2));
  }

  const userId = toText(params.telegramUserId);
  const actionRow = [
    contacted ? { text: '✅ Позначити контакт', callback_data: contacted } : null,
    userId ? { text: 'Написати клієнту', url: `tg://user?id=${encodeURIComponent(userId)}` } : null
  ].filter(Boolean);
  if (actionRow.length) rows.push(actionRow);

  if (!rows.length) return undefined;
  return { inline_keyboard: rows };
};

export const buildLeadAdminActionMarkupAsync = async (params: {
  lead?: { id?: string | null; leadCode?: string | null } | null;
  request?: { id?: string | null; publicId?: string | null } | null;
  telegramUserId?: string | null;
  selectedCars?: Array<{ id?: string | null; title?: string | null; publicUrl?: string | null }> | null;
  tokenContext?: {
    botId?: string | null;
    companyId?: string | null;
    requestId?: string | null;
  };
}) => {
  const requestId = params.tokenContext?.requestId || params.request?.id;
  const [contacted, salesDriveSync] = await Promise.all([
    tokenizedLeadContactedCallback({
      leadId: params.lead?.id,
      botId: params.tokenContext?.botId,
      companyId: params.tokenContext?.companyId,
      requestId
    }),
    tokenizedSalesDriveSyncCallback({
      requestId,
      botId: params.tokenContext?.botId,
      companyId: params.tokenContext?.companyId
    })
  ]);
  const markup = buildLeadAdminActionMarkupWithCallback(params, contacted);
  if (!salesDriveSync) return markup;
  const inline_keyboard = [...(markup?.inline_keyboard || [])];
  inline_keyboard.push([{ text: 'SalesDrive sync', callback_data: salesDriveSync }]);
  return { inline_keyboard };
};

export const buildLeadAdminNotificationText = (params: {
  header: string;
  displayName: string;
  telegramUsername?: string | null;
  telegramUserId?: string | null;
  phone?: string | null;
  intentLabel?: string;
  requestPresentationText?: string | null;
  fallbackTitle?: string | null;
  selectedCarsText?: string | null;
  request?: { id?: string | null; publicId?: string | null } | null;
  source?: string | null;
  duplicate?: boolean;
}) => {
  const username = toText(params.telegramUsername).replace(/^@+/, '');
  const tgUserId = toText(params.telegramUserId);
  const userLink = username ? `https://t.me/${username}` : (tgUserId ? `tg://user?id=${tgUserId}` : '—');
  return [
    params.duplicate ? `${params.header} ♻️ Дублікат/оновлення` : params.header,
    `👤 ${params.displayName || 'Клієнт'}`,
    `username: ${username ? `@${username}` : '—'}`,
    `tgUserId: ${tgUserId || '—'}`,
    `🔗 ${userLink}`,
    params.phone ? `Контакт: ${params.phone}` : null,
    params.intentLabel ? `Тип: ${params.intentLabel}` : null,
    params.source ? `Джерело: ${params.source}` : null,
    params.requestPresentationText
      ? `\n${params.requestPresentationText}`
      : (params.fallbackTitle ? `Авто/запит: ${params.fallbackTitle}` : null),
    params.selectedCarsText ? `Обрані авто:\n${params.selectedCarsText}` : null,
    params.request ? `Request ID: ${params.request.publicId || params.request.id}` : null
  ].filter(Boolean).join('\n');
};
