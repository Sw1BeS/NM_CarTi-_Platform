import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticateToken, AuthRequest } from '../../../middleware/auth.js';
import { getUserByEmail, getWorkspaceById, getWorkspaceBySlug } from '../../../services/v41/readService.js';
import { signJwt } from '../../../config/jwt.js';
import { logger } from '../../../utils/logger.js';
import { errorResponse } from '../../../utils/errorResponse.js';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = (req as any).body;
  try {
    // Use read abstraction layer (reads from v4.1 or legacy based on flag)
    const user = await getUserByEmail(email, true); // includePassword=true

    if (!user || !user.isActive) {
      return errorResponse(res as any, 401, 'Invalid credentials', 'AUTH_INVALID');
    }

    const valid = await bcrypt.compare(password, user.password!);
    if (!valid) {
      return errorResponse(res as any, 401, 'Invalid credentials', 'AUTH_INVALID');
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
    return errorResponse(res as any, 500, 'Internal error', 'AUTH_ERROR');
  }
});

router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const jwtUser = (req as AuthRequest).user;
  try {
    if (!jwtUser?.email) {
      return errorResponse(res as any, 401, 'Unauthorized', 'AUTH_UNAUTHORIZED');
    }
    const user = await getUserByEmail(jwtUser.email);
    if (!user) return errorResponse(res as any, 404, 'User not found', 'AUTH_NOT_FOUND');

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
    logger.error(e);
    return errorResponse(res as any, 500, 'Failed to fetch user context', 'AUTH_CONTEXT');
  }
});

export default router;
