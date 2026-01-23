import { PrismaClient, Lead, LeadStatus, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import { generateULID } from '../utils/ulid.js';

/**
 * LeadRepository with Dual Write (Legacy Lead + v4.1 Record/Contact)
 */
export class LeadRepository extends BaseRepository<Lead> {
    constructor(prisma: PrismaClient) {
        super(prisma, 'lead');
    }

    // Helper: Find EntityType ID for v4.1
    private async getEntityId(slug: string, workspaceId: string): Promise<string | null> {
        // Simple cache or query
        const et = await this.prisma.entityType.findFirst({
            where: { slug, workspace_id: workspaceId }
        });
        return et?.id || null;
    }

    // Helper: Resolve workspaceId from botId
    private async resolveWorkspace(botId?: string): Promise<string | null> {
        if (!botId) return null;
        const bot = await this.prisma.botConfig.findUnique({ where: { id: botId } });
        return bot?.companyId || null;
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

        // Logic remains on Legacy tables for reading (safer until full migration)
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
        const leadId = generateULID();

        // 1. Write to Legacy Lead Table (Primary for now)
        const lead = await this.prisma.lead.create({
            data: {
                id: leadId,
                ...data
            }
        });

        // 2. Dual Write to v4.1 (Best Effort)
        try {
            const workspaceId = await this.resolveWorkspace(data.botId);
            if (workspaceId) {
                // Upsert Contact
                let contactId = leadId; // Reuse ID if possible? No, contact is person.

                // Deduplicate Contact by phone
                if (data.phone) {
                    const existingContact = await this.prisma.contact.findFirst({
                        where: { workspace_id: workspaceId, phone_e164: data.phone }
                    });
                    if (existingContact) contactId = existingContact.id;
                    else {
                        contactId = generateULID();
                        await this.prisma.contact.create({
                            data: {
                                id: contactId,
                                workspace_id: workspaceId,
                                name: data.clientName,
                                phone_e164: data.phone,
                                created_by: 'dual_write'
                            }
                        });
                    }
                } else {
                    // Anonymous contact
                    contactId = generateULID();
                    await this.prisma.contact.create({
                        data: {
                            id: contactId,
                            workspace_id: workspaceId,
                            name: data.clientName,
                            created_by: 'dual_write'
                        }
                    });
                }

                // Create Deal Record
                const dealTypeId = await this.getEntityId('deal', workspaceId);
                if (dealTypeId) {
                    const attributes: any = {
                        title: `Deal: ${data.clientName}`,
                        status: data.status,
                        source: data.source || 'Bot',
                        client_requirements: data.request ? { text: data.request } : {},
                        notes: data.payload ? JSON.stringify(data.payload) : undefined,
                        contact_id: contactId
                    };

                    await this.prisma.record.create({
                        data: {
                            id: leadId, // Reuse Lead ID for the Deal Record to maintain 1:1 mapping
                            workspace_id: workspaceId,
                            entity_type_id: dealTypeId,
                            status: 'active',
                            attributes: attributes,
                            created_by: 'dual_write'
                        }
                    });
                }
            }
        } catch (e) {
            console.error('Dual Write Failed (Non-blocking):', e);
        }

        return lead;
    }

    async updatePayload(id: string, payload: any): Promise<Lead> {
        const lead = await this.prisma.lead.update({
            where: { id },
            data: { payload }
        });

        // Dual Update
        try {
            const record = await this.prisma.record.findFirst({ where: { id } }); // We used lead.id as record.id
            if (record) {
                const currentAttrs = record.attributes as any;
                await this.prisma.record.update({
                    where: { workspace_id_id: { workspace_id: record.workspace_id, id } },
                    data: {
                        attributes: { ...currentAttrs, notes: JSON.stringify(payload) },
                        updated_at: new Date()
                    }
                });
            }
        } catch (e) {
            console.error('Dual Update Payload Failed:', e);
        }

        return lead;
    }

    async updateStatus(id: string, status: string): Promise<Lead> {
        const lead = await this.prisma.lead.update({
            where: { id },
            data: { status: status as LeadStatus }
        });

        // Dual Update
        try {
            const record = await this.prisma.record.findFirst({ where: { id } });
            if (record) {
                const currentAttrs = record.attributes as any;
                await this.prisma.record.update({
                    where: { workspace_id_id: { workspace_id: record.workspace_id, id } },
                    data: {
                        attributes: { ...currentAttrs, status: status },
                        updated_at: new Date()
                    }
                });
            }
        } catch (e) {
            console.error('Dual Update Status Failed:', e);
        }

        return lead;
    }

    async updateLead(id: string, data: {
        clientName?: string;
        phone?: string;
        source?: string;
        request?: string;
        status?: LeadStatus;
        payload?: any;
    }): Promise<Lead> {
        const lead = await this.prisma.lead.update({
            where: { id },
            data
        });

        // Dual Write Update
        try {
             // Try to find the associated record (Deal)
             // Strategy: We used lead.id as record.id for the Deal record
             const record = await this.prisma.record.findFirst({
                 where: { id: id }
             });

             if (record) {
                 const currentAttrs = record.attributes as any;
                 const newAttrs = { ...currentAttrs };

                 if (data.clientName) newAttrs.title = `Deal: ${data.clientName}`;
                 if (data.status) newAttrs.status = data.status;
                 if (data.source) newAttrs.source = data.source;
                 if (data.request) newAttrs.client_requirements = { text: data.request };
                 if (data.payload) newAttrs.notes = JSON.stringify(data.payload);

                 await this.prisma.record.update({
                     where: { workspace_id_id: { workspace_id: record.workspace_id, id } },
                     data: {
                         attributes: newAttrs,
                         updated_at: new Date()
                     }
                 });
             }
        } catch (e) {
            console.error('Dual Write Update Failed (Non-blocking):', e);
        }

        return lead;
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
