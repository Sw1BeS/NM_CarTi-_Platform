/**
 * Superadmin Routes - System administration
 * Only accessible by SUPER_ADMIN role
 */

import { Router } from 'express';
import { SuperadminService } from './superadmin.service.js';
import { ClientManagerService } from './client-manager.service.js';
import { companyMiddleware, requireRole } from '../../../middleware/company.middleware.js';
import jwt from 'jsonwebtoken';

const router = Router();
const superadminService = new SuperadminService();
const clientManagerService = new ClientManagerService();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_123';

// All routes require SUPER_ADMIN role
router.use(companyMiddleware);
router.use(requireRole('SUPER_ADMIN'));

/**
 * GET /api/superadmin/companies
 * Get all companies with stats
 */
router.get('/companies', async (req: any, res) => {
    try {
        const companies = await superadminService.getAllCompanies();
        res.json(companies);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/superadmin/companies
 * Create new company with owner
 */
router.post('/companies', async (req: any, res) => {
    try {
        const { name, slug, plan, ownerEmail, ownerName } = req.body;

        if (!name || !slug || !ownerEmail) {
            return res.status(400).json({ error: 'name, slug, and ownerEmail are required' });
        }

        const result = await clientManagerService.createCompany({
            name,
            slug,
            plan,
            ownerEmail,
            ownerName
        });

        res.status(201).json(result);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * DELETE /api/superadmin/companies/:id
 * Delete company and all data
 */
router.delete('/companies/:id', async (req: any, res) => {
    try {
        await clientManagerService.deleteCompany(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * PUT /api/superadmin/companies/:id/plan
 * Update company plan
 */
router.put('/companies/:id/plan', async (req: any, res) => {
    try {
        const { plan } = req.body;

        if (!plan) {
            return res.status(400).json({ error: 'plan is required' });
        }

        const company = await superadminService.updateCompanyPlan(req.params.id, plan);
        res.json(company);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * PUT /api/superadmin/companies/:id/status
 * Toggle company active status
 */
router.put('/companies/:id/status', async (req: any, res) => {
    try {
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ error: 'isActive must be boolean' });
        }

        const company = await superadminService.toggleCompanyStatus(req.params.id, isActive);
        res.json(company);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/superadmin/users
 * Get all users across companies
 */
router.get('/users', async (req: any, res) => {
    try {
        const { companyId, role, isActive } = req.query;

        const users = await superadminService.getAllUsers({
            companyId: companyId as string,
            role: role as string,
            isActive: isActive === 'true'
        });

        res.json(users);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/superadmin/users
 * Create user in any company
 */
router.post('/users', async (req: any, res) => {
    try {
        const { email, password, role, companyId, name, isActive } = req.body;
        if (!email || !password || !role || !companyId) {
            return res.status(400).json({ error: 'email, password, role, companyId are required' });
        }
        const user = await superadminService.createUser({ email, password, role, companyId, name, isActive });
        res.status(201).json(user);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * PUT /api/superadmin/users/:id
 * Update user (role/status/password/company)
 */
router.put('/users/:id', async (req: any, res) => {
    try {
        const { id } = req.params;
        const user = await superadminService.updateUser(id, req.body || {});
        res.json(user);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * POST /api/superadmin/impersonate
 * Issue a JWT to log in as a target user (SSO)
 */
router.post('/impersonate', async (req: any, res) => {
    try {
        const { userId, email, companyId, role, expiresIn } = req.body || {};
        if (!userId && !email) {
            return res.status(400).json({ error: 'userId or email is required' });
        }

        const user = await superadminService.findUser({
            id: userId,
            email,
            companyId
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const token = jwt.sign({
            userId: user.id,
            email: user.email,
            role: user.role,
            companyId: companyId || user.companyId
        }, JWT_SECRET, { expiresIn: expiresIn || '2h' });

        res.json({ token, user });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/superadmin/stats
 * Get system-wide statistics
 */
router.get('/stats', async (req: any, res) => {
    try {
        const stats = await superadminService.getSystemStats();
        res.json(stats);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/superadmin/templates
 * Create marketplace template
 */
router.post('/templates', async (req: any, res) => {
    try {
        const { name, category, description, thumbnail, structure, isPremium } = req.body;

        if (!name || !category || !description || !structure) {
            return res.status(400).json({ error: 'name, category, description, and structure are required' });
        }

        const template = await superadminService.createMarketplaceTemplate({
            name,
            category,
            description,
            thumbnail,
            structure,
            isPremium
        });

        res.status(201).json(template);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/superadmin/logs
 * Get system logs
 */
router.get('/logs', async (req: any, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const logs = await superadminService.getSystemLogs(limit);
        res.json(logs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
