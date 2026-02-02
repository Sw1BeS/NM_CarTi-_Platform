import express from 'express';
import { telegramDestinationService } from './destination.service.js';
import { requireAuth } from '../../../../middleware/auth.js';
import { logger } from '../../../../utils/logger.js';

const router = express.Router();

// List
router.get('/', requireAuth, async (req: any, res) => {
    try {
        const companyId = req.user.companyId;
        const { role, status } = req.query;
        const list = await telegramDestinationService.listDestinations(companyId, {
            role: role as string,
            status: status as string
        });
        res.json(list);
    } catch (e) {
        logger.error('Failed to list destinations', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Pause
router.patch('/:id/pause', requireAuth, async (req: any, res) => {
    try {
        const companyId = req.user.companyId;
        const updated = await telegramDestinationService.pauseDestination(req.params.id, companyId);
        res.json(updated);
    } catch (e) {
        res.status(400).json({ error: (e as Error).message });
    }
});

// Resume
router.patch('/:id/resume', requireAuth, async (req: any, res) => {
    try {
        const companyId = req.user.companyId;
        const updated = await telegramDestinationService.resumeDestination(req.params.id, companyId);
        res.json(updated);
    } catch (e) {
        res.status(400).json({ error: (e as Error).message });
    }
});

// Sync
router.post('/:id/sync', requireAuth, async (req: any, res) => {
    try {
        const companyId = req.user.companyId;
        const result = await telegramDestinationService.syncSource(req.params.id, companyId);
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: (e as Error).message });
    }
});

export const destinationRoutes = router;
