import { prisma } from '../../../services/prisma.js';
import { MetaCapiService } from '../meta/metaCapi.service.js';
import { sanitizeMetaEventSourceUrl } from '../meta/metaEventSourceUrl.js';
import { readAttributionSnapshot } from '../../Attribution/attributionPayload.js';
import { attributionSessionService } from '../../Attribution/attributionSession.service.js';
import { isEnvFlagEnabled } from '../../../services/featureFlags.js';
import type { AttributionSnapshot } from '../../Attribution/attributionTypes.js';

const SALESDRIVE_INTEGRATION = 'SALESDRIVE';
const DEFAULT_DESTINATION_KEY = 'b2c_bot_sandbox';
const SALESDRIVE_B2C_META_STATUS_MAP_ENV = 'SALESDRIVE_B2C_META_STATUS_MAP';
const SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST_ENV = 'SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST';
const SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST_ENV = 'SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST';
const SALESDRIVE_DEFAULT_CURRENCY_ENV = 'SALESDRIVE_DEFAULT_CURRENCY';
const SALESDRIVE_WEBHOOK_TIMEZONE_OFFSET_MINUTES_ENV = 'SALESDRIVE_WEBHOOK_TIMEZONE_OFFSET_MINUTES';
const APPROVED_SALESDRIVE_META_EVENTS = new Set([
  'Lead',
  'QualifiedLead',
  'Purchase',
  'Contact',
  'Contacted',
  'Schedule',
  'Scheduled',
  'Won'
]);

type WebhookRequestLike = {
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  companyId?: string | null;
};

type ParsedSalesDriveStatus = {
  orderId?: string;
  leadId?: string;
  account?: string;
  formId?: string;
  webhookEvent?: string;
  statusId?: string;
  statusName?: string;
  statusTimestamp?: string;
  phone?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  attributionToken?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  eventSourceUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  value?: number;
  currency?: string;
  comment?: string;
  source?: string;
};

type SalesDriveMetaStatusRule = {
  statusIds: string[];
  statusNames: string[];
  eventName: string;
  crmStatus: string;
  requireValue: boolean;
  requireCurrency: boolean;
  enabled: boolean;
};

type B2CBotWebhookContext = {
  isB2C: boolean;
  companyId?: string;
  attribution: AttributionSnapshot | null;
  payloads: Record<string, unknown>[];
  lead?: {
    clientName?: string | null;
    phone?: string | null;
    userTgId?: string | null;
  } | null;
};

const toText = (value: unknown) => String(value || '').trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const normalizeRuleText = (value: unknown) => toText(value).toLowerCase();
const splitRuleList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(toText).filter(Boolean);
  const text = toText(value);
  return text ? text.split(/[|,]/).map((item) => item.trim()).filter(Boolean) : [];
};

const ruleBoolean = (value: unknown, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(toText(value).toLowerCase());
};

const defaultCrmStatus = (eventName: string) =>
  eventName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const normalizeSalesDriveMetaRule = (value: unknown): SalesDriveMetaStatusRule | null => {
  if (!isRecord(value)) return null;
  const eventName = toText(value.eventName || value.event_name || value.event);
  if (!APPROVED_SALESDRIVE_META_EVENTS.has(eventName)) return null;

  const statusIds = splitRuleList(value.statusIds || value.status_ids || value.statusId || value.status_id);
  const statusNames = splitRuleList(value.statusNames || value.status_names || value.statusName || value.status_name)
    .map(normalizeRuleText)
    .filter(Boolean);
  if (!statusIds.length && !statusNames.length) return null;

  return {
    statusIds,
    statusNames,
    eventName,
    crmStatus: toText(value.crmStatus || value.crm_status) || defaultCrmStatus(eventName),
    requireValue: ruleBoolean(value.requireValue || value.require_value, false),
    requireCurrency: ruleBoolean(value.requireCurrency || value.require_currency, false),
    enabled: !ruleBoolean(value.disabled, false) && ruleBoolean(value.enabled, true)
  };
};

const normalizeSalesDriveMetaRuleEntry = (statusKey: string, value: unknown): SalesDriveMetaStatusRule | null => {
  if (isRecord(value)) {
    return normalizeSalesDriveMetaRule({
      ...value,
      statusIds: value.statusIds || value.status_ids || splitRuleList(statusKey)
    });
  }
  const [eventName, crmStatus] = toText(value).split(':').map((item) => item.trim());
  return normalizeSalesDriveMetaRule({
    statusIds: splitRuleList(statusKey),
    eventName,
    crmStatus
  });
};

const DEFAULT_SALESDRIVE_META_STATUS_RULES: SalesDriveMetaStatusRule[] = [{
  statusIds: ['13'],
  statusNames: [],
  eventName: 'Contacted',
  crmStatus: 'contacted',
  requireValue: false,
  requireCurrency: false,
  enabled: true
}];

export const parseSalesDriveB2CMetaStatusMap = (raw: unknown = process.env[SALESDRIVE_B2C_META_STATUS_MAP_ENV]) => {
  const text = toText(raw);
  if (!text) {
    return { configured: false, rules: DEFAULT_SALESDRIVE_META_STATUS_RULES };
  }

  try {
    const parsed = JSON.parse(text);
    const candidates = Array.isArray(parsed)
      ? parsed.map(normalizeSalesDriveMetaRule)
      : isRecord(parsed)
        ? Object.entries(parsed).map(([statusKey, value]) => normalizeSalesDriveMetaRuleEntry(statusKey, value))
        : [];
    const rules = candidates.filter((rule): rule is SalesDriveMetaStatusRule => Boolean(rule?.enabled));
    return { configured: true, rules };
  } catch {
    return { configured: true, rules: [], invalid: true };
  }
};

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

const firstRecord = (value: unknown): Record<string, unknown> =>
  Array.isArray(value) ? value.find(isRecord) || {} : {};

const pickFromRecords = (records: Record<string, unknown>[], keys: string[]) => {
  for (const record of records) {
    const value = pick(record, keys);
    if (value !== undefined) return value;
  }
  return undefined;
};

const joinText = (...values: unknown[]) => values.map(toText).filter(Boolean).join(' | ');
const joinName = (...values: unknown[]) => values.map(toText).filter(Boolean).join(' ');

const readNormalizedEnvList = (name: string) =>
  splitRuleList(process.env[name]).map(normalizeRuleText).filter(Boolean);

const readTimezoneOffsetMinutes = () => {
  const parsed = Number(process.env[SALESDRIVE_WEBHOOK_TIMEZONE_OFFSET_MINUTES_ENV]);
  return Number.isFinite(parsed) ? parsed : 0;
};

const findSalesDriveStatusOptionText = (body: Record<string, unknown>, statusId: string) => {
  if (!statusId) return '';
  const fields = nestedPick(body, ['meta'], ['fields']);
  const statusField = isRecord(fields)
    ? (isRecord(fields.statusId) ? fields.statusId : isRecord(fields.status) ? fields.status : {})
    : {};
  const options = Array.isArray(statusField.options) ? statusField.options : [];
  const option = options.find((item) => {
    if (!isRecord(item)) return false;
    return toText(item.value) === statusId || toText(item.id) === statusId;
  });
  return isRecord(option) ? toText(option.text || option.name || option.label) : '';
};

const isConfiguredB2CWebhookOrigin = (parsed: ParsedSalesDriveStatus) => {
  const accountAllowlist = readNormalizedEnvList(SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST_ENV);
  if (!accountAllowlist.length || !parsed.account) return false;
  if (!accountAllowlist.includes(normalizeRuleText(parsed.account))) return false;

  const formAllowlist = readNormalizedEnvList(SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST_ENV);
  if (!formAllowlist.length) return true;
  return Boolean(parsed.formId && formAllowlist.includes(normalizeRuleText(parsed.formId)));
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
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
      .replace(/(?:\+?\d[\d\s()\-]{6,}\d)/g, (match, offset, input) => {
        const before = input[offset - 1] || '';
        const after = input[offset + match.length] || '';
        return before === '.' || after === ':' || after === '.' ? match : '[redacted-phone]';
      });
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
  const text = toText(value);
  if (!text) return undefined;
  const compact = text.replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  const normalized = compact.includes(',') && !compact.includes('.')
    ? compact.replace(',', '.')
    : compact.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readCommentLineValue = (comment: string | undefined, key: string) => {
  const text = toText(comment);
  if (!text) return '';
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:\\s*([^\\n;]+)`, 'i'));
  return toText(match?.[1]);
};

const readCommentIp = (comment: string | undefined) =>
  readCommentLineValue(comment, 'IP') || toText(toText(comment).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0]);

const readCommentDomainUrl = (comment: string | undefined) => {
  const domain = readCommentLineValue(comment, 'Domain');
  if (!domain) return '';
  if (/^https?:\/\//i.test(domain)) return domain;
  return `https://${domain.replace(/^\/+|\/+$/g, '')}/`;
};

const readDirectEventSourceUrl = (...records: Record<string, unknown>[]) =>
  toText(pickFromRecords(records, [
    'event_source_url',
    'eventSourceUrl',
    'landing_url',
    'landingUrl',
    'page_url',
    'pageUrl',
    'source_url',
    'sourceUrl',
    'url',
    'site'
  ]));

const readCartieRequestId = (value?: string) => {
  const text = toText(value);
  if (!text) return '';
  return toText(
    text.match(/\bcartie_request_id\s*[:=]\s*([A-Za-z0-9_-]+)/i)?.[1]
    || text.match(/\brequest(?:Id|_id)?\s*[:=]\s*([A-Za-z0-9_-]+)/i)?.[1]
  );
};

const ATTRIBUTION_TOKEN_KEYS = [
  'cartie_attribution_token',
  'cartieAttributionToken',
  'attribution_token',
  'attributionToken',
  'tracking_token',
  'trackingToken',
  'utm_cartie_token',
  'utmCartieToken',
  'utm_cartie_attribution_token',
  'utmCartieAttributionToken',
  'start_param',
  'startParam'
];

const UTM_ATTRIBUTION_TOKEN_CARRIER_KEYS = [
  'utm_term',
  'utmTerm',
  'utm_content',
  'utmContent',
  'utm_campaign',
  'utmCampaign',
  'utm_source',
  'utmSource',
  'utm_medium',
  'utmMedium',
  'utm_id',
  'utmId'
];

const readAttributionTokenFromComment = (comment: string | undefined) => {
  const text = toText(comment);
  if (!text) return '';
  for (const key of ATTRIBUTION_TOKEN_KEYS) {
    const lineValue = readCommentLineValue(text, key);
    if (lineValue) return lineValue;
  }
  return toText(
    text.match(/\bcartie_attribution_token\s*[:=]\s*([A-Za-z0-9_-]{12,80})/i)?.[1]
    || text.match(/\battribution_token\s*[:=]\s*([A-Za-z0-9_-]{12,80})/i)?.[1]
  );
};

const readAttributionTokenFromUtmText = (value: unknown) => {
  const text = toText(value);
  if (!text) return '';
  return toText(
    text.match(/\bcartie_token_([A-Za-z0-9_-]{12,80}?)(?=__term_|__original_|__orig_|[|;&,\s]|$)/i)?.[1]
    || text.match(/\bcartie_attribution_([A-Za-z0-9_-]{12,80}?)(?=__term_|__original_|__orig_|[|;&,\s]|$)/i)?.[1]
    || text.match(/\bcartie_attribution_token[:=]([A-Za-z0-9_-]{12,80}?)(?=__term_|__original_|__orig_|[|;&,\s]|$)/i)?.[1]
  );
};

const readAttributionTokenFromUtmCarriers = (records: Record<string, unknown>[], comment?: string) => {
  for (const key of UTM_ATTRIBUTION_TOKEN_CARRIER_KEYS) {
    const direct = readAttributionTokenFromUtmText(pickFromRecords(records, [key]));
    if (direct) return direct;
    const fromComment = readAttributionTokenFromUtmText(readCommentLineValue(comment, key));
    if (fromComment) return fromComment;
  }
  return '';
};

const recordSources = (payload: Record<string, unknown>) => {
  const nestedPayload = isRecord(payload.payload) ? payload.payload : {};
  return [
    payload,
    isRecord(payload.tracking) ? payload.tracking : {},
    isRecord(payload.request) ? payload.request : {},
    isRecord(payload.telegram) ? payload.telegram : {},
    isRecord(payload.criteria) ? payload.criteria : {},
    nestedPayload,
    isRecord(nestedPayload.tracking) ? nestedPayload.tracking : {},
    isRecord(nestedPayload.request) ? nestedPayload.request : {},
    isRecord(nestedPayload.telegram) ? nestedPayload.telegram : {},
    isRecord(nestedPayload.criteria) ? nestedPayload.criteria : {}
  ].filter((item) => Object.keys(item).length);
};

const readPayloadText = (payloads: Record<string, unknown>[], keys: string[]) => {
  for (const payload of payloads) {
    const value = pickFromRecords(recordSources(payload), keys);
    if (value !== undefined && toText(value)) return toText(value);
  }
  return '';
};

const readPayloadCity = (payloads: Record<string, unknown>[]) => {
  const direct = readPayloadText(payloads, ['city', 'location']);
  if (direct) return direct;
  for (const payload of payloads) {
    for (const source of recordSources(payload)) {
      const cities = source.cities;
      if (!Array.isArray(cities)) continue;
      const firstCity = cities.find((item) => isRecord(item) || toText(item));
      if (isRecord(firstCity)) {
        const city = toText(pick(firstCity, ['label', 'name', 'city']));
        if (city) return city;
      }
      const city = toText(firstCity);
      if (city) return city;
    }
  }
  return '';
};

const compactPayloads = (...payloads: unknown[]) =>
  payloads.filter((payload): payload is Record<string, unknown> => isRecord(payload) && Object.keys(payload).length > 0);

export const parseSalesDriveWebhookPayload = (body: Record<string, unknown>): ParsedSalesDriveStatus => {
  const order = isRecord(body.order) ? body.order : {};
  const lead = isRecord(body.lead) ? body.lead : {};
  const client = isRecord(body.client) ? body.client : {};
  const data = isRecord(body.data) ? body.data : {};
  const info = isRecord(body.info) ? body.info : {};
  const firstContact = firstRecord(data.contacts);

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
  const account = toText(pick(body, ['account']) || pick(info, ['account']));
  const formId = toText(pick(body, ['formId', 'form_id']) || pick(order, ['formId', 'form_id']) || pick(data, ['formId', 'form_id']));
  const webhookEvent = toText(pick(body, ['webhookEvent', 'webhook_event']) || pick(info, ['webhookEvent', 'webhook_event']));
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
    || findSalesDriveStatusOptionText(body, statusId)
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
    || pickFromRecords([firstContact], ['phone', 'clientPhone', 'phoneNumber'])
  );
  const email = toText(
    pick(body, ['email', 'clientEmail'])
    || pick(client, ['email', 'clientEmail'])
    || pick(order, ['email', 'clientEmail'])
    || pick(data, ['email', 'clientEmail'])
    || pickFromRecords([firstContact], ['email', 'clientEmail'])
  );
  const firstName = toText(
    pick(body, ['firstName', 'first_name', 'fName', 'fname'])
    || pick(client, ['firstName', 'first_name', 'fName', 'fname'])
    || pick(order, ['firstName', 'first_name', 'fName', 'fname'])
    || pick(data, ['firstName', 'first_name', 'fName', 'fname'])
    || pickFromRecords([firstContact], ['firstName', 'first_name', 'fName', 'fname'])
  );
  const lastName = toText(
    pick(body, ['lastName', 'last_name', 'lName', 'lname'])
    || pick(client, ['lastName', 'last_name', 'lName', 'lname'])
    || pick(order, ['lastName', 'last_name', 'lName', 'lname'])
    || pick(data, ['lastName', 'last_name', 'lName', 'lname'])
    || pickFromRecords([firstContact], ['lastName', 'last_name', 'lName', 'lname'])
  );
  const name = toText(
    pick(body, ['name', 'clientName', 'fullName'])
    || pick(client, ['name', 'clientName', 'fullName'])
    || pick(order, ['name', 'clientName', 'fullName'])
    || pick(data, ['name', 'clientName', 'fullName'])
    || pickFromRecords([firstContact], ['name', 'clientName', 'fullName'])
  ) || joinName(firstName, lastName);
  const comment = toText(
    pick(body, ['comment', 'sourceComment'])
    || pick(order, ['comment', 'sourceComment'])
    || pick(data, ['comment', 'sourceComment'])
  );
  const fbp = toText(
    pick(body, ['fbp', '_fbp', 'utm_fbp', 'utmFbp'])
    || pick(client, ['fbp', '_fbp', 'utm_fbp', 'utmFbp'])
    || pick(order, ['fbp', '_fbp', 'utm_fbp', 'utmFbp'])
    || pick(data, ['fbp', '_fbp', 'utm_fbp', 'utmFbp'])
    || pickFromRecords([firstContact], ['fbp', '_fbp', 'utm_fbp', 'utmFbp'])
  ) || readCommentLineValue(comment, 'fbp') || readCommentLineValue(comment, '_fbp') || readCommentLineValue(comment, 'utm_fbp');
  const fbc = toText(
    pick(body, ['fbc', '_fbc', 'utm_fbc', 'utmFbc'])
    || pick(client, ['fbc', '_fbc', 'utm_fbc', 'utmFbc'])
    || pick(order, ['fbc', '_fbc', 'utm_fbc', 'utmFbc'])
    || pick(data, ['fbc', '_fbc', 'utm_fbc', 'utmFbc'])
    || pickFromRecords([firstContact], ['fbc', '_fbc', 'utm_fbc', 'utmFbc'])
  ) || readCommentLineValue(comment, 'fbc') || readCommentLineValue(comment, '_fbc') || readCommentLineValue(comment, 'utm_fbc');
  const fbclid = toText(
    pick(body, ['fbclid', 'utm_fbclid', 'utmFbclid'])
    || pick(client, ['fbclid', 'utm_fbclid', 'utmFbclid'])
    || pick(order, ['fbclid', 'utm_fbclid', 'utmFbclid'])
    || pick(data, ['fbclid', 'utm_fbclid', 'utmFbclid'])
    || pickFromRecords([firstContact], ['fbclid', 'utm_fbclid', 'utmFbclid'])
  ) || readCommentLineValue(comment, 'fbclid') || readCommentLineValue(comment, 'utm_fbclid');
  const value = toNumber(
    pick(body, ['value', 'amount', 'total', 'paymentAmount', 'payedAmount', 'zagalnaSuma', 'zagalnaSumaDoOplati', 'oplacenoKlientom'])
    || pick(order, ['value', 'amount', 'total', 'paymentAmount', 'payedAmount', 'zagalnaSuma', 'zagalnaSumaDoOplati', 'oplacenoKlientom'])
    || pick(data, ['value', 'amount', 'total', 'paymentAmount', 'payedAmount', 'zagalnaSuma', 'zagalnaSumaDoOplati', 'oplacenoKlientom'])
  );
  const currency = toText(pick(body, ['currency']) || pick(order, ['currency']) || pick(data, ['currency']) || (value !== undefined ? process.env[SALESDRIVE_DEFAULT_CURRENCY_ENV] : undefined)) || undefined;
  const attributionToken = toText(
    pickFromRecords([body, client, order, data, firstContact], ATTRIBUTION_TOKEN_KEYS)
  )
    || readAttributionTokenFromComment(comment)
    || readAttributionTokenFromUtmCarriers([body, client, order, data, firstContact], comment);
  const clientIpAddress = toText(
    pick(body, ['client_ip_address', 'clientIpAddress', 'ip', 'ipAddress'])
    || pick(client, ['client_ip_address', 'clientIpAddress', 'ip', 'ipAddress'])
    || pick(order, ['client_ip_address', 'clientIpAddress', 'ip', 'ipAddress'])
    || pick(data, ['client_ip_address', 'clientIpAddress', 'ip', 'ipAddress'])
    || pickFromRecords([firstContact], ['client_ip_address', 'clientIpAddress', 'ip', 'ipAddress', 'con_iPN', 'con_ipn', 'conIp'])
  ) || readCommentIp(comment);
  const clientUserAgent = toText(
    pick(body, ['client_user_agent', 'clientUserAgent', 'user_agent', 'userAgent'])
    || pick(client, ['client_user_agent', 'clientUserAgent', 'user_agent', 'userAgent'])
    || pick(order, ['client_user_agent', 'clientUserAgent', 'user_agent', 'userAgent'])
    || pick(data, ['client_user_agent', 'clientUserAgent', 'user_agent', 'userAgent'])
    || pickFromRecords([firstContact], ['client_user_agent', 'clientUserAgent', 'user_agent', 'userAgent'])
  );
  const eventSourceUrl = readDirectEventSourceUrl(body, client, order, data, firstContact) || readCommentDomainUrl(comment);
  const utmSource = toText(pick(body, ['utm_source', 'utmSource']) || pick(order, ['utm_source', 'utmSource']) || pick(data, ['utm_source', 'utmSource'])) || readCommentLineValue(comment, 'utm_source');
  const utmMedium = toText(pick(body, ['utm_medium', 'utmMedium']) || pick(order, ['utm_medium', 'utmMedium']) || pick(data, ['utm_medium', 'utmMedium'])) || readCommentLineValue(comment, 'utm_medium');
  const utmCampaign = toText(pick(body, ['utm_campaign', 'utmCampaign']) || pick(order, ['utm_campaign', 'utmCampaign']) || pick(data, ['utm_campaign', 'utmCampaign'])) || readCommentLineValue(comment, 'utm_campaign');
  const utmContent = toText(pick(body, ['utm_content', 'utmContent']) || pick(order, ['utm_content', 'utmContent']) || pick(data, ['utm_content', 'utmContent'])) || readCommentLineValue(comment, 'utm_content');
  const utmTerm = toText(pick(body, ['utm_term', 'utmTerm']) || pick(order, ['utm_term', 'utmTerm']) || pick(data, ['utm_term', 'utmTerm'])) || readCommentLineValue(comment, 'utm_term');
  const source = toText(
    joinText(
      pick(body, ['source', 'prodex24source', 'utmSource', 'utmSourceFull', 'utmCampaign']),
      pick(order, ['source', 'prodex24source', 'utmSource', 'utmSourceFull', 'utmCampaign']),
      pick(data, ['source', 'prodex24source', 'utmSource', 'utmSourceFull', 'utmCampaign', 'integrationType', 'campaignId', 'dzerelo']),
      account,
      webhookEvent
    )
  );

  return {
    orderId: orderId || leadId || undefined,
    leadId: leadId || undefined,
    account: account || undefined,
    formId: formId || undefined,
    webhookEvent: webhookEvent || undefined,
    statusId: statusId || undefined,
    statusName: statusName || undefined,
    statusTimestamp: statusTimestamp || undefined,
    phone: phone || undefined,
    email: email || undefined,
    name: name || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    fbp: fbp || undefined,
    fbc: fbc || undefined,
    fbclid: fbclid || undefined,
    attributionToken: attributionToken || undefined,
    clientIpAddress: clientIpAddress || undefined,
    clientUserAgent: clientUserAgent || undefined,
    eventSourceUrl: eventSourceUrl || undefined,
    utmSource: utmSource || undefined,
    utmMedium: utmMedium || undefined,
    utmCampaign: utmCampaign || undefined,
    utmContent: utmContent || undefined,
    utmTerm: utmTerm || undefined,
    value,
    currency,
    comment: comment || undefined,
    source: source || undefined
  };
};

const resolveB2CBotWebhookContext = async (parsed: ParsedSalesDriveStatus, companyId?: string | null): Promise<B2CBotWebhookContext> => {
  const text = [parsed.comment, parsed.source].filter(Boolean).join(' ').toLowerCase();
  const b2cByText = text.includes('cartié b2c') || text.includes('cartie b2c') || text.includes('b2c_bot') || text.includes(DEFAULT_DESTINATION_KEY);
  const b2cByConfiguredOrigin = isConfiguredB2CWebhookOrigin(parsed);
  const directAttribution = await attributionSessionService
    .resolveSnapshotFromToken(parsed.attributionToken, { consume: false })
    .catch(() => null);
  const directAttributionPayload = directAttribution ? { attribution: directAttribution } : {};
  const b2cByAttributionToken = Boolean(directAttribution);

  if (!parsed.orderId) {
    return {
      isB2C: b2cByText || b2cByConfiguredOrigin || b2cByAttributionToken,
      companyId: companyId || undefined,
      attribution: directAttribution,
      payloads: compactPayloads(directAttributionPayload)
    };
  }
  const identity = await prisma.leadIdentity.findFirst({
    where: {
      ...(companyId ? { companyId } : {}),
      provider: 'SALESDRIVE',
      externalId: parsed.orderId
    },
    include: { lead: true }
  }).catch(() => null);
  const lead = (identity as any)?.lead || null;
  const leadPayload = isRecord(lead?.payload) ? lead.payload : {};
  const identityPayload = isRecord((identity as any)?.payload) ? (identity as any).payload : {};
  const linkedRequestId = toText(identityPayload.requestId || identityPayload.request_id || readCartieRequestId(parsed.comment) || readCartieRequestId(parsed.source));
  const linkedRequest = linkedRequestId
    ? await prisma.b2bRequest.findFirst({
        where: {
          ...(companyId ? { companyId } : {}),
          OR: [
            { id: linkedRequestId },
            { publicId: linkedRequestId }
          ]
        },
        select: { companyId: true, payload: true, requesterPartnerId: true }
      }).catch(() => null)
    : null;
  const linkedRequestPayload = isRecord((linkedRequest as any)?.payload) ? (linkedRequest as any).payload : {};
  const attribution = directAttribution
    || readAttributionSnapshot(linkedRequestPayload)
    || readAttributionSnapshot(leadPayload)
    || readAttributionSnapshot(identityPayload);
  const identityCompanyId = toText((identity as any)?.companyId || (identity as any)?.lead?.companyId);
  const linkedPayloads = compactPayloads(directAttributionPayload, linkedRequestPayload, leadPayload, identityPayload);
  if (toText(leadPayload.source) === 'b2c_bot' || toText(leadPayload.destination_key) === DEFAULT_DESTINATION_KEY) {
    return { isB2C: true, companyId: companyId || identityCompanyId || undefined, attribution, payloads: linkedPayloads, lead };
  }
  if (linkedRequest && !toText((linkedRequest as any).requesterPartnerId)) {
    const linkedRequestIsB2C = toText(linkedRequestPayload.source) === 'b2c_bot'
      || toText(linkedRequestPayload.destination_key) === DEFAULT_DESTINATION_KEY;
    if (linkedRequestIsB2C) {
      return { isB2C: true, companyId: companyId || toText((linkedRequest as any).companyId) || identityCompanyId || undefined, attribution, payloads: linkedPayloads, lead };
    }
  }

  const requestIds = Array.from(new Set([
    readCartieRequestId(parsed.comment),
    readCartieRequestId(parsed.source),
    parsed.orderId
  ].map(toText).filter(Boolean)));
  const request = await prisma.b2bRequest.findFirst({
    where: {
      ...(companyId ? { companyId } : {}),
      OR: [
        ...requestIds.map((id) => ({ publicId: id })),
        ...requestIds.map((id) => ({ id }))
      ]
    },
    select: { companyId: true, payload: true, requesterPartnerId: true }
  }).catch(() => null);
  const requestPayload = isRecord((request as any)?.payload) ? (request as any).payload : {};
  const requestIsB2C = !toText((request as any)?.requesterPartnerId)
    && (toText(requestPayload.source) === 'b2c_bot' || toText(requestPayload.destination_key) === DEFAULT_DESTINATION_KEY);
  return {
    isB2C: requestIsB2C || b2cByText || b2cByConfiguredOrigin || b2cByAttributionToken,
    companyId: companyId || toText((request as any)?.companyId) || undefined,
    attribution: readAttributionSnapshot(requestPayload) || attribution,
    payloads: compactPayloads(requestPayload, ...linkedPayloads),
    lead
  };
};

const matchesSalesDriveMetaRule = (rule: SalesDriveMetaStatusRule, parsed: ParsedSalesDriveStatus) => {
  const statusId = toText(parsed.statusId);
  const statusName = normalizeRuleText(parsed.statusName);
  return (statusId && rule.statusIds.includes(statusId))
    || Boolean(statusName && rule.statusNames.some((needle) => statusName.includes(needle)));
};

const statusDecision = (parsed: ParsedSalesDriveStatus) => {
  const statusId = toText(parsed.statusId);
  const statusName = toText(parsed.statusName);
  const statusMap = parseSalesDriveB2CMetaStatusMap();
  const { configured, rules } = statusMap;
  const rule = rules.find((item) => matchesSalesDriveMetaRule(item, parsed));

  if (rule) {
    if (['Purchase', 'Won'].includes(rule.eventName) && !isEnvFlagEnabled('META_B2C_BOT_PURCHASE_ENABLED', false)) {
      return { send: false, reason: 'purchase_disabled' };
    }
    if (rule.requireValue && parsed.value === undefined) {
      return { send: false, reason: 'missing_purchase_value' };
    }
    if (rule.requireCurrency && !parsed.currency) {
      return { send: false, reason: 'missing_purchase_currency' };
    }
    return { send: true, eventName: rule.eventName, crmStatus: rule.crmStatus };
  }

  if (!statusId && !statusName) return { send: false, reason: 'missing_status_id' };
  if (configured) return { send: false, reason: statusMap.invalid ? 'status_map_invalid' : 'status_skipped' };
  if (statusId === '13') return { send: true, eventName: 'Contacted', crmStatus: 'contacted' };
  if (!configured && ['2', '9'].includes(statusId)) return { send: false, reason: 'qualified_lead_unconfirmed' };
  if (!configured && ['5', '11'].includes(statusId)) return { send: false, reason: 'purchase_disabled' };
  return { send: false, reason: 'status_skipped' };
};

const toUnixStatusTime = (value?: string) => {
  const text = toText(value);
  const localDmyDate = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const localYmdDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const localParts = localDmyDate
    ? {
        year: Number(localDmyDate[3]),
        month: Number(localDmyDate[2]),
        day: Number(localDmyDate[1]),
        hour: Number(localDmyDate[4] || 0),
        minute: Number(localDmyDate[5] || 0),
        second: Number(localDmyDate[6] || 0)
      }
    : localYmdDate
      ? {
          year: Number(localYmdDate[1]),
          month: Number(localYmdDate[2]),
          day: Number(localYmdDate[3]),
          hour: Number(localYmdDate[4] || 0),
          minute: Number(localYmdDate[5] || 0),
          second: Number(localYmdDate[6] || 0)
        }
      : null;
  const date = localParts
    ? new Date(Date.UTC(
        localParts.year,
        localParts.month - 1,
        localParts.day,
        localParts.hour,
        localParts.minute,
        localParts.second
      ) - readTimezoneOffsetMinutes() * 60_000)
    : new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;
  return String(Math.floor(date.getTime() / 1000));
};

const destinationKey = () => toText(process.env.META_B2C_BOT_DESTINATION_KEY) || DEFAULT_DESTINATION_KEY;

const buildFbcFromFbclid = (fbclid: string | undefined, statusTime: string) => {
  const clickId = toText(fbclid);
  const seconds = Number(statusTime);
  if (!clickId || !Number.isFinite(seconds)) return undefined;
  return `fb.1.${Math.floor(seconds * 1000)}.${clickId}`;
};

const hasMetaMatchData = (params: {
  parsed: ParsedSalesDriveStatus;
  fbp?: string;
  fbc?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
}) => Boolean(
  params.parsed.phone
  || params.parsed.email
  || params.parsed.name
  || params.parsed.firstName
  || params.parsed.lastName
  || params.fbp
  || params.fbc
  || params.clientIpAddress
  || params.clientUserAgent
);

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
      salesDriveAccount: params.parsed.account,
      salesDriveFormId: params.parsed.formId,
      salesDriveWebhookEvent: params.parsed.webhookEvent,
      statusId: params.parsed.statusId,
      statusName: params.parsed.statusName,
      statusTimestamp: params.parsed.statusTimestamp,
      destinationKey: destinationKey(),
      eventId: params.eventId,
      hasPhone: Boolean(params.parsed.phone),
      hasEmail: Boolean(params.parsed.email),
      hasName: Boolean(params.parsed.name || params.parsed.firstName || params.parsed.lastName),
      hasClientIp: Boolean(params.parsed.clientIpAddress),
      hasClientUserAgent: Boolean(params.parsed.clientUserAgent),
      hasFbp: Boolean(params.parsed.fbp),
      hasFbc: Boolean(params.parsed.fbc || params.parsed.fbclid),
      hasAttributionToken: Boolean(params.parsed.attributionToken),
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
  const attribution = webhookContext.attribution || null;
  const attributionIdentifiers = attribution?.identifiers || {};
  const attributionQuery = attribution?.query || {};
  const payloads = webhookContext.payloads || [];
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
  const phone = parsed.phone || readPayloadText(payloads, ['phone', 'clientPhone', 'contact']);
  const email = parsed.email || readPayloadText(payloads, ['email', 'clientEmail']);
  const name = parsed.name || readPayloadText(payloads, ['name', 'clientName', 'fullName']) || toText(webhookContext.lead?.clientName);
  const firstName = parsed.firstName || readPayloadText(payloads, ['firstName', 'first_name', 'fName', 'fname']);
  const lastName = parsed.lastName || readPayloadText(payloads, ['lastName', 'last_name', 'lName', 'lname']);
  const fbp = parsed.fbp || attributionIdentifiers.fbp || readPayloadText(payloads, ['fbp', '_fbp']);
  const fbc = parsed.fbc || attributionIdentifiers.fbc || readPayloadText(payloads, ['fbc', '_fbc']) || buildFbcFromFbclid(parsed.fbclid || readPayloadText(payloads, ['fbclid']), statusTime);
  const clientIpAddress = parsed.clientIpAddress || attributionIdentifiers.client_ip_address || readPayloadText(payloads, ['client_ip_address', 'clientIpAddress', 'ip', 'ipAddress', 'con_iPN', 'con_ipn', 'conIp']);
  const clientUserAgent = parsed.clientUserAgent || attributionIdentifiers.client_user_agent || readPayloadText(payloads, ['client_user_agent', 'clientUserAgent', 'user_agent', 'userAgent']);
  const eventSourceUrl = sanitizeMetaEventSourceUrl(parsed.eventSourceUrl || attribution?.event_source_url || readPayloadText(payloads, ['event_source_url', 'eventSourceUrl', 'landing_url', 'landingUrl', 'site']));
  const city = readPayloadCity(payloads);
  const country = readPayloadText(payloads, ['country', 'countryCode']);
  const telegramUserId = readPayloadText(payloads, ['telegram_user_id', 'telegramUserId', 'userId']) || toText(webhookContext.lead?.userTgId);
  const externalIds = [
    `salesdrive:${parsed.orderId}`,
    telegramUserId ? `telegram:${telegramUserId}` : ''
  ].filter(Boolean);
  const matchParsed = { ...parsed, phone, email, name, firstName, lastName };
  if (!hasMetaMatchData({ parsed: matchParsed, fbp, fbc, clientIpAddress, clientUserAgent })) {
    await logWebhookDecision({ companyId: resolvedCompanyId, action: 'WEBHOOK_RULE_SKIPPED', status: 'WARN', parsed, reason: 'missing_match_identifiers', eventId });
    return { ok: true, sent: false, reason: 'missing_match_identifiers', eventId };
  }

  const metaResult = await new MetaCapiService().trackB2CBotCrmLifecycleEvent(resolvedCompanyId || null, decision.eventName, {
    entityType: 'salesdrive_status',
    entityId: parsed.orderId,
    eventId,
    externalId: externalIds[0],
    externalIds,
    phone,
    email,
    name,
    firstName,
    lastName,
    city,
    country,
    eventTime: statusTime,
    fbp,
    fbc,
    clientIpAddress,
    clientUserAgent,
    eventSourceUrl,
    value: parsed.value,
    currency: parsed.currency,
    actionSource: 'system_generated',
    customData: {
      crm_status: decision.crmStatus,
      salesdrive_order_id: parsed.orderId,
      salesdrive_lead_id: parsed.leadId,
      salesdrive_account: parsed.account,
      salesdrive_form_id: parsed.formId,
      status_id: parsed.statusId,
      status_name: parsed.statusName,
      status_time: statusTime,
      destination_key: destinationKey(),
      utm_source: parsed.utmSource || readPayloadText(payloads, ['utm_source', 'utmSource']) || attributionQuery.utm_source,
      utm_medium: parsed.utmMedium || readPayloadText(payloads, ['utm_medium', 'utmMedium']) || attributionQuery.utm_medium,
      utm_campaign: parsed.utmCampaign || readPayloadText(payloads, ['utm_campaign', 'utmCampaign']) || attributionQuery.utm_campaign,
      utm_content: parsed.utmContent || readPayloadText(payloads, ['utm_content', 'utmContent']) || attributionQuery.utm_content,
      utm_term: parsed.utmTerm || readPayloadText(payloads, ['utm_term', 'utmTerm']) || attributionQuery.utm_term,
      event_source_url: eventSourceUrl
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
