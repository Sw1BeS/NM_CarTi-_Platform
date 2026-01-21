import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  JWT_SECRET = 'dev_secret_key_123';
}

export interface AuthRequest extends Request {
  user?: {
    id: number;
    role: string;
    email: string;
    companyId?: string;
    workspaceId?: string;
    workspaceSlug?: string;
  };
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = (req as any).headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return (res as any).status(401).send('Unauthorized');

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return (res as any).status(403).send('Forbidden');
    (req as AuthRequest).user = user;
    next();
  });
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const userRole = authReq.user?.role;

    if (!userRole || !roles.includes(userRole)) {
      // In production, strictly enforce roles.
      return (res as any).status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};
