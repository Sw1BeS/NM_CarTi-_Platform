
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { prisma } from './prisma.js';
import { Logger } from 'telegram/extensions/Logger.js';

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
}
