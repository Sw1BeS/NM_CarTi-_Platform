export const SALESDRIVE_INTEGRATION = 'SALESDRIVE';

const DEFAULT_ORDER_LIST_PATH = '/api/order/list/';
const DEFAULT_ORDER_CREATE_PATH = '/handler/';
const DEFAULT_STATUSES_PATH = '/api/statuses/';
const DEFAULT_TIMEOUT_MS = 8000;

type EnvLike = Record<string, string | undefined>;

export type SalesDriveConfig = {
  baseUrl: string;
  apiKey: string;
  orderCreatePath: string;
  orderListPath: string;
  statusesPath: string;
  syncEnabled: boolean;
  writeEnabled: boolean;
  timeoutMs: number;
  missing: string[];
};

export type SafeSalesDriveConfig = Omit<SalesDriveConfig, 'apiKey'> & {
  configured: boolean;
  apiKeyConfigured: boolean;
};

export type SalesDriveHealth = {
  integration: typeof SALESDRIVE_INTEGRATION;
  configured: boolean;
  syncEnabled: boolean;
  writeEnabled: boolean;
  status: 'CONFIG_MISSING' | 'OK' | 'ERROR';
  message: string;
  checkedAt: string;
  httpStatus?: number;
  config: SafeSalesDriveConfig;
};

export type SalesDriveOrderListOptions = {
  page?: number;
  limit?: number;
  orderTimeFrom?: string;
  updateAtFrom?: string;
  statusId?: string | number;
};

export type SalesDriveOrderListResult = {
  page: number;
  limit: number;
  rows: Record<string, unknown>[];
  raw: unknown;
};

export type SalesDriveImportPreview = {
  source: typeof SALESDRIVE_INTEGRATION;
  externalId: string;
  idempotencyKey: string;
  duplicate?: {
    provider: typeof SALESDRIVE_INTEGRATION;
    leadId: string;
  };
  contactCandidate: {
    name?: string;
    phone?: string;
    email?: string;
    salesDriveExternalId: string;
  };
  requestCandidate: {
    source: typeof SALESDRIVE_INTEGRATION;
    title?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    criteria: Record<string, unknown>;
    external: {
      salesDriveOrderId: string;
    };
  };
  warnings: string[];
};

export type SalesDriveOrderProductInput = {
  id?: string | number | null;
  name?: string | null;
  costPerItem?: string | number | null;
  amount?: string | number | null;
  description?: string | null;
  discount?: string | number | null;
  sku?: string | null;
};

export type SalesDriveOrderAddInput = {
  externalId: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  title?: string | null;
  comment?: string | null;
  site?: string | null;
  products?: SalesDriveOrderProductInput[];
  utm?: {
    sourceFull?: string | null;
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    content?: string | null;
    term?: string | null;
    page?: string | null;
  } | null;
};

export type SalesDriveOrderCreateResult = {
  success: boolean;
  externalId: string;
  orderId?: string | number;
  userId?: string | number;
  httpStatus: number;
  raw: unknown;
};

export type SalesDriveFetchLike = (url: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  statusText?: string;
  text: () => Promise<string>;
}>;

const text = (value: unknown) => String(value || '').trim();

const isEnabled = (value: unknown, defaultValue = false) => {
  const normalized = text(value).toLowerCase();
  if (!normalized) return defaultValue;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
};

const normalizeBaseUrl = (value: unknown) => text(value).replace(/\/+$/, '');

const normalizePath = (value: unknown, fallback: string) => {
  const raw = text(value) || fallback;
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const normalizeInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const pick = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && text(value)) return value;
  }
  return undefined;
};

const nestedPick = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== 'object') return undefined;
  return pick(value as Record<string, unknown>, keys);
};

const parseJson = (body: string) => {
  if (!body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch {
    return { rawText: body };
  }
};

const safeMessage = (value: unknown, config: SalesDriveConfig) => {
  const token = text(config.apiKey);
  let message = typeof value === 'object' && value !== null ? JSON.stringify(value) : text(value);
  if (token) message = message.replaceAll(token, '[redacted-salesdrive-key]');
  return message.replace(/(?:\+?\d[\d\s()\-]{6,}\d)/g, '[redacted-phone]');
};

const buildUrl = (config: SalesDriveConfig, path: string, params: Record<string, string | number | undefined> = {}) => {
  const url = new URL(`${config.baseUrl}${normalizePath(path, DEFAULT_ORDER_LIST_PATH)}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url;
};

const ensureConfigured = (config: SalesDriveConfig) => {
  if (!config.missing.length) return;
  throw new Error(`SalesDrive connector is not configured: ${config.missing.join(', ')}`);
};

const normalizePhone = (value: unknown) => {
  const raw = text(value);
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 8) return undefined;
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('380')) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `+38${digits}`;
  return `+${digits}`;
};

const normalizeEmail = (value: unknown) => {
  const email = text(value).toLowerCase();
  return email.includes('@') ? email : undefined;
};

const joinName = (...parts: unknown[]) => parts.map(text).filter(Boolean).join(' ').trim() || undefined;

const firstArrayItem = (value: unknown) => Array.isArray(value) && value.length ? value[0] : undefined;

const compactObject = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')
) as Partial<T>;

const splitName = (input: SalesDriveOrderAddInput) => {
  const explicitFirst = text(input.firstName);
  const explicitLast = text(input.lastName);
  const name = text(input.name);
  if (explicitFirst || explicitLast) {
    return {
      fName: explicitFirst || undefined,
      lName: explicitLast || undefined,
      mName: text(input.middleName) || undefined
    };
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return {
    fName: parts[0],
    lName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
    mName: text(input.middleName) || undefined
  };
};

export const readSalesDriveConfig = (env: EnvLike = process.env): SalesDriveConfig => {
  const baseUrl = normalizeBaseUrl(env.SALESDRIVE_API_BASE_URL || env.SALESDRIVE_API_URL);
  const apiKey = text(env.SALESDRIVE_API_KEY || env.SALESDRIVE_FORM_API_KEY);
  const missing = [
    baseUrl ? '' : 'SALESDRIVE_API_BASE_URL',
    apiKey ? '' : 'SALESDRIVE_API_KEY'
  ].filter(Boolean);

  return {
    baseUrl,
    apiKey,
    orderCreatePath: normalizePath(env.SALESDRIVE_ORDER_CREATE_PATH, DEFAULT_ORDER_CREATE_PATH),
    orderListPath: normalizePath(env.SALESDRIVE_ORDER_LIST_PATH, DEFAULT_ORDER_LIST_PATH),
    statusesPath: normalizePath(env.SALESDRIVE_STATUSES_PATH, DEFAULT_STATUSES_PATH),
    syncEnabled: isEnabled(env.SALESDRIVE_SYNC_ENABLED, false),
    writeEnabled: isEnabled(env.SALESDRIVE_WRITE_ENABLED, false),
    timeoutMs: normalizeInt(env.SALESDRIVE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000, 60000),
    missing
  };
};

export const toSafeSalesDriveConfig = (config: SalesDriveConfig): SafeSalesDriveConfig => ({
  baseUrl: config.baseUrl,
  orderCreatePath: config.orderCreatePath,
  orderListPath: config.orderListPath,
  statusesPath: config.statusesPath,
  syncEnabled: config.syncEnabled,
  writeEnabled: config.writeEnabled,
  timeoutMs: config.timeoutMs,
  missing: config.missing,
  configured: config.missing.length === 0,
  apiKeyConfigured: Boolean(config.apiKey)
});

export const salesDriveHeaders = (config: SalesDriveConfig) => ({
  'Content-Type': 'application/json',
  'Form-Api-Key': config.apiKey
});

const getFetcher = (fetcher?: SalesDriveFetchLike): SalesDriveFetchLike => {
  if (fetcher) return fetcher;
  if (typeof fetch === 'function') return fetch as SalesDriveFetchLike;
  throw new Error('Fetch API is not available in this runtime');
};

export const checkSalesDriveHealth = async (
  config = readSalesDriveConfig(),
  fetcher?: SalesDriveFetchLike
): Promise<SalesDriveHealth> => {
  const checkedAt = new Date().toISOString();
  const safeConfig = toSafeSalesDriveConfig(config);

  if (config.missing.length) {
    return {
      integration: SALESDRIVE_INTEGRATION,
      configured: false,
      syncEnabled: config.syncEnabled,
      writeEnabled: config.writeEnabled,
      status: 'CONFIG_MISSING',
      message: `Missing ${config.missing.join(', ')}`,
      checkedAt,
      config: safeConfig
    };
  }

  try {
    const url = buildUrl(config, config.statusesPath, {});
    const response = await getFetcher(fetcher)(url.toString(), {
      method: 'GET',
      headers: salesDriveHeaders(config),
      signal: AbortSignal.timeout(config.timeoutMs)
    });
    const body = await response.text();
    if (!response.ok) {
      return {
        integration: SALESDRIVE_INTEGRATION,
        configured: true,
        syncEnabled: config.syncEnabled,
        writeEnabled: config.writeEnabled,
        status: 'ERROR',
        message: safeMessage(parseJson(body) || response.statusText || 'SalesDrive health check failed', config),
        checkedAt,
        httpStatus: response.status,
        config: safeConfig
      };
    }

    return {
      integration: SALESDRIVE_INTEGRATION,
      configured: true,
      syncEnabled: config.syncEnabled,
      writeEnabled: config.writeEnabled,
      status: 'OK',
      message: 'SalesDrive read API reachable',
      checkedAt,
      httpStatus: response.status,
      config: safeConfig
    };
  } catch (error) {
    return {
      integration: SALESDRIVE_INTEGRATION,
      configured: true,
      syncEnabled: config.syncEnabled,
      writeEnabled: config.writeEnabled,
      status: 'ERROR',
      message: safeMessage(error instanceof Error ? error.message : String(error), config),
      checkedAt,
      config: safeConfig
    };
  }
};

export const fetchSalesDriveOrderList = async (
  options: SalesDriveOrderListOptions = {},
  config = readSalesDriveConfig(),
  fetcher?: SalesDriveFetchLike
): Promise<SalesDriveOrderListResult> => {
  ensureConfigured(config);
  const page = normalizeInt(options.page, 1, 1, 100000);
  const limit = normalizeInt(options.limit, 50, 1, 100);
  const url = buildUrl(config, config.orderListPath, {
    page,
    limit,
    'filter[orderTime][from]': options.orderTimeFrom,
    'filter[updateAt][from]': options.updateAtFrom,
    'filter[statusId]': options.statusId
  });

  const response = await getFetcher(fetcher)(url.toString(), {
    method: 'GET',
    headers: salesDriveHeaders(config),
    signal: AbortSignal.timeout(config.timeoutMs)
  });
  const body = await response.text();
  const raw = parseJson(body);
  if (!response.ok) {
    throw new Error(safeMessage(raw || response.statusText || 'SalesDrive order export failed', config));
  }

  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rowsCandidate = pick(record, ['data', 'orders', 'items', 'list', 'result']);
  const rows = Array.isArray(raw)
    ? raw as Record<string, unknown>[]
    : Array.isArray(rowsCandidate)
      ? rowsCandidate as Record<string, unknown>[]
      : [];

  return { page, limit, rows, raw };
};

export const buildSalesDriveOrderAddPayload = (
  input: SalesDriveOrderAddInput,
  config: SalesDriveConfig
) => {
  const products = (input.products || [])
    .map((product) => compactObject({
      id: text(product.id) || undefined,
      name: text(product.name) || undefined,
      costPerItem: product.costPerItem ?? undefined,
      amount: product.amount ?? undefined,
      description: text(product.description) || undefined,
      discount: product.discount ?? undefined,
      sku: text(product.sku) || undefined
    }))
    .filter((product) => Object.keys(product).length > 0);
  const name = splitName(input);
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const comment = [
    text(input.title),
    text(input.comment)
  ].filter(Boolean).join('\n') || undefined;
  const utm = input.utm || {};

  return compactObject({
    form: config.apiKey,
    getResultData: 1,
    ...name,
    phone,
    email,
    company: text(input.company) || undefined,
    products: products.length ? products : undefined,
    comment,
    sajt: text(input.site) || undefined,
    externalId: text(input.externalId),
    prodex24source_full: text(utm.sourceFull) || undefined,
    prodex24source: text(utm.source) || undefined,
    prodex24medium: text(utm.medium) || undefined,
    prodex24campaign: text(utm.campaign) || undefined,
    prodex24content: text(utm.content) || undefined,
    prodex24term: text(utm.term) || undefined,
    prodex24page: text(utm.page) || undefined
  });
};

const assertWriteEnabled = (config: SalesDriveConfig) => {
  ensureConfigured(config);
  if (!config.syncEnabled) throw new Error('SalesDrive sync is disabled');
  if (!config.writeEnabled) throw new Error('SalesDrive writes are disabled');
};

export const createSalesDriveOrder = async (
  input: SalesDriveOrderAddInput,
  config = readSalesDriveConfig(),
  fetcher?: SalesDriveFetchLike
): Promise<SalesDriveOrderCreateResult> => {
  assertWriteEnabled(config);
  const externalId = text(input.externalId);
  if (!externalId) throw new Error('SalesDrive externalId is required');

  const url = buildUrl(config, config.orderCreatePath);
  const response = await getFetcher(fetcher)(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSalesDriveOrderAddPayload(input, config)),
    signal: AbortSignal.timeout(config.timeoutMs)
  });
  const body = await response.text();
  const raw = parseJson(body);
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (!response.ok || record.status === 'error' || record.success === false) {
    throw new Error(safeMessage(raw || response.statusText || 'SalesDrive order create failed', config));
  }

  const data = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : {};
  return {
    success: true,
    externalId,
    orderId: data.orderId as string | number | undefined,
    userId: data.userId as string | number | undefined,
    httpStatus: response.status,
    raw
  };
};

export const mapSalesDriveOrderToPreview = (order: Record<string, unknown>): SalesDriveImportPreview => {
  const contact = nestedPick(order, ['contact', 'client', 'customer']) as Record<string, unknown> | undefined;
  const firstContact = firstArrayItem(order.contacts) as Record<string, unknown> | undefined;
  const source = contact || firstContact || {};
  const externalId = text(pick(order, ['id', 'orderId', 'order_id', 'externalId', 'external_id'])) || 'unknown';
  const phone = normalizePhone(
    pick(order, ['phone', 'phoneNumber', 'clientPhone'])
    || pick(source, ['phone', 'phoneNumber', 'clientPhone'])
  );
  const email = normalizeEmail(
    pick(order, ['email', 'clientEmail'])
    || pick(source, ['email', 'clientEmail'])
  );
  const name = joinName(
    pick(order, ['fName', 'firstName']),
    pick(order, ['lName', 'lastName'])
  ) || text(pick(order, ['name', 'clientName']) || pick(source, ['name', 'clientName'])) || undefined;
  const products = Array.isArray(order.products) ? order.products as Record<string, unknown>[] : [];
  const firstProduct = products[0] || {};
  const title = text(
    pick(order, ['title', 'comment', 'description'])
    || pick(firstProduct, ['name', 'title'])
    || 'SalesDrive order'
  );
  const status = text(
    pick(order, ['statusName', 'status', 'statusId'])
    || nestedPick(order.status, ['name', 'id'])
  ) || undefined;
  const createdAt = text(pick(order, ['orderTime', 'createdAt', 'createTime', 'created_at'])) || undefined;
  const updatedAt = text(pick(order, ['updateAt', 'updatedAt', 'updated_at'])) || undefined;
  const warnings = [
    externalId === 'unknown' ? 'missing_external_id' : '',
    phone ? '' : 'missing_phone',
    name ? '' : 'missing_name'
  ].filter(Boolean);

  return {
    source: SALESDRIVE_INTEGRATION,
    externalId,
    idempotencyKey: `salesdrive:order:${externalId}`,
    contactCandidate: {
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      salesDriveExternalId: externalId
    },
    requestCandidate: {
      source: SALESDRIVE_INTEGRATION,
      ...(title ? { title } : {}),
      ...(status ? { status } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      criteria: {
        products: products.map((product) => ({
          id: text(pick(product, ['id', 'productId', 'sku'])) || undefined,
          name: text(pick(product, ['name', 'title'])) || undefined,
          price: pick(product, ['costPerItem', 'price', 'cost'])
        })).filter((product) => product.id || product.name || product.price),
        comment: text(pick(order, ['comment', 'description'])) || undefined,
        utm: pick(order, ['utm', 'utmSource', 'utmCampaign']) || undefined
      },
      external: {
        salesDriveOrderId: externalId
      }
    },
    warnings
  };
};

export const buildSalesDriveImportPreview = (orders: Record<string, unknown>[]) =>
  orders.map(mapSalesDriveOrderToPreview);
