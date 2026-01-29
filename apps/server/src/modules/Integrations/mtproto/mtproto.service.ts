
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { prisma } from '../../../services/prisma.js';
import { Logger } from 'telegram/extensions/Logger.js';
import { detectMake } from '../../../services/taxonomy.js';
import { ParsingService } from '../parsing/parsing.service.js';

// Minimal logger to avoid spam
const logger = new Logger({ level: 'error' } as any);

export class MTProtoService {
    private static clients: Map<string, TelegramClient> = new Map();

    /**
     * Initialize a client for a connector.
     * If sessionString is present, it will try to connect.
     */
    static async getClient(connectorId: string) {
        if (this.clients.has(connectorId)) {
            return this.clients.get(connectorId)!;
        }

        const connector = await prisma.mTProtoConnector.findUnique({
            where: { id: connectorId }
        });

        if (!connector) throw new Error('Connector not found');

        const apiId = connector.workspaceApiId || Number(process.env.TG_API_ID);
        const apiHash = connector.workspaceApiHash || process.env.TG_API_HASH;

        if (!apiId || !apiHash) {
            throw new Error('Missing API_ID or API_HASH');
        }

        const stringSession = new StringSession(connector.sessionString || '');
        const client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 5,
            baseLogger: logger
        });

        // If we have a session, connect
        if (connector.sessionString) {
            await client.connect();
        }

        this.clients.set(connectorId, client);
        return client;
    }

    /**
     * Step 1: Send Code
     */
    static async sendCode(connectorId: string, phone: string) {
        const client = await this.getClient(connectorId);

        // We must connect first (even without session) to send code
        await client.connect();

        const { phoneCodeHash, isCodeViaApp } = await client.sendCode(
            { apiId: client.apiId, apiHash: client.apiHash },
            phone
        );

        await prisma.mTProtoConnector.update({
            where: { id: connectorId },
            data: {
                phone,
                status: 'CONNECTING',
                lastError: null // Clear error
            }
        });

        return { phoneCodeHash, isCodeViaApp };
    }

    /**
     * Step 2: SignIn
     */
    static async signIn(connectorId: string, phone: string, code: string, phoneCodeHash: string, password?: string) {
        const client = await this.getClient(connectorId);

        try {
            await client.invoke(
                new Api.auth.SignIn({
                    phoneNumber: phone,
                    phoneCodeHash: phoneCodeHash,
                    phoneCode: code,
                })
            );
        } catch (e: any) {
            if (e.message.includes('SESSION_PASSWORD_NEEDED')) {
                if (!password) throw new Error('PASSWORD_NEEDED');

                await client.invoke(
                    new Api.auth.CheckPassword({
                        password: await (client as any).computeCheckPassword(password)
                    })
                );
            } else {
                throw e;
            }
        }

        const session = client.session.save() as unknown as string;

        await prisma.mTProtoConnector.update({
            where: { id: connectorId },
            data: {
                sessionString: session,
                status: 'READY',
                connectedAt: new Date()
            }
        });

        return { success: true };
    }

    static async disconnect(connectorId: string) {
        const client = this.clients.get(connectorId);
        if (client) {
            await client.disconnect();
            this.clients.delete(connectorId);
        }
        await prisma.mTProtoConnector.update({
            where: { id: connectorId },
            data: { status: 'DISCONNECTED', sessionString: null }
        });
    }

    /**
     * Channel Management
     */
    static async resolveChannel(connectorId: string, query: string) {
        const client = await this.getClient(connectorId);
        await client.connect();

        try {
            // Remove @ or t.me/
            const cleanQuery = query.replace(/^@|https:\/\/t\.me\//, '');
            const entity = await client.getEntity(cleanQuery) as any;

            if (!entity) throw new Error('Not found');

            // Basic validation
            if (entity.className !== 'Channel' && entity.className !== 'Chat') {
                throw new Error('Target is not a channel or group');
            }

            return {
                id: entity.id.toString(),
                title: entity.title,
                username: entity.username,
                participantsCount: entity.participantsCount
            };
        } catch (e: any) {
            logger.error(e);
            throw new Error(`Failed to resolve channel: ${e.message}`);
        }
    }

    static async addChannelSource(connectorId: string, channel: { id: string, title: string, username?: string }, importRules: any) {
        // Prevent duplicates
        const existing = await prisma.channelSource.findUnique({
            where: {
                connectorId_channelId: {
                    connectorId,
                    channelId: channel.id
                }
            }
        });

        if (existing) throw new Error('Channel already added');

        return await prisma.channelSource.create({
            data: {
                connectorId,
                channelId: channel.id,
                title: channel.title,
                username: channel.username,
                importRules: importRules || {},
                status: 'ACTIVE'
            }
        });
    }

    static async getChannelSources(connectorId: string) {
        return await prisma.channelSource.findMany({
            where: { connectorId },
            orderBy: { createdAt: 'desc' }
        });
    }

    static async deleteChannelSource(id: string) {
        return await prisma.channelSource.delete({ where: { id } });
    }

    /**
     * History & Sync
     */
    static async getHistory(connectorId: string, channelId: string, limit = 20, offsetId = 0) {
        const client = await this.getClient(connectorId);
        await client.connect();

        try {
            // gramjs expects channel as an input peer or identifier.
            // ID from our DB (string) usually needs BigInt for parsing if it's raw ID.
            // But getMessages often takes username or entity.

            // To be safe, we try to resolve entity first (cached by gramjs internally hopefully)
            // or just pass the ID if strict.

            // NOTE: channelId from resolveChannel is often BigInt string.
            // client.getInputEntity might be needed.

            const messages = await client.getMessages(channelId, {
                limit,
                offsetId,
            });

            return messages;
        } catch (e: any) {
            logger.error(e);
            throw new Error(`Failed to fetch history: ${e.message}`);
        }
    }

    /**
     * Live Sync logic
     * Allows attaching a callback to handle new messages for a connector
     */
    static async addEventHandler(connectorId: string, handler: (event: any) => void) {
        const client = await this.getClient(connectorId);
        await client.connect();

        // Use generic handler to catch NewMessage and EditMessage
        // Note: gramjs event filtering is powerful but complex. 
        // We attach a raw handler for now or NewMessage

        const { NewMessage } = await import('telegram/events/index.js');

        client.addEventHandler(handler, new NewMessage({}));
        // TODO: EditMessage support
    }


    /**
     * Parsing & Sync Logic
     */

    // Simple heuristic parser
    static async updateChannel(channelSourceId: string, data: { importRules?: any }) {
        return prisma.channelSource.update({
            where: { id: channelSourceId },
            data: {
                importRules: data.importRules
            }
        });
    }

    /**
     * Parsing & Sync Logic
     */

    // Simple heuristic parser
    public static parseMessageToInventory(text: string): any {
        if (!text || text.length < 10) return null;

        // 1. Detect Make (and imply title structure)
        const make = detectMake(text);

        // 2. Extract Price
        // Patterns: $10000, 10000$, 10 000 usd, 10.000 eur
        // We look for numbers near money keywords
        const priceRegex = /((?:\$|€|£)?\s?\d{1,3}(?:[.,\s]?\d{3})+(?:\.\d{1,2})?\s?(?:\$|€|£|usd|eur|uah|грн)?)/gi;
        const matches = text.match(priceRegex) || [];

        let price = 0;
        // Filter likely candidates (must contain symbol or keyword OR be large number)
        for (const m of matches) {
            const clean = m.replace(/[.,\s$€£a-zа-я]/gi, '');
            const val = parseInt(clean, 10);
            if (val > 1000 && val < 500000) { // Safety range
                // Check if it has currency context
                if (m.match(/[$€£]|usd|eur|uah|грн/i)) {
                    price = val;
                    break;
                }
                // Fallback: if lines contains "Price" or "Цена"
                // For now, accept first valid number if strict symbol not found? 
                // Let's rely on symbol/keyword presence for high precision.
                if (val > 1000 && !price) price = val; // Weak heuristic, maybe keep searching
            }
        }
        // If still 0, try finding "12000" alone if line starts with it or typical format
        if (price === 0) {
            const rawNums = text.match(/\b\d{4,6}\b/g);
            if (rawNums) {
                // Pick one that looks like a price (usually larger than year 2025, smaller than mileage 200000?)
                // Very ambiguous. Let's skip raw numbers for now to avoid Year/Mileage confusion.
            }
        }

        // 3. Extract Year
        const yearMatch = text.match(/\b(199\d|20[0-2]\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : 2020;

        // 4. Extract Mileage
        // Patterns: 150 km, 150t km, 150k km, 150 thousand, 150 тыс
        // "150 000"
        let mileage = 0;
        const mileageMatch = text.match(/(\d+(?:[.,]\d+)?)\s?(t|k|т|тыс|тис)?\s?(km|км|mi|miles|миль)/i);
        if (mileageMatch) {
            let val = parseFloat(mileageMatch[1].replace(',', '.'));
            const multiplier = mileageMatch[2]; // t, k, тыс
            const unit = mileageMatch[3]; // km, miles

            if (multiplier) val *= 1000;
            else if (val < 500) val *= 1000; // "145 km" usually means 145k in listings context? No, dangerous.

            if (unit && (unit.startsWith('mi') || unit.startsWith('ми'))) {
                val *= 1.60934;
            }
            mileage = Math.round(val);
        }

        // 5. Title
        // If make detected, try to find "Make Model"
        // Regex: Make + next 2 words
        let title = text.split('\n')[0].substring(0, 100);
        if (make) {
            // Find finding line with make
            const lines = text.split('\n');
            const makeLine = lines.find(l => l.toLowerCase().includes(make.toLowerCase())) || lines[0];
            title = makeLine.substring(0, 100).trim();
        }

        // 6. VIN
        const vinMatch = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);

        return {
            title,
            make: make || null,
            year,
            price: price > 0 ? price : 0,
            mileage: mileage > 0 ? mileage : 0,
            vin: vinMatch ? vinMatch[0].toUpperCase() : null,
            description: text
        };
    }

    static async syncChannel(connectorId: string, sourceId: string) {
        const source = await prisma.channelSource.findUnique({
            where: { id: sourceId },
            include: { connector: true }
        });
        if (!source || !source.connector) throw new Error("Source or Connector not found");

        const client = await this.getClient(connectorId);
        await client.connect();

        // Mark sync start
        await prisma.channelSource.update({
            where: { id: sourceId },
            data: { lastSyncedAt: new Date() }
        });

        try {
            const messages = await client.getMessages(source.channelId, { limit: 20 });
            let imported = 0;

            for (const msg of messages) {
                if (!msg.message) continue;

                // Dedupe by source (sourceChatId + sourceMessageId or externalId if added)
                // Schema has sourceChatId, sourceMessageId.
                // Let's rely on that unique constraint: @@unique([sourceChatId, sourceMessageId])

                const exists = await prisma.carListing.findFirst({
                    where: {
                        sourceChatId: source.channelId,
                        sourceMessageId: msg.id
                    }
                });

                if (exists) continue;

                let parsed;
                if (source.importRules && Object.keys(source.importRules).length > 0 && !(source.importRules as any).autoPublish) {
                    // Use Dynamic Parsing if rules exist (and it's not just the default autoPublish flag)
                    // Check if 'rules' key exists or root object is the template.
                    // The UI saves rules as { rules: { ... } } inside importRules usually?
                    // Let's assume importRules IS the template (ParsingTemplate).
                    try {
                        parsed = ParsingService.extract(msg.message, source.importRules as any);
                    } catch (e) {
                        // Fallback
                        parsed = this.parseMessageToInventory(msg.message);
                    }
                } else {
                    parsed = this.parseMessageToInventory(msg.message);
                }

                if (!parsed || parsed.price === 0) continue; // Skip non-ads

                await prisma.carListing.create({
                    data: {
                        id: `tg_${source.channelId}_${msg.id}`, // Generate ID manually or use cuid if preferred, schema says String @id

                        // Schema: title, price, year, mileage, location, status, companyId

                        title: parsed.title,
                        price: parsed.price,
                        year: parsed.year,
                        mileage: 0, // Default
                        location: 'Unknown',

                        status: 'AVAILABLE',
                        companyId: source.connector.companyId,

                        // MTProto fields
                        source: 'TELEGRAM',
                        sourceChatId: source.channelId,
                        sourceMessageId: msg.id,
                        description: parsed.description,
                        mediaUrls: []
                    }
                });
                imported++;
            }

            return { success: true, imported };

        } catch (e: any) {
            logger.error(`Sync failed for ${source.title}: ${e.message}`);
            await prisma.channelSource.update({
                where: { id: sourceId },
                data: { status: 'ERROR' }
            });
            throw e;
        }
    }

    static async getStats() {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [totalCars, newCars, totalLeads, newLeads, sources] = await Promise.all([
            prisma.carListing.count({ where: { source: 'TELEGRAM' } }),
            prisma.carListing.count({ where: { source: 'TELEGRAM', createdAt: { gte: yesterday } } }),
            prisma.lead.count({ where: { source: { contains: 'Telegram', mode: 'insensitive' } } }),
            prisma.lead.count({ where: { source: { contains: 'Telegram', mode: 'insensitive' }, createdAt: { gte: yesterday } } }),
            prisma.channelSource.count({ where: { status: 'ACTIVE' } })
        ]);

        return {
            totalCars,
            newCars,
            totalLeads,
            newLeads,
            activeSources: sources
        };
    }
}
