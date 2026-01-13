/**
 * Superadmin Service - System-wide administration
 * Only accessible by SUPER_ADMIN role
 */

import { prisma } from '../../services/prisma.js';

export class SuperadminService {
    /**
     * Get all companies (system overview)
     */
    async getAllCompanies() {
        return prisma.company.findMany({
            include: {
                _count: {
                    select: {
                        users: true,
                        bots: true,
                        scenarios: true,
                        integrations: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Create company (for onboarding new clients)
     */
    async createCompany(data: {
        name: string;
        slug: string;
        plan?: string;
        ownerEmail: string;
        ownerName?: string;
    }) {
        // Create company
        const company = await prisma.company.create({
            data: {
                name: data.name,
                slug: data.slug,
                plan: data.plan as any || 'FREE'
            }
        });

        // Create owner user
        const tempPassword = Math.random().toString(36).slice(-10);

        const owner = await prisma.user.create({
            data: {
                email: data.ownerEmail,
                name: data.ownerName || data.ownerEmail.split('@')[0],
                password: tempPassword, // TODO: Hash and send email
                role: 'OWNER',
                companyId: company.id
            }
        });

        return {
            company,
            owner,
            tempPassword // Return for initial setup
        };
    }

    /**
     * Delete company and all related data
     */
    async deleteCompany(companyId: string) {
        // Cascade delete will handle related records
        return prisma.company.delete({
            where: { id: companyId }
        });
    }

    /**
     * Get system-wide statistics
     */
    async getSystemStats() {
        const [companies, users, bots, leads, requests, templates] = await Promise.all([
            prisma.company.count(),
            prisma.user.count(),
            prisma.botConfig.count(),
            prisma.lead.count(),
            prisma.b2bRequest.count(),
            prisma.scenarioTemplate.count()
        ]);

        // Active companies (with activity in last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const activeCompanies = await prisma.company.count({
            where: {
                users: {
                    some: {
                        updatedAt: {
                            gte: thirtyDaysAgo
                        }
                    }
                }
            }
        });

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
     * Get all users across all companies
     */
    async getAllUsers(filters?: {
        companyId?: string;
        role?: string;
        isActive?: boolean;
    }) {
        return prisma.user.findMany({
            where: {
                companyId: filters?.companyId,
                role: filters?.role as any,
                isActive: filters?.isActive
            },
            include: {
                company: {
                    select: {
                        id: true,
                        name: true,
                        slug: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
    }

    /**
     * Update company plan (upgrade/downgrade)
     */
    async updateCompanyPlan(companyId: string, plan: string) {
        return prisma.company.update({
            where: { id: companyId },
            data: { plan: plan as any }
        });
    }

    /**
     * Toggle company active status
     */
    async toggleCompanyStatus(companyId: string, isActive: boolean) {
        return prisma.company.update({
            where: { id: companyId },
            data: { isActive }
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
}
