/**
 * Company Routes - Multi-tenant workspace API
 */

import { Router } from 'express';
import { CompanyService } from './company.service.js';
import { companyMiddleware, requireRole } from '../../middleware/company.middleware.js';

const router = Router();
const companyService = new CompanyService();

// All routes require authentication
router.use(companyMiddleware);

/**
 * GET /api/companies/current
 * Get current company details
 */
router.get('/current', async (req: any, res) => {
    try {
        const company = await companyService.getById(req.companyId);

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        res.json(company);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * PUT /api/companies/current/branding
 * Update company branding (ADMIN+ only)
 */
router.put('/current/branding', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { name, logo, primaryColor, domain } = req.body;

        const company = await companyService.updateBranding(req.companyId, {
            name,
            logo,
            primaryColor,
            domain
        });

        res.json(company);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/companies/current/users
 * Get company users
 */
router.get('/current/users', requireRole('OWNER', 'ADMIN', 'MANAGER'), async (req: any, res) => {
    try {
        const users = await companyService.getUsers(req.companyId);
        res.json(users);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/companies/current/users
 * Invite user to company (ADMIN+ only)
 */
router.post('/current/users', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { email, name, role } = req.body;

        if (!email || !role) {
            return res.status(400).json({ error: 'Email and role are required' });
        }

        const user = await companyService.inviteUser(req.companyId, { email, name, role });

        res.status(201).json(user);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * PUT /api/companies/current/users/:userId/role
 * Update user role (OWNER+ only)
 */
router.put('/current/users/:userId/role', requireRole('OWNER'), async (req: any, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        if (!role) {
            return res.status(400).json({ error: 'Role is required' });
        }

        const user = await companyService.updateUserRole(req.companyId, userId, role);
        res.json(user);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * DELETE /api/companies/current/users/:userId
 * Remove user from company (OWNER+ only)
 */
router.delete('/current/users/:userId', requireRole('OWNER'), async (req: any, res) => {
    try {
        const { userId } = req.params;

        await companyService.removeUser(req.companyId, userId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/companies/current/stats
 * Get company statistics
 */
router.get('/current/stats', async (req: any, res) => {
    try {
        const stats = await companyService.getStats(req.companyId);
        res.json(stats);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
