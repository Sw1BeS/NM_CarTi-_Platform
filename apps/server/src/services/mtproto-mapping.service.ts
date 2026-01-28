/**
 * MTProto Channel Parsing → Entity Mapping Service
 * 
 * Converts parsed Telegram channel messages into platform entities:
 * - CarListing (inventory)
 * - Draft (content calendar)
 * - B2bRequest (sales)
 * 
 * Applies import rules from ChannelSource configuration.
 */

import { prisma } from './prisma.js';
import type { ChannelSource } from '@prisma/client';

interface TelegramMessage {
    chatId: string;
    messageId: number;
    text?: string;
    date: Date;
    mediaUrls?: string[];
    mediaGroupKey?: string;
}

interface CarData {
    title: string;
    price?: number;
    currency?: string;
    year?: number;
    mileage?: number;
    location?: string;
    brand?: string;
    model?: string;
    specs?: Record<string, any>;
}

/**
 * Extract car data from message text
 * Uses regex patterns to parse common formats
 */
function extractCarData(text: string): CarData | null {
    if (!text) return null;

    const data: CarData = {
        title: '',
        currency: 'USD'
    };

    // Extract brand/model (e.g., "BMW 320d", "Mercedes C200")
    const brandModelMatch = text.match(/(BMW|Mercedes|Audi|VW|Volkswagen|Toyota|Lexus|Nissan|Hyundai|Kia|Porsche)\s*([A-Z0-9\-\s]+)/i);
    if (brandModelMatch) {
        data.brand = brandModelMatch[1];
        data.model = brandModelMatch[2].trim();
        data.title = `${data.brand} ${data.model}`;
    }

    // Extract year (e.g., "2018", "2018 год", "2018г")
    const yearMatch = text.match(/(\d{4})\s*(год|г|year|yr)?/i);
    if (yearMatch) {
        const year = parseInt(yearMatch[1]);
        if (year >= 1990 && year <= new Date().getFullYear() + 1) {
            data.year = year;
        }
    }

    // Extract price (e.g., "$18000", "18000$", "18 000", "18k")
    const priceMatch = text.match(/[\$€]?\s*(\d+[\s,]?\d*)\s*k?[\$€]?/i);
    if (priceMatch) {
        let priceStr = priceMatch[1].replace(/[\s,]/g, '');
        let price = parseInt(priceStr);

        // Handle "k" notation (e.g., "18k" = 18000)
        if (text.toLowerCase().includes('k')) {
            price = price * 1000;
        }

        data.price = price;
    }

    // Extract mileage (e.g., "85000 км", "85k miles")
    const mileageMatch = text.match(/(\d+[\s,]?\d*)\s*k?\s*(км|km|miles)/i);
    if (mileageMatch) {
        let mileageStr = mileageMatch[1].replace(/[\s,]/g, '');
        let mileage = parseInt(mileageStr);

        if (text.toLowerCase().includes('k')) {
            mileage = mileage * 1000;
        }

        data.mileage = mileage;
    }

    // Extract location (e.g., "Kyiv", "Київ", "Львів")
    const locationMatch = text.match(/(Kyiv|Київ|Киев|Lviv|Львів|Львов|Odesa|Одесса|Dnipro|Днепр)/i);
    if (locationMatch) {
        data.location = locationMatch[1];
    }

    // Extract specs (fuel, transmission)
    const specs: Record<string, any> = {};

    if (text.match(/diesel|дизель/i)) specs.fuel = 'diesel';
    else if (text.match(/petrol|бензин|gasoline/i)) specs.fuel = 'petrol';
    else if (text.match(/electric|електро|электро/i)) specs.fuel = 'electric';

    if (text.match(/automatic|автомат/i)) specs.transmission = 'automatic';
    else if (text.match(/manual|механика/i)) specs.transmission = 'manual';

    if (Object.keys(specs).length > 0) {
        data.specs = specs;
    }

    // Fallback title if no brand/model found
    if (!data.title) {
        data.title = text.slice(0, 100).trim();
    }

    return data;
}

/**
 * Check if car matches filter keywords
 */
function matchesKeywords(carData: CarData, keywords: string[]): boolean {
    if (!keywords || keywords.length === 0) return true;

    const searchText = `${carData.brand} ${carData.model} ${carData.title}`.toLowerCase();

    return keywords.some(keyword =>
        searchText.includes(keyword.toLowerCase())
    );
}

/**
 * Apply import rules to filter/transform car data
 */
function applyImportRules(
    carData: CarData,
    rules: any
): { shouldImport: boolean; transformedData: CarData } {
    const transformed = { ...carData };

    // Apply filters
    if (rules.minYear && carData.year && carData.year < rules.minYear) {
        return { shouldImport: false, transformedData: carData };
    }

    if (rules.maxYear && carData.year && carData.year > rules.maxYear) {
        return { shouldImport: false, transformedData: carData };
    }

    if (rules.minPrice && carData.price && carData.price < rules.minPrice) {
        return { shouldImport: false, transformedData: carData };
    }

    if (rules.maxPrice && carData.price && carData.price > rules.maxPrice) {
        return { shouldImport: false, transformedData: carData };
    }

    if (rules.filterKeywords && !matchesKeywords(carData, rules.filterKeywords)) {
        return { shouldImport: false, transformedData: carData };
    }

    // Apply transformations (mapTo overrides)
    if (rules.mapTo) {
        if (rules.mapTo.brand) transformed.brand = rules.mapTo.brand;
        if (rules.mapTo.location) transformed.location = rules.mapTo.location;
        if (rules.mapTo.currency) transformed.currency = rules.mapTo.currency;
    }

    return { shouldImport: true, transformedData: transformed };
}

/**
 * Main processor: parse message and create CarListing
 */
export async function processParsedMessage(
    message: TelegramMessage,
    channelSource: ChannelSource
): Promise<void> {
    try {
        const rules = channelSource.importRules || {};

        // Extract car data from message
        const carData = extractCarData(message.text || '');
        if (!carData) {
            console.log(`[MTProto Mapping] No car data in message ${message.messageId}`);
            return;
        }

        // Apply import rules
        const { shouldImport, transformedData } = applyImportRules(carData, rules);
        if (!shouldImport) {
            console.log(`[MTProto Mapping] Message ${message.messageId} filtered out by rules`);
            return;
        }

        // Get workspace ID via connector
        const connector = await prisma.mTProtoConnector.findUnique({
            where: { id: channelSource.connectorId },
            select: { companyId: true }
        });

        if (!connector) {
            console.error(`[MTProto Mapping] Connector ${channelSource.connectorId} not found`);
            return;
        }

        // Check if already imported (dedup by sourceChatId + sourceMessageId)
        const existing = await prisma.carListing.findFirst({
            where: {
                sourceChatId: message.chatId,
                sourceMessageId: message.messageId
            }
        });

        if (existing) {
            console.log(`[MTProto Mapping] Car from message ${message.messageId} already imported`);
            return;
        }

        // Create CarListing
        const status = (rules as any).autoPublish ? 'AVAILABLE' : 'PENDING';

        await prisma.carListing.create({
            data: {
                id: `car_mtproto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                source: 'MTPROTO',
                sourceUrl: `https://t.me/c/${message.chatId.replace('-100', '')}/${message.messageId}`,
                title: transformedData.title,
                price: transformedData.price || 0,
                currency: transformedData.currency || 'USD',
                year: transformedData.year || new Date().getFullYear(),
                mileage: transformedData.mileage || 0,
                location: transformedData.location,
                thumbnail: message.mediaUrls?.[0],
                mediaUrls: message.mediaUrls || [],
                specs: transformedData.specs,
                status,
                companyId: connector.companyId,
                sourceChatId: message.chatId,
                sourceMessageId: message.messageId,
                mediaGroupKey: message.mediaGroupKey,
                originalRaw: {
                    text: message.text,
                    date: message.date,
                    channelSourceId: channelSource.id
                },
                postedAt: message.date
            }
        });

        console.log(`✅ [MTProto Mapping] Created CarListing from message ${message.messageId} (${transformedData.title})`);
    } catch (error) {
        console.error(`[MTProto Mapping] Error processing message ${message.messageId}:`, error);
    }
}

/**
 * Batch processor for multiple messages
 */
export async function processBatch(
    messages: TelegramMessage[],
    channelSource: ChannelSource
): Promise<{ imported: number; skipped: number; errors: number }> {
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const message of messages) {
        try {
            await processParsedMessage(message, channelSource);
            imported++;
        } catch (error) {
            console.error(`[MTProto Mapping] Batch error:`, error);
            errors++;
        }
    }

    return { imported, skipped, errors };
}
