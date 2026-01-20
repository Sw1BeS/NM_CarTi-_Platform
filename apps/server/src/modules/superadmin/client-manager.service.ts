/**
 * Client Manager Service - Logic for creating and cloning system instances
 * Separated from main automotive modules to keep them clean.
 */

import { prisma } from '../../services/prisma.js';
import { writeService } from '../../services/v41/writeService.js';

export class ClientManagerService {
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
        const company = await writeService.createCompanyDual({
            name: data.name,
            slug: data.slug,
            plan: data.plan
        });

        // Create owner user
        const tempPassword = Math.random().toString(36).slice(-10);

        const owner = await writeService.createUserDual({
            email: data.ownerEmail,
            passwordHash: tempPassword,
            name: data.ownerName || data.ownerEmail.split('@')[0],
            role: 'OWNER',
            companyId: company.id
        });

        return {
            company,
            owner,
            tempPassword
        };
    }

    /**
     * Delete company and all related data
     */
    async deleteCompany(companyId: string) {
        return prisma.workspace.update({
            where: { id: companyId },
            data: { deleted_at: new Date() }
        });
    }

    /**
     * Clone a template company to a new client (Future work)
     */
    async cloneToClient(templateCompanyId: string, newClientData: any) {
        // Implementation for deep cloning (bots, scenarios, definitions)
        throw new Error('Clone logic to be implemented for separate management tool');
    }
}
