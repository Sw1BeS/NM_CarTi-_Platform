import { PrismaClient, GlobalUser } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import { generateULID } from '../utils/ulid.js';

export class UserRepository extends BaseRepository<GlobalUser> {
    constructor(prisma: PrismaClient) {
        super(prisma, 'globalUser');
    }

    async findByEmail(email: string): Promise<GlobalUser | null> {
        return this.prisma.globalUser.findFirst({
            where: { email, deleted_at: null }
        });
    }

    async findByIdWithMemberships(id: string) {
        return this.prisma.globalUser.findUnique({
            where: { id },
            include: {
                memberships: {
                    where: { deleted_at: null },
                    include: { workspace: true }
                }
            }
        });
    }

    async createUser(data: { email: string; password_hash: string; name?: string }): Promise<GlobalUser> {
        return this.prisma.globalUser.create({
            data: {
                id: generateULID(),
                ...data
            }
        });
    }

    async updatePassword(id: string, password_hash: string): Promise<GlobalUser> {
        return this.prisma.globalUser.update({
            where: { id },
            data: { password_hash }
        });
    }

    async findAllActive(): Promise<GlobalUser[]> {
        return this.prisma.globalUser.findMany({
            where: { deleted_at: null }
        });
    }

    async countUsers(): Promise<number> {
        return this.prisma.globalUser.count({ where: { deleted_at: null } });
    }

    async updateUser(id: string, data: Partial<GlobalUser>): Promise<GlobalUser> {
        return this.prisma.globalUser.update({
            where: { id },
            data
        });
    }
}
