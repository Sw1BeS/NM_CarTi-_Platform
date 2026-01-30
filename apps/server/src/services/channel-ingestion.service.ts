import { DraftSource, type ChannelSource } from '@prisma/client';
import { prisma } from './prisma.js';
import { CarRepository } from '../repositories/car.repository.js';
import { DraftRepository } from '../repositories/draft.repository.js';
import { logger } from '../utils/logger.js';

export type IngestionMode = 'INVENTORY' | 'DRAFT_ONLY';

export interface NormalizedChannelMessage {
    chatId: string;
    messageId: number;
    text: string;
    date: Date;
    mediaUrls: string[];
    mediaGroupKey?: string;
    channelTitle?: string;
    sourceUrl?: string;
    sourceType: 'MTPROTO' | 'BOTAPI';
}

export interface CarData {
    title: string;
    price?: number;
    currency?: string;
    year?: number;
    mileage?: number;
    location?: string;
    brand?: string;
    model?: string;
    specs?: Record<string, any>;
    description?: string;
}

export interface IngestionResult {
    created: boolean;
    entity: 'CAR' | 'DRAFT' | null;
    reason?: string;
}

const carRepo = new CarRepository(prisma);
const draftRepo = new DraftRepository(prisma);

export class ChannelIngestionService {
    normalizeMessage(input: Omit<NormalizedChannelMessage, 'text' | 'mediaUrls' | 'sourceType'> & {
        text?: string | null;
        mediaUrls?: string[];
        sourceType: 'MTPROTO' | 'BOTAPI';
    }): NormalizedChannelMessage {
        return {
            chatId: String(input.chatId),
            messageId: Number(input.messageId),
            text: String(input.text || ''),
            date: input.date,
            mediaUrls: input.mediaUrls || [],
            mediaGroupKey: input.mediaGroupKey,
            channelTitle: input.channelTitle,
            sourceUrl: input.sourceUrl,
            sourceType: input.sourceType
        };
    }

    applyRules(text: string, rules: any, options?: { requireSignals?: boolean }) {
        const carData = this.extractCarData(text);
        if (!carData) {
            return { shouldImport: false, transformedData: null, reason: 'NO_CAR_DATA' };
        }

        if (options?.requireSignals) {
            const hasSignals = !!(carData.price || carData.year || carData.mileage);
            if (!hasSignals) {
                return { shouldImport: false, transformedData: carData, reason: 'NO_SIGNALS' };
            }
        }

        const { shouldImport, transformedData } = this.applyImportRules(carData, rules);
        return { shouldImport, transformedData, reason: shouldImport ? undefined : 'FILTERED' };
    }

    attachMediaRefs(message: NormalizedChannelMessage) {
        const mediaUrls = message.mediaUrls || [];
        return {
            thumbnail: mediaUrls.length ? mediaUrls[0] : undefined,
            mediaUrls
        };
    }

    async upsertCarListingOrDraft(params: {
        message: NormalizedChannelMessage;
        mode: IngestionMode;
        channelSource?: ChannelSource | null;
        companyId?: string | null;
        botId?: string | null;
        sourceLabel: string;
        requireSignals?: boolean;
    }): Promise<IngestionResult> {
        const { message, mode, channelSource, botId, sourceLabel } = params;
        const rules = channelSource?.importRules || {};

        const { shouldImport, transformedData, reason } = this.applyRules(message.text, rules, { requireSignals: params.requireSignals });
        if (!shouldImport || !transformedData) {
            return { created: false, entity: null, reason: reason || 'SKIPPED' };
        }

        if (mode === 'DRAFT_ONLY') {
            const existing = await prisma.draft.findFirst({
                where: {
                    sourceChatId: message.chatId,
                    sourceMessageId: message.messageId
                }
            });
            if (existing) return { created: false, entity: 'DRAFT', reason: 'DUPLICATE' };

            await draftRepo.create({
                source: DraftSource.MANUAL,
                title: transformedData.title,
                price: transformedData.price ? String(transformedData.price) : undefined,
                url: message.sourceUrl,
                description: transformedData.description || message.text,
                status: 'PENDING',
                destination: message.chatId,
                botId: botId ? String(botId) : null,
                sourceChatId: message.chatId,
                sourceMessageId: message.messageId,
                mediaGroupKey: message.mediaGroupKey,
                metadata: {
                    channelTitle: message.channelTitle,
                    channelSourceId: channelSource?.id,
                    sourceType: message.sourceType
                }
            });

            return { created: true, entity: 'DRAFT' };
        }

        const existing = await prisma.carListing.findFirst({
            where: {
                sourceChatId: message.chatId,
                sourceMessageId: message.messageId
            }
        });
        if (existing) return { created: false, entity: 'CAR', reason: 'DUPLICATE' };

        let companyId = params.companyId || null;
        if (!companyId && channelSource) {
            const connector = await prisma.mTProtoConnector.findUnique({
                where: { id: channelSource.connectorId },
                select: { companyId: true }
            });
            companyId = connector?.companyId || null;
        }

        if (!companyId) {
            logger.error('[ChannelIngestion] Missing companyId for inventory import');
            return { created: false, entity: 'CAR', reason: 'NO_COMPANY' };
        }

        const media = this.attachMediaRefs(message);
        const autoPublish = (channelSource?.importRules as any)?.autoPublish;
        const status = autoPublish ? 'AVAILABLE' : 'PENDING';

        await carRepo.createFromChannelMessage({
            source: sourceLabel,
            sourceUrl: message.sourceUrl,
            title: transformedData.title,
            price: transformedData.price || 0,
            currency: transformedData.currency || 'USD',
            year: transformedData.year || new Date().getFullYear(),
            mileage: transformedData.mileage || 0,
            location: transformedData.location,
            thumbnail: media.thumbnail,
            mediaUrls: media.mediaUrls,
            specs: transformedData.specs,
            description: transformedData.description || message.text,
            status,
            companyId,
            sourceChatId: message.chatId,
            sourceMessageId: message.messageId,
            mediaGroupKey: message.mediaGroupKey,
            originalRaw: {
                text: message.text,
                channelTitle: message.channelTitle,
                date: message.date,
                sourceType: message.sourceType,
                botId
            },
            postedAt: message.date
        });

        return { created: true, entity: 'CAR' };
    }

    private extractCarData(text: string): CarData | null {
        if (!text) return null;

        const data: CarData = {
            title: '',
            currency: 'USD',
            description: text
        };

        const brandModelMatch = text.match(/(BMW|Mercedes|Audi|VW|Volkswagen|Toyota|Lexus|Nissan|Hyundai|Kia|Porsche)\s*([A-Z0-9\-\s]+)/i);
        if (brandModelMatch) {
            data.brand = brandModelMatch[1];
            data.model = brandModelMatch[2].trim();
            data.title = `${data.brand} ${data.model}`;
        }

        const yearMatch = text.match(/(\d{4})\s*(год|г|year|yr)?/i);
        if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            if (year >= 1990 && year <= new Date().getFullYear() + 1) {
                data.year = year;
            }
        }

        const priceMatch = text.match(/[\$€]?\s*(\d+[\s,]?\d*)\s*k?[\$€]?/i);
        if (priceMatch) {
            let priceStr = priceMatch[1].replace(/[\s,]/g, '');
            let price = parseInt(priceStr);

            if (text.toLowerCase().includes('k')) {
                price = price * 1000;
            }
            data.price = price;
        }

        const mileageMatch = text.match(/(\d+[\s,]?\d*)\s*k?\s*(км|km|miles)/i);
        if (mileageMatch) {
            let mileageStr = mileageMatch[1].replace(/[\s,]/g, '');
            let mileage = parseInt(mileageStr);

            if (text.toLowerCase().includes('k')) {
                mileage = mileage * 1000;
            }
            data.mileage = mileage;
        }

        const locationMatch = text.match(/(Kyiv|Київ|Киев|Lviv|Львів|Львов|Odesa|Одесса|Dnipro|Днепр)/i);
        if (locationMatch) {
            data.location = locationMatch[1];
        }

        const specs: Record<string, any> = {};
        if (text.match(/diesel|дизель/i)) specs.fuel = 'diesel';
        else if (text.match(/petrol|бензин|gasoline/i)) specs.fuel = 'petrol';
        else if (text.match(/electric|електро|электро/i)) specs.fuel = 'electric';

        if (text.match(/automatic|автомат/i)) specs.transmission = 'automatic';
        else if (text.match(/manual|механика/i)) specs.transmission = 'manual';

        if (Object.keys(specs).length > 0) {
            data.specs = specs;
        }

        if (!data.title) {
            data.title = text.slice(0, 100).trim();
        }

        return data;
    }

    private applyImportRules(carData: CarData, rules: any) {
        const transformed = { ...carData };

        if (rules?.minYear && carData.year && carData.year < rules.minYear) {
            return { shouldImport: false, transformedData: carData };
        }

        if (rules?.maxYear && carData.year && carData.year > rules.maxYear) {
            return { shouldImport: false, transformedData: carData };
        }

        if (rules?.minPrice && carData.price && carData.price < rules.minPrice) {
            return { shouldImport: false, transformedData: carData };
        }

        if (rules?.maxPrice && carData.price && carData.price > rules.maxPrice) {
            return { shouldImport: false, transformedData: carData };
        }

        if (rules?.filterKeywords && rules.filterKeywords.length) {
            const searchText = `${carData.brand} ${carData.model} ${carData.title}`.toLowerCase();
            const matches = rules.filterKeywords.some((keyword: string) =>
                searchText.includes(String(keyword).toLowerCase())
            );
            if (!matches) {
                return { shouldImport: false, transformedData: carData };
            }
        }

        if (rules?.mapTo) {
            if (rules.mapTo.brand) transformed.brand = rules.mapTo.brand;
            if (rules.mapTo.location) transformed.location = rules.mapTo.location;
            if (rules.mapTo.currency) transformed.currency = rules.mapTo.currency;
        }

        return { shouldImport: true, transformedData: transformed };
    }
}

export const channelIngestionService = new ChannelIngestionService();
