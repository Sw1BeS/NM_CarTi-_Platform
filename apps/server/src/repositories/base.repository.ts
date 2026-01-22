import { PrismaClient } from '@prisma/client';

/**
 * Base Repository Pattern
 * 
 * Provides common CRUD operations and Prisma access abstraction.
 * All repositories should extend this base class.
 */
export abstract class BaseRepository<T> {
    protected prisma: PrismaClient;
    protected modelName: string;

    constructor(prisma: PrismaClient, modelName: string) {
        this.prisma = prisma;
        this.modelName = modelName;
    }

    /**
     * Find record by ID
     */
    async findById(id: string): Promise<T | null> {
        return (this.prisma as any)[this.modelName].findUnique({
            where: { id }
        });
    }

    /**
     * Find all records (with optional filtering)
     */
    async findAll(where: any = {}): Promise<T[]> {
        return (this.prisma as any)[this.modelName].findMany({ where });
    }

    /**
     * Create new record
     */
    async create(data: any): Promise<T> {
        return (this.prisma as any)[this.modelName].create({ data });
    }

    /**
     * Update record by ID
     */
    async update(id: string, data: any): Promise<T> {
        return (this.prisma as any)[this.modelName].update({
            where: { id },
            data
        });
    }

    /**
     * Delete record by ID (soft delete if deleted_at exists)
     */
    async delete(id: string): Promise<T> {
        // Check if model has deleted_at field
        const hasDeletedAt = await this.checkField('deleted_at');

        if (hasDeletedAt) {
            return (this.prisma as any)[this.modelName].update({
                where: { id },
                data: { deleted_at: new Date() }
            });
        } else {
            return (this.prisma as any)[this.modelName].delete({
                where: { id }
            });
        }
    }

    /**
     * Count records
     */
    async count(where: any = {}): Promise<number> {
        return (this.prisma as any)[this.modelName].count({ where });
    }

    /**
     * Check if field exists in model schema
     */
    private async checkField(fieldName: string): Promise<boolean> {
        try {
            const sample = await (this.prisma as any)[this.modelName].findFirst();
            return sample && fieldName in sample;
        } catch {
            return false;
        }
    }
}
