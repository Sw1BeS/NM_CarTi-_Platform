import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { miniAppService } from '../services/miniapp.service.js';
import { errorResponse } from '../utils/errorResponse.js';
import { parseTelegramUser } from '../modules/Communication/telegram/core/telegramAuth.js';
import { resolvePublicSlug } from '../services/publicSlug.service.js';
import { prisma } from '../services/prisma.js';
import { logger } from '../utils/logger.js';
import { ShowcaseService } from '../modules/Marketing/showcase/showcase.service.js';
import { mapInventoryOutput, mapVariantInput } from '../services/dto.js';
import { renderCarCardForBot } from '../services/carCardRenderer.v2.js';
import { telegramOutbox } from '../modules/Communication/telegram/messaging/outbox/telegramOutbox.js';
import { emitPlatformEvent } from '../modules/Communication/telegram/core/events/eventEmitter.js';
import { verifyMiniAppInitDataForScope } from '../services/miniAppAuth.service.js';
import { requestContractService } from '../services/requestContract.service.js';
import { startLeadSellWizard } from '../modules/Communication/telegram/routing/wizards/leadSellWizard.js';
import { buildLeadAdminActionMarkupAsync, buildLeadAdminNotificationText } from '../services/leadAdminNotification.js';
import { buildB2BVariantAdminActionMarkupAsync, buildB2BVariantAdminNotificationText } from '../services/b2bAdminNotification.js';
import { isEnvFlagEnabled } from '../services/featureFlags.js';
import { vehicleTaxonomyService } from '../services/vehicleTaxonomy.service.js';
import { b2bWhitelistService } from '../services/b2bWhitelist.service.js';
import { buildCallbackData } from '../modules/Communication/telegram/core/utils/callbackUtils.js';

const router = Router();
const showcaseService = new ShowcaseService();

const MINIAPP_ERROR_CODES = {
  INITDATA_REQUIRED: 'TELEGRAM_INITDATA_REQUIRED',
  INITDATA_INVALID: 'TELEGRAM_INITDATA_INVALID',
  VALIDATION: 'VALIDATION_ERROR',
  BOT_FLOW_UNAVAILABLE: 'BOT_FLOW_UNAVAILABLE',
  CONTACT_REQUEST_SEND_FAILED: 'CONTACT_REQUEST_SEND_FAILED'
} as const;

const LEAD_WRONG_ENDPOINT = 'LEAD_WRONG_ENDPOINT';
const B2B_PARTNER_NOT_APPROVED = 'B2B_PARTNER_NOT_APPROVED';
const B2B_PARTNER_NOT_APPROVED_REASON = 'PARTNER_NOT_APPROVED';
const B2B_PORTAL_UNAVAILABLE = 'B2B_PORTAL_UNAVAILABLE';

const isB2BMiniAppConfig = (config: Record<string, any> | null | undefined) => {
  const template = String(config?.template || '').trim().toUpperCase();
  const surfaceMode = String(config?.miniapp?.surfaceMode || config?.miniapp?.mode || '').trim().toUpperCase();
  return template === 'B2B' || surfaceMode === 'B2B';
};

const readString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str ? str : undefined;
};

const readNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const readStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => readString(item)).filter((item): item is string => Boolean(item));
  return items.length ? Array.from(new Set(items)) : undefined;
};

const resolveCompanyIdBySlug = async (slug?: string | null) => {
  const trimmed = String(slug || '').trim();
  if (!trimmed) return null;
  const resolved = await resolvePublicSlug(trimmed);
  return resolved.companyId || null;
};

const requireInitData = async (initData: string | undefined, companyId?: string | null, botId?: string | null) => {
  return verifyMiniAppInitDataForScope(initData, { companyId, botId });
};

const parseMiniAppTelegramIdentity = (initData: string) => {
  const tgUser = parseTelegramUser(initData) as any;
  const userId = tgUser?.id ? String(tgUser.id) : undefined;
  const name = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ').trim()
    || readString(tgUser?.name)
    || undefined;
  return {
    userId,
    username: readString(tgUser?.username),
    name,
    raw: tgUser
  };
};

const resolveB2BMiniAppPartner = async (config: Record<string, any>, initData: string) => {
  const tgIdentity = parseMiniAppTelegramIdentity(initData);
  if (!tgIdentity.userId) {
    return {
      approved: false as const,
      reason: B2B_PARTNER_NOT_APPROVED_REASON,
      user: {
        telegramUserId: undefined,
        username: tgIdentity.username,
        name: tgIdentity.name
      }
    };
  }

  const partnerUser = await prisma.partnerUser.findFirst({
    where: { companyId: config.companyId, telegramId: tgIdentity.userId },
    select: {
      partnerId: true,
      role: true,
      partner: {
        select: {
          id: true,
          name: true,
          partnerCode: true,
          showcaseSlug: true
        }
      }
    }
  });

  const user = {
    telegramUserId: tgIdentity.userId,
    username: tgIdentity.username,
    name: tgIdentity.name
  };

  if (!partnerUser?.partnerId || !partnerUser.partner) {
    return {
      approved: false as const,
      reason: B2B_PARTNER_NOT_APPROVED_REASON,
      user
    };
  }

  return {
    approved: true as const,
    user,
    partner: {
      id: partnerUser.partner.id,
      name: partnerUser.partner.name,
      code: partnerUser.partner.partnerCode,
      showcaseSlug: partnerUser.partner.showcaseSlug,
      role: partnerUser.role,
      partnerId: partnerUser.partnerId
    }
  };
};

const b2bPartnerNotApprovedResponse = (res: any) => errorResponse(
  res,
  403,
  'B2B partner is not approved',
  B2B_PARTNER_NOT_APPROVED,
  { reason: B2B_PARTNER_NOT_APPROVED_REASON }
);

const b2bPortalUnavailableResponse = (res: any) => errorResponse(
  res,
  400,
  'B2B portal is not available for this MiniApp',
  B2B_PORTAL_UNAVAILABLE
);

const CONTACT_URL_HOSTS = [
  'wa.me',
  'whatsapp.com',
  't.me',
  'telegram.me',
  'viber.com'
];

const normalizeSensitiveKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const isContactLikeKey = (key: string) => {
  const normalized = normalizeSensitiveKey(key);
  return normalized.includes('contact')
    || normalized.includes('phone')
    || normalized.includes('mobile')
    || normalized.includes('telegram')
    || normalized.includes('whatsapp')
    || normalized.includes('viber')
    || normalized.includes('email')
    || normalized === 'mail'
    || normalized === 'tel'
    || normalized === 'tg'
    || normalized === 'dealerphone'
    || normalized === 'ownerphone';
};

const isContactLikeString = (value: string) => {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  if (/mailto:|tel:|tg:|wa\.me|whatsapp|telegram\.me|t\.me|viber/.test(text)) return true;
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(value)) return true;
  if (/(^|\s)@[a-z0-9_]{5,}\b/i.test(value)) return true;
  if (/\+?\d[\d\s().-]{7,}\d/.test(value)) return true;
  return false;
};

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const sanitizeB2BPublicSpecs = (value: unknown, depth = 0): unknown => {
  if (depth > 8) return undefined;
  if (Array.isArray(value)) {
    const items = value
      .map(item => sanitizeB2BPublicSpecs(item, depth + 1))
      .filter(item => {
        if (item === undefined) return false;
        if (isRecord(item) && Object.keys(item).length === 0) return false;
        return true;
      });
    return items;
  }
  if (isRecord(value)) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isContactLikeKey(key)) continue;
      const sanitized = sanitizeB2BPublicSpecs(item, depth + 1);
      if (sanitized === undefined) continue;
      if (isRecord(sanitized) && Object.keys(sanitized).length === 0) continue;
      cleaned[key] = sanitized;
    }
    return cleaned;
  }
  if (typeof value === 'string') {
    return isContactLikeString(value) ? undefined : value;
  }
  return value;
};

const sanitizeB2BMediaUrl = (value: unknown) => {
  const raw = readString(value);
  if (!raw) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (CONTACT_URL_HOSTS.some(contactHost => host === contactHost || host.endsWith(`.${contactHost}`))) return undefined;
  for (const key of parsed.searchParams.keys()) {
    if (isContactLikeKey(key)) return undefined;
  }
  const decodedValues = [
    safeDecodeURIComponent(raw),
    safeDecodeURIComponent(parsed.href),
    ...Array.from(parsed.searchParams.values()).map(param => safeDecodeURIComponent(param))
  ];
  if (decodedValues.some(item => isContactLikeString(item))) return undefined;
  return raw;
};

const sanitizeB2BMediaUrls = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(sanitizeB2BMediaUrl).filter((item): item is string => Boolean(item))));
};

const mapB2BMiniAppVariantOutput = (variant: any, request?: { publicId?: string | null }) => ({
  id: variant.id,
  requestId: variant.requestId,
  requestPublicId: request?.publicId || variant.request?.publicId || variant.requestId,
  status: variant.status,
  requesterDecision: variant.requesterDecision,
  fitQueueStatus: variant.fitQueueStatus,
  title: variant.title,
  price: variant.price,
  currency: variant.currency || 'USD',
  year: variant.year,
  mileage: variant.mileage,
  location: variant.location,
  thumbnail: sanitizeB2BMediaUrl(variant.thumbnail),
  mediaUrls: sanitizeB2BMediaUrls(variant.mediaUrls),
  specs: sanitizeB2BPublicSpecs(variant.specs || {}) || {},
  createdAt: variant.createdAt
});

const mapB2BMiniAppNetworkRequestOutput = (request: any) => {
  const safeDescription = sanitizeB2BPublicSpecs(request.description);
  return {
    id: request.id,
    publicId: request.publicId || request.id,
    title: request.title,
    description: typeof safeDescription === 'string' ? safeDescription : '',
    status: request.status,
    budgetMin: request.budgetMin,
    budgetMax: request.budgetMax,
    yearMin: request.yearMin,
    yearMax: request.yearMax,
    city: request.city,
    channelPostUrl: request.channelPostUrl,
    variantsCount: Number(request?._count?.variants || 0),
    criteria: sanitizeB2BPublicSpecs(request.payload || {}) || {},
    createdAt: request.createdAt
  };
};

const buildInitDataDiagnostics = (initData?: string) => {
  if (!initData) return { hasInitData: false };
  const params = new URLSearchParams(initData);
  const authDateRaw = params.get('auth_date');
  const authTimestamp = authDateRaw ? Number(authDateRaw) : undefined;
  const authAgeSeconds = authTimestamp && Number.isFinite(authTimestamp)
    ? Math.max(0, Math.floor(Date.now() / 1000) - authTimestamp)
    : undefined;
  const user = parseTelegramUser(initData) as any;

  return {
    hasInitData: true,
    initDataLength: initData.length,
    hasHash: Boolean(params.get('hash')),
    hasSignature: Boolean(params.get('signature')),
    authAgeSeconds,
    fieldNames: Array.from(new Set(Array.from(params.keys()))).sort(),
    telegramUserId: user?.id ? String(user.id) : undefined
  };
};

const getMiniAppBotForSend = async (botId?: string | null, companyId?: string | null) => {
  if (botId) {
    const bot = await prisma.botConfig.findFirst({
      where: { id: botId, ...(companyId ? { companyId } : {}), isEnabled: true },
      select: { id: true, token: true, companyId: true, config: true, template: true, name: true, adminChatId: true }
    });
    if (bot) return bot;
  }

  return prisma.botConfig.findFirst({
    where: { ...(companyId ? { companyId } : {}), isEnabled: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, token: true, companyId: true, config: true, template: true, name: true, adminChatId: true }
  });
};

const buildBotOpenUrl = (bot: { config?: unknown; name?: string | null } | null | undefined) => {
  const config = isRecord(bot?.config) ? bot.config as Record<string, unknown> : {};
  const username = readString(config.botUsername) || readString(config.username);
  if (!username) return undefined;
  return `https://t.me/${username.replace(/^@+/, '')}`;
};

const ensureMiniAppBotSession = async (params: {
  botId: string;
  chatId: string;
  variables?: Record<string, unknown>;
  state?: string;
}) => {
  const existing = await prisma.botSession.findUnique({
    where: {
      botId_chatId: {
        botId: params.botId,
        chatId: params.chatId
      }
    }
  });

  if (existing) {
    if (!params.state && !params.variables) return existing;
    const nextVariables = JSON.parse(JSON.stringify({
      ...((existing.variables as Record<string, unknown>) || {}),
      ...(params.variables || {})
    })) as Prisma.InputJsonValue;
    return prisma.botSession.update({
      where: { id: existing.id },
      data: {
        ...(params.state ? { state: params.state } : {}),
        variables: nextVariables,
        lastActive: new Date()
      }
    });
  }

  return prisma.botSession.create({
    data: {
      botId: params.botId,
      chatId: params.chatId,
      platform: 'TG',
      state: params.state || 'CL_MENU',
      variables: JSON.parse(JSON.stringify(params.variables || {})) as Prisma.InputJsonValue
    }
  });
};

const buildContactRequestKeyboard = () => ({
  keyboard: [[{ text: '📱 Поділитися контактом', request_contact: true }], [{ text: '⬅️ Назад' }]],
  resize_keyboard: true,
  one_time_keyboard: true
});

const normalizeLeadIntentKind = (value: unknown) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (['PICK', 'REQUEST', 'BUY'].includes(normalized)) {
    return { kind: 'PICK' as const, intentType: 'REQUEST' as const };
  }
  if (['PRICE_TERMS', 'PRICE', 'TERMS', 'INTEREST', 'SPECIFIC', 'LEASING'].includes(normalized)) {
    return { kind: 'PRICE_TERMS' as const, intentType: 'INTEREST' as const };
  }
  return null;
};

const mapMiniAppEventToMeta = (eventType: string) => {
  const normalized = String(eventType || '').trim().toLowerCase();
  if (['miniappopen', 'miniapp_open', 'mini_app_open'].includes(normalized)) return 'PageView';
  if (['leadsubmit', 'lead_submit', 'lead_intent_pick_submitted', 'lead_intent_price_terms_submitted', 'lead_intent_selected_cars_submitted'].includes(normalized)) {
    return 'Lead';
  }
  if (['b2brequestcreate', 'b2b_request_create', 'b2brequestcreated', 'b2b_request_created'].includes(normalized)) return 'SubmitApplication';
  if (['b2boffersubmit', 'b2b_offer_submit', 'offersubmit', 'offer_submit'].includes(normalized)) return 'SubmitApplication';
  if (['qualifiedlead', 'qualified_lead'].includes(normalized)) return 'Lead';
  if (['adminstatuschange', 'admin_status_change'].includes(normalized)) return 'SubmitApplication';
  if (['contactshare', 'contact_share'].includes(normalized)) return 'Contact';
  if (['viewcar', 'view_car', 'viewinventoryitem', 'view_inventory_item'].includes(normalized)) return 'ViewContent';
  if (['viewinventory', 'view_inventory', 'viewshowcase', 'view_showcase', 'search'].includes(normalized)) return 'Search';
  if (['leadformstart', 'lead_form_start'].includes(normalized)) return 'SubmitApplication';
  return null;
};

const normalizeMiniAppEventType = (eventType: string) =>
  String(eventType || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const READ_ONLY_PREVIEW_EVENT_TYPES = new Set([
  'miniapp_open',
  'miniappopen',
  'view_opened',
  'viewopened',
  'view_car',
  'viewcar',
  'view_inventory_item',
  'viewinventoryitem',
  'view_inventory',
  'viewinventory',
  'view_showcase',
  'viewshowcase',
  'search',
  'lead_form_start',
  'leadformstart',
  'car_shared',
  'carshared',
  'favorite_added',
  'favoriteadded',
  'favorite_removed',
  'favoriteremoved',
  'miniapp_launch_diagnostics',
  'miniapplaunchdiagnostics',
  'write_blocked_missing_initdata',
  'write_rejected_invalid_initdata'
]);

const isReadOnlyPreviewMiniAppEvent = (eventType: string) => {
  const normalized = normalizeMiniAppEventType(eventType);
  return READ_ONLY_PREVIEW_EVENT_TYPES.has(normalized);
};

const readTrackingMeta = (tracking: unknown) => {
  const trackingRecord = isRecord(tracking) ? tracking : {};
  return isRecord(trackingRecord.meta) ? trackingRecord.meta : {};
};

const buildMiniAppTrackingEventId = (eventType: string, tracking: unknown, requestId?: string) => {
  const trackingRecord = isRecord(tracking) ? tracking : {};
  const trackingMeta = readTrackingMeta(trackingRecord);
  return readString(trackingMeta.eventId)
    || readString(trackingMeta.event_id)
    || readString(trackingRecord.eventId)
    || readString(trackingRecord.event_id)
    || readString(trackingRecord.submitId)
    || readString(trackingRecord.submit_id)
    || readString(requestId)
    || `miniapp_${normalizeMiniAppEventType(eventType) || 'event'}_${Date.now().toString(36)}`;
};

const readClientIp = (req: any) => {
  const forwarded = readString(req?.get?.('x-forwarded-for'));
  const firstForwarded = forwarded?.split(',').map(part => part.trim()).find(Boolean);
  return firstForwarded || readString(req?.ip) || readString(req?.socket?.remoteAddress);
};

const SENSITIVE_EVENT_KEYS = new Set([
  'phone',
  'phoneraw',
  'email',
  'name',
  'fullname',
  'initdata',
  'raw',
  'rawuser',
  'telegramuser',
  'tguser',
  'user',
  'token',
  'accesstoken',
  'authorization'
]);

const sanitizeMiniAppEventValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeMiniAppEventValue).filter(item => item !== undefined);
  if (isRecord(value)) {
    const sanitizedRecord: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_EVENT_KEYS.has(key.toLowerCase())) continue;
      const sanitized = sanitizeMiniAppEventValue(item);
      if (sanitized !== undefined) sanitizedRecord[key] = sanitized;
    }
    return sanitizedRecord;
  }
  if (typeof value === 'string') {
    const sanitized = value
      .replace(/(?:\+?\d[\d\s()\-]{6,}\d)/g, '[hidden]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[hidden-email]')
      .replace(/@[a-zA-Z0-9_]{3,}/g, '@hidden')
      .trim();
    return sanitized || undefined;
  }
  if (value === null || value === undefined) return undefined;
  return value;
};

const toMetaCustomData = (input: Record<string, unknown>) => {
  const blocked = new Set(['phone', 'phoneRaw', 'email', 'name', 'initData', 'token', 'accessToken']);
  const sanitizedInput = sanitizeMiniAppEventValue(input);
  const record = isRecord(sanitizedInput) ? sanitizedInput : {};
  return Object.fromEntries(
    Object.entries(record).filter(([key, value]) => {
      if (blocked.has(key)) return false;
      return value !== undefined && value !== null && value !== '';
    })
  );
};

const buildSafeInitDataDiagnostics = (initData: string) => {
  const diagnostics = buildInitDataDiagnostics(initData) as Record<string, unknown>;
  delete diagnostics.telegramUserId;
  return diagnostics;
};

const isMiniAppAdmin = async (companyId: string, tgUserId: string, botId?: string | null) => {
  if (botId) {
    const bot = await prisma.botConfig.findUnique({ where: { id: botId }, select: { adminChatId: true } });
    if (bot?.adminChatId && String(bot.adminChatId) === String(tgUserId)) return true;
  }

  const user = await prisma.globalUser.findFirst({
    where: { telegram_user_id: String(tgUserId) },
    select: { id: true }
  });
  if (!user) return false;

  const membership = await prisma.membership.findFirst({
    where: {
      user_id: user.id,
      workspace_id: companyId,
      role_id: { in: ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'] }
    },
    select: { id: true }
  });

  return Boolean(membership);
};

router.get('/config', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    const requestId = readString(req.get('x-request-id')) || `miniapp_${Date.now().toString(36)}`;

    logger.info('[MiniApp] config request', {
      requestId,
      slug,
      ip: req.ip,
      ua: req.get('user-agent')
    });

    const config = await miniAppService.getConfig(slug);
    res.json({ ok: true, ...config });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load config';
    // If company not found, it throws "Company not found", return 404/400
    if (message === 'Company not found') return errorResponse(res, 404, message);
    errorResponse(res, 500, message);
  }
});

router.get('/vehicle-taxonomy', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const companyId = slug ? await resolveCompanyIdBySlug(slug) : null;
    const taxonomy = await vehicleTaxonomyService.getTaxonomy({ companyId });
    res.json({ ok: true, ...taxonomy });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load vehicle taxonomy';
    errorResponse(res, 500, message);
  }
});

router.get('/showcases', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const companyId = await resolveCompanyIdBySlug(slug || undefined);
    if (!companyId) return errorResponse(res, 404, 'Company not found');

    const showcases = await prisma.showcase.findMany({
      where: {
        workspaceId: companyId,
        isPublic: true
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        botId: true,
        createdAt: true
      }
    });

    res.json({ ok: true, items: showcases });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load showcases';
    errorResponse(res, 500, message);
  }
});

router.get('/showcases/:slug/inventory', async (req, res) => {
  try {
    const slug = readString(req.params.slug);
    if (!slug) return errorResponse(res, 400, 'slug is required');

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const search = readString(req.query.search);
    const minPrice = readNumber(req.query.minPrice);
    const maxPrice = readNumber(req.query.maxPrice);
    const minYear = readNumber(req.query.minYear);
    const maxYear = readNumber(req.query.maxYear);
    const status = readString(req.query.status);
    const availabilityState = readString(req.query.availabilityState);

    const { showcase, items, total } = await showcaseService.getInventoryForShowcase(slug, {
      page,
      limit,
      search,
      minPrice,
      maxPrice,
      minYear,
      maxYear,
      status,
      availabilityState
    });

    if (!showcase.isPublic) return errorResponse(res, 404, 'Showcase not found');

    res.json({
      ok: true,
      showcase: {
        id: showcase.id,
        name: showcase.name,
        slug: showcase.slug,
        botId: showcase.botId
      },
      items: items.map(mapInventoryOutput),
      total,
      page,
      limit
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load showcase inventory';
    errorResponse(res, 500, message);
  }
});

router.get('/cars/:carId', async (req, res) => {
  try {
    const carId = readString(req.params.carId);
    if (!carId) return errorResponse(res, 400, 'carId is required');

    const car = await prisma.carListing.findUnique({ where: { id: carId } });
    if (!car) return errorResponse(res, 404, 'Car not found');

    res.json({ ok: true, car: mapInventoryOutput(car) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load car';
    errorResponse(res, 500, message);
  }
});

router.post('/cars/:carId/share', async (req, res) => {
  try {
    const carId = readString(req.params.carId);
    if (!carId) return errorResponse(res, 400, 'carId is required');

    const body = (req.body || {}) as Record<string, unknown>;
    const initData = readString(body.initData);
    const slug = readString(body.slug);
    const chatId = readString(body.chatId);
    const botIdRaw = readString(body.botId);
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const car = await prisma.carListing.findUnique({ where: { id: carId } });
    if (!car) return errorResponse(res, 404, 'Car not found');

    let botId = botIdRaw || null;
    let companyId = car.companyId || null;
    if (slug) {
      const config = await miniAppService.getConfig(slug);
      botId = config.botId || botId;
      companyId = config.companyId || companyId;
    }

    const initCheck = await requireInitData(initData, companyId, botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const tgUser = parseTelegramUser(initData);
    const destinationChatId = chatId || (tgUser?.id ? String(tgUser.id) : undefined);
    if (!destinationChatId) return errorResponse(res, 400, 'chatId is required');

    const bot = botId
      ? await prisma.botConfig.findFirst({ where: { id: botId, isEnabled: true } })
      : await prisma.botConfig.findFirst({ where: { companyId: companyId || undefined, isEnabled: true }, orderBy: { createdAt: 'asc' } });
    if (!bot?.token) return errorResponse(res, 400, 'Bot not found');

    const caption = await renderCarCardForBot({
      car,
      companyId: bot.companyId || companyId || null,
      botId: bot.id,
      showcaseSlug: slug || undefined
    });

    const mediaItemPhotos = Array.isArray((car as any).mediaItems)
      ? ((car as any).mediaItems as any[]).flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        return [item.url, item.previewUrl, item.tgFileId, item.fileId, item.media];
      })
      : [];
    const photos = [car.thumbnail, ...(Array.isArray(car.mediaUrls) ? car.mediaUrls : []), ...mediaItemPhotos]
      .map(v => String(v || '').trim())
      .filter(Boolean);
    const deduped = Array.from(new Set(photos)).slice(0, 10);

    let sent: any;
    if (deduped.length > 1) {
      sent = await telegramOutbox.sendMediaGroup({
        botId: bot.id,
        token: bot.token,
        chatId: destinationChatId,
        media: deduped.map((media, index) => ({
          type: 'photo',
          media,
          caption: index === 0 ? caption : undefined,
          parse_mode: 'HTML'
        })),
        companyId: bot.companyId || companyId
      });
    } else if (deduped.length === 1) {
      sent = await telegramOutbox.sendPhoto({
        botId: bot.id,
        token: bot.token,
        chatId: destinationChatId,
        photo: deduped[0],
        caption,
        companyId: bot.companyId || companyId
      });
    } else {
      sent = await telegramOutbox.sendMessage({
        botId: bot.id,
        token: bot.token,
        chatId: destinationChatId,
        text: caption,
        companyId: bot.companyId || companyId
      });
    }

    res.json({ ok: true, sent });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to share car';
    errorResponse(res, 500, message);
  }
});

router.get('/b2b/me', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const initData = readString(req.query.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    if (!isB2BMiniAppConfig(config as Record<string, any>)) {
      return b2bPortalUnavailableResponse(res);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const partnerState = await resolveB2BMiniAppPartner(config as Record<string, any>, initData);
    if (!partnerState.approved) {
      return res.json({
        ok: true,
        approved: false,
        reason: partnerState.reason,
        user: partnerState.user
      });
    }

    const [ownRequests, receivedVariants] = await Promise.all([
      prisma.b2bRequest.count({
        where: {
          companyId: config.companyId,
          requesterPartnerId: partnerState.partner.partnerId
        }
      }),
      prisma.requestVariant.count({
        where: {
          request: {
            companyId: config.companyId,
            requesterPartnerId: partnerState.partner.partnerId
          }
        }
      })
    ]);

    res.json({
      ok: true,
      approved: true,
      user: partnerState.user,
      partner: {
        id: partnerState.partner.id,
        name: partnerState.partner.name,
        code: partnerState.partner.code,
        showcaseSlug: partnerState.partner.showcaseSlug,
        role: partnerState.partner.role
      },
      stats: {
        ownRequests,
        receivedVariants
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load B2B partner portal';
    errorResponse(res, 500, message);
  }
});

router.post('/b2b/access/request', async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const initData = readString(body.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    if (!isB2BMiniAppConfig(config as Record<string, any>)) {
      return b2bPortalUnavailableResponse(res);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const telegram = parseMiniAppTelegramIdentity(initData);
    if (!telegram.userId) {
      return errorResponse(res, 400, 'Telegram user not found', MINIAPP_ERROR_CODES.INITDATA_INVALID);
    }

    const result = await b2bWhitelistService.ensureAccess({
      tgUserId: telegram.userId,
      username: telegram.username || null,
      fullName: telegram.name || null
    }, {
      companyId: config.companyId,
      botId: config.botId || null
    }, [
      'source=miniapp',
      `slug=${slug}`,
      `chatId=${telegram.userId}`
    ].join(';'));

    const accessRequestId = result.accessRequest?.id || '';
    if (!result.allowed && accessRequestId) {
      const bot = await getMiniAppBotForSend(config.botId, config.companyId);
      if (bot?.token && bot.adminChatId) {
        const requesterLink = telegram.username
          ? `https://t.me/${telegram.username.replace(/^@+/, '')}`
          : `tg://user?id=${telegram.userId}`;
        await telegramOutbox.sendMessage({
          botId: bot.id,
          token: bot.token,
          chatId: String(bot.adminChatId),
          text: [
            '🟡 [B2B ACCESS] Новий запит на доступ',
            `ID: ${accessRequestId}`,
            `source: MiniApp`,
            `tgUserId: ${telegram.userId}`,
            `username: ${telegram.username ? `@${telegram.username}` : '—'}`,
            `name: ${telegram.name || '—'}`,
            `🔗 ${requesterLink}`
          ].join('\n'),
          replyMarkup: {
            inline_keyboard: [[
              { text: '✅ Підтвердити', callback_data: buildCallbackData('ba_ap', accessRequestId) },
              { text: '❌ Відхилити', callback_data: buildCallbackData('ba_rj', accessRequestId) }
            ]]
          },
          companyId: bot.companyId || config.companyId,
          userId: telegram.userId
        }).catch((e: unknown) => {
          logger.warn('[MiniApp] failed to send B2B access admin notification', {
            slug,
            botId: bot.id,
            accessRequestId,
            error: e instanceof Error ? e.message : String(e)
          });
        });
      }
    }

    res.json({
      ok: true,
      approved: result.allowed,
      accessRequest: result.accessRequest ? {
        id: result.accessRequest.id,
        status: result.accessRequest.status
      } : null
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to request B2B access';
    errorResponse(res, 500, message);
  }
});

router.get('/b2b/requests/my', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const initData = readString(req.query.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    if (!isB2BMiniAppConfig(config as Record<string, any>)) {
      return b2bPortalUnavailableResponse(res);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const partnerState = await resolveB2BMiniAppPartner(config as Record<string, any>, initData);
    if (!partnerState.approved) return b2bPartnerNotApprovedResponse(res);

    const requests = await prisma.b2bRequest.findMany({
      where: {
        companyId: config.companyId,
        requesterPartnerId: partnerState.partner.partnerId
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      ok: true,
      items: requests.map(r => ({
        id: r.id,
        publicId: r.publicId || r.id,
        title: r.title,
        status: r.status,
        channelPostUrl: r.channelPostUrl,
        createdAt: r.createdAt
      }))
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load requests';
    errorResponse(res, 500, message);
  }
});

router.get('/b2b/requests/active', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const initData = readString(req.query.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    if (!isB2BMiniAppConfig(config as Record<string, any>)) {
      return b2bPortalUnavailableResponse(res);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const partnerState = await resolveB2BMiniAppPartner(config as Record<string, any>, initData);
    if (!partnerState.approved) return b2bPartnerNotApprovedResponse(res);

    const limit = Math.min(50, Math.max(1, readNumber(req.query.limit) || 20));
    const requests = await prisma.b2bRequest.findMany({
      where: {
        companyId: config.companyId,
        status: { in: ['PUBLISHED', 'COLLECTING_VARIANTS'] },
        requesterPartnerId: { not: null },
        NOT: {
          requesterPartnerId: partnerState.partner.partnerId
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        _count: { select: { variants: true } }
      }
    });

    res.json({
      ok: true,
      items: requests.map(mapB2BMiniAppNetworkRequestOutput)
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load active requests';
    errorResponse(res, 500, message);
  }
});

router.get('/b2b/variants/received', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const initData = readString(req.query.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    if (!isB2BMiniAppConfig(config as Record<string, any>)) {
      return b2bPortalUnavailableResponse(res);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const partnerState = await resolveB2BMiniAppPartner(config as Record<string, any>, initData);
    if (!partnerState.approved) return b2bPartnerNotApprovedResponse(res);

    const requests = await prisma.b2bRequest.findMany({
      where: { companyId: config.companyId, requesterPartnerId: partnerState.partner.partnerId },
      select: { id: true }
    });
    const requestIds = requests.map(r => r.id);
    if (!requestIds.length) return res.json({ ok: true, items: [] });

    const variants = await prisma.requestVariant.findMany({
      where: { requestId: { in: requestIds } },
      include: { request: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      ok: true,
      items: variants.map(v => ({
        id: v.id,
        requestId: v.requestId,
        requestPublicId: v.request?.publicId || v.requestId,
        status: v.status,
        requesterDecision: v.requesterDecision,
        title: v.title,
        price: v.price,
        year: v.year,
        mileage: v.mileage,
        location: v.location,
        thumbnail: sanitizeB2BMediaUrl(v.thumbnail),
        mediaUrls: sanitizeB2BMediaUrls(v.mediaUrls),
        specs: sanitizeB2BPublicSpecs(v.specs || {}) || {},
        createdAt: v.createdAt
      }))
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load variants';
    errorResponse(res, 500, message);
  }
});

router.post('/b2b/variants/:variantId/decision', async (req, res) => {
  try {
    const variantId = readString(req.params.variantId);
    if (!variantId) return errorResponse(res, 400, 'variantId is required');

    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const initData = readString(body.initData);
    const decisionRaw = readString(body.decision);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const decision = String(decisionRaw || '').toUpperCase();
    if (!['FIT', 'NOT_FIT'].includes(decision)) {
      return errorResponse(res, 400, 'decision must be FIT or NOT_FIT');
    }

    const config = await miniAppService.getConfig(slug);
    if (!isB2BMiniAppConfig(config as Record<string, any>)) {
      return b2bPortalUnavailableResponse(res);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const partnerState = await resolveB2BMiniAppPartner(config as Record<string, any>, initData);
    if (!partnerState.approved) return b2bPartnerNotApprovedResponse(res);

    const variant = await prisma.requestVariant.findUnique({
      where: { id: variantId },
      include: { request: true }
    });
    if (!variant || variant.request?.companyId !== config.companyId) return errorResponse(res, 404, 'Variant not found');
    if (variant.request?.requesterPartnerId !== partnerState.partner.partnerId) return errorResponse(res, 403, 'Forbidden');

    const updated = await prisma.requestVariant.update({
      where: { id: variantId },
      data: {
        requesterDecision: decision === 'FIT' ? 'FIT' : 'NOT_FIT',
        requesterDecisionAt: new Date(),
        status: decision === 'FIT' ? 'APPROVED' : 'REJECTED',
        fitQueueStatus: decision === 'FIT' ? 'NEW' : null,
        fitQueuedAt: decision === 'FIT' ? new Date() : null
      }
    });

    res.json({
      ok: true,
      variant: {
        id: updated.id,
        requesterDecision: updated.requesterDecision,
        fitQueueStatus: updated.fitQueueStatus
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to save decision';
    errorResponse(res, 500, message);
  }
});

router.post('/b2b/requests/:requestRef/variants', async (req, res) => {
  try {
    const requestRef = readString(req.params.requestRef);
    if (!requestRef) return errorResponse(res, 400, 'requestRef is required');

    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const initData = readString(body.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    if (!isB2BMiniAppConfig(config as Record<string, any>)) {
      return b2bPortalUnavailableResponse(res);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const telegram = parseMiniAppTelegramIdentity(initData);
    if (!telegram.userId) {
      return errorResponse(res, 400, 'Telegram user not found', MINIAPP_ERROR_CODES.INITDATA_INVALID);
    }

    const partnerState = await resolveB2BMiniAppPartner(config as Record<string, any>, initData);
    if (!partnerState.approved) return b2bPartnerNotApprovedResponse(res);

    const request = await prisma.b2bRequest.findFirst({
      where: {
        companyId: config.companyId,
        OR: [{ id: requestRef }, { publicId: requestRef }]
      }
    });
    if (!request) return errorResponse(res, 404, 'Request not found');

    const title = readString(body.title);
    if (!title) return errorResponse(res, 400, 'title is required', MINIAPP_ERROR_CODES.VALIDATION);

    const submitId = readString(body.submitId)
      || (isRecord(body.tracking) ? readString(body.tracking.submitId) || readString(body.tracking.eventId) : undefined);

    if (submitId) {
      const existing = await prisma.requestVariant.findFirst({
        where: {
          requestId: request.id,
          sellerPartnerId: partnerState.partner.partnerId,
          specs: {
            path: ['submitId'],
            equals: submitId
          } as any
        }
      });
      if (existing) {
        return res.json({
          ok: true,
          duplicate: true,
          variant: mapB2BMiniAppVariantOutput(existing, request)
        });
      }
    }

    const safeMediaUrls = sanitizeB2BMediaUrls([
      readString(body.thumbnail),
      ...(readStringArray(body.mediaUrls) || [])
    ]);
    const comment = readString(body.comment);
    const condition = readString(body.condition);
    const vin = readString(body.vin)?.toUpperCase();
    const sourceUrl = sanitizeB2BMediaUrl(body.sourceUrl) || sanitizeB2BMediaUrl(body.url);
    const specs = JSON.parse(JSON.stringify({
      ...(isRecord(body.specs) ? body.specs : {}),
      ...(condition ? { condition } : {}),
      ...(vin ? { vin } : {}),
      ...(comment ? { comment } : {}),
      source: 'miniapp_b2b_offer',
      ...(submitId ? { submitId } : {}),
      telegramUserId: telegram.userId
    })) as Prisma.InputJsonValue;

    const variantInput = mapVariantInput({
      title,
      price: readNumber(body.price),
      currency: readString(body.currency) || 'USD',
      year: readNumber(body.year),
      mileage: readNumber(body.mileage),
      location: readString(body.location),
      condition,
      contact: readString(body.contact),
      companyName: partnerState.partner.name,
      source: 'MINIAPP_B2B_OFFER',
      sourceUrl,
      thumbnail: safeMediaUrls[0] || null,
      mediaUrls: safeMediaUrls,
      specs,
      status: 'SUBMITTED',
      statusHistory: [
        {
          status: 'SUBMITTED',
          at: new Date().toISOString(),
          by: telegram.userId
        }
      ],
      sellerPartnerId: partnerState.partner.partnerId
    });

    const variant = await prisma.requestVariant.create({
      data: {
        ...variantInput,
        requestId: request.id
      }
    });

    await emitPlatformEvent({
      companyId: config.companyId,
      botId: config.botId || null,
      eventType: 'miniapp.b2b.offer.created',
      userId: telegram.userId,
      payload: {
        requestId: request.id,
        requestPublicId: request.publicId || request.id,
        variantId: variant.id,
        sellerPartnerId: partnerState.partner.partnerId,
        submitId,
        source: 'miniapp'
      }
    });

    const bot = await getMiniAppBotForSend(config.botId, config.companyId);
    if (bot?.token && bot.adminChatId) {
      const adminText = buildB2BVariantAdminNotificationText({
        request,
        variant,
        partnerName: partnerState.partner.name,
        telegramUserId: telegram.userId,
        telegramUsername: telegram.username,
        source: 'MiniApp B2B'
      });
      const replyMarkup = await buildB2BVariantAdminActionMarkupAsync({
        variant,
        request,
        botId: bot.id,
        companyId: bot.companyId || config.companyId
      });
      await telegramOutbox.sendMessage({
        botId: bot.id,
        token: bot.token,
        chatId: String(bot.adminChatId),
        text: adminText,
        replyMarkup,
        companyId: bot.companyId || config.companyId,
        userId: telegram.userId
      }).catch((e: unknown) => {
        logger.warn('[MiniApp] failed to send B2B offer admin notification', {
          requestId: request.id,
          variantId: variant.id,
          slug,
          botId: bot.id,
          error: e instanceof Error ? e.message : String(e)
        });
      });
    }

    res.json({
      ok: true,
      duplicate: false,
      variant: mapB2BMiniAppVariantOutput(variant, request)
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to submit B2B offer';
    errorResponse(res, 500, message);
  }
});

router.get('/b2b/admin/fit-queue', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const initData = readString(req.query.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    if (!isB2BMiniAppConfig(config as Record<string, any>)) {
      return b2bPortalUnavailableResponse(res);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const tgUser = parseTelegramUser(initData);
    const tgUserId = tgUser?.id ? String(tgUser.id) : undefined;
    if (!tgUserId) return errorResponse(res, 400, 'Telegram user not found');

    const adminAllowed = await isMiniAppAdmin(config.companyId, tgUserId, config.botId || undefined);
    if (!adminAllowed) return errorResponse(res, 403, 'Admin access required');

    const status = readString(req.query.status)?.toUpperCase();

    res.json({
      ok: true,
      items: await requestContractService.listAdminFitQueue({
        companyId: config.companyId,
        status
      })
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load fit queue';
    errorResponse(res, 500, message);
  }
});

router.patch('/b2b/admin/fit-queue/:variantId', async (req, res) => {
  try {
    const variantId = readString(req.params.variantId);
    if (!variantId) return errorResponse(res, 400, 'variantId is required');
    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const initData = readString(body.initData);
    const fitQueueStatus = readString(body.fitQueueStatus);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');
    if (!fitQueueStatus) return errorResponse(res, 400, 'fitQueueStatus is required');

    const config = await miniAppService.getConfig(slug);
    if (!isB2BMiniAppConfig(config as Record<string, any>)) {
      return b2bPortalUnavailableResponse(res);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const tgUser = parseTelegramUser(initData);
    const tgUserId = tgUser?.id ? String(tgUser.id) : undefined;
    if (!tgUserId) return errorResponse(res, 400, 'Telegram user not found');
    const adminAllowed = await isMiniAppAdmin(config.companyId, tgUserId, config.botId || undefined);
    if (!adminAllowed) return errorResponse(res, 403, 'Admin access required');

    res.json({
      ok: true,
      variant: await requestContractService.updateAdminFitQueue({
        companyId: config.companyId,
        variantId,
        fitQueueStatus,
        location: readString(body.location),
        meetingAt: readString(body.meetingAt),
        result: readString(body.result)
      })
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to update fit queue';
    if (message === 'Invalid fitQueueStatus') return errorResponse(res, 400, message);
    if (message === 'Variant not found') return errorResponse(res, 404, message);
    errorResponse(res, 500, message);
  }
});

router.post('/b2b/admin/fit-queue/:variantId/contact-share', async (req, res) => {
  try {
    const variantId = readString(req.params.variantId);
    if (!variantId) return errorResponse(res, 400, 'variantId is required');
    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const initData = readString(body.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    if (!isB2BMiniAppConfig(config as Record<string, any>)) {
      return b2bPortalUnavailableResponse(res);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const tgUser = parseTelegramUser(initData);
    const tgUserId = tgUser?.id ? String(tgUser.id) : undefined;
    if (!tgUserId) return errorResponse(res, 400, 'Telegram user not found');
    const adminAllowed = await isMiniAppAdmin(config.companyId, tgUserId, config.botId || undefined);
    if (!adminAllowed) return errorResponse(res, 403, 'Admin access required');

    res.json({
      ok: true,
      reveal: await requestContractService.shareAdminFitQueueContacts({
        companyId: config.companyId,
        variantId
      })
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to share contacts';
    if (message === 'Variant not found') return errorResponse(res, 404, message);
    if (message === 'Contacts unavailable') return errorResponse(res, 400, message);
    if (message === 'Contact reveal requires FIT') return errorResponse(res, 409, message);
    errorResponse(res, 500, message);
  }
});

router.get('/favorites', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const tgUserId = readString(req.query.tgUserId) || readString(req.query.telegramUserId);
    const visitorId = readString(req.query.visitorId);

    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!tgUserId && !visitorId) return errorResponse(res, 400, 'tgUserId or visitorId is required');

    const result = await miniAppService.listFavorites(slug, { tgUserId, visitorId });
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load favorites';
    errorResponse(res, 500, message);
  }
});

router.post('/favorites/:carListingId', async (req, res) => {
  try {
    const carListingId = readString(req.params.carListingId);
    if (!carListingId) return errorResponse(res, 400, 'carListingId is required');

    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const initData = readString(body.initData);
    const tgUserId = readString(body.tgUserId) || readString(body.telegramUserId) || readString(body.userId);
    const visitorId = readString(body.visitorId);

    const listing = await prisma.carListing.findUnique({ where: { id: carListingId }, select: { companyId: true } });

    let resolvedConfig;
    try {
      if (slug) resolvedConfig = await miniAppService.getConfig(slug);
    } catch { }

    const companyId = listing?.companyId || resolvedConfig?.companyId || null;
    const botId = resolvedConfig?.botId;
    const requestId = readString(req.get('x-request-id')) || `miniapp_${Date.now().toString(36)}`;

    logger.info('[MiniApp] favorite toggle request', {
      requestId,
      slug: slug || null,
      carListingId,
      tgUserId: tgUserId || null,
      hasVisitorId: Boolean(visitorId),
      hasInitData: Boolean(initData),
      companyId,
      botId: botId || null
    });

    if (!tgUserId && !visitorId) return errorResponse(res, 400, 'tgUserId or visitorId is required');
    let favoriteIdentity = { tgUserId, visitorId };
    if (initData) {
      const initCheck = await requireInitData(initData, companyId, botId);
      if (!initCheck.ok) {
        if (!visitorId) return errorResponse(res, 401, initCheck.message || 'Unauthorized');
        logger.warn('[MiniApp] favorite initData invalid, falling back to visitorId', {
          requestId,
          slug: slug || null,
          carListingId,
          companyId,
          botId: botId || null,
          reason: initCheck.message,
          diagnostics: buildInitDataDiagnostics(initData)
        });
        favoriteIdentity = { tgUserId: undefined, visitorId };
      }
    } else if (!visitorId) {
      return errorResponse(res, 401, 'initData or visitorId is required');
    }

    const result = await miniAppService.toggleFavorite(carListingId, favoriteIdentity, slug);
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to toggle favorite';
    errorResponse(res, 500, message);
  }
});

router.post('/lead-intents', async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const initData = readString(body.initData);
    const kind = normalizeLeadIntentKind(readString(body.kind) || readString(body.intentType) || readString(body.type));
    const requestId = readString(req.get('x-request-id')) || `miniapp_${Date.now().toString(36)}`;

    if (!slug) return errorResponse(res, 400, 'slug is required', MINIAPP_ERROR_CODES.VALIDATION);
    if (!initData) {
      return errorResponse(res, 400, 'initData is required', MINIAPP_ERROR_CODES.INITDATA_REQUIRED);
    }
    if (!kind) {
      return errorResponse(res, 400, 'kind must be PICK or PRICE_TERMS', MINIAPP_ERROR_CODES.VALIDATION);
    }
    if (readString(body.phone)) {
      return errorResponse(res, 400, 'phone is collected through Telegram contact request', MINIAPP_ERROR_CODES.VALIDATION);
    }

    const config = await miniAppService.getConfig(slug).catch(() => null);
    if (!config?.companyId) return errorResponse(res, 404, 'Company not found');
    if (isB2BMiniAppConfig(config as Record<string, any>)) {
      return errorResponse(res, 400, 'Lead intents are not available for B2B MiniApp', MINIAPP_ERROR_CODES.BOT_FLOW_UNAVAILABLE);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) {
      logger.warn('[MiniApp] lead intent initData invalid', {
        requestId,
        slug,
        companyId: config.companyId,
        botId: config.botId || null,
        reason: initCheck.message,
        diagnostics: buildInitDataDiagnostics(initData)
      });
      return errorResponse(res, 401, initCheck.message || 'Invalid Telegram init data', MINIAPP_ERROR_CODES.INITDATA_INVALID);
    }

    const telegram = parseMiniAppTelegramIdentity(initData);
    if (!telegram.userId) {
      return errorResponse(res, 400, 'Telegram user not found', MINIAPP_ERROR_CODES.INITDATA_INVALID);
    }

    const criteria = isRecord(body.criteria) ? body.criteria : {};
    const tracking = isRecord(body.tracking) ? body.tracking : undefined;
    const payloadFromInput = isRecord(body.payload) ? body.payload : {};
    const carListingIds = readStringArray(body.carListingIds);
    const pending = await requestContractService.createPendingLeadIntent({
      slug,
      intentType: kind.intentType,
      title: readString(body.title),
      description: readString(body.description),
      budgetMax: readNumber(body.budgetMax) ?? readNumber(criteria.budgetMax),
      yearMin: readNumber(body.yearMin) ?? readNumber(criteria.yearMin) ?? readNumber(criteria.yearFrom),
      comment: readString(body.comment) || readString(criteria.comment),
      carListingId: readString(body.carListingId),
      carListingIds,
      tracking,
      payload: {
        ...payloadFromInput,
        kind: kind.kind,
        criteria,
        source: 'miniapp_lead_intent',
        requestId
      },
      telegram: {
        userId: telegram.userId,
        username: telegram.username,
        name: telegram.name
      }
    });

    const bot = await getMiniAppBotForSend(pending.botId || config.botId, config.companyId);
    if (!bot?.token) return errorResponse(res, 400, 'Bot not found', MINIAPP_ERROR_CODES.BOT_FLOW_UNAVAILABLE);

    if ((pending as any).isDuplicate) {
      return res.json({
        ok: true,
        contactRequested: false,
        duplicate: true,
        closeMiniApp: true,
        intent: {
          kind: kind.kind,
          type: pending.intentType,
          title: pending.title
        }
      });
    }

    const knownContact = await requestContractService.findKnownLeadContact({
      companyId: config.companyId,
      botId: pending.botId || config.botId,
      telegramUserId: telegram.userId
    });

    if (knownContact?.phone) {
      const finalized = await requestContractService.finalizePendingLeadIntent({
        botId: bot.id,
        companyId: config.companyId,
        telegramUserId: telegram.userId,
        phone: knownContact.phone,
        displayName: telegram.name || (telegram.username ? `@${telegram.username}` : 'Клієнт'),
        telegramUsername: telegram.username,
        telegramName: telegram.name
      });

      await telegramOutbox.sendMessage({
        botId: bot.id,
        token: bot.token,
        chatId: pending.chatId || telegram.userId,
        text: `✅ Запит отримано. Використали збережений контакт ${knownContact.phone}. Менеджер звʼяжеться з вами найближчим часом.`,
        replyMarkup: { remove_keyboard: true },
        companyId: config.companyId,
        userId: telegram.userId
      }).catch((e: unknown) => {
        logger.warn('[MiniApp] failed to send known-contact confirmation', {
          requestId,
          slug,
          botId: bot.id,
          error: e instanceof Error ? e.message : String(e)
        });
      });

      if (bot.adminChatId) {
        const displayName = telegram.name || (telegram.username ? `@${telegram.username}` : 'Клієнт');
        const adminText = buildLeadAdminNotificationText({
          header: '🟢 [LEAD] MiniApp запит',
          displayName,
          telegramUsername: telegram.username,
          telegramUserId: telegram.userId,
          phone: knownContact.phone,
          intentLabel: finalized.intentType === 'REQUEST' ? 'Підбір авто' : 'Інтерес до авто',
          requestPresentationText: finalized.requestPresentation?.telegramText,
          fallbackTitle: finalized.title,
          request: finalized.request,
          source: 'miniapp',
          duplicate: Boolean((pending as any).isDuplicate || finalized.isDuplicate)
        });
        const replyMarkup = await buildLeadAdminActionMarkupAsync({
          lead: finalized.lead,
          request: finalized.request,
          telegramUserId: telegram.userId,
          selectedCars: finalized.requestPresentation?.selectedCars,
          tokenContext: {
            botId: bot.id,
            companyId: bot.companyId || config.companyId,
            requestId: finalized.request?.id
          }
        });
        await telegramOutbox.sendMessage({
          botId: bot.id,
          token: bot.token,
          chatId: String(bot.adminChatId),
          text: adminText,
          replyMarkup,
          companyId: config.companyId,
          userId: telegram.userId
        }).catch((e: unknown) => {
          logger.warn('[MiniApp] failed to send known-contact admin notification', {
            requestId,
            slug,
            botId: bot.id,
            error: e instanceof Error ? e.message : String(e)
          });
        });
      }

      return res.json({
        ok: true,
        contactRequested: false,
        contactKnown: true,
        finalized: true,
        closeMiniApp: true,
        duplicate: Boolean((pending as any).isDuplicate || finalized.isDuplicate),
        intent: {
          kind: kind.kind,
          type: finalized.intentType,
          title: finalized.title
        },
        request: finalized.request ? {
          id: finalized.request.id,
          publicId: finalized.request.publicId
        } : undefined
      });
    }

    try {
      const askText = kind.kind === 'PICK'
        ? '✅ Запит на підбір отримано. Поділіться контактом у чаті, щоб менеджер міг продовжити підбір.'
        : '✅ Запит по авто отримано. Поділіться контактом у чаті, щоб менеджер міг уточнити ціну та умови.';
      await telegramOutbox.sendMessage({
        botId: bot.id,
        token: bot.token,
        chatId: pending.chatId || telegram.userId,
        text: askText,
        replyMarkup: buildContactRequestKeyboard(),
        companyId: config.companyId,
        userId: telegram.userId
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to send contact request';
      logger.warn('[MiniApp] failed to send contact request', {
        requestId,
        slug,
        botId: bot.id,
        error: message
      });
      return res.json({
        ok: true,
        contactRequested: false,
        contactRequestFailed: true,
        closeMiniApp: false,
        openBotUrl: buildBotOpenUrl(bot),
        duplicate: Boolean((pending as any).isDuplicate),
        intent: {
          kind: kind.kind,
          type: pending.intentType,
          title: pending.title
        }
      });
    }

    res.json({
      ok: true,
      contactRequested: true,
      closeMiniApp: true,
      duplicate: Boolean((pending as any).isDuplicate),
      intent: {
        kind: kind.kind,
        type: pending.intentType,
        title: pending.title
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to create lead intent';
    errorResponse(res, 500, message);
  }
});

router.post('/bot-flows', async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const initData = readString(body.initData);
    const flow = String(readString(body.flow) || '').toUpperCase();

    if (!slug) return errorResponse(res, 400, 'slug is required', MINIAPP_ERROR_CODES.VALIDATION);
    if (!initData) return errorResponse(res, 400, 'initData is required', MINIAPP_ERROR_CODES.INITDATA_REQUIRED);
    if (!['SELL', 'SUPPORT'].includes(flow)) {
      return errorResponse(res, 400, 'flow must be SELL or SUPPORT', MINIAPP_ERROR_CODES.BOT_FLOW_UNAVAILABLE);
    }

      const config = await miniAppService.getConfig(slug).catch(() => null);
      if (!config?.companyId) return errorResponse(res, 404, 'Company not found');
      if (isB2BMiniAppConfig(config as Record<string, any>)) {
        return errorResponse(
          res,
          400,
          'Bot flow is not available for B2B MiniApp',
          MINIAPP_ERROR_CODES.BOT_FLOW_UNAVAILABLE
        );
      }

      const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) {
      logger.warn('[MiniApp] bot flow initData invalid', {
        slug,
        companyId: config.companyId,
        botId: config.botId || null,
        flow,
        reason: initCheck.message,
        diagnostics: buildInitDataDiagnostics(initData)
      });
      return errorResponse(res, 401, initCheck.message || 'Invalid Telegram init data', MINIAPP_ERROR_CODES.INITDATA_INVALID);
    }

    const telegram = parseMiniAppTelegramIdentity(initData);
    if (!telegram.userId) return errorResponse(res, 400, 'Telegram user not found', MINIAPP_ERROR_CODES.INITDATA_INVALID);

    const bot = await getMiniAppBotForSend(config.botId || initCheck.verifiedBotId, config.companyId);
    if (!bot?.token) return errorResponse(res, 400, 'Bot not found', MINIAPP_ERROR_CODES.BOT_FLOW_UNAVAILABLE);

    const session = await ensureMiniAppBotSession({
      botId: bot.id,
      chatId: telegram.userId,
      variables: {
        miniappBotFlow: {
          flow,
          slug,
          createdAt: new Date().toISOString()
        }
      }
    });

    try {
      if (flow === 'SELL') {
        await startLeadSellWizard({
          bot,
          session,
          chatId: telegram.userId,
          userId: telegram.userId,
          companyId: config.companyId,
          chatType: 'private',
          update: {
            message: {
              chat: { id: Number(telegram.userId), type: 'private' },
              from: telegram.raw
            }
          }
        } as any);
      } else {
        await ensureMiniAppBotSession({
          botId: bot.id,
          chatId: telegram.userId,
          state: 'CL_SUPPORT_TEXT',
          variables: {
            supportDraft: { mode: 'new', source: 'miniapp_bot_flow' }
          }
        });
        await telegramOutbox.sendMessage({
          botId: bot.id,
          token: bot.token,
          chatId: telegram.userId,
          text: '🆘 Напишіть, будь ласка, ваше питання одним повідомленням. Менеджер отримає звернення у CarTié.',
          replyMarkup: { remove_keyboard: true },
          companyId: config.companyId,
          userId: telegram.userId
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to start bot flow';
      logger.warn('[MiniApp] failed to start bot flow', {
        slug,
        botId: bot.id,
        flow,
        error: message
      });
      return errorResponse(res, 502, 'Failed to start bot flow', MINIAPP_ERROR_CODES.CONTACT_REQUEST_SEND_FAILED);
    }

    res.json({
      ok: true,
      flow,
      closeMiniApp: true
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to start bot flow';
    errorResponse(res, 500, message);
  }
});

router.post('/requests', async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const initData = readString(body.initData);
    const requestId = readString(req.get('x-request-id')) || `miniapp_${Date.now().toString(36)}`;

    if (!slug) return errorResponse(res, 400, 'slug is required');

    let config;
    try {
      config = await miniAppService.getConfig(slug);
    } catch (e: unknown) {
      return errorResponse(res, 404, 'Company not found');
    }

    if (!isB2BMiniAppConfig(config)) {
      return errorResponse(
        res,
        400,
        'Lead MiniApp writes must use /api/miniapp/lead-intents',
        LEAD_WRONG_ENDPOINT
      );
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const telegram = parseMiniAppTelegramIdentity(initData || '');
    if (!telegram.userId) {
      return errorResponse(res, 400, 'Telegram user not found', MINIAPP_ERROR_CODES.INITDATA_INVALID);
    }

    const partnerState = await resolveB2BMiniAppPartner(config as Record<string, any>, initData || '');
    if (!partnerState.approved) return b2bPartnerNotApprovedResponse(res);

    logger.info('[MiniApp] request create', {
      requestId,
      slug,
      companyId: config.companyId,
      botId: config.botId || null,
      hasInitData: Boolean(initData),
      hasPhone: Boolean(readString(body.phone)),
      hasCarListingId: Boolean(readString(body.carListingId)),
      carListingIdsCount: Array.isArray(body.carListingIds)
        ? body.carListingIds.filter((item) => typeof item === 'string' && item.trim()).length
        : 0
    });

    const request = await miniAppService.createRequest({
      slug,
      requestType: readString(body.requestType) || readString(body.type),
      requestSubtype: readString(body.requestSubtype),
      title: readString(body.title),
      description: readString(body.description),
      budgetMax: readNumber(body.budgetMax),
      yearMin: readNumber(body.yearMin),
      phone: readString(body.phone),
      comment: readString(body.comment),
      carListingId: readString(body.carListingId),
      carListingIds: Array.isArray(body.carListingIds)
        ? body.carListingIds.map((item) => readString(item)).filter((item): item is string => Boolean(item))
        : undefined,
      tracking: (body.tracking as Record<string, unknown>) || undefined,
      telegram: {
        userId: telegram.userId,
        username: telegram.username,
        name: telegram.name
      },
      payload: (body.payload as Record<string, unknown>) || undefined
    });

    res.json({ ok: true, request });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to create request';
    errorResponse(res, 500, message);
  }
});

router.post('/events', async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const eventType = readString(body.eventType);
    const initData = readString(body.initData);
    const visitorId = readString(body.visitorId);

    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!eventType) return errorResponse(res, 400, 'eventType is required');

    let config;
    try {
      config = await miniAppService.getConfig(slug);
    } catch {
      config = null;
    }
    if (!config?.companyId) return errorResponse(res, 404, 'Company not found');

    let verifiedTelegram: ReturnType<typeof parseMiniAppTelegramIdentity> | undefined;
    if (initData) {
      const initCheck = await requireInitData(initData, config.companyId, config.botId);
      if (!initCheck.ok) {
        logger.debug?.('[MiniApp] event initData invalid', {
          slug,
          eventType,
          companyId: config.companyId,
          botId: config.botId || null,
          reason: initCheck.message,
          diagnostics: buildSafeInitDataDiagnostics(initData)
        });
        return errorResponse(res, 401, initCheck.message || 'Unauthorized', MINIAPP_ERROR_CODES.INITDATA_INVALID);
      }
      verifiedTelegram = parseMiniAppTelegramIdentity(initData);
    } else if (!visitorId || !isReadOnlyPreviewMiniAppEvent(eventType)) {
      return errorResponse(res, 400, 'initData is required', MINIAPP_ERROR_CODES.INITDATA_REQUIRED);
    } else {
      logger.debug?.('[MiniApp] read-only preview event without initData', {
        slug,
        eventType,
        companyId: config.companyId,
        botId: config.botId || null,
        visitorId
      });
    }

    const resolvedUserId = verifiedTelegram?.userId || visitorId || null;
    const payload = body.payload && typeof body.payload === 'object'
      ? sanitizeMiniAppEventValue(body.payload) as Record<string, unknown>
      : undefined;
    const tracking = body.tracking && typeof body.tracking === 'object'
      ? sanitizeMiniAppEventValue(body.tracking) as Record<string, unknown>
      : undefined;
    const carListingId = readString(body.carListingId);
    const eventId = buildMiniAppTrackingEventId(eventType, tracking, readString(req.get('x-request-id')));
    const metaEventName = mapMiniAppEventToMeta(eventType);
    const metaEnabled = Boolean(metaEventName && isEnvFlagEnabled('META_CAPI_ENABLED', false));
    const metaStatus: Record<string, unknown> = {
      enabled: metaEnabled,
      eventName: metaEventName
    };

    await emitPlatformEvent({
      companyId: config.companyId,
      botId: config.botId || null,
      eventType: `miniapp.${eventType}`,
      userId: resolvedUserId,
      payload: {
        eventId,
        source: 'miniapp',
        slug,
        visitorId,
        tgUserId: verifiedTelegram?.userId,
        view: readString(body.view),
        carListingId,
        payload,
        tracking
      }
    });

    if (metaEventName && metaEnabled) {
      const trackingMeta = readTrackingMeta(tracking);
      const externalId = verifiedTelegram?.userId
        ? `telegram:${verifiedTelegram.userId}`
        : (visitorId ? `visitor:${visitorId}` : undefined);
      const customData = toMetaCustomData({
        ...(payload || {}),
        source: 'miniapp',
        slug,
        miniapp_event: eventType,
        view: readString(body.view),
        carListingId,
        routeSource: readString(tracking?.routeSource),
        requestType: readString(tracking?.requestType)
      });

      const { IntegrationService } = await import('../modules/Integrations/integration.service.js');
      const metaResult = await new IntegrationService().metaPixelTrackEvent(config.companyId, metaEventName, {
        eventId,
        externalId,
        fbp: readString(trackingMeta.fbp),
        fbc: readString(trackingMeta.fbc),
        eventSourceUrl: readString(trackingMeta.eventSourceUrl) || readString(trackingMeta.event_source_url),
        actionSource: readString(trackingMeta.actionSource) || readString(trackingMeta.action_source) || 'website',
        ip: readClientIp(req),
        userAgent: readString(req.get('user-agent')),
        contentIds: carListingId ? [carListingId] : undefined,
        customData,
        entityType: 'miniapp_event',
        entityId: eventId,
        stage: eventType
      }).catch((e: unknown) => {
        logger.warn('[MiniApp] Meta CAPI event failed', {
          slug,
          eventType,
          metaEventName,
          companyId: config.companyId,
          error: e instanceof Error ? e.message : String(e)
        });
        return null;
      });
      if (metaResult && typeof metaResult === 'object') {
        metaStatus.success = (metaResult as any).success;
        metaStatus.duplicate = Boolean((metaResult as any).duplicate);
        if ((metaResult as any).error) metaStatus.error = (metaResult as any).error;
      }
      if (metaResult && typeof metaResult === 'object' && metaResult.success === false) {
        logger.warn('[MiniApp] Meta CAPI event rejected', {
          slug,
          eventType,
          metaEventName,
          companyId: config.companyId,
          eventId,
          error: (metaResult as any).error
        });
      }
    }

    res.json({ ok: true, eventId, meta: metaStatus });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to track event';
    errorResponse(res, 500, message);
  }
});

router.get('/requests/my', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    const initData = readString(req.query.initData);
    if (!initData) return errorResponse(res, 400, 'initData is required', MINIAPP_ERROR_CODES.INITDATA_REQUIRED);

    const config = await miniAppService.getConfig(slug);
    if (!config?.companyId) return errorResponse(res, 404, 'Company not found');
    if (isB2BMiniAppConfig(config as Record<string, any>)) {
      return errorResponse(res, 400, 'Lead request history is not available for B2B MiniApp', MINIAPP_ERROR_CODES.BOT_FLOW_UNAVAILABLE);
    }

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized', MINIAPP_ERROR_CODES.INITDATA_INVALID);
    const telegram = parseMiniAppTelegramIdentity(initData);
    if (!telegram.userId) return errorResponse(res, 400, 'Telegram user not found', MINIAPP_ERROR_CODES.INITDATA_INVALID);

    const items = await miniAppService.listMyRequests(slug, {
      telegramUserId: telegram.userId,
      limit: readNumber(req.query.limit)
    });

    res.json({ ok: true, items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to fetch request history';
    errorResponse(res, 500, message);
  }
});

router.get('/requests/status', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    const initData = readString(req.query.initData);
    if (!initData) return errorResponse(res, 400, 'initData is required', MINIAPP_ERROR_CODES.INITDATA_REQUIRED);

    const config = await miniAppService.getConfig(slug);
    if (!config?.companyId) return errorResponse(res, 404, 'Company not found');
    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized', MINIAPP_ERROR_CODES.INITDATA_INVALID);
    const telegram = parseMiniAppTelegramIdentity(initData);
    if (!telegram.userId) return errorResponse(res, 400, 'Telegram user not found', MINIAPP_ERROR_CODES.INITDATA_INVALID);
    const requestId = readString(req.query.requestId) || readString(req.query.publicId);

    const request = await miniAppService.getRequestStatus(slug, {
      requestId: requestId || undefined,
      telegramUserId: telegram.userId
    });

    if (!request) return errorResponse(res, 404, 'Request not found');

    res.json({ ok: true, request });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to fetch request status';
    errorResponse(res, 500, message);
  }
});

export default router;
