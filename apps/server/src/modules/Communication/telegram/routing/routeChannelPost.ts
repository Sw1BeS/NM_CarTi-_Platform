import { PipelineMiddleware } from '../core/types.js';
import { logger } from '../../../../utils/logger.js';
import { channelIngestionService, type MediaItem } from '../../../../services/channel-ingestion.service.js';
import { saveTelegramBotFile } from '../../../../services/mediaStorage.service.js';

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
    const text = post.caption || post.text || '';
    if (!text) return next();

    const mediaItems: MediaItem[] = [];
    let mediaUrls: string[] = [];
    if (post.photo && post.photo.length > 0) {
        const largest = post.photo[post.photo.length - 1];
        const fileId = largest.file_id;
        const botToken = ctx.bot?.token;

        if (botToken) {
            try {
                const saved = await saveTelegramBotFile(botToken, fileId, `bot_${channelId}_${post.message_id}`);
                mediaItems.push({
                    url: saved.url,
                    previewUrl: saved.url,
                    tgFileId: fileId,
                    source: 'BOTAPI'
                });
            } catch (e) {
                mediaItems.push({
                    url: `tg_file_id:${fileId}`,
                    tgFileId: fileId,
                    source: 'BOTAPI'
                });
            }
        } else {
            mediaItems.push({
                url: `tg_file_id:${fileId}`,
                tgFileId: fileId,
                source: 'BOTAPI'
            });
        }

        mediaUrls = mediaItems.map(item => item.url);
    }

    try {
        // P0-3 FIX: Check bot config for channelMode
        const channelMode = (ctx.bot?.config as any)?.channelMode || 'CONTENT';
        const mode = channelMode === 'INVENTORY' ? 'INVENTORY' : 'DRAFT_ONLY';

        const normalized = channelIngestionService.normalizeMessage({
            chatId: channelId,
            messageId: post.message_id,
            text,
            date: new Date(post.date * 1000),
            mediaUrls,
            mediaItems,
            mediaGroupKey: post.media_group_id?.toString(),
            channelTitle: post.chat.title,
            sourceUrl: `https://t.me/c/${channelId.replace('-100', '')}/${post.message_id}`,
            sourceType: 'BOTAPI'
        });

        const result = await channelIngestionService.upsertCarListingOrDraft({
            message: normalized,
            mode,
            companyId: ctx.companyId,
            botId: ctx.bot?.id || ctx.botId,
            sourceLabel: 'TELEGRAM_CHANNEL',
            requireSignals: true
        });

        const outcome = result.created ? 'Created' : (result.reason === 'MERGED' ? 'Merged' : 'Skipped');
        logger.info(`[ChannelPost] ${outcome} ${mode === 'INVENTORY' ? 'CarListing' : 'Draft'} from channel ${channelId} (${channelMode} mode)`);
    } catch (e) {
        logger.error('[ChannelPost] Failed to process post', e);
    }

    return next();
};
