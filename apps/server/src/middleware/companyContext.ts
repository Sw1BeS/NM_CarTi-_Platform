import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';

/**
 * Adapter to populate legacy req.companyId and req.workspaceId from the authenticated user.
 * Include this AFTER authenticateToken.
 */
export const companyContext = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
        return (res as any).status(401).json({ error: 'Authentication required for company context' });
    }

    // 1. Default from token
    req.companyId = req.user.companyId;
    req.workspaceId = req.user.workspaceId;

    // 2. Superadmin override logic (preserved from legacy company.middleware.ts)
    if (req.user.role === 'SUPER_ADMIN') {
        const targetCompany = (req.query.companyId || req.body?.companyId) as string;
        if (targetCompany) {
            req.companyId = targetCompany;
        }
    }

    // 3. Validation
    // If not superadmin, companyId is required for routes that use this middleware
    if (!req.companyId && req.user.role !== 'SUPER_ADMIN') {
        // Some legacy routes might fail if they expect companyId
        return (res as any).status(403).json({ error: 'Company context missing' });
    }

    next();
};
