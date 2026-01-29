import { Router, Request, Response } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { RequestStatus } from '@prisma/client';
import { getUserByTelegramId, getWorkspaceBySlug } from '../services/v41/readService.js';
import { generatePublicId, mapLeadCreateInput, mapLeadOutput, mapRequestInput, mapRequestOutput, mapVariantInput, mapVariantOutput, mapInventoryOutput } from '../services/dto.js';
import { parseTelegramUser, verifyTelegramInitData } from '../modules/Communication/telegram/core/telegramAuth.js';
import { mapBotOutput } from '../modules/Communication/bots/botDto.js';
import { ShowcaseService } from '../modules/Marketing/showcase/showcase.service.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const router = Router();
const showcaseService = new ShowcaseService();

// Public Inventory
router.get('/:slug/inventory', async (req, res) => {
  try {
    const { slug } = req.params;

    // Attempt to use ShowcaseService first
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const search = req.query.search as string | undefined;
        const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
        const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
        const minYear = req.query.minYear ? Number(req.query.minYear) : undefined;
        const maxYear = req.query.maxYear ? Number(req.query.maxYear) : undefined;

        const { showcase, items, total } = await showcaseService.getInventoryForShowcase(slug, {
            page,
            limit,
            search,
            minPrice,
            maxPrice,
            minYear,
            maxYear
        });

        if (!showcase.isPublic) {
            return errorResponse(res, 404, 'Showcase not found');
        }

        return res.json({ items: items.map(mapInventoryOutput), total });
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

    // LEGACY FALLBACK
    const workspace = await getWorkspaceBySlug(slug);
    if (!workspace) return errorResponse(res, 404, 'Company not found');

    const limit = Math.min(100, Number(req.query.limit) || 50);
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const minYear = Number(req.query.minYear);
    const maxYear = Number(req.query.maxYear);
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);

    const where: any = {
      companyId: workspace.id,
      status: 'AVAILABLE'
    };

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

    const publicCars = cars.map((c: any) => ({
      id: c.id,
      canonicalId: c.id,
      title: c.title,
      price: { amount: c.price, currency: c.currency },
      year: c.year,
      mileage: c.mileage,
      thumbnail: c.thumbnail,
      mediaUrls: c.mediaUrls,
      specs: c.specs,
      source: c.source
    }));

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
    const workspace = await getWorkspaceBySlug(slug);
    if (!workspace) return errorResponse(res, 404, 'Company not found');

    // Validate initData if present
    const { initData, ...payload } = req.body || {};
    if (initData) {
       // Optional: Enforce validation if strictly required.
       // For now we allow open requests but log.
       // logic to find bot token and verify would go here.
    }

    const { variants, ...raw } = payload;
    const createData: any = mapRequestInput(raw);

    if (!createData.title) return errorResponse(res, 400, 'Title is required');
    if (!createData.publicId) createData.publicId = generatePublicId();

    // Force company context
    createData.companyId = workspace.id;

    const request = await prisma.b2bRequest.create({
      data: createData
    });

    res.json(mapRequestOutput(request));
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, 'Failed to create request');
  }
});

router.post('/leads', async (req, res) => {
  try {
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
    const { variants, ...raw } = req.body || {};
    const createData: any = mapRequestInput(raw);
    if (!createData.title) {
      return errorResponse(res, 400, 'Title is required');
    }
    if (!createData.publicId) createData.publicId = generatePublicId();
    if (variants && Array.isArray(variants)) {
      createData.variants = { create: variants.map((v: any) => mapVariantInput(v)) };
    }
    const request = await prisma.b2bRequest.create({
      data: createData,
      include: { variants: true }
    });
    res.json(mapRequestOutput(request));
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, 'Failed to create request');
  }
});

router.post('/requests/:id/variants', async (req, res) => {
  const { id } = req.params;
  const variantData = mapVariantInput(req.body || {});
  try {
    const variant = await prisma.requestVariant.create({
      data: {
        ...variantData,
        requestId: id
      }
    });
    res.json(mapVariantOutput(variant));
  } catch (e: any) {
    logger.error(e);
    errorResponse(res, 500, 'Failed to add variant');
  }
});

router.post('/dealer/session', async (req, res) => {
  const { initData } = req.body || {};
  if (!initData) return errorResponse(res, 400, 'initData is required');

  const bots = await prisma.botConfig.findMany({
    where: { isEnabled: true },
    select: { token: true }
  });

  const verified = bots.some(bot => verifyTelegramInitData(initData, bot.token));
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
    const skip = (page - 1) * limit;

    const publicStatuses = [RequestStatus.PUBLISHED, RequestStatus.COLLECTING_VARIANTS];
    const where = { status: { in: publicStatuses } };

    const [total, requests] = await Promise.all([
      prisma.b2bRequest.count({ where }),
      prisma.b2bRequest.findMany({
        where,
        include: { variants: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
      })
    ]);

    res.json({
      items: requests.map(mapRequestOutput),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
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
            .map(mapVariantOutput);
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
