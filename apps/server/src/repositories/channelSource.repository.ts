import { PrismaClient, ChannelSource } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class ChannelSourceRepository extends BaseRepository<ChannelSource> {
    constructor(prisma: PrismaClient) {
        super(prisma, 'channelSource');
    }
}
