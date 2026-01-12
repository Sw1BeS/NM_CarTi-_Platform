import { LeadStatus as DbLeadStatus } from '@prisma/client';

const DEFAULT_CURRENCY = 'USD';

const toNumber = (value: any) => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const toString = (value: any) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const LEAD_STATUS_TO_DB: Record<string, DbLeadStatus> = {
  NEW: DbLeadStatus.NEW,
  CONTACTED: DbLeadStatus.CONTACTED,
  WON: DbLeadStatus.WON,
  LOST: DbLeadStatus.LOST,
  IN_PROGRESS: DbLeadStatus.IN_PROGRESS,
  DONE: DbLeadStatus.DONE
};

const LEAD_STATUS_TO_CLIENT: Record<string, string> = {
  NEW: 'NEW',
  IN_PROGRESS: 'CONTACTED',
  DONE: 'WON',
  CONTACTED: 'CONTACTED',
  WON: 'WON',
  LOST: 'LOST'
};

const DB_LEAD_STATUSES = new Set(['NEW', 'IN_PROGRESS', 'DONE', 'CONTACTED', 'WON', 'LOST']);

export const generatePublicId = () =>
  `REQ-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const extractPrice = (input: any, fallbackCurrency?: string) => {
  let amount: any;
  let currency: string | undefined;
  if (input && typeof input === 'object') {
    amount = input.amount;
    currency = typeof input.currency === 'string' ? input.currency : undefined;
  } else {
    amount = input;
  }
  const parsedAmount = toNumber(amount);
  return {
    amount: parsedAmount,
    currency: currency || fallbackCurrency || DEFAULT_CURRENCY
  };
};

const mergeLeadPayload = (input: any, existingPayload: any = {}) => {
  const payload = { ...(existingPayload || {}) };
  if ('notes' in input) payload.notes = input.notes;
  if ('goal' in input) payload.goal = input.goal;
  if ('email' in input) payload.email = input.email;
  if ('telegramUsername' in input) payload.telegramUsername = input.telegramUsername;
  if ('linkedRequestId' in input) payload.linkedRequestId = input.linkedRequestId;
  if ('language' in input) payload.language = input.language;
  if ('lastInteractionAt' in input) payload.lastInteractionAt = input.lastInteractionAt;
  return payload;
};

const mapLeadStatusToDb = (status: any, payload: any) => {
  if (!status) return undefined;
  const normalized = String(status).toUpperCase();
  if (!DB_LEAD_STATUSES.has(normalized)) {
    payload.clientStatus = normalized;
  }
  return LEAD_STATUS_TO_DB[normalized] || DbLeadStatus.NEW;
};

const mapLeadStatusToClient = (status: any, payload: any) => {
  if (payload?.clientStatus) return payload.clientStatus;
  if (!status) return 'NEW';
  const normalized = String(status).toUpperCase();
  return LEAD_STATUS_TO_CLIENT[normalized] || normalized;
};

export const mapLeadStatusFilter = (status: any) => {
  if (!status) return undefined;
  const normalized = String(status).toUpperCase();
  if (DB_LEAD_STATUSES.has(normalized)) return normalized;
  return LEAD_STATUS_TO_DB[normalized] || undefined;
};

export const mapLeadCreateInput = (input: any) => {
  const payload = mergeLeadPayload(input);
  const name = toString(input.clientName) || toString(input.name);
  if (!name) {
    return { error: 'clientName is required' };
  }
  const data: any = {
    clientName: name,
    status: mapLeadStatusToDb(input.status, payload) || DbLeadStatus.NEW,
    payload
  };

  if ('phone' in input) data.phone = input.phone;
  if ('source' in input) data.source = input.source;
  if ('telegramChatId' in input || 'userTgId' in input) {
    data.userTgId = input.telegramChatId ?? input.userTgId;
  }
  const reqText = toString(input.request) || toString(input.goal);
  if (reqText) data.request = reqText;

  return { data };
};

export const mapLeadUpdateInput = (input: any, existingPayload: any = {}) => {
  const payload = mergeLeadPayload(input, existingPayload);
  const data: any = { payload };

  if ('clientName' in input || 'name' in input) {
    const name = toString(input.clientName) || toString(input.name);
    if (name) data.clientName = name;
  }
  if ('phone' in input) data.phone = input.phone;
  if ('source' in input) data.source = input.source;
  if ('telegramChatId' in input || 'userTgId' in input) {
    data.userTgId = input.telegramChatId ?? input.userTgId;
  }
  if ('goal' in input || 'request' in input) {
    const reqText = toString(input.request) || toString(input.goal);
    if (reqText !== undefined) data.request = reqText;
  }
  if ('status' in input) {
    const status = mapLeadStatusToDb(input.status, payload);
    if (status) data.status = status;
  }

  return { data };
};

export const mapLeadOutput = (lead: any) => {
  const payload = lead?.payload || {};
  return {
    id: lead.id,
    name: lead.clientName || payload.name || '',
    status: mapLeadStatusToClient(lead.status, payload),
    source: lead.source || payload.source || 'MANUAL',
    telegramChatId: lead.userTgId || payload.telegramChatId,
    telegramUsername: payload.telegramUsername,
    phone: lead.phone || payload.phone,
    email: payload.email,
    goal: lead.request || payload.goal,
    notes: payload.notes,
    linkedRequestId: payload.linkedRequestId,
    language: payload.language,
    createdAt: lead.createdAt,
    lastInteractionAt: payload.lastInteractionAt || lead.updatedAt
  };
};

export const mapVariantInput = (input: any) => {
  const price = extractPrice(input.price);
  const data: any = {};

  if ('status' in input) data.status = input.status;
  if ('source' in input) data.source = input.source;
  if ('sourceUrl' in input || 'url' in input) data.sourceUrl = input.sourceUrl ?? input.url;
  if ('title' in input) data.title = input.title;
  if (price.amount !== undefined) data.price = price.amount;
  if (price.currency) data.currency = price.currency;
  if ('year' in input) data.year = toNumber(input.year);
  if ('mileage' in input) data.mileage = toNumber(input.mileage);
  if ('location' in input) data.location = input.location;
  if ('thumbnail' in input) data.thumbnail = input.thumbnail;
  if ('specs' in input) data.specs = input.specs ?? null;

  return data;
};

export const mapVariantOutput = (variant: any) => {
  const amount = toNumber(variant.price) ?? 0;
  const currency = variant.currency || DEFAULT_CURRENCY;
  return {
    id: variant.id,
    requestId: variant.requestId,
    status: variant.status,
    source: variant.source,
    title: variant.title,
    price: { amount, currency },
    year: variant.year ?? 0,
    mileage: variant.mileage ?? 0,
    location: variant.location ?? '',
    thumbnail: variant.thumbnail ?? '',
    specs: variant.specs ?? {},
    url: variant.sourceUrl ?? undefined,
    sourceUrl: variant.sourceUrl ?? undefined,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt
  };
};

export const mapRequestInput = (input: any) => {
  const data: any = {};
  const title = toString(input.title);
  if (title) data.title = title;
  if ('description' in input) data.description = input.description ?? null;
  const budgetMin = toNumber(input.budgetMin);
  if (budgetMin !== undefined) data.budgetMin = budgetMin;
  const budgetMax = toNumber(input.budgetMax);
  if (budgetMax !== undefined) data.budgetMax = budgetMax;
  const yearMin = toNumber(input.yearMin);
  if (yearMin !== undefined) data.yearMin = yearMin;
  const yearMax = toNumber(input.yearMax);
  if (yearMax !== undefined) data.yearMax = yearMax;
  if ('city' in input) data.city = input.city ?? null;
  if ('language' in input) data.language = input.language ?? null;
  if ('status' in input) data.status = input.status;
  if ('priority' in input) data.priority = input.priority;
  const publicId = toString(input.publicId);
  if (publicId) data.publicId = publicId;
  const chatId = input.chatId ?? input.clientChatId;
  if (chatId !== undefined) data.chatId = String(chatId);
  if ('content' in input) data.content = input.content ?? null;
  return data;
};

export const mapRequestOutput = (request: any) => ({
  id: request.id,
  publicId: request.publicId || request.id,
  title: request.title,
  description: request.description ?? '',
  budgetMin: request.budgetMin ?? 0,
  budgetMax: request.budgetMax ?? 0,
  yearMin: request.yearMin ?? 0,
  yearMax: request.yearMax ?? 0,
  city: request.city ?? '',
  language: request.language ?? undefined,
  status: request.status ?? 'NEW',
  priority: request.priority ?? 'NORMAL',
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  variants: (request.variants || []).map(mapVariantOutput)
});

export const mapInventoryInput = (input: any) => {
  const data: any = {};
  const id = toString(input.id) || toString(input.canonicalId);
  if (id) data.id = id;

  if ('source' in input) data.source = input.source;
  if ('sourceUrl' in input) data.sourceUrl = input.sourceUrl ?? null;
  if ('title' in input) data.title = input.title;

  const price = extractPrice(input.price, input.currency);
  if (price.amount !== undefined) data.price = price.amount;
  if (price.currency) data.currency = price.currency;

  const year = toNumber(input.year);
  if (year !== undefined) data.year = year;
  const mileage = toNumber(input.mileage);
  if (mileage !== undefined) data.mileage = mileage;

  if ('location' in input) data.location = input.location ?? null;
  if ('thumbnail' in input) data.thumbnail = input.thumbnail ?? null;
  if ('mediaUrls' in input) {
    data.mediaUrls = Array.isArray(input.mediaUrls)
      ? input.mediaUrls
      : input.mediaUrls
      ? [input.mediaUrls]
      : [];
  }
  if ('specs' in input) data.specs = input.specs ?? null;
  if ('description' in input) data.description = input.description ?? null;
  if ('status' in input) data.status = input.status;
  if ('postedAt' in input && input.postedAt) data.postedAt = input.postedAt;

  return data;
};

export const mapInventoryOutput = (car: any) => ({
  ...car,
  canonicalId: car.id,
  price: {
    amount: toNumber(car.price) ?? 0,
    currency: car.currency || DEFAULT_CURRENCY
  }
});
