import { Router } from 'express';
import { miniAppService } from '../services/miniapp.service.js';
import { errorResponse } from '../utils/errorResponse.js';

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
    const tgUserId = readString(body.tgUserId) || readString(body.telegramUserId) || readString(body.userId);
    const visitorId = readString(body.visitorId);

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

    if (!slug) return errorResponse(res, 400, 'slug is required');

    const request = await miniAppService.createRequest({
      slug,
      title: readString(body.title),
      description: readString(body.description),
      budgetMax: body.budgetMax as unknown,
      yearMin: body.yearMin as unknown,
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
