import { Router } from 'express';
import { miniAppService } from '../services/miniapp.service.js';
import { errorResponse } from '../utils/errorResponse.js';
import { verifyTelegramInitData } from '../modules/Communication/telegram/core/telegramAuth.js';
import { ShowcaseService } from '../modules/Marketing/showcase/showcase.service.js';
import { getWorkspaceBySlug } from '../services/v41/readService.js';
import { prisma } from '../services/prisma.js';

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
  try {
    const showcase = await showcaseService.getShowcaseBySlug(trimmed);
    if (showcase?.workspaceId) return showcase.workspaceId;
  } catch {
    // ignore
  }
  const workspace = await getWorkspaceBySlug(trimmed);
  return workspace?.id || null;
};

const requireInitData = async (initData: string | undefined, companyId?: string | null) => {
  if (!initData) return { ok: false, message: 'initData is required' };
  const init = initData;
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
    const companyId = listing?.companyId || (await resolveCompanyIdBySlug(slug)) || null;
    const initCheck = await requireInitData(initData, companyId);
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

    if (!slug) return errorResponse(res, 400, 'slug is required');
    const companyId = await resolveCompanyIdBySlug(slug);
    const initCheck = await requireInitData(initData, companyId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

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
