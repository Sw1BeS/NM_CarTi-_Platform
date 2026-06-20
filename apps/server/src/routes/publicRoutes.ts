import { Router, Request, Response } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { getUserByTelegramId } from '../services/v41/readService.js';
import {
  mapLeadCreateInput,
  mapLeadOutput,
  mapVariantInput,
  mapVariantOutput,
  mapPublicInventoryOutput
} from '../services/dto.js';
import { parseTelegramUser, verifyTelegramInitData } from '../modules/Communication/telegram/core/telegramAuth.js';
import { mapBotOutput } from '../modules/Communication/bots/botDto.js';
import { ShowcaseService } from '../modules/Marketing/showcase/showcase.service.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';
import { resolvePublicSlug } from '../services/publicSlug.service.js';
import { getEnvInt } from '../services/featureFlags.js';
import { requestContractService } from '../services/requestContract.service.js';

const router = Router();
const showcaseService = new ShowcaseService();

const requireInitData = async (initData: string | undefined, companyId?: string | null) => {
  if (!initData) return { ok: false, message: 'initData is required' };
  const init = initData;
  const maxAgeSeconds = Math.max(60, getEnvInt('TELEGRAM_INITDATA_MAX_AGE_SECONDS', 43200));
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

// Public Inventory
router.get('/:slug/inventory', async (req, res) => {
  try {
    const { slug } = req.params;
    const resolved = await resolvePublicSlug(slug, { allowWorkspaceFallback: true });

    // Attempt to use ShowcaseService first
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const search = req.query.search as string | undefined;
        const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
        const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
        const minYear = req.query.minYear ? Number(req.query.minYear) : undefined;
        const maxYear = req.query.maxYear ? Number(req.query.maxYear) : undefined;
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const availabilityState = typeof req.query.availabilityState === 'string' ? req.query.availabilityState : undefined;

        const { showcase, items, total } = await showcaseService.getInventoryForShowcase(resolved.slug || slug, {
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

        if (!showcase.isPublic) {
            return errorResponse(res, 404, 'Showcase not found');
        }

        return res.json({ items: items.map(mapPublicInventoryOutput), total });
    } catch (e: any) {
        // Fallback: Check if it's a legacy workspace slug?
        // Requirement: "One source of truth".
        // But we should be gentle with backward compat if possible, OR strictly fail.
        // The plan says: "use ShowcaseService... if slug matches a showcase, use it. If not, fallback or error".
        // Let's keep the legacy logic as fallback ONLY if showcase not found AND workspace found.
        if (e.message !== 'Showcase not found') {
             logger.error('[Public Inventory] Error:', e);
             return errorResponse(res, 500, 'Internal Server Error');
        }
    }

    if (resolved.source !== 'workspace_compat' || !resolved.companyId) {
      return errorResponse(res, 404, 'Showcase not found');
    }

    // Explicit compatibility-only fallback for legacy workspace-based public URLs.
    res.set('x-cartie-compatibility', 'legacy_workspace_public_inventory');

    const limit = Math.min(100, Number(req.query.limit) || 50);
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const minYear = Number(req.query.minYear);
    const maxYear = Number(req.query.maxYear);
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    const requestedStatus = String(req.query.status || '').trim().toUpperCase();
    const publicStatus = ['AVAILABLE', 'PENDING', 'RESERVED', 'SOLD'].includes(requestedStatus) ? requestedStatus : 'AVAILABLE';

    const where: any = {
      companyId: resolved.companyId,
      status: publicStatus,
      publicationStatus: 'PUBLISHED'
    };
    const requestedAvailabilityState = String(req.query.availabilityState || '').trim().toUpperCase();
    if (['IN_STOCK', 'IN_TRANSIT', 'IMPORT_TO_ORDER', 'RESERVED', 'SOLD', 'UNKNOWN'].includes(requestedAvailabilityState)) {
      where.availabilityState = requestedAvailabilityState;
    }

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }
    if (!isNaN(minYear)) {
      where.year = { ...(where.year || {}), gte: minYear };
    }
    if (!isNaN(maxYear)) {
      where.year = { ...(where.year || {}), lte: maxYear };
    }
    if (!isNaN(minPrice)) {
      where.price = { ...(where.price || {}), gte: minPrice };
    }
    if (!isNaN(maxPrice)) {
      where.price = { ...(where.price || {}), lte: maxPrice };
    }

    const cars = await prisma.carListing.findMany({
      where,
      take: limit,
      orderBy: { postedAt: 'desc' }
    });

    const publicCars = cars.map(mapPublicInventoryOutput);

    res.json({ items: publicCars });
  } catch (e) {
    logger.error(e);
    errorResponse(res, 500, 'Failed to fetch inventory');
  }
});

// Public Request Creation
router.post('/:slug/requests', async (req, res) => {
  try {
    const { slug } = req.params;
    const resolved = await resolvePublicSlug(slug, { allowWorkspaceFallback: true });
    if (!resolved.companyId) return errorResponse(res, 404, 'Company not found');
    if (resolved.source === 'workspace_compat') {
      res.set('x-cartie-compatibility', 'legacy_workspace_public_request_create');
    }

    const { initData, ...payload } = req.body || {};
    const initCheck = await requireInitData(initData, resolved.companyId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');
    const request = await requestContractService.createPublicSlugRequest(slug, payload as Record<string, unknown>);
    res.json(request);
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, e?.message || 'Failed to create request');
  }
});

// Public Request Status
router.get('/:slug/request-status', async (req, res) => {
  try {
    const resolved = await resolvePublicSlug(req.params.slug, { allowWorkspaceFallback: true });
    if (resolved.source === 'workspace_compat') {
      res.set('x-cartie-compatibility', 'legacy_workspace_public_request_status');
    }
    const request = await requestContractService.getRequestStatusBySlug(req.params.slug, {
      requestId: typeof req.query.requestId === 'string' ? req.query.requestId : (typeof req.query.publicId === 'string' ? req.query.publicId : undefined),
      phone: typeof req.query.phone === 'string' ? req.query.phone : undefined,
      telegramUserId: typeof req.query.telegramUserId === 'string' ? req.query.telegramUserId : undefined
    });

    if (!request) return errorResponse(res, 404, 'Request not found');
    res.json({ ok: true, request });
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, e?.message || 'Failed to fetch request status');
  }
});

router.post('/leads', async (req, res) => {
  try {
    const { initData } = req.body || {};
    const initCheck = await requireInitData(initData);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const mapped = mapLeadCreateInput(req.body || {});
    if (mapped.error) return errorResponse(res, 400, mapped.error);
    const requestedBotId = (req.body || {}).botId ? String((req.body || {}).botId) : undefined;
    let companyId: string | null = null;
    let botId: string | undefined = undefined;

    if (requestedBotId) {
      const bot = await prisma.botConfig.findUnique({ where: { id: requestedBotId }, select: { id: true, companyId: true } });
      if (!bot) return errorResponse(res, 400, 'Invalid botId');
      botId = bot.id;
      companyId = bot.companyId;
    } else {
      const system = await prisma.workspace.findUnique({ where: { slug: 'system' }, select: { id: true } });
      companyId = system?.id || (await prisma.workspace.findFirst({ select: { id: true } }))?.id || null;
    }

    if (!companyId) return errorResponse(res, 500, 'Workspace not configured');

    const lead = await prisma.lead.create({
      data: {
        ...mapped.data,
        companyId,
        ...(botId ? { botId } : {})
      }
    });
    res.json(mapLeadOutput(lead));
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, 'Failed to create lead');
  }
});

router.post('/requests', async (req, res) => {
  try {
    const { initData } = req.body || {};
    const initCheck = await requireInitData(initData);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');
    res.set('x-cartie-compatibility', 'legacy_public_requests_create');
    const request = await requestContractService.createLegacyPublicRequest((req.body || {}) as Record<string, unknown>);
    res.json(request);
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, e?.message || 'Failed to create request');
  }
});

router.post('/requests/:id/variants', async (req, res) => {
  const { id } = req.params;
  const variantData = mapVariantInput(req.body || {});
  try {
    const { initData } = req.body || {};
    const request = await prisma.b2bRequest.findUnique({ where: { id }, select: { companyId: true } });
    const initCheck = await requireInitData(initData, request?.companyId);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const variant = await prisma.requestVariant.create({
      data: {
        ...variantData,
        requestId: id
      }
    });
    res.set('x-cartie-compatibility', 'legacy_public_variants_create');
    res.json(mapVariantOutput(variant));
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, 'Failed to add variant');
  }
});

router.post('/dealer/session', async (req, res) => {
  const { initData } = req.body || {};
  if (!initData) return errorResponse(res, 400, 'initData is required');
  const maxAgeSeconds = Math.max(60, getEnvInt('TELEGRAM_INITDATA_MAX_AGE_SECONDS', 43200));

  const bots = await prisma.botConfig.findMany({
    where: { isEnabled: true },
    select: { token: true }
  });

  const verified = bots.some(bot => verifyTelegramInitData(initData, bot.token, maxAgeSeconds));
  if (!verified) return errorResponse(res, 401, 'Invalid Telegram init data');

  const tgUser = parseTelegramUser(initData);
  if (!tgUser?.id) return errorResponse(res, 400, 'Invalid Telegram user payload');

  const telegramUserId = Number(tgUser.id);
  // Use read abstraction
  const user = await getUserByTelegramId(telegramUserId);
  if (!user || !user.isActive) return errorResponse(res, 403, 'Access denied');

  if (!['DEALER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return errorResponse(res, 403, 'Partner access only');
  }

  res.json({
    user: {
      id: user.id,
      name: user.name || user.username || user.email,
      role: user.role,
      email: user.email,
      companyId: user.companyId,
      telegramUserId: user.telegramUserId,
      username: user.username
    }
  });
});

router.get('/bots', async (_req, res) => {
  const bots = await prisma.botConfig.findMany({ where: { isEnabled: true } });
  const sanitized = bots.map(bot => {
    const dto = mapBotOutput(bot);
    delete (dto as any).token;
    return dto;
  });
  res.json(sanitized);
});

// --- PUBLIC MARKETPLACE & DEALER API ---

router.get('/requests', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const result = await requestContractService.listPublicRequests({ page, limit });
    res.json(result);
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, 'Failed to fetch public requests');
  }
});

router.get('/proposals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Assuming 'RequestVariant' is used as a Proposal or there is a Proposal entity.
    // Based on user request "proposals/:id", if Proposal is a generic entity or a variant.
    // Checking serverAdapter, 'proposals' maps to generic entity 'b2b_proposal'.
    // Let's support the Generic Entity 'b2b_proposal' mapping here.

    // First check if it's a generic entity proposal
    const proposal = await prisma.entityRecord.findFirst({
      where: {
        id,
        entity: { slug: 'b2b_proposal' }
      }
    });

    if (proposal) {
      const rawData = (proposal.data && typeof proposal.data === 'object' && !Array.isArray(proposal.data))
        ? proposal.data
        : {};
      const proposalData: Record<string, any> = { ...(rawData as Record<string, any>), id: proposal.id };
      let variants: any[] = [];
      if (proposalData.requestId) {
        const request = await prisma.b2bRequest.findUnique({
          where: { id: proposalData.requestId },
          include: { variants: true }
        });
        if (request) {
          const allowed = Array.isArray(proposalData.variantIds) ? proposalData.variantIds : [];
          variants = (request.variants || [])
            .filter(v => allowed.length === 0 || allowed.includes(v.id))
            .map(variantItem => mapVariantOutput(variantItem));
        }
      }
      return res.json({ ok: true, proposal: proposalData, variants });
    }

    // Fallback: Check if it refers to a RequestVariant (often used interchangeably in simple setups)
    const variant = await prisma.requestVariant.findUnique({
      where: { id },
      include: { request: true }
    });

    if (variant) {
      return res.json({ ok: true, proposal: null, variants: [mapVariantOutput(variant)] });
    }

    errorResponse(res, 404, 'Proposal not found');
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, 'Failed to fetch proposal');
  }
});

router.post('/proposals/:id/view', async (req, res) => {
  try {
    const { initData } = req.body || {};
    const initCheck = await requireInitData(initData);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const { id } = req.params;
    const record = await prisma.entityRecord.findFirst({
      where: { id, entity: { slug: 'b2b_proposal' } }
    });
    if (!record) return errorResponse(res, 404, 'Proposal not found');

    const data = (record.data && typeof record.data === 'object') ? (record.data as any) : {};
    const views = Number(data.views || 0) + 1;
    const next = { ...data, views, status: data.status || 'VIEWED' };

    await prisma.entityRecord.update({
      where: { id: record.id },
      data: { data: next }
    });

    res.json({ ok: true, views });
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, 'Failed to update views');
  }
});

router.post('/proposals/:id/feedback', async (req, res) => {
  try {
    const { initData } = req.body || {};
    const initCheck = await requireInitData(initData);
    if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');

    const { id } = req.params;
    const { variantId, type } = req.body || {};
    if (!variantId || !type) return errorResponse(res, 400, 'variantId and type are required');

    const record = await prisma.entityRecord.findFirst({
      where: { id, entity: { slug: 'b2b_proposal' } }
    });
    if (!record) return errorResponse(res, 404, 'Proposal not found');

    const data = (record.data && typeof record.data === 'object') ? (record.data as any) : {};
    const clientFeedback = { ...(data.clientFeedback || {}), [variantId]: type };
    const next = { ...data, clientFeedback };

    await prisma.entityRecord.update({
      where: { id: record.id },
      data: { data: next }
    });

    res.json({ ok: true });
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, 'Failed to save feedback');
  }
});

export default router;
