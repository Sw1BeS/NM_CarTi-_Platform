import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticateToken, AuthRequest } from '../../../middleware/auth.js';
import { getUserByEmail, getWorkspaceById, getWorkspaceBySlug } from '../../../services/v41/readService.js';
import { signJwt } from '../../../config/jwt.js';

const router = Router();

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

    // Canonical payload: always include companyId + workspaceId.
    let workspaceId = user.workspace?.id || user.companyId || null;
    if (!workspaceId) {
      const systemWorkspace = await getWorkspaceById('company_system') || await getWorkspaceBySlug('system');
      workspaceId = systemWorkspace?.id || 'company_system';
    }

    const companyId = user.companyId || workspaceId;

    const token = signJwt({
      userId: user.id,
      globalUserId: user.globalUserId || user.id,
      email: user.email,
      role: user.role,
      companyId,
      workspaceId
    }, { expiresIn: '12h' });

    (res as any).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId,
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
  const jwtUser = (req as AuthRequest).user;
  try {
    if (!jwtUser?.email) {
      return (res as any).status(401).json({ error: 'Unauthorized' });
    }
    const user = await getUserByEmail(jwtUser.email);
    if (!user) return (res as any).status(404).json({ error: 'User not found' });

    // Consistent shape with /login
    const companyId = user.companyId || user.workspace?.id;
    (res as any).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId,
      company: user.workspace ? {
        id: user.workspace.id,
        name: user.workspace.name,
        slug: user.workspace.slug,
        primaryColor: user.workspace.primaryColor,
        plan: user.workspace.plan
      } : null
    });
  } catch (e) {
    console.error(e);
    (res as any).status(500).json({ error: 'Failed to fetch user context' });
  }
});

export default router;
