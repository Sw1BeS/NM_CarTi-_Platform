import { DraftSource, type ChannelSource, type CarListing, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { CarRepository } from '../repositories/car.repository.js';
import { DraftRepository } from '../repositories/draft.repository.js';
import { logger } from '../utils/logger.js';
import {
    deriveVehicleAvailabilityState,
    deriveVehiclePublicationStatus
} from './vehicleState.service.js';

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
    tgMeta?: Record<string, string | number | null>;
};

import { normalizeCurrency, normalizeNumber, parseCarData } from './enhanced-parsing.utils.js';

const carRepo = new CarRepository(prisma);
const draftRepo = new DraftRepository(prisma);

const isNonEmptyString = (value?: string | null) => !!value && value.trim().length > 0;
const isMeaningfulNumber = (value?: number | null) => typeof value === 'number' && value > 0;
const isMeaningfulYear = (value?: number | null) =>
    typeof value === 'number' && value >= 1900 && value <= new Date().getFullYear() + 1;
const isRealUrl = (value?: string | null) => typeof value === 'string' && /^https?:\/\//.test(value);

// Legacy helpers removed in favor of enhanced-parsing.utils.ts
// parsePriceFromText replaced


const normalizeMediaItem = (item: MediaItem): Prisma.InputJsonObject => {
    const normalized: Record<string, Prisma.InputJsonValue> = {};
    if (item.url) normalized.url = item.url;
    if (item.previewUrl) normalized.previewUrl = item.previewUrl;
    if (item.tgFileId) normalized.tgFileId = item.tgFileId;
    if (item.source) normalized.source = item.source;
    if (item.tgMeta) normalized.tgMeta = item.tgMeta as Prisma.InputJsonObject;
    return normalized;
};

const mergeSpecs = (
    current?: Prisma.JsonValue | null,
    incoming?: Record<string, unknown> | null
): Prisma.JsonObject | undefined => {
    const result: Prisma.JsonObject = {};
    if (current && typeof current === 'object' && !Array.isArray(current)) {
        Object.assign(result, current as Prisma.JsonObject);
    }
    if (incoming) {
        for (const [key, value] of Object.entries(incoming)) {
            if (result[key] === undefined && value !== undefined) {
                result[key] = value as Prisma.JsonValue;
            }
        }
    }
    return Object.keys(result).length ? result : undefined;
};

const buildSourceMeta = (
    message: NormalizedChannelMessage,
    sourceLabel: string,
    botId?: string | null,
    channelSource?: ChannelSource | null
): Prisma.JsonObject => ({
    sourceType: message.sourceType,
    sourceLabel,
    messageId: message.messageId,
    chatId: message.chatId,
    receivedAt: new Date().toISOString(),
    botId: botId || undefined,
    channelSourceId: channelSource?.id
});

const isJsonObject = (value: unknown): value is Prisma.JsonObject =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const mergeOriginalRaw = (
    existingRaw: unknown,
    message: NormalizedChannelMessage,
    sourceMeta: Prisma.JsonObject
): Prisma.JsonObject => {
    const base = isJsonObject(existingRaw) ? (existingRaw as Prisma.JsonObject) : {};
    const existingSources = Array.isArray(base.sources) ? (base.sources as Prisma.JsonValue[]) : [];
    const nextSources = [
        ...existingSources.filter((entry) => {
            if (!isJsonObject(entry)) return false;
            return entry.sourceType !== sourceMeta.sourceType || entry.sourceLabel !== sourceMeta.sourceLabel;
        }),
        sourceMeta
    ];
    return {
        ...base,
        sources: nextSources,
        lastMessage: {
            text: message.text,
            date: message.date.toISOString(),
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
        mediaItems: mergedItems.map(normalizeMediaItem) as Prisma.InputJsonValue,
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
            : (message.mediaUrls || []).map((url): MediaItem => ({ url }));
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
            type UpdatePayload = Parameters<typeof carRepo.updateCar>[1];
            const updates: UpdatePayload = {
                sourceUrl: isNonEmptyString(existing.sourceUrl) ? existing.sourceUrl : message.sourceUrl,
                description: isNonEmptyString(existing.description) ? existing.description : (transformedData.description || message.text),
                location: isNonEmptyString(existing.location) ? existing.location : transformedData.location,
                currency: isNonEmptyString(existing.currency) ? existing.currency : (transformedData.currency || 'USD'),
                specs: mergeSpecs(existing.specs as Prisma.JsonValue | null, transformedData.specs) as Prisma.InputJsonValue | undefined,
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
        const normalizedMediaItems = media.mediaItems.map(normalizeMediaItem) as Prisma.InputJsonValue;
        const autoPublish = (channelSource?.importRules as any)?.autoPublish;
        const status = autoPublish ? 'AVAILABLE' : 'PENDING';
        const availabilityState = deriveVehicleAvailabilityState({
            status: autoPublish ? 'AVAILABLE' : undefined,
            title: transformedData.title,
            description: transformedData.description || message.text,
            specs: transformedData.specs
        });
        const publicationStatus = deriveVehiclePublicationStatus({ status, autoPublish });

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
                mediaItems: normalizedMediaItems,
                specs: (transformedData.specs as Prisma.InputJsonValue | undefined),
                description: transformedData.description || message.text,
                status,
                availabilityState,
                publicationStatus,
                companyId,
                sourceChatId: message.chatId,
                sourceMessageId: message.messageId,
                mediaGroupKey: message.mediaGroupKey,
                originalRaw: {
                    text: message.text,
                    channelTitle: message.channelTitle,
                    date: message.date.toISOString(),
                    sourceType: message.sourceType,
                    botId: botId || undefined,
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

        const parsed = parseCarData(text);
        const description = text;
        const lines = String(text).split('\n').map(line => line.trim()).filter(Boolean);
        const firstLine = lines[0] || '';

        const brand = typeof parsed.brand === 'string' ? parsed.brand : undefined;
        const model = typeof parsed.model === 'string' ? parsed.model : undefined;

        const fallbackTitle = `${brand || ''} ${model || ''}`.trim() || parsed.title || firstLine;
        const title = fallbackTitle || `Car ${parsed.year || ''} ${parsed.price ? `${parsed.price}${parsed.currency || ''}` : ''}`.trim() || 'Unknown Car';

        const specs: Record<string, unknown> = {
            ...(parsed || {})
        };
        delete specs.title;
        delete specs.brand;
        delete specs.model;
        delete specs.price;
        delete specs.currency;
        delete specs.year;
        delete specs.mileage;
        delete specs.location;

        return {
            title,
            price: parsed.price,
            currency: parsed.currency || 'USD',
            year: parsed.year,
            mileage: parsed.mileage,
            location: parsed.location,
            brand,
            model,
            specs,
            description
        };
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
