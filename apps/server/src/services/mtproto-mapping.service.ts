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
import { logger } from '../utils/logger.js';
import { channelIngestionService, type CarData } from './channel-ingestion.service.js';

interface TelegramMessage {
    chatId: string;
    messageId: number;
    text?: string;
    date: Date;
    mediaUrls?: string[];
    mediaItems?: any[];
    mediaGroupKey?: string;
}

export type PreviewAction = 'CREATE' | 'SKIP' | 'DUPLICATE';

export interface PreviewResult {
    action: PreviewAction;
    reason?: string;
    mapped?: CarData;
}

const buildSourceUrl = (chatId: string, messageId: number) =>
    `https://t.me/c/${chatId.replace('-100', '')}/${messageId}`;

/**
 * Main processor: parse message and create CarListing
 */
export async function processParsedMessage(
    message: TelegramMessage,
    channelSource: ChannelSource
): Promise<void> {
    try {
        const normalized = channelIngestionService.normalizeMessage({
            chatId: message.chatId,
            messageId: message.messageId,
            text: message.text,
            date: message.date,
            mediaUrls: message.mediaUrls,
            mediaItems: message.mediaItems,
            mediaGroupKey: message.mediaGroupKey,
            channelTitle: channelSource.title,
            sourceUrl: buildSourceUrl(message.chatId, message.messageId),
            sourceType: 'MTPROTO'
        });

        const result = await channelIngestionService.upsertCarListingOrDraft({
            message: normalized,
            mode: 'INVENTORY',
            channelSource,
            sourceLabel: 'MTPROTO',
            requireSignals: false
        });

        if (result.created) {
            logger.info(`✅ [MTProto Mapping] Created CarListing from message ${message.messageId}`);
        } else if (result.reason === 'DUPLICATE') {
            logger.info(`[MTProto Mapping] Car from message ${message.messageId} already imported`);
        }
    } catch (error) {
        logger.error(`[MTProto Mapping] Error processing message ${message.messageId}:`, error);
    }
}

export async function processParsedMessageToDraft(
    message: TelegramMessage,
    channelSource: ChannelSource
): Promise<{ imported: boolean; reason?: string }> {
    try {
        const normalized = channelIngestionService.normalizeMessage({
            chatId: message.chatId,
            messageId: message.messageId,
            text: message.text,
            date: message.date,
            mediaUrls: message.mediaUrls,
            mediaItems: message.mediaItems,
            mediaGroupKey: message.mediaGroupKey,
            channelTitle: channelSource.title,
            sourceUrl: buildSourceUrl(message.chatId, message.messageId),
            sourceType: 'MTPROTO'
        });

        const result = await channelIngestionService.upsertCarListingOrDraft({
            message: normalized,
            mode: 'DRAFT_ONLY',
            channelSource,
            sourceLabel: 'MTPROTO',
            requireSignals: false
        });

        return { imported: result.created, reason: result.reason };
    } catch (error) {
        logger.error(`[MTProto Mapping] Draft import error for message ${message.messageId}:`, error);
        return { imported: false, reason: 'ERROR' };
    }
}

export async function previewParsedMessage(
    message: TelegramMessage,
    channelSource: ChannelSource,
    mode: 'DRAFT_ONLY' | 'INVENTORY'
): Promise<PreviewResult> {
    const rules = channelSource.importRules || {};
    const { shouldImport, transformedData, reason } = channelIngestionService.applyRules(message.text || '', rules, { requireSignals: false });

    if (!shouldImport || !transformedData) {
        return { action: 'SKIP', reason: reason || 'SKIPPED' };
    }

    const duplicate = mode === 'DRAFT_ONLY'
        ? await prisma.draft.findFirst({
            where: { sourceChatId: message.chatId, sourceMessageId: message.messageId }
        })
        : await prisma.carListing.findFirst({
            where: { sourceChatId: message.chatId, sourceMessageId: message.messageId }
        });

    if (duplicate) return { action: 'DUPLICATE', reason: 'ALREADY_IMPORTED', mapped: transformedData };

    return { action: 'CREATE', mapped: transformedData };
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
            logger.error(`[MTProto Mapping] Batch error:`, error);
            errors++;
        }
    }

    return { imported, skipped, errors };
}
