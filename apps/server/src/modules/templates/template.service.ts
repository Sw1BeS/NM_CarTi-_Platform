/**
 * Template Service - Marketplace for bot scenarios
 */

import { prisma } from '../../services/prisma.js';

export class TemplateService {
    /**
     * Get marketplace templates (public)
     */
    async getMarketplace(filters?: {
        category?: string;
        search?: string;
        isPremium?: boolean;
    }) {
        return prisma.scenarioTemplate.findMany({
            where: {
                isPublic: true,
                category: filters?.category || undefined,
                isPremium: filters?.isPremium || undefined,
                name: filters?.search ? { contains: filters.search, mode: 'insensitive' } : undefined
            },
            orderBy: [
                { isPremium: 'desc' },
                { installs: 'desc' }
            ],
            take: 50
        });
    }

    /**
     * Get template by ID
     */
    async getById(templateId: string) {
        return prisma.scenarioTemplate.findUnique({
            where: { id: templateId }
        });
    }

    /**
     * Get installed templates for company
     */
    async getInstalled(companyId: string) {
        return prisma.companyTemplate.findMany({
            where: { companyId },
            include: {
                template: true
            },
            orderBy: { installedAt: 'desc' }
        });
    }

    /**
     * Install template to company
     */
    async installTemplate(companyId: string, templateId: string) {
        const template = await prisma.scenarioTemplate.findUnique({
            where: { id: templateId }
        });

        if (!template) {
            throw new Error('Template not found');
        }

        // Check if already installed
        const existing = await prisma.companyTemplate.findUnique({
            where: {
                companyId_templateId: {
                    companyId,
                    templateId
                }
            }
        });

        if (existing) {
            throw new Error('Template already installed');
        }

        // Create scenario from template
        const scenario = await prisma.scenario.create({
            data: {
                companyId,
                name: template.name,
                nodes: template.structure as any,  // Cast JsonValue to any for compatibility
                isActive: false, // User must activate manually
                keywords: [] // Can be customized later
            }
        });

        // Track installation
        await prisma.companyTemplate.create({
            data: {
                companyId,
                templateId
            }
        });

        // Increment install counter
        await prisma.scenarioTemplate.update({
            where: { id: templateId },
            data: {
                installs: { increment: 1 }
            }
        });

        return scenario;
    }

    /**
     * Uninstall template (doesn't delete created scenario)
     */
    async uninstallTemplate(companyId: string, templateId: string) {
        const installation = await prisma.companyTemplate.findUnique({
            where: {
                companyId_templateId: {
                    companyId,
                    templateId
                }
            }
        });

        if (!installation) {
            throw new Error('Template not installed');
        }

        await prisma.companyTemplate.delete({
            where: { id: installation.id }
        });

        return { success: true };
    }

    /**
     * Create new template (admin only)
     */
    async createTemplate(data: {
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
}
