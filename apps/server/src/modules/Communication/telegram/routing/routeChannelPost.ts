import { PipelineMiddleware } from '../core/types.js';
import { prisma } from '../../../../services/prisma.js';
import { logger } from '../../../../utils/logger.js';
// @ts-ignore
import { parsePrice, parseMileage } from '../../../../services/textParserUtils.js';

/**
 * routeChannelPost - Handles channel_post updates
 * 
 * P0-3 FIX: Unified pipeline for channel posts
 * - Checks bot.config.channelMode ('INVENTORY' | 'CONTENT')
 * - INVENTORY mode: Creates CarListing (shared dedup with MTProto)
 * - CONTENT mode: Creates Draft (for content calendar)
 * - Default: CONTENT (backward compatible)
 */
export const routeChannelPost: PipelineMiddleware = async (ctx, next) => {
    const update = ctx.update;
    const post = update.channel_post;

    if (!post) {
        return next();
    }

    const channelId = String(post.chat.id);
    const title = post.chat.title || 'Channel Post';
    const text = post.caption || post.text || '';

    if (!text) return next();

    // Parse content
    const priceData = parsePrice(text);
    const mileage = parseMileage(text);
    const yearMatch = text.match(/(19|20)\d{2}/);
    const year = yearMatch ? Number(yearMatch[0]) : undefined;

    // Only process if looks like a listing
    if (!priceData.amount && !year && !mileage) {
        return next();
    }

    try {
        // P0-3 FIX: Check bot config for channelMode
        const channelMode = (ctx.bot?.config as any)?.channelMode || 'CONTENT';

        if (channelMode === 'INVENTORY') {
            // Create CarListing (unified with MTProto)
            const created = await createCarListingFromChannelPost(ctx, post, { channelId, title, text, priceData, mileage, year });
            logger.info(`[ChannelPost] ${created ? 'Created' : 'Skipped'} CarListing from channel ${channelId} (INVENTORY mode)`);
        } else {
            // Create Draft (content calendar)
            const created = await createDraftFromChannelPost(ctx, post, { channelId, title, text, priceData, mileage, year });
            logger.info(`[ChannelPost] ${created ? 'Created' : 'Skipped'} Draft from channel ${channelId} (CONTENT mode)`);
        }
    } catch (e) {
        logger.error('[ChannelPost] Failed to process post', e);
    }

    return next();
};

/**
 * Create CarListing from channel post
 * Uses same dedup strategy as MTProto: sourceChatId + sourceMessageId
 */
async function createCarListingFromChannelPost(ctx: any, post: any, data: any) {
    const { channelId, title, text, priceData, mileage, year } = data;

    // Check for duplicate by sourceChatId + sourceMessageId
    const existing = await prisma.carListing.findFirst({
        where: {
            sourceChatId: channelId,
            sourceMessageId: post.message_id
        }
    });

    if (existing) {
        logger.info(`[ChannelPost] CarListing already exists for message ${post.message_id}, skipping`);
        return false;
    }

    // Extract thumbnail
    let thumbnail = undefined;
    let mediaUrls: string[] = [];
    if (post.photo && post.photo.length > 0) {
        const largest = post.photo[post.photo.length - 1];
        thumbnail = `tg_file_id:${largest.file_id}`;
        mediaUrls = post.photo.map((p: any) => `tg_file_id:${p.file_id}`);
    }

    // Create CarListing
    await prisma.carListing.create({
        data: {
            id: `car_botapi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            source: 'TELEGRAM_CHANNEL',  // Distinguish from MTPROTO
            sourceUrl: `https://t.me/c/${channelId.replace('-100', '')}/${post.message_id}`,
            title: title,
            price: priceData.amount || 0,
            currency: priceData.currency || 'USD',
            year: year || new Date().getFullYear(),
            mileage: mileage || 0,
            location: undefined,  // TODO: Extract from text
            thumbnail,
            mediaUrls,
            status: 'PENDING',  // Admin review required
            companyId: ctx.companyId,
            sourceChatId: channelId,
            sourceMessageId: post.message_id,
            originalRaw: {
                text,
                channelTitle: post.chat.title,
                date: new Date(post.date * 1000),
                botId: ctx.bot?.id || ctx.botId
            },
            postedAt: new Date(post.date * 1000)
        }
    });

    return true;
}

/**
 * Create Draft from channel post (original logic)
 */
async function createDraftFromChannelPost(ctx: any, post: any, data: any) {
    const { channelId, title, text, priceData, mileage, year } = data;

    // Check for duplicate by metadata (channelId + messageId)
    const existing = await prisma.draft.findFirst({
        where: {
            metadata: {
                path: ['channelId'],
                equals: channelId
            },
            AND: {
                metadata: {
                    path: ['messageId'],
                    equals: post.message_id
                }
            }
        }
    });

    if (existing) {
        logger.info(`[ChannelPost] Draft already exists for message ${post.message_id}, skipping`);
        return false;
    }

    // Extract thumbnail
    let thumbnail = undefined;
    if (post.photo && post.photo.length > 0) {
        const largest = post.photo[post.photo.length - 1];
        thumbnail = `tg_file_id:${largest.file_id}`;
    }

    await prisma.draft.create({
        data: {
            source: 'MANUAL',  // Schema enum only has EXTENSION | MANUAL
            title: title,
            description: text,
            price: `${priceData.amount} ${priceData.currency || 'USD'}`,
            url: `https://t.me/c/${channelId.replace('-100', '')}/${post.message_id}`,
            status: 'PENDING',
            destination: channelId,
            botId: ctx.botId ? String(ctx.botId) : null,
            metadata: {
                channelId,
                messageId: post.message_id,
                parsedYear: year,
                parsedMileage: mileage,
                thumbnail
            }
        }
    });

    return true;
}
