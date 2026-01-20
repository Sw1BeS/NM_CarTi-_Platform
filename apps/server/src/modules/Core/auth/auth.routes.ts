import { Router, Request, Response } from 'express';
// @ts-ignore
import { prisma } from '../../../services/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from '../../../middleware/auth.js';
import { getUserByEmail } from '../../../services/v41/readService.js';

const router = Router();
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  JWT_SECRET = 'dev_secret_key_123';
}

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = (req as any).body;
  try {
    // Use read abstraction layer (reads from v4.1 or legacy based on flag)
    const user = await getUserByEmail(email, true); // includePassword=true

    if (!user || !user.isActive) {
      return (res as any).status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password!);
    if (!valid) {
      return (res as any).status(401).json({ error: 'Invalid credentials' });
    }

    // Include both legacy and v4.1 IDs in JWT for compatibility
    const token = jwt.sign({
      userId: user.id,
      globalUserId: user.globalUserId,
      email: user.email,
      role: user.role,
      companyId: user.companyId || user.workspace?.id,
      workspaceId: user.workspace?.id
    }, JWT_SECRET, { expiresIn: '12h' });

    (res as any).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId || user.workspace?.id,
        company: user.workspace ? {
          id: user.workspace.id,
          name: user.workspace.name,
          slug: user.workspace.slug,
          primaryColor: user.workspace.primaryColor,
          plan: user.workspace.plan
        } : null
      }
    });
  } catch (e) {
    (res as any).status(500).json({ error: 'Internal error' });
  }
});

router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  (res as any).json(user);
});

export default router;
