/**
 * Superadmin Routes - System administration
 * Only accessible by SUPER_ADMIN role
 */

import { Router } from 'express';
import { SuperadminService } from './superadmin.service.js';
import { ClientManagerService } from './client-manager.service.js';
import { companyContext } from '../../../middleware/companyContext.js';
import { authenticateToken, requireRole } from '../../../middleware/auth.js';
import { signJwt } from '../../../config/jwt.js';
import { getWorkspaceById, getWorkspaceBySlug } from '../../../services/v41/readService.js';
import { errorResponse } from '../../../utils/errorResponse.js';

const router = Router();
const superadminService = new SuperadminService();
const clientManagerService = new ClientManagerService();

// All routes require SUPER_ADMIN role
router.use(authenticateToken);
router.use(companyContext);
router.use(requireRole(['SUPER_ADMIN']));

/**
 * GET /api/superadmin/companies
 * Get all companies with stats
 */
router.get('/companies', async (req: any, res) => {
    try {
        const companies = await superadminService.getAllCompanies();
        res.json(companies);
    } catch (e: any) {
        errorResponse(res, 500, e.message);
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
            return errorResponse(res, 400, 'name, slug, and ownerEmail are required');
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
        errorResponse(res, 400, e.message);
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
        errorResponse(res, 400, e.message);
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
            return errorResponse(res, 400, 'plan is required');
        }

        const company = await superadminService.updateCompanyPlan(req.params.id, plan);
        res.json(company);
    } catch (e: any) {
        errorResponse(res, 400, e.message);
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
            return errorResponse(res, 400, 'isActive must be boolean');
        }

        const company = await superadminService.toggleCompanyStatus(req.params.id, isActive);
        res.json(company);
    } catch (e: any) {
        errorResponse(res, 400, e.message);
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
        errorResponse(res, 500, e.message);
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
            return errorResponse(res, 400, 'email, password, role, companyId are required');
        }
        const user = await superadminService.createUser({ email, password, role, companyId, name, isActive });
        res.status(201).json(user);
    } catch (e: any) {
        errorResponse(res, 400, e.message);
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
        errorResponse(res, 400, e.message);
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
            return errorResponse(res, 400, 'userId or email is required');
        }

        const user = await superadminService.findUser({
            id: userId,
            email,
            companyId
        });

        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        // Phase 3 Fix: Resolve a valid workspaceId/companyId pair.
        const requestedCompanyId = typeof companyId === 'string' ? companyId : undefined;

        let resolvedCompanyId = requestedCompanyId || user.companyId || user.workspace?.id || null;
        let resolvedWorkspaceId = user.workspace?.id || null;

        if (resolvedCompanyId && (!resolvedWorkspaceId || resolvedWorkspaceId !== resolvedCompanyId)) {
            const workspace = await getWorkspaceById(resolvedCompanyId);
            if (workspace) {
                resolvedWorkspaceId = workspace.id;
            }
        }

        if (!resolvedWorkspaceId && resolvedCompanyId) {
            resolvedWorkspaceId = resolvedCompanyId;
        }
        if (!resolvedCompanyId && resolvedWorkspaceId) {
            resolvedCompanyId = resolvedWorkspaceId;
        }

        if (!resolvedCompanyId || !resolvedWorkspaceId) {
            const systemWorkspace = await getWorkspaceById('company_system') || await getWorkspaceBySlug('system');
            resolvedCompanyId = resolvedCompanyId || systemWorkspace?.id || 'company_system';
            resolvedWorkspaceId = resolvedWorkspaceId || resolvedCompanyId;
        }

        const payload = {
            userId: user.id,
            globalUserId: user.globalUserId || user.id,
            role: user.role,
            email: user.email,
            companyId: resolvedCompanyId,
            workspaceId: resolvedWorkspaceId
        };

        const token = signJwt(payload, { expiresIn: expiresIn || '2h' });

        res.json({ token, user });
    } catch (e: any) {
        errorResponse(res, 400, e.message);
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
        errorResponse(res, 500, e.message);
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
            return errorResponse(res, 400, 'name, category, description, and structure are required');
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
        errorResponse(res, 400, e.message);
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
        errorResponse(res, 500, e.message);
    }
});

export default router;
