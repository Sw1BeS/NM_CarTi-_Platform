import { Request, Response, NextFunction } from 'express';

/**
 * Extended Express Request with workspace context
 */
export interface WorkspaceRequest extends Request {
    workspaceId?: string;
    workspaceSlug?: string;
}

/**
 * Workspace Context Middleware
 * 
 * Extracts workspace identifier from request and attaches it to req.workspaceId
 * This enables multi-tenant isolation at the middleware level.
 * 
 * Extraction order (first match wins):
 * 1. X-Workspace-Slug header
 * 2. X-Workspace-Id header
 * 3. Subdomain from hostname (e.g., demo.cartie.com → "demo")
 * 4. JWT token workspace claim
 * 
 * Feature flag: USE_V4_WORKSPACE_SCOPING (default OFF for backward compatibility)
 * 
 * @example
 * // In your Express app
 * import { workspaceContext } from './middleware/workspaceContext';
 * app.use(workspaceContext);
 */
export async function workspaceContext(
    req: WorkspaceRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    // Feature flag check - skip if not enabled
    if (process.env.USE_V4_WORKSPACE_SCOPING !== 'true') {
        return next();
    }

    try {
        let workspaceSlug: string | undefined;
        let workspaceId: string | undefined;

        // 1. Try X-Workspace-Slug header
        const headerSlug = req.headers['x-workspace-slug'];
        if (headerSlug && typeof headerSlug === 'string') {
            workspaceSlug = headerSlug.toLowerCase();
        }

        // 2. Try X-Workspace-Id header
        const headerId = req.headers['x-workspace-id'];
        if (headerId && typeof headerId === 'string') {
            workspaceId = headerId;
        }

        // 3. Try subdomain extraction
        if (!workspaceSlug && !workspaceId) {
            const host = req.headers.host;
            if (host) {
                const parts = host.split('.');
                // If we have at least 2 parts (subdomain.domain.tld), extract subdomain
                if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'api') {
                    workspaceSlug = parts[0].toLowerCase();
                }
            }
        }

        // 4. Try JWT token (if implemented in your auth middleware)
        // Note: This assumes auth middleware runs before workspace middleware
        // and attaches decoded token to req.user
        if (!workspaceSlug && !workspaceId && (req as any).user?.workspaceId) {
            workspaceId = (req as any).user.workspaceId;
        }

        // If we have a slug, resolve to workspace ID
        // Note: workspace table doesn't exist yet (PR-1), so skip this until then
        if (workspaceSlug && !workspaceId) {
            try {
                // Use singleton prisma instance
                // @ts-ignore - Dynamic access to avoid circular dependency issues during build if types aren't ready
                if ((global as any).prisma?.workspace || (await import('../services/prisma')).prisma.workspace) {
                    const { prisma } = await import('../services/prisma.js');

                    const workspace = await prisma.workspace.findUnique({
                        where: { slug: workspaceSlug },
                        select: { id: true, deleted_at: true }
                    });

                    if (!workspace || workspace.deleted_at) {
                        res.status(404).json({
                            error: 'Workspace not found',
                            code: 'WORKSPACE_NOT_FOUND'
                        });
                        return;
                    }

                    workspaceId = workspace.id;
                }
            } catch (err) {
                // Workspace table not created yet - skip
                console.warn('Workspace resolution skipped (v4.1 tables not created yet)');
            }
        }

        // Attach to request
        if (workspaceId) {
            req.workspaceId = workspaceId;
            req.workspaceSlug = workspaceSlug;
        } else {
            // No workspace context - this might be OK for public endpoints
            // or endpoints that don't require workspace scoping
            // Individual routes can check req.workspaceId and return 400 if required
        }

        next();
    } catch (error) {
        console.error('Workspace context middleware error:', error);
        res.status(500).json({
            error: 'Failed to resolve workspace context',
            code: 'WORKSPACE_CONTEXT_ERROR'
        });
        return;
    }
}

/**
 * Middleware to enforce workspace is present
 * Use this on routes that REQUIRE workspace context
 * 
 * @example
 * router.get('/api/records', requireWorkspace, async (req: WorkspaceRequest, res) => {
 *   const records = await getRecords(req.workspaceId!);
 *   res.json(records);
 * });
 */
export function requireWorkspace(
    req: WorkspaceRequest,
    res: Response,
    next: NextFunction
): void {
    if (!req.workspaceId) {
        return res.status(400).json({
            error: 'Workspace context required',
            code: 'WORKSPACE_REQUIRED',
            hint: 'Provide X-Workspace-Slug header or use workspace subdomain'
        }) as any;
    }
    next();
}

/**
 * Helper to get workspace ID from request (throws if missing)
 * Use in controllers/services that require workspace
 */
export function getWorkspaceId(req: WorkspaceRequest): string {
    if (!req.workspaceId) {
        throw new Error('Workspace context is required but not found in request');
    }
    return req.workspaceId;
}
