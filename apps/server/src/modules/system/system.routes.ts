
import { Router } from 'express';
import { SettingsService } from './settings.service.js';
import { requireRole } from '../../middleware/auth.js';

const router = Router();

// Public branding config (no auth required)
router.get('/settings/public', async (req, res) => {
    try {
        const settings = await SettingsService.getSettings(true);
        res.json(settings || {});
    } catch (e) {
        res.status(500).json({ error: 'Failed to load public settings' });
    }
});

// Admin full config
router.get('/settings', requireRole(['ADMIN']), async (req, res) => {
    try {
        const settings = await SettingsService.getSettings(false);
        res.json(settings || {});
    } catch (e) {
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

router.put('/settings', requireRole(['ADMIN']), async (req, res) => {
    try {
        const updated = await SettingsService.updateSettings(req.body);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
