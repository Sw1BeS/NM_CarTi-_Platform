
import { Router } from 'express';
import { SettingsService } from './settings.service.js';
import { authenticateToken, requireRole } from '../../../middleware/auth.js';
import { errorResponse } from '../../../utils/errorResponse.js';

const router = Router();

// Public branding config (no auth required)
router.get('/settings/public', async (req, res) => {
    try {
        const settings = await SettingsService.getSettings(true);
        res.json(settings || {});
    } catch (e) {
        errorResponse(res, 500, 'Failed to load public settings');
    }
});

// All routes below require auth
router.use(authenticateToken);

// Admin full config
router.get('/settings', requireRole(['ADMIN']), async (req, res) => {
    try {
        const settings = await SettingsService.getSettings(false);
        res.json(settings || {});
    } catch (e) {
        errorResponse(res, 500, 'Failed to load settings');
    }
});

router.put('/settings', requireRole(['ADMIN']), async (req, res) => {
    try {
        const updated = await SettingsService.updateSettings(req.body);
        res.json(updated);
    } catch (e) {
        errorResponse(res, 500, 'Failed to update settings');
    }
});

export default router;
