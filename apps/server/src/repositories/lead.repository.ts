import { PrismaClient, Lead, LeadStatus } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import { generateULID } from '../utils/ulid.js';

export class LeadRepository extends BaseRepository<Lead> {
    constructor(prisma: PrismaClient) {
        super(prisma, 'lead');
    }

    async findByWorkspace(companyId: string, filters?: {
        status?: string;
        source?: string;
        skip?: number;
        take?: number;
    }): Promise<Lead[]> {
        return this.prisma.lead.findMany({
            where: {
                bot: { companyId },
                ...(filters?.status && { status: filters.status as LeadStatus }),
                ...(filters?.source && { source: filters.source })
            },
            skip: filters?.skip,
            take: filters?.take,
            orderBy: { createdAt: 'desc' }
        });
    }

    async findDuplicate(
        scope: { botId?: string; bot?: { companyId: string } },
        criteria: {
            phone?: string | null;
            userTgId?: string | null;
            name?: string | null;
            days?: number;
        }
    ): Promise<Lead | null> {
        const days = criteria.days || 14;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        if (criteria.phone) {
            const byPhone = await this.prisma.lead.findFirst({
                where: {
                    ...scope,
                    phone: criteria.phone,
                    createdAt: { gte: since }
                },
                orderBy: { createdAt: 'desc' }
            });
            if (byPhone) return byPhone;
        }

        if (criteria.userTgId) {
            const byUser = await this.prisma.lead.findFirst({
                where: {
                    ...scope,
                    userTgId: criteria.userTgId,
                    createdAt: { gte: since }
                },
                orderBy: { createdAt: 'desc' }
            });
            if (byUser) return byUser;
        }

        if (criteria.name && criteria.phone) {
            return this.prisma.lead.findFirst({
                where: {
                    ...scope,
                    phone: criteria.phone,
                    clientName: criteria.name,
                    createdAt: { gte: since }
                },
                orderBy: { createdAt: 'desc' }
            });
        }

        return null;
    }

    async createLead(data: {
        clientName: string;
        phone?: string;
        source?: string;
        botId?: string;
        userTgId?: string;
        leadCode?: string;
        status?: LeadStatus;
        payload?: any;
        request?: string;
    }): Promise<Lead> {
        return this.prisma.lead.create({
            data: {
                id: generateULID(),
                ...data
            }
        });
    }

    async updatePayload(id: string, payload: any): Promise<Lead> {
        return this.prisma.lead.update({
            where: { id },
            data: { payload }
        });
    }

    async updateStatus(id: string, status: string): Promise<Lead> {
        return this.prisma.lead.update({
            where: { id },
            data: { status: status as LeadStatus }
        });
    }

    async countByWorkspace(companyId: string): Promise<number> {
        return this.prisma.lead.count({
            where: { bot: { companyId } }
        });
    }

    async countLeads(): Promise<number> {
        return this.prisma.lead.count();
    }
}
