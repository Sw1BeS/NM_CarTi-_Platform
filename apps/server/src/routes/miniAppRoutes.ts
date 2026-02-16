import { Router } from 'express';
import { miniAppService } from '../services/miniapp.service.js';
import { errorResponse } from '../utils/errorResponse.js';
import { verifyTelegramInitData } from '../modules/Communication/telegram/core/telegramAuth.js';
import { resolvePublicSlug } from '../services/publicSlug.service.js';
import { prisma } from '../services/prisma.js';
import { logger } from '../utils/logger.js';

const router = Router();

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

  if (botId) {
    const bot = await prisma.botConfig.findFirst({
      where: { id: botId, isEnabled: true },
      select: { token: true }
    });
    if (bot) {
      if (verifyTelegramInitData(init, bot.token)) return { ok: true };
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
  const verified = bots.some(bot => verifyTelegramInitData(init, bot.token));
  if (!verified) return { ok: false, message: 'Invalid Telegram init data' };
  return { ok: true };
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

    const initCheck = await requireInitData(initData, companyId, botId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    if (!tgUserId && !visitorId) return errorResponse(res, 400, 'tgUserId or visitorId is required');

    const result = await miniAppService.toggleFavorite(carListingId, { tgUserId, visitorId }, slug);
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
      hasCarListingId: Boolean(readString(body.carListingId))
    });

    const request = await miniAppService.createRequest({
      slug,
      title: readString(body.title),
      description: readString(body.description),
      budgetMax: readNumber(body.budgetMax),
      yearMin: readNumber(body.yearMin),
      phone: readString(body.phone),
      comment: readString(body.comment),
      carListingId: readString(body.carListingId),
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
