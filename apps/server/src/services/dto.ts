import { LeadStatus as DbLeadStatus, RequestStatus as DbRequestStatus, VariantStatus as DbVariantStatus, Prisma } from '@prisma/client';
import { NormalizationService } from './normalization.service.js';
import { parseCarData } from './enhanced-parsing.utils.js';

const DEFAULT_CURRENCY = 'USD';

const toNumber = (value: any) => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const toString = (value: any) => {
  return NormalizationService.cleanString(value) || undefined;
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

const REQUEST_STATUS_MAP: Record<string, DbRequestStatus> = {
  NEW: DbRequestStatus.DRAFT,
  DRAFT: DbRequestStatus.DRAFT,
  PUBLISHED: DbRequestStatus.PUBLISHED,
  COLLECTING_VARIANTS: DbRequestStatus.COLLECTING_VARIANTS,
  COLLECTING: DbRequestStatus.COLLECTING_VARIANTS,
  IN_PROGRESS: DbRequestStatus.COLLECTING_VARIANTS,
  OPEN: DbRequestStatus.COLLECTING_VARIANTS,
  SHORTLIST: DbRequestStatus.SHORTLIST,
  READY_FOR_REVIEW: DbRequestStatus.SHORTLIST,
  CONTACT_SHARED: DbRequestStatus.CONTACT_SHARED,
  CONTACT: DbRequestStatus.CONTACT_SHARED,
  WON: DbRequestStatus.WON,
  LOST: DbRequestStatus.LOST,
  CLOSED: DbRequestStatus.LOST
};

const VARIANT_STATUS_MAP: Record<string, DbVariantStatus> = {
  SUBMITTED: DbVariantStatus.SUBMITTED,
  PENDING: DbVariantStatus.SUBMITTED,
  OFFERED: DbVariantStatus.REVIEWED,
  REVIEWED: DbVariantStatus.REVIEWED,
  APPROVED: DbVariantStatus.APPROVED,
  ACCEPTED: DbVariantStatus.APPROVED,
  FIT: DbVariantStatus.APPROVED,
  REJECTED: DbVariantStatus.REJECTED,
  REJECT: DbVariantStatus.REJECTED,
  SENT_TO_CLIENT: DbVariantStatus.SENT_TO_CLIENT,
  SENT: DbVariantStatus.SENT_TO_CLIENT
};

export const generatePublicId = () =>
  `REQ-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

// Replaced with NormalizationService.extractPrice
// const extractPrice = ...

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

export const mapRequestStatusFilter = (status: any) => {
  if (!status) return undefined;
  const normalized = String(status).toUpperCase();
  return REQUEST_STATUS_MAP[normalized] || undefined;
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

  if ('phone' in input) data.phone = NormalizationService.normalizePhone(input.phone);
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
  if ('phone' in input) data.phone = NormalizationService.normalizePhone(input.phone);
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
    telegramChatId: payload.telegramChatId || lead.userTgId,
    telegramUserId: payload.telegramUserId || lead.userTgId,
    telegramUsername: payload.telegramUsername,
    telegramName: payload.telegramName || payload.name || lead.clientName || undefined,
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
  const price = NormalizationService.extractPrice(input.price, input.currency); // Prioritize input.currency
  const data: any = {};

  if ('status' in input) {
    const norm = String(input.status || '').toUpperCase();
    data.status = VARIANT_STATUS_MAP[norm] || DbVariantStatus.SUBMITTED;
  }
  if ('source' in input) data.source = input.source;
  if ('sourceUrl' in input || 'url' in input) data.sourceUrl = input.sourceUrl ?? input.url;
  if ('title' in input) data.title = toString(input.title);
  if (price.amount !== undefined) data.price = price.amount;
  if (price.currency) data.currency = price.currency;
  if ('year' in input) data.year = toNumber(input.year);
  if ('mileage' in input) data.mileage = toNumber(input.mileage);
  if ('location' in input) data.location = NormalizationService.normalizeCity(input.location);
  if ('thumbnail' in input) data.thumbnail = input.thumbnail;
  if ('mediaUrls' in input) data.mediaUrls = Array.isArray(input.mediaUrls) ? input.mediaUrls.filter(Boolean) : [];
  if ('mediaItems' in input) data.mediaItems = input.mediaItems ?? null;
  if ('companyName' in input) data.companyName = toString(input.companyName);
  if ('contact' in input) data.contact = toString(input.contact);
  if ('specs' in input) data.specs = input.specs ?? null;
  if ('statusHistory' in input) data.statusHistory = input.statusHistory ?? null;
  if ('requesterDecision' in input) {
    const decision = String(input.requesterDecision || '').toUpperCase();
    if (['PENDING', 'FIT', 'NOT_FIT'].includes(decision)) data.requesterDecision = decision;
  }
  if ('fitQueueStatus' in input) {
    const fitQueueStatus = String(input.fitQueueStatus || '').toUpperCase();
    if (['NEW', 'IN_PROGRESS', 'AGREED', 'MEETING_SCHEDULED', 'CLOSED'].includes(fitQueueStatus)) {
      data.fitQueueStatus = fitQueueStatus;
    }
  }
  if ('requesterDecisionAt' in input) data.requesterDecisionAt = input.requesterDecisionAt || null;
  if ('fitQueuedAt' in input) data.fitQueuedAt = input.fitQueuedAt || null;
  if ('fitClosedAt' in input) data.fitClosedAt = input.fitClosedAt || null;
  if ('sellerPartnerId' in input) data.sellerPartnerId = toString(input.sellerPartnerId) || null;
  if (!('statusHistory' in input)) {
    const initialStatus = data.status || DbVariantStatus.SUBMITTED;
    data.statusHistory = [{ status: initialStatus, at: new Date().toISOString(), by: 'system' }];
  }

  return data;
};

export const mapVariantOutput = (variant: any, opts: { includeContact?: boolean } = {}) => {
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
    mediaUrls: variant.mediaUrls ?? [],
    mediaItems: variant.mediaItems ?? [],
    ...(opts.includeContact ? { companyName: variant.companyName ?? '', contact: variant.contact ?? '' } : {}),
    specs: variant.specs ?? {},
    url: variant.sourceUrl ?? undefined,
    sourceUrl: variant.sourceUrl ?? undefined,
    statusHistory: variant.statusHistory ?? [],
    requesterDecision: variant.requesterDecision ?? 'PENDING',
    fitQueueStatus: variant.fitQueueStatus ?? undefined,
    requesterDecisionAt: variant.requesterDecisionAt ?? undefined,
    fitQueuedAt: variant.fitQueuedAt ?? undefined,
    fitClosedAt: variant.fitClosedAt ?? undefined,
    sellerPartnerId: variant.sellerPartnerId ?? undefined,
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
  if ('city' in input) data.city = NormalizationService.normalizeCity(input.city) ?? null;
  if ('language' in input) data.language = input.language ?? null;
  if ('status' in input) {
    const norm = String(input.status || '').toUpperCase();
    data.status = REQUEST_STATUS_MAP[norm] || DbRequestStatus.DRAFT;
  }
  if ('priority' in input) {
    const normPriority = String(input.priority || '').toUpperCase();
    data.priority = normPriority === 'MEDIUM' ? 'NORMAL' : normPriority || 'NORMAL';
  }
  const publicId = toString(input.publicId);
  if (publicId) data.publicId = publicId;
  const chatId = input.chatId ?? input.clientChatId;
  if (chatId !== undefined) data.chatId = String(chatId);
  if ('content' in input) data.content = input.content ?? null;
  if ('assignedTo' in input || 'assigneeId' in input) {
    data.assignedTo = input.assignedTo ?? input.assigneeId ?? null;
  }
  if ('leadId' in input) {
    const leadId = toString(input.leadId);
    if (leadId) data.leadId = leadId;
  }
  if ('botId' in input) {
    const botId = toString(input.botId);
    if (botId) data.botId = botId;
  }
  if ('requesterPartnerId' in input) {
    const requesterPartnerId = toString(input.requesterPartnerId);
    if (requesterPartnerId) data.requesterPartnerId = requesterPartnerId;
  }
  if ('channelPostUrl' in input) {
    data.channelPostUrl = toString(input.channelPostUrl) || null;
  }
  if ('internalNote' in input || 'internalNotes' in input || 'notes' in input) {
    data.internalNotes = input.internalNote ?? input.internalNotes ?? input.notes ?? null;
  }
  if ('payload' in input) {
    data.payload = input.payload ?? null;
  }
  return data;
};

export const mapRequestOutput = (request: any, opts: { includeContact?: boolean } = {}) => ({
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
  status: request.status ?? DbRequestStatus.DRAFT,
  priority: request.priority ?? 'NORMAL',
  leadId: request.leadId ?? undefined,
  botId: request.botId ?? undefined,
  requesterPartnerId: request.requesterPartnerId ?? undefined,
  channelPostUrl: request.channelPostUrl ?? undefined,
  assigneeId: request.assignedTo ?? undefined,
  internalNote: request.internalNotes ?? undefined,
  clientChatId: request.chatId ?? undefined,
  payload: request.payload ?? undefined,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  variants: (request.variants || []).map((variant: any) => mapVariantOutput(variant, opts))
});

export type InventoryInput = {
  id?: string;
  source?: string;
  sourceUrl?: string | null;
  title?: string;
  price?: number;
  currency?: string;
  year?: number;
  mileage?: number;
  location?: string | null;
  thumbnail?: string | null;
  mediaUrls?: string[];
  specs?: Prisma.InputJsonValue;
  description?: string | null;
  status?: string;
  postedAt?: Date;
};

export const mapInventoryInput = (input: Record<string, unknown>): InventoryInput => {
  const data: InventoryInput = {};
  const id = toString(input.id) || toString(input.canonicalId);
  if (id) data.id = id;

  if ('source' in input) {
    const source = toString(input.source);
    if (source) data.source = source;
  }
  if ('sourceUrl' in input) {
    data.sourceUrl = input.sourceUrl === null ? null : toString(input.sourceUrl);
  }
  if ('title' in input) data.title = toString(input.title);

  const currency = toString(input.currency);
  const price = NormalizationService.extractPrice(input.price, currency || DEFAULT_CURRENCY);
  if (price.amount !== undefined) data.price = price.amount;
  if (price.currency) data.currency = price.currency;

  const year = toNumber(input.year);
  if (year !== undefined) data.year = year;
  const mileage = toNumber(input.mileage);
  if (mileage !== undefined) data.mileage = mileage;

  if ('location' in input) data.location = NormalizationService.normalizeCity(input.location) ?? null;
  if ('thumbnail' in input) data.thumbnail = input.thumbnail === null ? null : toString(input.thumbnail);
  if ('mediaUrls' in input) {
    const rawMediaUrls = input.mediaUrls;
    const mediaUrls = Array.isArray(rawMediaUrls)
      ? rawMediaUrls
      : rawMediaUrls
        ? [rawMediaUrls]
        : [];
    data.mediaUrls = mediaUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
  }
  if ('specs' in input) {
    const specs = input.specs as Prisma.InputJsonValue | undefined;
    if (specs !== undefined) data.specs = specs;
  }
  if ('description' in input) {
    const description = typeof input.description === 'string' ? input.description : undefined;
    data.description = description ?? null;
  }
  if ('status' in input) {
    const status = toString(input.status);
    if (status) data.status = status;
  }
  if ('postedAt' in input && input.postedAt) {
    const postedAt = input.postedAt instanceof Date ? input.postedAt : new Date(String(input.postedAt));
    if (!Number.isNaN(postedAt.getTime())) data.postedAt = postedAt;
  }

  return data;
};

export const mapInventoryOutput = (car: Record<string, unknown>) => ({
  ...(() => {
    const description = toString(car.description) || '';
    const parsed = description ? parseCarData(description) : {};
    const rawSpecs = car.specs;
    const baseSpecs = rawSpecs && typeof rawSpecs === 'object' && !Array.isArray(rawSpecs)
      ? { ...(rawSpecs as Record<string, unknown>) }
      : {};

    const mergedSpecs: Record<string, unknown> = {
      ...baseSpecs
    };

    if (!mergedSpecs.brand && parsed.brand !== undefined) mergedSpecs.brand = parsed.brand;
    if (!mergedSpecs.model && parsed.model !== undefined) mergedSpecs.model = parsed.model;

    const parsedSpecKeys = ['engine', 'fuel', 'transmission', 'drive', 'vin', 'color', 'condition'] as const;
    for (const key of parsedSpecKeys) {
      if (!mergedSpecs[key] && parsed[key] !== undefined) {
        mergedSpecs[key] = parsed[key];
      }
    }

    const mediaUrls = Array.isArray(car.mediaUrls)
      ? (car.mediaUrls as unknown[]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const mediaItems = Array.isArray(car.mediaItems)
      ? (car.mediaItems as unknown[])
      : [];
    const thumbnail = toString(car.thumbnail) || mediaUrls[0] || '';
    const year = toNumber(car.year) ?? toNumber(parsed.year) ?? 0;
    const mileage = toNumber(car.mileage) ?? toNumber(parsed.mileage) ?? 0;
    const location = toString(car.location) || toString(parsed.location) || '';
    const title = toString(car.title) || toString(parsed.title) || 'Unknown Car';
    const modelFromSource = toString((car as any).model) || toString((mergedSpecs as any).model) || '';
    const modelFromParsed = toString(parsed.model) || '';
    const modelLooksNoisy = /(?:color|condition|пробіг|пробег|ціна|цена|price|бюджет|грн|usd|eur)/i.test(modelFromSource)
      || modelFromSource.split(/\s+/).length > 5;
    const model = (modelFromSource && !modelLooksNoisy) ? modelFromSource : (modelFromParsed || modelFromSource);
    const brand = toString((car as any).brand) || toString((mergedSpecs as any).brand) || toString(parsed.brand) || '';

    return {
      ...car,
      title,
      brand,
      model,
      year,
      mileage,
      location,
      thumbnail,
      mediaUrls,
      mediaItems,
      specs: mergedSpecs,
      description
    };
  })(),
  canonicalId: car.id,
  price: {
    amount: toNumber(car.price) ?? 0,
    currency: car.currency || DEFAULT_CURRENCY
  }
});
