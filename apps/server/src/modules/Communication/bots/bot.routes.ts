
import { Router } from 'express';
// @ts-ignore
import { prisma } from '../../../services/prisma.js';
import { authenticateToken, requireRole } from '../../../middleware/auth.js';
import { mapBotOutput } from './botDto.js';

const router = Router();

// --- BOTS ---
router.use(authenticateToken);

router.get('/bots/active', requireRole(['ADMIN']), async (req, res) => {
    const bots = await prisma.botConfig.findMany({ where: { isEnabled: true } });
    res.json(bots.map(mapBotOutput));
});

// --- SCENARIOS ---
router.get('/scenarios', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    const isActive = req.query.isActive as string | undefined;
    const where: any = {};
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
    try {
        if (id) {
            const updated = await prisma.scenario.update({ where: { id }, data });
            res.json(updated);
        } else {
            const created = await prisma.scenario.create({ data });
            res.json(created);
        }
    } catch (e: any) {
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
