import { PrismaClient, Draft } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class DraftRepository extends BaseRepository<Draft> {
    constructor(prisma: PrismaClient) {
        super(prisma, 'draft');
    }
}
