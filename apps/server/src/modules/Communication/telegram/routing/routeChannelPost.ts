import { PipelineMiddleware } from '../core/types.js';
import { logger } from '../../../../utils/logger.js';
import { channelIngestionService, type MediaItem } from '../../../../services/channel-ingestion.service.js';
import { MediaLimitError, saveTelegramBotFile } from '../../../../services/mediaStorage.service.js';
import { logIntegrationEvent } from '../../../../services/integrationEventLog.service.js';

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

    // P0 FIX: Default to INVENTORY mode so media is downloaded
    // Previous default was 'CONTENT' which skipped media download (shouldDownloadMedia=false)
    // This caused all CarListings to have mediaItems=null
    const channelMode = (ctx.bot?.config as any)?.channelMode || 'INVENTORY';
    const mode = channelMode === 'INVENTORY' ? 'INVENTORY' : 'DRAFT_ONLY';
    const shouldDownloadMedia = mode === 'INVENTORY';

    const mediaItems: MediaItem[] = [];
    let mediaUrls: string[] = [];
    const hasPhoto = Array.isArray(post.photo) && post.photo.length > 0;
    const hasUnsupportedMedia = !!(post.video || post.document || post.voice || post.audio || post.sticker || post.animation);

    if (!hasPhoto && hasUnsupportedMedia) {
        await logIntegrationEvent({
            companyId: ctx.companyId,
            integration: 'TELEGRAM_BOTAPI',
            entityId: ctx.bot?.id || ctx.botId || null,
            action: 'media_skipped',
            status: 'WARN',
            message: 'MEDIA_UNSUPPORTED',
            meta: {
                sourceChatId: channelId,
                sourceMessageId: post.message_id
            }
        });
    }

    if (hasPhoto) {
        const largest = post.photo[post.photo.length - 1];
        const fileId = largest.file_id;
        const botToken = ctx.bot?.token;

        // GAP-4 FIX: Safety check for bot token
        if (!ctx.bot) {
            logger.error('[routeChannelPost] ctx.bot is undefined, cannot download media');
        } else if (!botToken) {
            logger.error('[routeChannelPost] Bot token is missing, cannot download media', {
                botId: ctx.botId,
                companyId: ctx.companyId
            });
        }

        if (botToken && shouldDownloadMedia) {
            try {
                const saved = await saveTelegramBotFile(botToken, fileId, {
                    companyId: ctx.companyId,
                    sourceChatId: channelId,
                    sourceMessageId: post.message_id,
                    fileSize: largest.file_size
                });
                mediaItems.push({
                    url: saved.url,
                    previewUrl: saved.url,
                    tgFileId: fileId,
                    source: 'BOTAPI'
                });
            } catch (e) {
                if (e instanceof MediaLimitError) {
                    await logIntegrationEvent({
                        companyId: ctx.companyId,
                        integration: 'TELEGRAM_BOTAPI',
                        entityId: ctx.bot?.id || ctx.botId || null,
                        action: 'media_skipped',
                        status: 'WARN',
                        message: 'MEDIA_TOO_LARGE',
                        meta: {
                            sourceChatId: channelId,
                            sourceMessageId: post.message_id,
                            sizeBytes: e.sizeBytes,
                            limitBytes: e.limitBytes
                        }
                    });
                }
                mediaItems.push({
                    tgFileId: fileId,
                    source: 'BOTAPI'
                });
            }
        } else {
            if (!botToken && shouldDownloadMedia) {
                await logIntegrationEvent({
                    companyId: ctx.companyId,
                    integration: 'TELEGRAM_BOTAPI',
                    entityId: ctx.bot?.id || ctx.botId || null,
                    action: 'media_skipped',
                    status: 'WARN',
                    message: 'MEDIA_NO_BOT_TOKEN',
                    meta: {
                        sourceChatId: channelId,
                        sourceMessageId: post.message_id
                    }
                });
            }
            mediaItems.push({
                tgFileId: fileId,
                source: 'BOTAPI'
            });
        }

        mediaUrls = mediaItems
            .map(item => item.url || item.previewUrl)
            .filter((url): url is string => typeof url === 'string' && !url.startsWith('tg_file_id:'));
    }

    try {
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
