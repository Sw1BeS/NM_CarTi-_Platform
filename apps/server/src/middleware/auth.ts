import { Request, Response, NextFunction } from 'express';
import { verifyJwt, JwtUserPayload } from '../config/jwt.js';
import { errorResponse } from '../utils/errorResponse.js';

export interface AuthRequest extends Request {
  user?: JwtUserPayload;
  // Legacy compatibility fields (will be populated by companyContext)
  companyId?: string;
  workspaceId?: string;
}

const normalizeJwtPayload = (raw: any): JwtUserPayload => {
  const userId = raw?.userId ? String(raw.userId) : '';
  const role = raw?.role ? String(raw.role) : '';
  const companyId = raw?.companyId ? String(raw.companyId) : raw?.workspaceId ? String(raw.workspaceId) : '';
  const workspaceId = raw?.workspaceId ? String(raw.workspaceId) : raw?.companyId ? String(raw.companyId) : '';
  const globalUserId = raw?.globalUserId ? String(raw.globalUserId) : userId;

  if (!userId || !role || !companyId || !workspaceId) {
    throw new Error('Invalid token payload');
  }

  return {
    userId,
    globalUserId,
    role,
    companyId,
    workspaceId,
    email: typeof raw?.email === 'string' ? raw.email : undefined,
    iat: typeof raw?.iat === 'number' ? raw.iat : undefined,
    exp: typeof raw?.exp === 'number' ? raw.exp : undefined
  };
};

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = (req as any).headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) return errorResponse(res, 401, 'Unauthorized');

  try {
    const decoded = verifyJwt(token);
    const user = normalizeJwtPayload(decoded);
    (req as AuthRequest).user = user;
    next();
  } catch (err) {
    return errorResponse(res, 403, 'Forbidden');
  }
};

export const optionalAuthenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = (req as any).headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) return next();

  try {
    const decoded = verifyJwt(token);
    const user = normalizeJwtPayload(decoded);
    (req as AuthRequest).user = user;
    next();
  } catch (err) {
    // Ignore invalid token in optional auth
    next();
  }
};

export const requireRole = (roles: string[] | string, ...rest: string[]) => {
  const roleList = Array.isArray(roles) ? roles : [roles, ...rest];
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const userRole = authReq.user?.role;

    // SUPER_ADMIN override (matches legacy behavior)
    if (userRole === 'SUPER_ADMIN') return next();

    if (!userRole || !roleList.includes(userRole)) {
      return errorResponse(res, 403, 'Insufficient permissions');
    }
    next();
  };
};
