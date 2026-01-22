import { PrismaClient, CarListing } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import { generateULID } from '../utils/ulid.js';

export class CarRepository extends BaseRepository<CarListing> {
    constructor(prisma: PrismaClient) {
        super(prisma, 'carListing');
    }

    async createCar(data: {
        title: string;
        price: number;
        year: number;
        mileage: number;
        source?: string;
        sourceUrl?: string;
        location?: string;
        thumbnail?: string;
        mediaUrls?: string[];
        specs?: any;
        description?: string;
        status?: string;
        companyId?: string;
        currency?: string;
    }): Promise<CarListing> {
        const carId = `car_${generateULID()}`;

        return this.prisma.carListing.create({
            data: {
                id: carId,
                source: data.source || 'MANUAL',
                title: data.title,
                price: data.price,
                year: data.year,
                mileage: data.mileage,
                currency: data.currency || 'USD',
                status: data.status || 'AVAILABLE',
                sourceUrl: data.sourceUrl,
                location: data.location,
                thumbnail: data.thumbnail,
                mediaUrls: data.mediaUrls || [],
                specs: data.specs,
                description: data.description,
                companyId: data.companyId
            }
        });
    }

    async findCars(filters: {
        companyId?: string;
        status?: string;
        priceMin?: number;
        priceMax?: number;
        yearMin?: number;
        yearMax?: number;
        search?: string;
        skip?: number;
        take?: number;
    }): Promise<{ items: CarListing[]; total: number }> {
        const where: any = {};

        if (filters.companyId) where.companyId = filters.companyId;
        if (filters.status && filters.status !== 'ALL') where.status = filters.status;

        if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
            where.price = {};
            if (filters.priceMin !== undefined) where.price.gte = filters.priceMin;
            if (filters.priceMax !== undefined) where.price.lte = filters.priceMax;
        }

        if (filters.yearMin !== undefined || filters.yearMax !== undefined) {
            where.year = {};
            if (filters.yearMin !== undefined) where.year.gte = filters.yearMin;
            if (filters.yearMax !== undefined) where.year.lte = filters.yearMax;
        }

        if (filters.search) {
            where.OR = [
                { title: { contains: filters.search, mode: 'insensitive' } },
                { location: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } }
            ];
        }

        const [total, items] = await Promise.all([
            this.prisma.carListing.count({ where }),
            this.prisma.carListing.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: filters.skip,
                take: filters.take
            })
        ]);

        return { items, total };
    }

    async updateCar(id: string, data: Partial<{
        title?: string;
        price?: number;
        year?: number;
        mileage?: number;
        source?: string;
        sourceUrl?: string;
        location?: string;
        thumbnail?: string;
        mediaUrls?: string[];
        specs?: any;
        description?: string;
        status?: string;
        currency?: string;
        companyId?: string;
    }>): Promise<CarListing> {
        return this.prisma.carListing.update({
            where: { id },
            data
        });
    }

    async deleteCar(id: string): Promise<boolean> {
        await this.prisma.carListing.delete({ where: { id } });
        return true;
    }

    async findById(id: string): Promise<CarListing | null> {
        return this.prisma.carListing.findUnique({ where: { id } });
    }

    async countCars(companyId?: string): Promise<number> {
        return this.prisma.carListing.count({
            where: companyId ? { companyId } : undefined
        });
    }
}
