import { buildCallbackData } from '../modules/Communication/telegram/core/utils/callbackUtils.js';
import { renderVariantCard } from './cardRenderer.js';
import { createAdminActionToken } from './telegramAdminActionToken.service.js';

const toText = (value: unknown) => String(value || '').trim();

const publicBaseUrl = () =>
  String(process.env.PUBLIC_BASE_URL || process.env.MINIAPP_URL || 'https://cartie2.umanoff-analytics.space').replace(/\/+$/, '');

const requestSearchUrl = (request?: { id?: string | null; publicId?: string | null } | null) => {
  const value = toText(request?.publicId) || toText(request?.id);
  return value ? `${publicBaseUrl()}/requests?search=${encodeURIComponent(value)}` : undefined;
};

const actionButton = async (params: {
  text: string;
  action: string;
  variantId?: string | null;
  botId?: string | null;
  companyId?: string | null;
  requestId?: string | null;
}) => {
  const variantId = toText(params.variantId);
  if (!variantId) return null;

  try {
    const token = await createAdminActionToken({
      action: `b2bVariant.${params.action}`,
      targetType: 'request_variant',
      targetId: variantId,
      botId: params.botId || null,
      companyId: params.companyId || null,
      requestId: params.requestId || null
    });
    return token ? { text: params.text, callback_data: buildCallbackData('aa', token) } : null;
  } catch {
    return null;
  }
};

export const buildB2BVariantAdminActionMarkupAsync = async (params: {
  variant?: { id?: string | null } | null;
  request?: { id?: string | null; publicId?: string | null } | null;
  botId?: string | null;
  companyId?: string | null;
}) => {
  const context = {
    variantId: params.variant?.id,
    botId: params.botId || null,
    companyId: params.companyId || null,
    requestId: params.request?.id || null
  };

  const approve = await actionButton({ ...context, text: '✅ Підтвердити', action: 'APPROVE' });
  const reject = await actionButton({ ...context, text: '❌ Відхилити', action: 'REJECT' });
  const send = await actionButton({ ...context, text: '📤 Надіслати requester', action: 'SEND_TO_CLIENT' });
  const details = await actionButton({ ...context, text: 'ℹ️ Деталі', action: 'MORE' });
  const revealContact = await actionButton({ ...context, text: '🔐 Контакти після FIT', action: 'REVEAL_CONTACT' });

  const rows: any[][] = [];
  const crmUrl = requestSearchUrl(params.request);
  if (crmUrl) rows.push([{ text: 'Відкрити в CRM', url: crmUrl }]);

  const reviewRow = [approve, reject].filter(Boolean);
  if (reviewRow.length) rows.push(reviewRow);

  const deliveryRow = [send, details].filter(Boolean);
  if (deliveryRow.length) rows.push(deliveryRow);

  if (revealContact) rows.push([revealContact]);

  return rows.length ? { inline_keyboard: rows } : undefined;
};

export const buildB2BVariantAdminNotificationText = (params: {
  request?: { id?: string | null; publicId?: string | null; title?: string | null } | null;
  variant?: Record<string, any> | null;
  partnerName?: string | null;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  source?: string | null;
}) => {
  const username = toText(params.telegramUsername).replace(/^@+/, '');
  const tgUserId = toText(params.telegramUserId);
  const userLink = username ? `https://t.me/${username}` : (tgUserId ? `tg://user?id=${tgUserId}` : '—');
  const requestId = toText(params.request?.publicId) || toText(params.request?.id) || '—';
  const source = toText(params.source) || 'B2B';
  const partnerName = toText(params.partnerName) || toText(params.variant?.companyName) || '—';

  return [
    '🟣 [B2B OFFER] Новий варіант',
    `Request ID: ${requestId}`,
    params.request?.title ? `Запит: ${params.request.title}` : null,
    `Джерело: ${source}`,
    `Партнер: ${partnerName}`,
    `tgUserId: ${tgUserId || '—'}`,
    `username: ${username ? `@${username}` : '—'}`,
    `🔗 ${userLink}`,
    '',
    renderVariantCard(params.variant || {}, { includeContact: true, includeCompany: true })
  ].filter((line) => line !== null && line !== undefined).join('\n');
};
