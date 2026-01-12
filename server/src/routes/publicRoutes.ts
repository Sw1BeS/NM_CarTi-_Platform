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

export default router;
