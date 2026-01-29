
import { prisma } from '../../../services/prisma.js';
import { MTProtoService } from './mtproto.service.js';
import { MessageParser } from './mtproto.utils.js';
import { processParsedMessage } from '../../../services/mtproto-mapping.service.js';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../utils/logger.js';

/**
 * Worker to backfill messages from configured channels
 */
export class MTProtoWorker {
    private isRunning = false;

    async runBackfill() {
        if (this.isRunning) {
            logger.info('[MTProtoWorker] Already running');
            return;
        }
        this.isRunning = true;

        try {
            logger.info('[MTProtoWorker] Starting backfill cycle...');

            // 1. Get all active Channel Sources
            const sources = await prisma.channelSource.findMany({
                where: { status: 'ACTIVE' },
                include: { connector: true }
            });

            for (const source of sources) {
                if (source.connector.status !== 'READY') {
                    logger.info(`[MTProtoWorker] Skipping source ${source.title} (Connector not ready)`);
                    continue;
                }

                await this.processSource(source);

                // Rate Limit: Sleep 2 seconds between channels to avoid flooding user account
                await new Promise(r => setTimeout(r, 2000));
            }

        } catch (e) {
            logger.error('[MTProtoWorker] Error in backfill loop:', e);
        } finally {
            this.isRunning = false;
        }
    }

    private async processSource(source: any) {
        try {
            logger.info(`[MTProtoWorker] Processing ${source.title} (${source.channelId})...`);

            // Use lastMessageId as checkpoint, or 0 (fetch latest)
            // Strategy: For backfill, we might want to fetch *older* messages from a point, 
            // but simpler: Fetch latest N messages and upsert. Backfill usually implies going backwards, 
            // but here we just ensure we have the recent history first.

            // Let's fetch the last 50 messages for now (Snapshot approach)
            // A real backfill would need sophisticated offset management.
            const messages = await MTProtoService.getHistory(source.connectorId, source.channelId, 50);

            let count = 0;
            for (const msg of messages) {
                if (!msg.message) continue; // Skip empty messages (service messages)

                // Convert MTProto message to our standard format
                const telegramMessage = {
                    chatId: source.channelId,
                    messageId: msg.id,
                    text: msg.message,
                    date: new Date(msg.date * 1000), // Convert Unix timestamp to Date
                    mediaUrls: [], // TODO: Extract media URLs from msg.media
                    mediaGroupKey: msg.groupedId?.toString() || undefined
                };

                // Use mapping service (handles import rules, filtering, dedup)
                await processParsedMessage(telegramMessage, source);
                count++;
            }

            logger.info(`[MTProtoWorker] Processed ${count} messages from ${source.title}`);

            // Update source
            await prisma.channelSource.update({
                where: { id: source.id },
                data: {
                    lastSyncedAt: new Date()
                }
            });

        } catch (e: any) {
            logger.error(`[MTProtoWorker] Failed source ${source.title}:`, e);
        }
    }
    async startLiveSync() {
        try {
            logger.info('[MTProtoWorker] Initializing Live Sync...');

            // Get all READY connectors
            const connectors = await prisma.mTProtoConnector.findMany({
                where: { status: 'READY' }
            });

            for (const conn of connectors) {
                // Attach handler to each connector
                // We need to know WHICH channels are relevant for this connector
                const sources = await prisma.channelSource.findMany({
                    where: { connectorId: conn.id, status: 'ACTIVE' }
                });

                const channelIds = new Set(sources.map((s: any) => s.channelId)); // These are strings

                // Add event handler
                await MTProtoService.addEventHandler(conn.id, async (event: any) => {
                    if (!event.message) return;

                    const msg = event.message;
                    // Check if message is from a watched channel
                    // msg.peerId might be complicated object in gramjs
                    // usually msg.chatId is available or we check peer

                    // Simple check: compare ID string
                    // Note: gramjs IDs can be negative for chats/channels in some contexts or plain int

                    let chatIdStr = '';
                    if (msg.peerId?.channelId) chatIdStr = msg.peerId.channelId.toString();
                    else if (msg.chatId) chatIdStr = msg.chatId.toString();

                    // Sometimes channel ID in DB is "12345" but update has "-10012345"
                    // We need robust matching. For now, exact match or simple inclusion.

                    const source = sources.find((s: any) => s.channelId === chatIdStr || s.channelId === `-100${chatIdStr}`);

                    if (source) {
                        logger.info(`[LiveSync] New message in ${source.title}: ${msg.id}`);
                        await this.syncMessage(source, msg);
                    }
                });

                logger.info(`[LiveSync] Listening on connector ${conn.name} (${sources.length} channels)`);
            }

        } catch (e) {
            logger.error('[LiveSync] Failed to start:', e);
        }
    }

    private async syncMessage(source: any, msg: any) {
        // Convert live message to standard format
        const telegramMessage = {
            chatId: source.channelId,
            messageId: msg.id,
            text: msg.message,
            date: new Date(msg.date * 1000),
            mediaUrls: [],
            mediaGroupKey: msg.groupedId?.toString() || undefined
        };

        // Use mapping service (handles all logic)
        await processParsedMessage(telegramMessage, source);
        logger.info(`[LiveSync] Processed message ${msg.id} from ${source.title}`);
    }
}

export const mtprotoWorker = new MTProtoWorker();
