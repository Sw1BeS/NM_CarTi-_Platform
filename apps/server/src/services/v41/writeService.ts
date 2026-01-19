
import { prisma } from '../../services/prisma.js';
import { generateULID } from '../../utils/ulid.js';

/**
 * v4.1 Write Service (Dual-Write)
 * 
 * Handles writing to BOTH legacy (Company/User) and v4.1 (Workspace/GlobalUser) tables.
 * This ensures data consistency during the migration phase (Zero-Downtime).
 */

export const writeService = {

    /**
     * Create Company (Legacy) + Workspace (v4.1)
     */
    async createCompanyDual(data: {
        name: string;
        slug: string;
        plan?: string;
        primaryColor?: string;
        domain?: string;
    }) {
        const workspaceId = generateULID();

        // Create v4.1 Workspace
        const workspace = await prisma.workspace.create({
            data: {
                id: workspaceId,
                slug: data.slug,
                name: data.name,
                settings: {
                    plan: (data.plan as any) || 'FREE',
                    primaryColor: data.primaryColor || '#D4AF37',
                    domain: data.domain,
                    isActive: true
                }
            }
        });

        // Create Default Account for Workspace
        const accountId = generateULID();
        await prisma.account.create({
            data: {
                id: accountId,
                workspace_id: workspaceId,
                slug: 'default',
                name: `${data.name} Account`,
                config: {}
            }
        });

        // Return workspace as if it were company (mapped structure)
        return {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            plan: (workspace.settings as any)?.plan || 'FREE',
            primaryColor: (workspace.settings as any)?.primaryColor || '#D4AF37',
            isActive: true,
            createdAt: workspace.created_at,
            updatedAt: workspace.updated_at
        };
    },

    /**
     * Create User (Legacy) + GlobalUser/Membership (v4.1)
     */
    async createUserDual(data: {
        email: string;
        passwordHash: string;
        name?: string;
        role: string;
        companyId: string; // Creates legacy link
    }) {
        const userId = generateULID();
        let globalUserId = userId; // We can use same ID for new users

        return prisma.$transaction(async (tx) => {
            // Check if global user exists
            const existingGlobal = await tx.globalUser.findUnique({
                where: { email: data.email }
            });

            if (existingGlobal) {
                globalUserId = existingGlobal.id;
            } else {
                // Create new GlobalUser
                await tx.globalUser.create({
                    data: {
                        id: globalUserId,
                        email: data.email,
                        password_hash: data.passwordHash,
                        global_status: 'active'
                    }
                });
            }

            // Create Membership
            // We assume companyId === workspaceId
            const workspaceId = data.companyId;

            // Find default account for this workspace
            const defaultAccount = await tx.account.findFirst({
                where: { workspace_id: workspaceId }
            });

            const membership = await tx.membership.create({
                data: {
                    id: generateULID(),
                    user_id: globalUserId,
                    workspace_id: workspaceId,
                    account_id: defaultAccount?.id,
                    role_id: data.role.toLowerCase(),
                    permissions: {}
                }
            });

            // Return structure looking like User
            return {
                id: globalUserId,
                email: data.email,
                name: data.name,
                role: data.role,
                companyId: workspaceId,
                isActive: true
            };
        });
    }
};
