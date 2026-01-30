import { PrismaClient, TelegramDestination } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class TelegramDestinationRepository extends BaseRepository<TelegramDestination> {
    constructor(prisma: PrismaClient) {
        super(prisma, 'telegramDestination');
    }
}
