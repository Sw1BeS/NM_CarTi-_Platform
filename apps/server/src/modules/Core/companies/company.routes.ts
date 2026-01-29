/**
 * Company Routes - Multi-tenant workspace API
 */

import { Router } from 'express';
import { CompanyService } from './company.service.js';
import { authenticateToken, requireRole } from '../../../middleware/auth.js';
import { companyContext } from '../../../middleware/companyContext.js';
import { errorResponse } from '../../../utils/errorResponse.js';

const router = Router();
const companyService = new CompanyService();

// All routes require authentication
router.use(authenticateToken);
router.use(companyContext);

/**
 * GET /api/companies/current
 * Get current company details
 */
router.get('/current', async (req: any, res) => {
    try {
        const company = await companyService.getById(req.companyId);

        if (!company) {
            return errorResponse(res, 404, 'Company not found');
        }

        res.json(company);
    } catch (e: any) {
        errorResponse(res, 500, e.message);
    }
});

/**
 * PUT /api/companies/current/branding
 * Update company branding (ADMIN+ only)
 */
router.put('/current/branding', requireRole(['OWNER', 'ADMIN']), async (req: any, res) => {
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
        errorResponse(res, 400, e.message);
    }
});

/**
 * GET /api/companies/current/users
 * Get company users
 */
router.get('/current/users', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req: any, res) => {
    try {
        const users = await companyService.getUsers(req.companyId);
        res.json(users);
    } catch (e: any) {
        errorResponse(res, 500, e.message);
    }
});

/**
 * POST /api/companies/current/users
 * Invite user to company (ADMIN+ only)
 */
router.post('/current/users', requireRole(['OWNER', 'ADMIN']), async (req: any, res) => {
    try {
        const { email, name, role } = req.body;

        if (!email || !role) {
            return errorResponse(res, 400, 'Email and role are required');
        }

        const user = await companyService.inviteUser(req.companyId, { email, name, role });

        res.status(201).json(user);
    } catch (e: any) {
        errorResponse(res, 400, e.message);
    }
});

/**
 * PUT /api/companies/current/users/:userId/role
 * Update user role (OWNER+ only)
 */
router.put('/current/users/:userId/role', requireRole(['OWNER']), async (req: any, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        if (!role) {
            return errorResponse(res, 400, 'Role is required');
        }

        const user = await companyService.updateUserRole(req.companyId, userId, role);
        res.json(user);
    } catch (e: any) {
        errorResponse(res, 400, e.message);
    }
});

/**
 * DELETE /api/companies/current/users/:userId
 * Remove user from company (OWNER+ only)
 */
router.delete('/current/users/:userId', requireRole(['OWNER']), async (req: any, res) => {
    try {
        const { userId } = req.params;

        await companyService.removeUser(req.companyId, userId);
        res.json({ success: true });
    } catch (e: any) {
        errorResponse(res, 400, e.message);
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
        errorResponse(res, 500, e.message);
    }
});

export default router;
