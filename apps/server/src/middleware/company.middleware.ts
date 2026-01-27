/**
 * Company Middleware - Deprecated Adapter
 *
 * This file now delegates to the canonical auth middleware and company context
 * to avoid duplicated JWT parsing and role checks.
 */

import { NextFunction, Response } from 'express';
import { authenticateToken, optionalAuthenticateToken, requireRole as requireRoleAuth, AuthRequest } from './auth.js';
import { companyContext } from './companyContext.js';

export interface AuthenticatedRequest extends AuthRequest {}

export const companyMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    authenticateToken(req, res, () => companyContext(req, res, next));
};

export const optionalCompanyMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    optionalAuthenticateToken(req, res, () => {
        if (!req.user) return next();
        return companyContext(req, res, next);
    });
};

export const requireRole = (...allowedRoles: string[]) => {
    return requireRoleAuth(allowedRoles);
};
