import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { generatePublicId, mapLeadCreateInput, mapLeadOutput, mapRequestInput, mapRequestOutput, mapVariantInput, mapVariantOutput } from '../services/dto.js';
import { parseTelegramUser, verifyTelegramInitData } from '../services/telegramAuth.js';
import { mapBotOutput } from '../services/botDto.js';

const router = Router();

router.post('/leads', async (req, res) => {
  try {
    const mapped = mapLeadCreateInput(req.body || {});
    if (mapped.error) return res.status(400).json({ error: mapped.error });
    const lead = await prisma.lead.create({ data: mapped.data });
    res.json(mapLeadOutput(lead));
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

router.post('/requests', async (req, res) => {
  try {
    const { variants, ...raw } = req.body || {};
    const createData: any = mapRequestInput(raw);
    if (!createData.title) {
      return res.status(400).json({ error: 'Title is required' });
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
    console.error(e);
    res.status(500).json({ error: 'Failed to create request' });
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
    console.error(e);
    res.status(500).json({ error: 'Failed to add variant' });
  }
});

router.post('/dealer/session', async (req, res) => {
  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ error: 'initData is required' });

  const bots = await prisma.botConfig.findMany({
    where: { isEnabled: true },
    select: { token: true }
  });

  const verified = bots.some(bot => verifyTelegramInitData(initData, bot.token));
  if (!verified) return res.status(401).json({ error: 'Invalid Telegram init data' });

  const tgUser = parseTelegramUser(initData);
  if (!tgUser?.id) return res.status(400).json({ error: 'Invalid Telegram user payload' });

  const telegramUserId = String(tgUser.id);
  const user = await prisma.user.findFirst({ where: { telegramUserId } });
  if (!user || !user.isActive) return res.status(403).json({ error: 'Access denied' });

  if (!['DEALER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return res.status(403).json({ error: 'Partner access only' });
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

    const [total, requests] = await Promise.all([
      prisma.b2bRequest.count({
        where: { status: { in: ['NEW', 'IN_PROGRESS', 'OPEN'] } }
      }),
      prisma.b2bRequest.findMany({
        where: { status: { in: ['NEW', 'IN_PROGRESS', 'OPEN'] } },
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
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch public requests' });
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
      const proposalData = { ...(rawData as Record<string, any>), id: proposal.id };
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

    res.status(404).json({ error: 'Proposal not found' });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

router.post('/proposals/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    const record = await prisma.entityRecord.findFirst({
      where: { id, entity: { slug: 'b2b_proposal' } }
    });
    if (!record) return res.status(404).json({ error: 'Proposal not found' });

    const data = (record.data && typeof record.data === 'object') ? (record.data as any) : {};
    const views = Number(data.views || 0) + 1;
    const next = { ...data, views, status: data.status || 'VIEWED' };

    await prisma.entityRecord.update({
      where: { id: record.id },
      data: { data: next }
    });

    res.json({ ok: true, views });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update views' });
  }
});

router.post('/proposals/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params;
    const { variantId, type } = req.body || {};
    if (!variantId || !type) return res.status(400).json({ error: 'variantId and type are required' });

    const record = await prisma.entityRecord.findFirst({
      where: { id, entity: { slug: 'b2b_proposal' } }
    });
    if (!record) return res.status(404).json({ error: 'Proposal not found' });

    const data = (record.data && typeof record.data === 'object') ? (record.data as any) : {};
    const clientFeedback = { ...(data.clientFeedback || {}), [variantId]: type };
    const next = { ...data, clientFeedback };

    await prisma.entityRecord.update({
      where: { id: record.id },
      data: { data: next }
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

export default router;
