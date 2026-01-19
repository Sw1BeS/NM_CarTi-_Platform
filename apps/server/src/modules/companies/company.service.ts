/**
 * Company Service - Multi-tenant workspace management
 */

import { prisma } from '../../services/prisma.js';

export class CompanyService {
    /**
     * Get company by ID
     */
    async getById(companyId: string) {
        return prisma.company.findUnique({
            where: { id: companyId },
            include: {
                _count: {
                    select: {
                        users: true,
                        bots: true,
                        scenarios: true,
                        integrations: true
                    }
                }
            }
        });
    }

    /**
     * Get company by slug (for subdomain routing)
     */
    async getBySlug(slug: string) {
        return prisma.company.findUnique({
            where: { slug }
        });
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

        return prisma.company.create({
            data: {
                name: data.name,
                slug: data.slug,
                logo: data.logo,
                primaryColor: data.primaryColor || '#D4AF37',
                plan: data.plan as any || 'FREE'
            }
        });
    }

    /**
     * Update company branding
     */
    async updateBranding(companyId: string, data: {
        name?: string;
        logo?: string;
        primaryColor?: string;
        domain?: string;
    }) {
        return prisma.company.update({
            where: { id: companyId },
            data
        });
    }

    /**
     * Get company users with roles
     */
    async getUsers(companyId: string) {
        return prisma.user.findMany({
            where: { companyId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Invite user to company
     */
    async inviteUser(companyId: string, data: {
        email: string;
        name?: string;
        role: string;
    }) {
        // Check if user already exists in this company
        const existing = await prisma.user.findFirst({
            where: {
                email: data.email,
                companyId
            }
        });

        if (existing) {
            throw new Error('User already exists in this company');
        }

        // Generate temporary password (should send email in production)
        const tempPassword = Math.random().toString(36).slice(-8);

        return prisma.user.create({
            data: {
                email: data.email,
                name: data.name || data.email.split('@')[0],
                password: tempPassword, // TODO: Hash this
                role: data.role as any,
                companyId
            }
        });
    }

    /**
     * Update user role
     */
    async updateUserRole(companyId: string, userId: string, role: string) {
        // Verify user belongs to company
        const user = await prisma.user.findFirst({
            where: { id: userId, companyId }
        });

        if (!user) {
            throw new Error('User not found in this company');
        }

        return prisma.user.update({
            where: { id: userId },
            data: { role: role as any }
        });
    }

    /**
     * Remove user from company
     */
    async removeUser(companyId: string, userId: string) {
        const user = await prisma.user.findFirst({
            where: { id: userId, companyId }
        });

        if (!user) {
            throw new Error('User not found');
        }

        if (user.role === 'OWNER') {
            // Check if there are other owners
            const ownerCount = await prisma.user.count({
                where: { companyId, role: 'OWNER' }
            });

            if (ownerCount <= 1) {
                throw new Error('Cannot remove the last owner');
            }
        }

        return prisma.user.delete({
            where: { id: userId }
        });
    }

    /**
     * Get company stats
     */
    async getStats(companyId: string) {
        const [users, bots, scenarios, leads, requests] = await Promise.all([
            prisma.user.count({ where: { companyId } }),
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
