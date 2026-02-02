import { PrismaClient, TelegramDestination, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import { generateULID } from '../utils/ulid.js';

export class TelegramDestinationRepository extends BaseRepository<TelegramDestination> {
    constructor(prisma: PrismaClient) {
        super(prisma, 'telegramDestination');
    }

    async upsertDestination(data: {
        companyId: string;
        tgId: string;
        access: string;
        type: string;
        title: string;
        username?: string;
        role: string;
        status?: string;
        connectorId?: string;
        botId?: string;
    }): Promise<TelegramDestination> {
        const { companyId, tgId, access, ...rest } = data;

        return this.prisma.telegramDestination.upsert({
            where: {
                companyId_tgId_access: {
                    companyId,
                    tgId,
                    access
                }
            },
            update: {
                ...rest,
                updatedAt: new Date()
            },
            create: {
                id: generateULID(),
                companyId,
                tgId,
                access,
                ...rest
            }
        });
    }

    async findByCompany(companyId: string, filters?: {
        role?: string;
        status?: string;
        access?: string;
    }): Promise<TelegramDestination[]> {
        const where: Prisma.TelegramDestinationWhereInput = {
            companyId,
            ...(filters?.role && { role: filters.role }),
            ...(filters?.status && { status: filters.status }),
            ...(filters?.access && { access: filters.access })
        };

        return this.prisma.telegramDestination.findMany({
            where,
            orderBy: { updatedAt: 'desc' }
        });
    }

    async updateStatus(id: string, status: string): Promise<TelegramDestination> {
        return this.prisma.telegramDestination.update({
            where: { id },
            data: { status }
        });
    }
}
