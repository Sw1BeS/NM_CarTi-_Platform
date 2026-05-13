const DEFAULT_PUBLIC_BASE_URL = 'https://cartie2.umanoff-analytics.space';

const toText = (value: unknown) => String(value || '').trim();

const publicBaseUrl = () =>
  String(process.env.PUBLIC_BASE_URL || process.env.MINIAPP_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');

const leadContactedCallback = (leadId?: string | null) => {
  const id = toText(leadId);
  return id ? `lead_CONTACTED_${id}` : undefined;
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
}) => {
  const rows: any[][] = [];
  const crmUrl = requestSearchUrl(params.request) || leadSearchUrl(params.lead);
  if (crmUrl) {
    rows.push([{ text: 'Відкрити в CRM', url: crmUrl }]);
  }

  const contacted = leadContactedCallback(params.lead?.id);
  const userId = toText(params.telegramUserId);
  const actionRow = [
    contacted ? { text: '✅ Позначити контакт', callback_data: contacted } : null,
    userId ? { text: 'Написати клієнту', url: `tg://user?id=${encodeURIComponent(userId)}` } : null
  ].filter(Boolean);
  if (actionRow.length) rows.push(actionRow);

  if (!rows.length) return undefined;
  return { inline_keyboard: rows };
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
