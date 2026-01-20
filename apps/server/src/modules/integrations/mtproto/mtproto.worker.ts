
import { prisma } from '../../../services/prisma.js';
import { MTProtoService } from '../../../services/mtproto.service.js';
import { MessageParser } from './mtproto.utils.js';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';

/**
 * Worker to backfill messages from configured channels
 */
export class MTProtoWorker {
    private isRunning = false;

    async runBackfill() {
        if (this.isRunning) {
            console.log('[MTProtoWorker] Already running');
            return;
        }
        this.isRunning = true;

        try {
            console.log('[MTProtoWorker] Starting backfill cycle...');

            // 1. Get all active Channel Sources
            const sources = await prisma.channelSource.findMany({
                where: { status: 'ACTIVE' },
                include: { connector: true }
            });

            for (const source of sources) {
                if (source.connector.status !== 'READY') {
                    console.log(`[MTProtoWorker] Skipping source ${source.title} (Connector not ready)`);
                    continue;
                }

                await this.processSource(source);

                // Rate Limit: Sleep 2 seconds between channels to avoid flooding user account
                await new Promise(r => setTimeout(r, 2000));
            }

        } catch (e) {
            console.error('[MTProtoWorker] Error in backfill loop:', e);
        } finally {
            this.isRunning = false;
        }
    }

    private async processSource(source: any) {
        try {
            console.log(`[MTProtoWorker] Processing ${source.title} (${source.channelId})...`);

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

                // Parse
                const parsed = MessageParser.parse(msg);

                // If it looks like a car (has price + title), save it
                // Or if we are lenient, save everything as DRAFT

                // Generate a stable ID based on channel + message ID
                // But CarListing ID usually UUID. We can search by sourceChatId + sourceMessageId

                const existing = await prisma.carListing.findUnique({
                    where: {
                        sourceChatId_sourceMessageId: {
                            sourceChatId: source.channelId,
                            sourceMessageId: msg.id
                        }
                    }
                });

                if (existing) {
                    // Start Live Sync logic here? For now, skip or update status
                    continue;
                }

                // Create
                await prisma.carListing.create({
                    data: {
                        id: uuidv4(),
                        title: parsed.title || 'Untitled Import',
                        description: parsed.description,
                        price: parsed.price || 0,
                        currency: parsed.currency,
                        year: parsed.year || 0,
                        mileage: parsed.mileage || 0,
                        status: parsed.status, // AVAILABLE, SOLD, etc.
                        source: 'TELEGRAM_CHANNEL',
                        sourceUrl: `https://t.me/${source.username}/${msg.id}`,
                        sourceChatId: source.channelId,
                        sourceMessageId: msg.id,
                        companyId: source.connector.companyId,
                        mediaUrls: [],
                        mediaGroupKey: parsed.mediaGroupId, // Store album ID
                        originalRaw: JSON.parse(JSON.stringify({
                            text: msg.message,
                            date: msg.date,
                            fwdFrom: msg.fwdFrom
                        }))
                    }
                });
                count++;
            }

            console.log(`[MTProtoWorker] Synced ${count} messages from ${source.title}`);

            // Update source
            await prisma.channelSource.update({
                where: { id: source.id },
                data: {
                    lastSyncedAt: new Date()
                }
            });

        } catch (e: any) {
            console.error(`[MTProtoWorker] Failed source ${source.title}:`, e);
        }
    }
    async startLiveSync() {
        try {
            console.log('[MTProtoWorker] Initializing Live Sync...');

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
                        console.log(`[LiveSync] New message in ${source.title}: ${msg.id}`);
                        await this.syncMessage(source, msg);
                    }
                });

                console.log(`[LiveSync] Listening on connector ${conn.name} (${sources.length} channels)`);
            }

        } catch (e) {
            console.error('[LiveSync] Failed to start:', e);
        }
    }

    private async syncMessage(source: any, msg: any) {
        // Re-use logic from processSource but for single message
        // To avoid code duplication, we could extract `saveListing`.
        // For speed, just inlining the logic modified for single item.

        const parsed = MessageParser.parse(msg);

        const existing = await prisma.carListing.findUnique({
            where: {
                sourceChatId_sourceMessageId: {
                    sourceChatId: source.channelId,
                    sourceMessageId: msg.id
                }
            }
        });

        if (existing) {
            // Update?
            // If parsed price changed, update it.
            return;
        }

        // Create
        await prisma.carListing.create({
            data: {
                id: uuidv4(),
                title: parsed.title || 'Live Import',
                description: parsed.description,
                price: parsed.price || 0,
                currency: parsed.currency,
                year: parsed.year || 0,
                mileage: parsed.mileage || 0,
                status: parsed.status,
                source: 'TELEGRAM_LIVE',
                sourceUrl: `https://t.me/${source.username}/${msg.id}`,
                sourceChatId: source.channelId,
                sourceMessageId: msg.id,
                companyId: source.connector.companyId,
                mediaUrls: [],
                mediaGroupKey: parsed.mediaGroupId, // Store album ID
                originalRaw: JSON.parse(JSON.stringify({
                    text: msg.message,
                    date: msg.date,
                    fwdFrom: msg.fwdFrom
                }))
            }
        });
    }
}

export const mtprotoWorker = new MTProtoWorker();
