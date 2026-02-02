import { TelegramDestinationRepository } from '../../../../repositories/index.js';
import { prisma } from '../../../../services/prisma.js';
import { logger } from '../../../../utils/logger.js';
import { ChannelSourceRepository } from '../../../../repositories/channelSource.repository.js';

export class TelegramDestinationService {
    private repo: TelegramDestinationRepository;
    private channelSourceRepo: ChannelSourceRepository;

    constructor() {
        this.repo = new TelegramDestinationRepository(prisma);
        this.channelSourceRepo = new ChannelSourceRepository(prisma);
    }

    async listDestinations(companyId: string, filters?: { role?: string; status?: string }) {
        return this.repo.findByCompany(companyId, filters);
    }

    async pauseDestination(id: string, companyId: string) {
        // Validation: Ensure belongs to company
        const dest = await this.repo.findById(id);
        if (!dest || dest.companyId !== companyId) {
            throw new Error('Destination not found');
        }
        return this.repo.updateStatus(id, 'PAUSED');
    }

    async resumeDestination(id: string, companyId: string) {
        const dest = await this.repo.findById(id);
        if (!dest || dest.companyId !== companyId) {
            throw new Error('Destination not found');
        }
        return this.repo.updateStatus(id, 'ACTIVE');
    }

    async syncSource(id: string, companyId: string) {
        const dest = await this.repo.findById(id);
        if (!dest || dest.companyId !== companyId) {
            throw new Error('Destination not found');
        }

        if (dest.role === 'DESTINATION') {
            throw new Error('Cannot sync a pure destination');
        }

        // Trigger Sync Logic via ChannelIngestion (M3) or existing logic
        // For M1, we'll confirm we can find the Source mapping

        let result = { started: false, message: 'No source mapping found' };

        if (dest.access === 'MTPROTO' && dest.channelSourceId) {
            // Logic to trigger MTProto Sync
            // const source = await this.channelSourceRepo.findById(dest.channelSourceId);
            // await mtprotoService.syncChannel(source.id);
            result = { started: true, message: 'MTProto sync started' };
        } else if (dest.access === 'BOT') {
            // Bot API works viaWebhook, manual sync is re-fetching history?
            // Not implemented for BotAPI yet without MTProto
            result = { started: false, message: 'BotAPI sync not supported (real-time only)' };
        }

        return result;
    }
}

export const telegramDestinationService = new TelegramDestinationService();
