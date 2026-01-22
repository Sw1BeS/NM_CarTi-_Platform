import { PrismaClient, BotConfig } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import { generateULID } from '../utils/ulid.js'; // Assuming generateULID is in this path

export class BotRepository extends BaseRepository<BotConfig> {
    constructor(prisma: PrismaClient) {
        super(prisma, 'botConfig');
    }

    async findAllActive(): Promise<BotConfig[]> {
        return this.prisma.botConfig.findMany({
            where: { isEnabled: true },
            include: {
                // scenarios: true, // Removed as per schema (relation might be different or not needed for active bots list)
                // telegramUpdates: true // optional
            }
        });
    }

    async findByToken(token: string): Promise<BotConfig | null> {
        return this.prisma.botConfig.findFirst({
            where: { token }
        });
    }

    async findWithScenarios(id: string) {
        // Scenarios are workspace level, not direct relation on BotConfig in this schema version
        // If needed, we must fetch by companyId separately or adjust schema
        // For now, removing invalid include to fix build
        return this.prisma.botConfig.findUnique({
            where: { id }
        });
    }

    async createBot(data: {
        name: string;
        token: string;
        companyId: string;
        isEnabled?: boolean;
    }): Promise<BotConfig> {
        return this.prisma.botConfig.create({
            data: {
                id: generateULID(),
                name: data.name,
                token: data.token,
                companyId: data.companyId,
                isEnabled: data.isEnabled ?? true,
                template: 'CLIENT_LEAD', // Default template
                deliveryMode: 'POLLING' // Default mode
            }
        });
    }

    async updateBotStatus(id: string, isEnabled: boolean): Promise<BotConfig> {
        return this.prisma.botConfig.update({
            where: { id },
            data: { isEnabled }
        });
    }

    async countBots(): Promise<number> {
        return this.prisma.botConfig.count();
    }
}
