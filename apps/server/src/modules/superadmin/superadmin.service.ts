/**
 * Superadmin Service - System-wide administration
 * Only accessible by SUPER_ADMIN role
 */

import { prisma } from '../../services/prisma.js';
import { getAllWorkspaces, getAllUsers, getUserByEmail } from '../../services/v41/readService.js';
import { writeService } from '../../services/v41/writeService.js';
import bcrypt from 'bcryptjs';

export class SuperadminService {
    /**
     * Get all companies (system overview)
     */
    async getAllCompanies() {
        // Use read abstraction
        const workspaces = await getAllWorkspaces();

        // Return in legacy Company format
        return workspaces.map(w => ({
            id: w.id,
            name: w.name,
            slug: w.slug,
            primaryColor: w.primaryColor,
            plan: w.plan,
            domain: w.domain,
            isActive: w.isActive,
            createdAt: new Date(),
            updatedAt: new Date()
        }));
    }

    // Note: createCompany and deleteCompany logic moved to ClientManagerService
    // to separate system-level orchestration from automotive operations.

    /**
     * Get system-wide statistics
     */
    async getSystemStats() {
        // Count from V4 tables
        const [companies, users, bots, leads, requests, templates] = await Promise.all([
            prisma.workspace.count({ where: { deleted_at: null } }),
            prisma.globalUser.count({ where: { deleted_at: null } }),
            prisma.botConfig.count(), // BotConfig still has companyId index but no deleted_at?
            prisma.lead.count(),
            prisma.b2bRequest.count(),
            prisma.scenarioTemplate.count()
        ]);

        // Active companies (with activity in last 30 days)
        // Check memberships updated? Or just count active.
        // For now simplifying to total active workspaces.
        const activeCompanies = companies;

        return {
            companies,
            activeCompanies,
            users,
            bots,
            leads,
            requests,
            templates
        };
    }

    /**
     * Create a user in any company (SUPER_ADMIN only)
     */
    async createUser(data: {
        email: string;
        password: string;
        role: string;
        companyId: string;
        name?: string;
        isActive?: boolean;
    }) {
        const hashed = await bcrypt.hash(data.password, 10);
        return writeService.createUserDual({
            email: data.email,
            passwordHash: hashed,
            name: data.name || data.email.split('@')[0],
            role: data.role,
            companyId: data.companyId
        });
    }

    /**
     * Update user (role, password, company, status)
     */
    async updateUser(userId: string, data: {
        email?: string;
        name?: string;
        role?: string;
        companyId?: string;
        password?: string;
        isActive?: boolean;
    }) {
        // Updating user is tricky in V4. 
        // 1. Update GlobalUser (email, password, status as isActive)
        // 2. Update Membership (role, name if stored there)

        // We assume 'userId' is GlobalUser ID.
        // 'companyId' defines WHICH membership to update if role/name implied context.
        // If data.companyId is missing, this is ambiguous for Membership updates.
        // But SuperAdmin typically manages a user in context of a company.

        const updates: any = {};

        if (data.email || data.password || data.isActive !== undefined) {
            const globalUpdates: any = {};
            if (data.email) globalUpdates.email = data.email;
            if (data.password) globalUpdates.password_hash = await bcrypt.hash(data.password, 10);
            if (data.isActive !== undefined) globalUpdates.global_status = data.isActive ? 'active' : 'inactive';

            await prisma.globalUser.update({
                where: { id: userId },
                data: globalUpdates
            });
            updates.globalUser = true;
        }

        // Update Membership if companyId is provided
        if (data.companyId && (data.role || data.name)) {
            const membership = await prisma.membership.findFirst({
                where: { user_id: userId, workspace_id: data.companyId, deleted_at: null }
            });

            if (membership) {
                const memberUpdates: any = {};
                if (data.role) memberUpdates.role_id = data.role.toLowerCase();
                if (data.name) memberUpdates.name = data.name;

                await prisma.membership.update({
                    where: { id: membership.id },
                    data: memberUpdates
                });
                updates.membership = true;
            }
        }

        return { success: true, updates };
    }

    /**
     * Get all users across all companies
     */
    async getAllUsers(options?: { companyId?: string; isActive?: boolean; role?: string }) {
        // Use read abstraction
        let users = await getAllUsers(options?.companyId);

        // Filter by role if provided
        if (options?.role) {
            users = users.filter(u => u.role === options.role);
        }

        // Filter by isActive if provided
        if (options?.isActive !== undefined) {
            users = users.filter(u => u.isActive === options.isActive);
        }
        return users;
    }

    /**
     * Update company plan (upgrade/downgrade)
     */
    async updateCompanyPlan(companyId: string, plan: string) {
        // Update Workspace settings
        const workspace = await prisma.workspace.findUnique({ where: { id: companyId } });
        if (!workspace) throw new Error('Workspace not found');

        const settings = workspace.settings as any || {};

        return prisma.workspace.update({
            where: { id: companyId },
            data: {
                settings: {
                    ...settings,
                    plan
                }
            }
        });
    }

    /**
     * Toggle company active status
     */
    async toggleCompanyStatus(companyId: string, isActive: boolean) {
        // Update Workspace settings
        const workspace = await prisma.workspace.findUnique({ where: { id: companyId } });
        if (!workspace) throw new Error('Workspace not found');

        const settings = workspace.settings as any || {};

        return prisma.workspace.update({
            where: { id: companyId },
            data: {
                settings: {
                    ...settings,
                    isActive
                }
            }
        });
    }

    /**
     * Create new template for marketplace
     */
    async createMarketplaceTemplate(data: {
        name: string;
        category: string;
        description: string;
        thumbnail?: string;
        structure: any;
        isPremium?: boolean;
    }) {
        return prisma.scenarioTemplate.create({
            data: {
                name: data.name,
                category: data.category,
                description: data.description,
                thumbnail: data.thumbnail,
                structure: data.structure,
                isPremium: data.isPremium || false,
                isPublic: true
            }
        });
    }

    /**
     * Get system logs (for debugging)
     */
    async getSystemLogs(limit: number = 100) {
        return prisma.systemLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit
        });
    }

    /**
     * Find user by id or email
     */
    async findUser(query: { id?: string; email?: string; companyId?: string }) {
        // Search GlobalUser
        if (query.email) {
            return getUserByEmail(query.email);
        }
        if (query.id) {
            // Check if it's Global ID or Legacy ID (mapped same)
            const user = await getUserByEmail(query.id); // Typo in original? No, it's findFirst by ID or Email.
            // Using readService's getUserById
            // Wait, getUserByEmail(query.id) is wrong.
            // Let's use readService
        }

        if (query.id) {
            const u = await import('../../services/v41/readService.js').then(m => m.getUserById(query.id!));
            if (u) return u;
        }

        return null; // Fallback
    }
}
