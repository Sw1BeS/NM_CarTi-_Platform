import { Router } from 'express';
import { miniAppService } from '../services/miniapp.service.js';
import { errorResponse } from '../utils/errorResponse.js';
import { parseTelegramUser, verifyTelegramInitData } from '../modules/Communication/telegram/core/telegramAuth.js';
import { resolvePublicSlug } from '../services/publicSlug.service.js';
import { prisma } from '../services/prisma.js';
import { logger } from '../utils/logger.js';
import { ShowcaseService } from '../modules/Marketing/showcase/showcase.service.js';
import { mapInventoryOutput } from '../services/dto.js';
import { renderCarCardForBot } from '../services/carCardRenderer.v2.js';
import { telegramOutbox } from '../modules/Communication/telegram/messaging/outbox/telegramOutbox.js';
import { getEnvInt } from '../services/featureFlags.js';
import { emitPlatformEvent } from '../modules/Communication/telegram/core/events/eventEmitter.js';

const router = Router();
const showcaseService = new ShowcaseService();

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

const resolveCompanyIdBySlug = async (slug?: string | null) => {
  const trimmed = String(slug || '').trim();
  if (!trimmed) return null;
  const resolved = await resolvePublicSlug(trimmed);
  return resolved.companyId || null;
};

const requireInitData = async (initData: string | undefined, companyId?: string | null, botId?: string | null) => {
  if (!initData) return { ok: false, message: 'initData is required' };
  const init = initData;
  const maxAgeSeconds = Math.max(60, getEnvInt('TELEGRAM_INITDATA_MAX_AGE_SECONDS', 900));

  if (botId) {
    const bot = await prisma.botConfig.findFirst({
      where: { id: botId, isEnabled: true },
      select: { token: true }
    });
    if (bot) {
      if (verifyTelegramInitData(init, bot.token, maxAgeSeconds)) return { ok: true };
      return { ok: false, message: 'Invalid Telegram init data' };
    }
    // If specific bot not found/disabled, fail or fall back?
    // Fail secure.
    return { ok: false, message: 'Bot not found or disabled' };
  }

  const bots = await prisma.botConfig.findMany({
    where: {
      isEnabled: true,
      ...(companyId ? { companyId } : {})
    },
    select: { token: true }
  });
  const verified = bots.some(bot => verifyTelegramInitData(init, bot.token, maxAgeSeconds));
  if (!verified) return { ok: false, message: 'Invalid Telegram init data' };
  return { ok: true };
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

    const { showcase, items, total } = await showcaseService.getInventoryForShowcase(slug, {
      page,
      limit,
      search,
      minPrice,
      maxPrice,
      minYear,
      maxYear,
      status
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

router.get('/b2b/requests/my', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const initData = readString(req.query.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const tgUser = parseTelegramUser(initData);
    const tgUserId = tgUser?.id ? String(tgUser.id) : undefined;
    if (!tgUserId) return errorResponse(res, 400, 'Telegram user not found');

    const partnerUser = await prisma.partnerUser.findFirst({
      where: { companyId: config.companyId, telegramId: tgUserId },
      select: { partnerId: true }
    });
    if (!partnerUser?.partnerId) return errorResponse(res, 403, 'Access denied');

    const requests = await prisma.b2bRequest.findMany({
      where: {
        companyId: config.companyId,
        requesterPartnerId: partnerUser.partnerId
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

router.get('/b2b/variants/received', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const initData = readString(req.query.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const tgUser = parseTelegramUser(initData);
    const tgUserId = tgUser?.id ? String(tgUser.id) : undefined;
    if (!tgUserId) return errorResponse(res, 400, 'Telegram user not found');

    const partnerUser = await prisma.partnerUser.findFirst({
      where: { companyId: config.companyId, telegramId: tgUserId },
      select: { partnerId: true }
    });
    if (!partnerUser?.partnerId) return errorResponse(res, 403, 'Access denied');

    const requests = await prisma.b2bRequest.findMany({
      where: { companyId: config.companyId, requesterPartnerId: partnerUser.partnerId },
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
        thumbnail: v.thumbnail,
        mediaUrls: v.mediaUrls || [],
        specs: v.specs || {},
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
    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const tgUser = parseTelegramUser(initData);
    const tgUserId = tgUser?.id ? String(tgUser.id) : undefined;
    if (!tgUserId) return errorResponse(res, 400, 'Telegram user not found');

    const partnerUser = await prisma.partnerUser.findFirst({
      where: { companyId: config.companyId, telegramId: tgUserId },
      select: { partnerId: true }
    });
    if (!partnerUser?.partnerId) return errorResponse(res, 403, 'Access denied');

    const variant = await prisma.requestVariant.findUnique({
      where: { id: variantId },
      include: { request: true }
    });
    if (!variant || variant.request?.companyId !== config.companyId) return errorResponse(res, 404, 'Variant not found');
    if (variant.request?.requesterPartnerId !== partnerUser.partnerId) return errorResponse(res, 403, 'Forbidden');

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

router.get('/b2b/admin/fit-queue', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    const initData = readString(req.query.initData);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!initData) return errorResponse(res, 400, 'initData is required');

    const config = await miniAppService.getConfig(slug);
    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const tgUser = parseTelegramUser(initData);
    const tgUserId = tgUser?.id ? String(tgUser.id) : undefined;
    if (!tgUserId) return errorResponse(res, 400, 'Telegram user not found');

    const adminAllowed = await isMiniAppAdmin(config.companyId, tgUserId, config.botId || undefined);
    if (!adminAllowed) return errorResponse(res, 403, 'Admin access required');

    const status = readString(req.query.status);

    const items = await prisma.requestVariant.findMany({
      where: {
        requesterDecision: 'FIT',
        request: { companyId: config.companyId },
        ...(status ? { fitQueueStatus: status as any } : {})
      },
      include: {
        request: true,
        sellerPartner: true
      },
      orderBy: { fitQueuedAt: 'desc' }
    });

    res.json({
      ok: true,
      items: items.map(item => ({
        id: item.id,
        requestPublicId: item.request?.publicId || item.requestId,
        fitQueueStatus: item.fitQueueStatus,
        title: item.title,
        sellerCompany: item.sellerPartner?.name || item.companyName,
        contact: item.contact,
        fitQueuedAt: item.fitQueuedAt
      }))
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
    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const tgUser = parseTelegramUser(initData);
    const tgUserId = tgUser?.id ? String(tgUser.id) : undefined;
    if (!tgUserId) return errorResponse(res, 400, 'Telegram user not found');
    const adminAllowed = await isMiniAppAdmin(config.companyId, tgUserId, config.botId || undefined);
    if (!adminAllowed) return errorResponse(res, 403, 'Admin access required');

    const variant = await prisma.requestVariant.findUnique({
      where: { id: variantId },
      include: { request: true }
    });
    if (!variant || variant.request?.companyId !== config.companyId) return errorResponse(res, 404, 'Variant not found');

    const updated = await prisma.requestVariant.update({
      where: { id: variantId },
      data: {
        fitQueueStatus: fitQueueStatus as any,
        fitClosedAt: String(fitQueueStatus).toUpperCase() === 'CLOSED' ? new Date() : null
      }
    });

    res.json({
      ok: true,
      variant: {
        id: updated.id,
        fitQueueStatus: updated.fitQueueStatus,
        fitClosedAt: updated.fitClosedAt
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to update fit queue';
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
          botId: botId || null
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

    const initCheck = await requireInitData(initData, config.companyId, config.botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

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
      telegram: (body.telegram as Record<string, unknown>) || undefined,
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
    const tgUserId = readString(body.tgUserId) || readString(body.telegramUserId) || readString(body.userId);

    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!eventType) return errorResponse(res, 400, 'eventType is required');

    let config;
    try {
      config = await miniAppService.getConfig(slug);
    } catch {
      config = null;
    }

    if (initData && config) {
      const initCheck = await requireInitData(initData, config.companyId, config.botId);
      if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');
    }

    await emitPlatformEvent({
      companyId: config?.companyId || null,
      botId: config?.botId || null,
      eventType: `miniapp.${eventType}`,
      userId: tgUserId || visitorId || null,
      payload: {
        slug,
        visitorId,
        tgUserId,
        view: readString(body.view),
        carListingId: readString(body.carListingId),
        payload: body.payload && typeof body.payload === 'object' ? body.payload as Record<string, unknown> : undefined,
        tracking: body.tracking && typeof body.tracking === 'object' ? body.tracking as Record<string, unknown> : undefined
      }
    });

    res.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to track event';
    errorResponse(res, 500, message);
  }
});

router.get('/requests/status', async (req, res) => {
  try {
    const slug = readString(req.query.slug);
    if (!slug) return errorResponse(res, 400, 'slug is required');

    const requestId = readString(req.query.requestId) || readString(req.query.publicId);
    const phone = readString(req.query.phone);
    const telegramUserId = readString(req.query.telegramUserId) || readString(req.query.tgUserId);

    const request = await miniAppService.getRequestStatus(slug, {
      requestId: requestId || undefined,
      phone: phone || undefined,
      telegramUserId: telegramUserId || undefined
    });

    if (!request) return errorResponse(res, 404, 'Request not found');

    res.json({ ok: true, request });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to fetch request status';
    errorResponse(res, 500, message);
  }
});

export default router;
