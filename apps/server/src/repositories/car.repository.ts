import { PrismaClient, CarListing, Prisma, VehicleAvailabilityState, VehiclePublicationStatus } from '@prisma/client';
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
        sourceUrl?: string | null;
        location?: string | null;
        thumbnail?: string | null;
        mediaUrls?: string[];
        specs?: Prisma.InputJsonValue;
        description?: string | null;
        status?: string;
        availabilityState?: VehicleAvailabilityState;
        publicationStatus?: VehiclePublicationStatus;
        companyId?: string;
        partnerCompanyId?: string;
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
                availabilityState: data.availabilityState || 'IN_STOCK',
                publicationStatus: data.publicationStatus || 'PUBLISHED',
                sourceUrl: data.sourceUrl,
                location: data.location,
                thumbnail: data.thumbnail,
                mediaUrls: data.mediaUrls || [],
                specs: data.specs ?? undefined,
                description: data.description ?? undefined,
                companyId: data.companyId,
                partnerCompanyId: data.partnerCompanyId
            }
        });
    }

    async createFromChannelMessage(data: {
        source: string;
        sourceUrl?: string | null;
        title: string;
        price: number;
        currency?: string;
        year: number;
        mileage: number;
        location?: string | null;
        thumbnail?: string | null;
        mediaUrls?: string[];
        mediaItems?: Prisma.InputJsonValue;
        specs?: Prisma.InputJsonValue;
        description?: string | null;
        status?: string;
        availabilityState?: VehicleAvailabilityState;
        publicationStatus?: VehiclePublicationStatus;
        companyId?: string | null;
        sourceChatId: string;
        sourceMessageId: number;
        mediaGroupKey?: string | null;
        originalRaw?: Prisma.InputJsonValue;
        postedAt?: Date;
    }): Promise<CarListing> {
        const carId = `car_${generateULID()}`;

        return this.prisma.carListing.create({
            data: {
                id: carId,
                source: data.source,
                sourceUrl: data.sourceUrl,
                title: data.title,
                price: data.price,
                currency: data.currency || 'USD',
                year: data.year,
                mileage: data.mileage,
                location: data.location || undefined,
                thumbnail: data.thumbnail || undefined,
                mediaUrls: data.mediaUrls || [],
                mediaItems: data.mediaItems ?? undefined,
                specs: data.specs ?? undefined,
                description: data.description ?? undefined,
                status: data.status || 'AVAILABLE',
                availabilityState: data.availabilityState || 'IN_STOCK',
                publicationStatus: data.publicationStatus || 'PUBLISHED',
                companyId: data.companyId || undefined,
                sourceChatId: data.sourceChatId,
                sourceMessageId: data.sourceMessageId,
                mediaGroupKey: data.mediaGroupKey || undefined,
                originalRaw: data.originalRaw,
                postedAt: data.postedAt || new Date()
            }
        });
    }

    async findCars(filters: {
        companyId?: string;
        partnerCompanyId?: string;
        status?: string;
        availabilityState?: VehicleAvailabilityState;
        publicationStatus?: VehiclePublicationStatus;
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
        if (filters.partnerCompanyId) where.partnerCompanyId = filters.partnerCompanyId;
        if (filters.status && filters.status !== 'ALL') where.status = filters.status;
        if (filters.availabilityState) {
            where.availabilityState = filters.availabilityState;
        }
        if (filters.publicationStatus) {
            where.publicationStatus = filters.publicationStatus;
        }

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
        sourceUrl?: string | null;
        location?: string | null;
        thumbnail?: string | null;
        mediaUrls?: string[];
        mediaItems?: Prisma.InputJsonValue;
        specs?: Prisma.InputJsonValue;
        description?: string | null;
        status?: string;
        availabilityState?: VehicleAvailabilityState;
        publicationStatus?: VehiclePublicationStatus;
        currency?: string;
        companyId?: string;
        partnerCompanyId?: string;
        originalRaw?: Prisma.InputJsonValue;
        postedAt?: Date;
    }>): Promise<CarListing> {
        return this.prisma.carListing.update({
            where: { id },
            data: data as Prisma.CarListingUncheckedUpdateInput
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
