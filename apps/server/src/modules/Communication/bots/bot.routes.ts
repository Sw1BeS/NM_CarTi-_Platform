
import { Router } from 'express';
import { prisma } from '../../../services/prisma.js';
import { authenticateToken, requireRole } from '../../../middleware/auth.js';
import { mapBotOutput, mapBotInput } from './botDto.js';
import { botManager } from './bot.service.js';
import { BotRepository } from '../../../repositories/index.js';

const router = Router();
const botRepo = new BotRepository(prisma);

// --- BOTS ---
router.use(authenticateToken);

router.get('/bots/active', async (req, res) => {
    const bots = await botRepo.findAllActive();
    res.json(bots.map(mapBotOutput));
});

router.get('/bots', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    const bots = await botRepo.findAll({});
    res.json(bots.map(mapBotOutput));
});

router.post('/bots', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { data } = mapBotInput(req.body);
        const bot = await botRepo.create(data);
        if (bot.isEnabled) await botManager.restartBot(bot.id);
        res.json(mapBotOutput(bot));
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.put('/bots/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const existing = await botRepo.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Bot not found' });

        const { data } = mapBotInput(req.body, existing.config);
        const bot = await botRepo.update(req.params.id, data);

        await botManager.restartBot(bot.id);

        res.json(mapBotOutput(bot));
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/bots/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        await botRepo.delete(req.params.id);
        await botManager.restartBot(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- SCENARIOS ---
router.get('/scenarios', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    const isActive = req.query.isActive as string | undefined;
    const companyId = (req as any).user?.companyId;

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (isActive === 'true') where.isActive = true;
    if (isActive === 'false') where.isActive = false;

    const scenarios = await prisma.scenario.findMany({
        where,
        orderBy: { createdAt: 'desc' }
    });
    res.json(scenarios);
});

router.post('/scenarios', requireRole(['ADMIN']), async (req, res) => {
    const { id, ...data } = req.body;
    const companyId = (req as any).user?.companyId;

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
    }

    try {
        if (id) {
            const updated = await prisma.scenario.update({
                where: { id },
                data: { ...data, companyId }
            });
            res.json(updated);
        } else {
            const created = await prisma.scenario.create({
                data: { ...data, companyId }
            });
            res.json(created);
        }
    } catch (e: any) {
        console.error('[Scenario Save Error]:', e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/scenarios/:id', requireRole(['ADMIN']), async (req, res) => {
    await prisma.scenario.delete({ where: { id: req.params.id } });
    res.json({ success: true });
});

// --- CAMPAIGNS ---
router.get('/campaigns', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    const campaigns = await prisma.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50
    });
    res.json(campaigns);
});

router.post('/campaigns', requireRole(['ADMIN']), async (req, res) => {
    const { id, ...data } = req.body;
    // Basic validation
    if (!data.botId || !data.content) return res.status(400).json({ error: 'Missing requirements' });

    try {
        const campaign = await prisma.campaign.create({ data });
        res.json(campaign);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
