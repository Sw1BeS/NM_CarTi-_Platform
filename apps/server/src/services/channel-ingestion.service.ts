import { DraftSource, type ChannelSource, type CarListing } from '@prisma/client';
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
    mediaItems?: MediaItem[];
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
    specs?: Record<string, unknown>;
    description?: string;
}

export interface IngestionResult {
    created: boolean;
    entity: 'CAR' | 'DRAFT' | null;
    reason?: string;
}

export type MediaItem = {
    url?: string;
    previewUrl?: string;
    tgFileId?: string;
    source?: string;
};

const carRepo = new CarRepository(prisma);
const draftRepo = new DraftRepository(prisma);

const isNonEmptyString = (value?: string | null) => !!value && value.trim().length > 0;

const isMeaningfulNumber = (value?: number | null) => typeof value === 'number' && value > 0;

const isMeaningfulYear = (value?: number | null) =>
    typeof value === 'number' && value >= 1900 && value <= new Date().getFullYear() + 1;

const isRealUrl = (value?: string | null) => typeof value === 'string' && /^https?:\/\//.test(value);

const mergeSpecs = (current?: Record<string, unknown> | null, incoming?: Record<string, unknown> | null) => {
    const result: Record<string, unknown> = { ...(current || {}) };
    if (incoming) {
        for (const [key, value] of Object.entries(incoming)) {
            if (result[key] === undefined) result[key] = value;
        }
    }
    return Object.keys(result).length ? result : undefined;
};

const buildSourceMeta = (message: NormalizedChannelMessage, sourceLabel: string, botId?: string | null, channelSource?: ChannelSource | null) => ({
    sourceType: message.sourceType,
    sourceLabel,
    messageId: message.messageId,
    chatId: message.chatId,
    receivedAt: new Date().toISOString(),
    botId: botId || undefined,
    channelSourceId: channelSource?.id
});

const mergeOriginalRaw = (existingRaw: unknown, message: NormalizedChannelMessage, sourceMeta: Record<string, unknown>) => {
    const base = (existingRaw && typeof existingRaw === 'object' && !Array.isArray(existingRaw))
        ? (existingRaw as Record<string, unknown>)
        : {};
    const existingSources = Array.isArray(base.sources) ? base.sources as Record<string, unknown>[] : [];
    const nextSources = [
        ...existingSources.filter((entry) => entry.sourceType !== sourceMeta.sourceType || entry.sourceLabel !== sourceMeta.sourceLabel),
        sourceMeta
    ];
    return {
        ...base,
        sources: nextSources,
        lastMessage: {
            text: message.text,
            date: message.date,
            sourceUrl: message.sourceUrl
        }
    };
};

const mergeMedia = (existing: CarListing, incoming: { mediaUrls: string[]; mediaItems: MediaItem[]; thumbnail?: string }) => {
    const existingUrls = existing.mediaUrls || [];
    const existingItems = Array.isArray(existing.mediaItems) ? existing.mediaItems as MediaItem[] : [];
    const incomingUrls = incoming.mediaUrls || [];
    const incomingItems = incoming.mediaItems || [];

    const existingHasReal = existingUrls.some((url) => isRealUrl(url));
    const incomingHasReal = incomingUrls.some((url) => isRealUrl(url));

    const baseUrls = existingHasReal || !incomingHasReal ? existingUrls : incomingUrls;
    const baseItems = existingHasReal || !incomingHasReal ? existingItems : incomingItems;

    const mergedUrls = Array.from(new Set([...baseUrls, ...incomingUrls].filter(Boolean)));
    const mergedItems = Array.from(new Map(
        [...baseItems, ...incomingItems].map((item) => [
            item.url || item.previewUrl || item.tgFileId || JSON.stringify(item),
            item
        ])
    ).values());

    const thumbnail = incoming.thumbnail && (!existing.thumbnail || !isRealUrl(existing.thumbnail))
        ? incoming.thumbnail
        : existing.thumbnail || incoming.thumbnail;

    return {
        mediaUrls: mergedUrls,
        mediaItems: mergedItems,
        thumbnail
    };
};

export class ChannelIngestionService {
    normalizeMessage(input: Omit<NormalizedChannelMessage, 'text' | 'mediaUrls' | 'sourceType'> & {
        text?: string | null;
        mediaUrls?: string[];
        mediaItems?: MediaItem[];
        sourceType: 'MTPROTO' | 'BOTAPI';
    }): NormalizedChannelMessage {
        return {
            chatId: String(input.chatId),
            messageId: Number(input.messageId),
            text: String(input.text || ''),
            date: input.date,
            mediaUrls: input.mediaUrls || [],
            mediaItems: input.mediaItems || [],
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
        const mediaItems = (message.mediaItems && message.mediaItems.length)
            ? message.mediaItems
            : (message.mediaUrls || []).map((url) => ({ url }));
        const mediaUrls = mediaItems.map((item) => item.url || item.previewUrl).filter(Boolean) as string[];
        return {
            thumbnail: mediaUrls.length ? mediaUrls[0] : undefined,
            mediaUrls,
            mediaItems
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
                    sourceType: message.sourceType,
                    mediaItems: message.mediaItems || []
                }
            });

            return { created: true, entity: 'DRAFT' };
        }

        if (message.mediaGroupKey) {
            const existingGroup = await prisma.carListing.findFirst({
                where: {
                    sourceChatId: message.chatId,
                    mediaGroupKey: message.mediaGroupKey
                }
            });
            if (existingGroup) {
                const media = this.attachMediaRefs(message);
                const mergedMedia = mergeMedia(existingGroup, media);
                await carRepo.updateCar(existingGroup.id, mergedMedia);
                return { created: false, entity: 'CAR', reason: 'MEDIA_GROUP_APPEND' };
            }
        }

        const existing = await prisma.carListing.findFirst({
            where: {
                sourceChatId: message.chatId,
                sourceMessageId: message.messageId
            }
        });
        if (existing) {
            const sourceMeta = buildSourceMeta(message, sourceLabel, botId, channelSource);
            const media = this.attachMediaRefs(message);
            const mergedMedia = mergeMedia(existing, media);
            const updates: Partial<CarListing> = {
                sourceUrl: isNonEmptyString(existing.sourceUrl) ? existing.sourceUrl : message.sourceUrl,
                description: isNonEmptyString(existing.description) ? existing.description : (transformedData.description || message.text),
                location: isNonEmptyString(existing.location) ? existing.location : transformedData.location,
                currency: isNonEmptyString(existing.currency) ? existing.currency : (transformedData.currency || 'USD'),
                specs: mergeSpecs(existing.specs as Record<string, unknown> | null, transformedData.specs),
                originalRaw: mergeOriginalRaw(existing.originalRaw, message, sourceMeta),
                ...mergedMedia
            };

            if (!isNonEmptyString(existing.title)) updates.title = transformedData.title;
            if (!isMeaningfulNumber(existing.price)) updates.price = transformedData.price || existing.price;
            if (!isMeaningfulYear(existing.year)) updates.year = transformedData.year || existing.year;
            if (!isMeaningfulNumber(existing.mileage)) updates.mileage = transformedData.mileage || existing.mileage;

            await carRepo.updateCar(existing.id, updates);
            return { created: false, entity: 'CAR', reason: 'MERGED' };
        }

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

        const sourceMeta = buildSourceMeta(message, sourceLabel, botId, channelSource);
        try {
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
                mediaItems: media.mediaItems,
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
                    botId,
                    sources: [sourceMeta]
                },
                postedAt: message.date
            });
        } catch (e) {
            const err = e as { code?: string };
            if (err?.code !== 'P2002') throw e;
            const duplicate = await prisma.carListing.findFirst({
                where: { sourceChatId: message.chatId, sourceMessageId: message.messageId }
            });
            if (!duplicate) throw e;
            const mergedMedia = mergeMedia(duplicate, media);
            await carRepo.updateCar(duplicate.id, {
                ...mergedMedia,
                originalRaw: mergeOriginalRaw(duplicate.originalRaw, message, sourceMeta)
            });
            return { created: false, entity: 'CAR', reason: 'MERGED' };
        }

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

        const specs: Record<string, unknown> = {};
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
