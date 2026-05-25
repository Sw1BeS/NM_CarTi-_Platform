import { prisma } from '../../../services/prisma.js';
import { MetaCapiService } from '../meta/metaCapi.service.js';

const SALESDRIVE_INTEGRATION = 'SALESDRIVE';
const DEFAULT_DESTINATION_KEY = 'b2c_bot_sandbox';

type WebhookRequestLike = {
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  companyId?: string | null;
};

type ParsedSalesDriveStatus = {
  orderId?: string;
  leadId?: string;
  statusId?: string;
  statusName?: string;
  statusTimestamp?: string;
  phone?: string;
  email?: string;
  value?: number;
  currency?: string;
  comment?: string;
  source?: string;
};

const toText = (value: unknown) => String(value || '').trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const readHeader = (headers: Record<string, unknown> = {}, name: string) => {
  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalized) return toText(value);
  }
  return '';
};

const pick = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && toText(value)) return value;
  }
  return undefined;
};

const nestedPick = (record: Record<string, unknown>, path: string[], keys: string[]) => {
  let cursor: unknown = record;
  for (const part of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[part];
  }
  return isRecord(cursor) ? pick(cursor, keys) : undefined;
};

const readWebhookSecret = () =>
  toText(process.env.SALESDRIVE_WEBHOOK_SECRET)
  || toText(process.env.SALESDRIVE_WEBHOOK_TOKEN)
  || toText(process.env.SALESDRIVE_SECRET)
  || toText(process.env.INTEGRATION_WEBHOOK_SECRET);

export const validateSalesDriveWebhookSecret = (request: WebhookRequestLike) => {
  const configured = readWebhookSecret();
  if (!configured) return { ok: false, reason: 'WEBHOOK_SECRET_MISSING' };

  const headers = request.headers || {};
  const query = request.query || {};
  const body = request.body || {};
  const auth = readHeader(headers, 'authorization').replace(/^Bearer\s+/i, '');
  const provided = readHeader(headers, 'x-salesdrive-webhook-secret')
    || readHeader(headers, 'x-salesdrive-webhook-token')
    || readHeader(headers, 'x-integration-webhook-secret')
    || auth
    || toText(query.secret)
    || toText(query.token)
    || toText(body.secret)
    || toText(body.token);

  if (!provided || provided !== configured) return { ok: false, reason: 'INVALID_SECRET' };
  return { ok: true };
};

export const sanitizeSalesDriveWebhookPayload = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeSalesDriveWebhookPayload);
  if (!isRecord(value)) {
    if (typeof value !== 'string') return value;
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
      .replace(/(?:\+?\d[\d\s()\-]{6,}\d)/g, '[redacted-phone]');
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const normalized = normalizeKey(key);
    if (normalized.includes('token') || normalized.includes('secret') || normalized.includes('authorization')) {
      return [key, '[redacted-credential]'];
    }
    if (normalized.includes('phone') || normalized === 'tel') return [key, '[redacted-phone]'];
    if (normalized.includes('email') || normalized === 'mail') return [key, '[redacted-email]'];
    return [key, sanitizeSalesDriveWebhookPayload(item)];
  }));
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const parseSalesDriveWebhookPayload = (body: Record<string, unknown>): ParsedSalesDriveStatus => {
  const order = isRecord(body.order) ? body.order : {};
  const lead = isRecord(body.lead) ? body.lead : {};
  const client = isRecord(body.client) ? body.client : {};
  const data = isRecord(body.data) ? body.data : {};

  const orderId = toText(
    pick(body, ['salesdrive_order_id', 'order_id', 'orderId', 'id'])
    || pick(order, ['id', 'order_id', 'orderId'])
    || pick(data, ['order_id', 'orderId', 'id'])
  );
  const leadId = toText(
    pick(body, ['lead_id', 'leadId'])
    || pick(lead, ['id', 'lead_id', 'leadId'])
    || pick(data, ['lead_id', 'leadId'])
  );
  const statusId = toText(
    pick(body, ['status_id', 'statusId'])
    || nestedPick(body, ['status'], ['id', 'status_id', 'statusId'])
    || pick(order, ['status_id', 'statusId'])
    || pick(data, ['status_id', 'statusId'])
  );
  const statusName = toText(
    pick(body, ['status_name', 'statusName', 'status'])
    || nestedPick(body, ['status'], ['name', 'title', 'status_name', 'statusName'])
    || pick(order, ['status_name', 'statusName', 'status'])
    || pick(data, ['status_name', 'statusName', 'status'])
  );
  const statusTimestamp = toText(
    pick(body, ['status_changed_at', 'statusChangedAt', 'updated_at', 'updatedAt', 'updateAt'])
    || pick(order, ['status_changed_at', 'statusChangedAt', 'updated_at', 'updatedAt', 'updateAt'])
    || pick(data, ['status_changed_at', 'statusChangedAt', 'updated_at', 'updatedAt', 'updateAt'])
  );
  const phone = toText(
    pick(body, ['phone', 'clientPhone'])
    || pick(client, ['phone', 'clientPhone'])
    || pick(order, ['phone', 'clientPhone'])
    || pick(data, ['phone', 'clientPhone'])
  );
  const email = toText(
    pick(body, ['email', 'clientEmail'])
    || pick(client, ['email', 'clientEmail'])
    || pick(order, ['email', 'clientEmail'])
    || pick(data, ['email', 'clientEmail'])
  );
  const value = toNumber(pick(body, ['value', 'amount', 'total']) || pick(order, ['value', 'amount', 'total']));
  const currency = toText(pick(body, ['currency']) || pick(order, ['currency'])) || undefined;
  const comment = toText(pick(body, ['comment', 'sourceComment']) || pick(order, ['comment', 'sourceComment']));
  const source = toText(pick(body, ['source', 'prodex24source']) || pick(order, ['source', 'prodex24source']));

  return {
    orderId: orderId || leadId || undefined,
    leadId: leadId || undefined,
    statusId: statusId || undefined,
    statusName: statusName || undefined,
    statusTimestamp: statusTimestamp || undefined,
    phone: phone || undefined,
    email: email || undefined,
    value,
    currency,
    comment: comment || undefined,
    source: source || undefined
  };
};

const resolveB2CBotWebhookContext = async (parsed: ParsedSalesDriveStatus, companyId?: string | null) => {
  const text = [parsed.comment, parsed.source].filter(Boolean).join(' ').toLowerCase();
  if (text.includes('cartié b2c') || text.includes('cartie b2c') || text.includes('b2c_bot') || text.includes(DEFAULT_DESTINATION_KEY)) {
    return { isB2C: true, companyId: companyId || undefined };
  }

  if (!parsed.orderId) return { isB2C: false, companyId: companyId || undefined };
  const identity = await prisma.leadIdentity.findFirst({
    where: {
      ...(companyId ? { companyId } : {}),
      provider: 'SALESDRIVE',
      externalId: parsed.orderId
    },
    include: { lead: true }
  }).catch(() => null);
  const leadPayload = isRecord((identity as any)?.lead?.payload) ? (identity as any).lead.payload : {};
  const identityCompanyId = toText((identity as any)?.companyId || (identity as any)?.lead?.companyId);
  if (toText(leadPayload.source) === 'b2c_bot' || toText(leadPayload.destination_key) === DEFAULT_DESTINATION_KEY) {
    return { isB2C: true, companyId: companyId || identityCompanyId || undefined };
  }

  const request = await prisma.b2bRequest.findFirst({
    where: {
      ...(companyId ? { companyId } : {}),
      OR: [
        { publicId: parsed.orderId },
        { id: parsed.orderId }
      ]
    },
    select: { companyId: true, payload: true, requesterPartnerId: true }
  }).catch(() => null);
  const requestPayload = isRecord((request as any)?.payload) ? (request as any).payload : {};
  const requestIsB2C = !toText((request as any)?.requesterPartnerId)
    && (toText(requestPayload.source) === 'b2c_bot' || toText(requestPayload.destination_key) === DEFAULT_DESTINATION_KEY);
  return {
    isB2C: requestIsB2C,
    companyId: companyId || toText((request as any)?.companyId) || undefined
  };
};

const statusDecision = (parsed: ParsedSalesDriveStatus) => {
  const statusId = toText(parsed.statusId);
  if (!statusId) return { send: false, reason: 'missing_status_id' };
  if (statusId === '13') return { send: true, eventName: 'Contact' };
  if (['2', '9'].includes(statusId)) return { send: false, reason: 'qualified_lead_unconfirmed' };
  if (['5', '11'].includes(statusId)) return { send: false, reason: 'purchase_disabled' };
  return { send: false, reason: 'status_skipped' };
};

const toUnixStatusTime = (value?: string) => {
  const date = new Date(toText(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return String(Math.floor(date.getTime() / 1000));
};

const destinationKey = () => toText(process.env.META_B2C_BOT_DESTINATION_KEY) || DEFAULT_DESTINATION_KEY;

const logWebhookDecision = async (params: {
  companyId?: string | null;
  action: string;
  status: string;
  message?: string;
  parsed: ParsedSalesDriveStatus;
  reason?: string;
  eventId?: string;
  sanitizedPayload?: unknown;
}) => prisma.integrationEventLog.create({
  data: {
    companyId: params.companyId || null,
    integration: SALESDRIVE_INTEGRATION,
    action: params.action,
    status: params.status,
    entityType: 'salesdrive_status',
    entityId: params.parsed.orderId || params.parsed.leadId || null,
    message: params.message,
    meta: {
      reason: params.reason,
      salesDriveOrderId: params.parsed.orderId,
      salesDriveLeadId: params.parsed.leadId,
      statusId: params.parsed.statusId,
      statusName: params.parsed.statusName,
      statusTimestamp: params.parsed.statusTimestamp,
      destinationKey: destinationKey(),
      eventId: params.eventId,
      hasPhone: Boolean(params.parsed.phone),
      hasEmail: Boolean(params.parsed.email),
      sanitizedPayload: params.sanitizedPayload as any
    } as any
  }
}).catch(() => null);

export const handleSalesDriveWebhook = async (request: WebhookRequestLike) => {
  const validation = validateSalesDriveWebhookSecret(request);
  if (!validation.ok) return { ok: false, statusCode: validation.reason === 'WEBHOOK_SECRET_MISSING' ? 503 : 401, reason: validation.reason };

  const body = isRecord(request.body) ? request.body : {};
  const sanitizedPayload = sanitizeSalesDriveWebhookPayload(body);
  const parsed = parseSalesDriveWebhookPayload(body);
  const companyId = request.companyId || null;

  await logWebhookDecision({
    companyId,
    action: 'WEBHOOK_RECEIVED',
    status: 'OK',
    message: 'SalesDrive webhook received',
    parsed,
    sanitizedPayload
  });

  if (!parsed.orderId) {
    await logWebhookDecision({ companyId, action: 'WEBHOOK_RULE_SKIPPED', status: 'WARN', parsed, reason: 'missing_order_id' });
    return { ok: true, sent: false, reason: 'missing_order_id' };
  }
  if (!parsed.statusTimestamp || !toUnixStatusTime(parsed.statusTimestamp)) {
    await logWebhookDecision({ companyId, action: 'WEBHOOK_RULE_SKIPPED', status: 'WARN', parsed, reason: 'incomplete_status_timestamp' });
    return { ok: true, sent: false, reason: 'incomplete_status_timestamp' };
  }
  const webhookContext = await resolveB2CBotWebhookContext(parsed, companyId);
  const resolvedCompanyId = webhookContext.companyId || companyId;
  if (!webhookContext.isB2C) {
    await logWebhookDecision({ companyId, action: 'WEBHOOK_RULE_SKIPPED', status: 'OK', parsed, reason: 'non_b2c_bot_origin' });
    return { ok: true, sent: false, reason: 'non_b2c_bot_origin' };
  }

  const decision = statusDecision(parsed);
  if (!decision.send || !decision.eventName) {
    await logWebhookDecision({
      companyId: resolvedCompanyId,
      action: 'WEBHOOK_RULE_SKIPPED',
      status: 'OK',
      parsed,
      reason: decision.reason
    });
    return { ok: true, sent: false, reason: decision.reason };
  }

  const statusTime = toUnixStatusTime(parsed.statusTimestamp)!;
  const eventId = `salesdrive:${parsed.orderId}:${decision.eventName}:${parsed.statusId}:${statusTime}:${destinationKey()}`;
  const existing = await prisma.integrationEventLog.findUnique({
    where: { idempotencyKey: eventId }
  }).catch(() => null);
  if (existing?.status === 'SUCCESS') {
    await logWebhookDecision({ companyId: resolvedCompanyId, action: 'WEBHOOK_DEDUP_SKIPPED', status: 'OK', parsed, reason: 'duplicate_success', eventId });
    return { ok: true, sent: false, duplicate: true, eventId };
  }

  const metaResult = await new MetaCapiService().trackB2CBotDatasetEvent(resolvedCompanyId || 'default', decision.eventName, {
    entityType: 'salesdrive_status',
    entityId: parsed.orderId,
    eventId,
    externalId: `salesdrive:${parsed.orderId}`,
    phone: parsed.phone,
    email: parsed.email,
    value: parsed.value,
    currency: parsed.currency,
    actionSource: 'system_generated',
    customData: {
      salesdrive_order_id: parsed.orderId,
      salesdrive_lead_id: parsed.leadId,
      status_id: parsed.statusId,
      status_name: parsed.statusName,
      status_time: statusTime,
      destination_key: destinationKey()
    }
  });

  await logWebhookDecision({
    companyId: resolvedCompanyId,
    action: metaResult?.success ? 'WEBHOOK_META_SENT' : 'WEBHOOK_META_FAILED',
    status: metaResult?.success ? 'SUCCESS' : 'ERROR',
    parsed,
    reason: metaResult?.success ? 'sent' : (metaResult?.reason || metaResult?.error || 'meta_send_failed'),
    eventId
  });

  return {
    ok: true,
    sent: Boolean(metaResult?.success),
    eventName: decision.eventName,
    eventId,
    reason: metaResult?.success ? undefined : (metaResult?.reason || metaResult?.error)
  };
};
