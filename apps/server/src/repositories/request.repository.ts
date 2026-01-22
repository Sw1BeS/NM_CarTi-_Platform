import { PrismaClient, RequestVariant, B2bRequest, RequestStatus, ChannelPost, MessageLog } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import { generateULID } from '../utils/ulid.js';

export class RequestRepository extends BaseRepository<B2bRequest> {
    constructor(prisma: PrismaClient) {
        super(prisma, 'b2bRequest');
    }

    async findByWorkspace(companyId: string, filters?: {
        status?: RequestStatus;
        skip?: number;
        take?: number;
    }): Promise<B2bRequest[]> {
        return this.prisma.b2bRequest.findMany({
            where: {
                companyId,
                // deleted_at field does not exist on B2bRequest in schema provided
                ...(filters?.status && { status: filters.status })
            },
            include: {
                variants: true
            },
            skip: filters?.skip,
            take: filters?.take,
            orderBy: { createdAt: 'desc' }
        });
    }

    async createRequest(data: {
        title: string;
        budgetMax?: number;
        city?: string;
        companyId?: string;
        chatId?: string;
        description?: string;
        publicId?: string;
    }): Promise<B2bRequest> {
        return this.prisma.b2bRequest.create({
            data: {
                id: generateULID(),
                ...data
            }
        });
    }

    async addVariant(requestId: string, data: {
        title?: string;
        price?: number;
        year?: number;
        mileage?: number;
        sourceUrl?: string;
        thumbnail?: string;
    }): Promise<any> {
        return this.prisma.requestVariant.create({
            data: {
                id: generateULID(),
                requestId,
                ...data,
                status: 'SUBMITTED'
            }
        });
    }

    async findWithVariants(id: string) {
        return this.prisma.b2bRequest.findUnique({
            where: { id },
            include: {
                variants: true // No relation to 'car', just variant data
            }
        });
    }

    async countRequests(): Promise<number> {
        return this.prisma.b2bRequest.count();
    }

    async findAllRequests(params: {
        where?: any;
        orderBy?: any;
        take?: number;
        skip?: number;
    }): Promise<{ items: B2bRequest[]; total: number }> {
        const [total, items] = await Promise.all([
            this.prisma.b2bRequest.count({ where: params.where }),
            this.prisma.b2bRequest.findMany({
                where: params.where,
                orderBy: params.orderBy || { createdAt: 'desc' },
                take: params.take,
                skip: params.skip,
                include: { variants: true }
            })
        ]);
        return { total, items };
    }

    async updateRequest(id: string, data: any): Promise<B2bRequest> {
        return this.prisma.b2bRequest.update({
            where: { id },
            data,
            include: { variants: true }
        });
    }

    async deleteRequest(id: string): Promise<boolean> {
        await this.prisma.b2bRequest.delete({ where: { id } });
        return true;
    }

    async findById(id: string): Promise<B2bRequest | null> {
        return this.prisma.b2bRequest.findUnique({ where: { id } });
    }

    async findChannelPost(requestId: string, channelId?: string): Promise<ChannelPost | null> {
        return this.prisma.channelPost.findFirst({
            where: { requestId, ...(channelId && { channelId }) }
        });
    }

    async createChannelPost(data: any): Promise<ChannelPost> {
        return this.prisma.channelPost.create({ data });
    }

    async updateChannelPost(id: string, data: any): Promise<ChannelPost> {
        return this.prisma.channelPost.update({ where: { id }, data });
    }

    async logMessage(data: any): Promise<MessageLog> {
        return this.prisma.messageLog.create({ data });
    }
}
