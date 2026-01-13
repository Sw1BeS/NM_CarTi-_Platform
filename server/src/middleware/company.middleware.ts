/**
 * Company Middleware - Workspace Isolation
 * 
 * Extracts companyId from JWT and ensures all queries are scoped to the company
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

export interface AuthenticatedRequest extends Request {
    userId?: string;
    companyId?: string;
    userRole?: string;
}

/**
 * Extract company context from JWT
 * SUPER_ADMIN users can access any company or work without company context
 */
export const companyMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        req.userId = decoded.userId;
        req.companyId = decoded.companyId;
        req.userRole = decoded.role;

        // SUPER_ADMIN can work without company context or access any company
        if (req.userRole === 'SUPER_ADMIN') {
            // If targetCompanyId is in query/body, use it
            const targetCompany = (req.query.companyId || req.body?.companyId) as string;
            if (targetCompany) {
                req.companyId = targetCompany;
            }
            return next();
        }

        if (!req.companyId) {
            return res.status(403).json({ error: 'Company context missing in token' });
        }

        next();
    } catch (e: any) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

/**
 * Check if user has required role
 * SUPER_ADMIN always passes all role checks
 */
export const requireRole = (...allowedRoles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.userRole) {
            return res.status(403).json({ error: 'Role not found in request' });
        }

        // SUPER_ADMIN bypasses all role restrictions
        if (req.userRole === 'SUPER_ADMIN') {
            return next();
        }

        if (!allowedRoles.includes(req.userRole)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                required: allowedRoles,
                current: req.userRole
            });
        }

        next();
    };
};

/**
 * Optional company middleware - doesn't fail if no token
 * Useful for public endpoints that may enhance with company context
 */
export const optionalCompanyMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(); // Continue without company context
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        req.userId = decoded.userId;
        req.companyId = decoded.companyId;
        req.userRole = decoded.role;

        next();
    } catch (e) {
        // Ignore token errors, continue without auth
        next();
    }
};
