import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../config/jwt.js';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    globalUserId: string;
    role: string;
    companyId: string;
    workspaceId: string;
    email?: string; // Legacy or debugging
    iat?: number;
    exp?: number;
  };
  // Legacy compatibility fields (will be populated by companyContext)
  companyId?: string;
  workspaceId?: string;
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = (req as any).headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return (res as any).status(401).send('Unauthorized');

  try {
    const user = verifyJwt(token);
    (req as AuthRequest).user = user;
    next();
  } catch (err) {
    return (res as any).status(403).send('Forbidden');
  }
};

export const optionalAuthenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = (req as any).headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return next();

  try {
    const user = verifyJwt(token);
    (req as AuthRequest).user = user;
    next();
  } catch (err) {
    // Ignore invalid token in optional auth
    next();
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const userRole = authReq.user?.role;

    // SUPER_ADMIN override (matches legacy behavior)
    if (userRole === 'SUPER_ADMIN') return next();

    if (!userRole || !roles.includes(userRole)) {
      return (res as any).status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};
