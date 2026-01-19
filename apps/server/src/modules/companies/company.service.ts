/**
 * Company Service - Multi-tenant workspace management
 */

import { prisma } from '../../services/prisma.js';
import { getWorkspaceById, getWorkspaceBySlug, getAllUsers } from '../../services/v41/readService.js';
import { writeService } from '../../services/v41/writeService.js';

export class CompanyService {
    /**
     * Get company by ID
     */
    async getById(companyId: string) {
        // Use read abstraction (reads from v4.1 or legacy)
        const workspace = await getWorkspaceById(companyId);

        // For now, return legacy format for backward compatibility
        // TODO: Migrate callers to use UnifiedWorkspace type
        if (!workspace) return null;

        return {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            primaryColor: workspace.primaryColor,
            plan: workspace.plan,
            domain: workspace.domain,
            isActive: workspace.isActive
        };
    }

    /**
     * Get company by slug (for subdomain routing)
     */
    async getBySlug(slug: string) {
        // Use read abstraction
        return await getWorkspaceBySlug(slug);
    }

    /**
     * Create new company
     */
    async create(data: {
        name: string;
        slug: string;
        logo?: string;
        primaryColor?: string;
        plan?: string;
    }) {
        // Validate slug format (alphanumeric + hyphens)
        const slugRegex = /^[a-z0-9-]+$/;
        if (!slugRegex.test(data.slug)) {
            throw new Error('Slug must be lowercase alphanumeric with hyphens');
        }

        // Use Dual-Write service
        return writeService.createCompanyDual({
            name: data.name,
            slug: data.slug,
            plan: data.plan,
            primaryColor: data.primaryColor
        });
    }

    /**
     * Update company branding
     */
    /**
     * Update company branding
     */
    async updateBranding(companyId: string, data: {
        name?: string;
        logo?: string;
        primaryColor?: string;
        domain?: string;
    }) {
        // Map to Workspace settings
        const workspace = await prisma.workspace.findUnique({ where: { id: companyId } });
        if (!workspace) throw new Error('Workspace not found');

        const currentSettings = workspace.settings as any || {};

        return prisma.workspace.update({
            where: { id: companyId },
            data: {
                name: data.name,
                settings: {
                    ...currentSettings,
                    ...(data.primaryColor ? { primaryColor: data.primaryColor } : {}),
                    ...(data.domain ? { domain: data.domain } : {})
                }
            }
        });
    }

    /**
     * Get company users with roles
     */
    async getUsers(companyId: string) {
        // Use read abstraction
        const users = await getAllUsers(companyId);

        // Return in legacy format for backward compatibility
        return users.map(u => ({
            id: u.globalUserId || u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            isActive: u.isActive,
            createdAt: new Date()
        }));
    }

    /**
     * Invite user to company
     */
    async inviteUser(companyId: string, data: {
        email: string;
        name?: string;
        role: string;
    }) {
        // Check if user already exists in this company (check Membership)
        const membership = await prisma.membership.findFirst({
            where: {
                workspace_id: companyId,
                deleted_at: null,
                user: {
                    email: data.email
                }
            }
        });

        if (membership) {
            throw new Error('User already exists in this company');
        }

        // Generate temporary password (should send email in production)
        const tempPassword = Math.random().toString(36).slice(-8);

        return writeService.createUserDual({
            email: data.email,
            passwordHash: tempPassword, // In real app, hash this token
            name: data.name || data.email.split('@')[0],
            role: data.role,
            companyId
        });
    }

    /**
     * Update user role
     */
    async updateUserRole(companyId: string, userId: string, role: string) {
        // Verify user belongs to company (Membership)
        // Note: userId here might be GlobalUser ID
        const membership = await prisma.membership.findFirst({
            where: {
                user_id: userId,
                workspace_id: companyId,
                deleted_at: null
            }
        });

        if (!membership) {
            throw new Error('User not found in this company');
        }

        return prisma.membership.update({
            where: { id: membership.id },
            data: { role_id: role.toLowerCase() }
        });
    }

    /**
     * Remove user from company
     */
    async removeUser(companyId: string, userId: string) {
        const membership = await prisma.membership.findFirst({
            where: {
                user_id: userId,
                workspace_id: companyId,
                deleted_at: null
            }
        });

        if (!membership) {
            throw new Error('User not found');
        }

        if (membership.role_id?.toUpperCase() === 'OWNER') {
            // Check if there are other owners
            const ownerCount = await prisma.membership.count({
                where: {
                    workspace_id: companyId,
                    role_id: 'owner',
                    deleted_at: null
                }
            });

            if (ownerCount <= 1) {
                throw new Error('Cannot remove the last owner');
            }
        }

        // Soft delete membership
        return prisma.membership.update({
            where: { id: membership.id },
            data: { deleted_at: new Date() }
        });
    }

    /**
     * Get company stats
     */
    async getStats(companyId: string) {
        const [users, bots, scenarios, leads, requests] = await Promise.all([
            prisma.membership.count({ where: { workspace_id: companyId, deleted_at: null } }),
            prisma.botConfig.count({ where: { companyId } }),
            prisma.scenario.count({ where: { companyId } }),
            prisma.lead.count({
                where: { bot: { companyId } }
            }),
            prisma.b2bRequest.count({ where: { companyId } })
        ]);

        return {
            users,
            bots,
            scenarios,
            leads,
            requests
        };
    }
}
