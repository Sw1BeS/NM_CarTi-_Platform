
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { prisma } from '../../../services/prisma.js';
import { ChannelSourceRepository } from '../../../repositories/channelSource.repository.js';
import { Logger } from 'telegram/extensions/Logger.js';
import { detectMake } from '../../../services/taxonomy.js';
import { ParsingService } from '../parsing/parsing.service.js';
import { processParsedMessage } from '../../../services/mtproto-mapping.service.js';
import { MediaLimitError, saveMediaBuffer } from '../../../services/mediaStorage.service.js';
import { logIntegrationEvent } from '../../../services/integrationEventLog.service.js';
import type { MediaItem } from '../../../services/channel-ingestion.service.js';

// Minimal logger to avoid spam
const logger = new Logger({ level: 'error' } as any);
const channelSourceRepo = new ChannelSourceRepository(prisma);

const clearAuthAttemptData = {
    authSessionString: null,
    authPhoneCodeHash: null,
    authPhone: null,
    authApiId: null,
    authApiHash: null,
    authSentCodeType: null,
    authNextCodeType: null,
    authCodeLength: null,
    authTimeoutAt: null,
    authRequestedAt: null
};

type LoginCodeRequestResult = {
    sendResult: any;
    forceSmsAttempted: boolean;
    forceSmsSucceeded: boolean;
    forceSmsError: string | null;
    initialSentCodeType: string | null;
};

type MediaExtractionContext = {
    companyId?: string | null;
    sourceChatId: string;
    sourceMessageId: number;
    channelSourceId?: string | null;
    mediaPolicy?: 'refs_only' | 'download' | 'first_only';
};

export class MTProtoService {
    private static clients: Map<string, TelegramClient> = new Map();

    private static createClient(sessionString: string, apiId: number, apiHash: string) {
        const stringSession = new StringSession(sessionString);
        return new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 5,
            baseLogger: logger
        });
    }

    private static resolveApiCredentials(connector: {
        workspaceApiId?: number | null;
        workspaceApiHash?: string | null;
        authApiId?: number | null;
        authApiHash?: string | null;
    }, preferAuthAttempt = false) {
        const apiId = preferAuthAttempt
            ? connector.authApiId || connector.workspaceApiId || Number(process.env.TG_API_ID)
            : connector.workspaceApiId || Number(process.env.TG_API_ID);
        const apiHash = preferAuthAttempt
            ? connector.authApiHash || connector.workspaceApiHash || process.env.TG_API_HASH
            : connector.workspaceApiHash || process.env.TG_API_HASH;

        if (!apiId || !apiHash) {
            throw new Error('Missing API_ID or API_HASH');
        }

        return { apiId, apiHash };
    }

    private static telegramClassName(value: any): string | null {
        return value?.className || value?.constructor?.name || null;
    }

    private static isSentCodeSuccess(value: any): boolean {
        return this.telegramClassName(value) === 'auth.SentCodeSuccess';
    }

    private static sentCodeTimeoutAt(timeout: unknown): Date | null {
        if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
            return null;
        }

        return new Date(Date.now() + timeout * 1000);
    }

    private static sentCodeDetails(sendResult: any) {
        if (this.isSentCodeSuccess(sendResult)) {
            throw new Error('TELEGRAM_ALREADY_AUTHORIZED');
        }

        const phoneCodeHash = sendResult?.phoneCodeHash;
        if (!phoneCodeHash) {
            throw new Error('Telegram did not return phoneCodeHash');
        }

        const sentCodeType = this.telegramClassName(sendResult.type);
        const nextCodeType = this.telegramClassName(sendResult.nextType);
        const codeLength = typeof sendResult.type?.length === 'number' ? sendResult.type.length : null;

        return {
            phoneCodeHash,
            isCodeViaApp: sentCodeType === 'auth.SentCodeTypeApp',
            sentCodeType,
            nextCodeType,
            codeLength,
            timeoutAt: this.sentCodeTimeoutAt(sendResult.timeout)
        };
    }

    private static isSmsSentCodeType(sentCodeType: string | null): boolean {
        return sentCodeType === 'auth.SentCodeTypeSms'
            || sentCodeType === 'auth.SentCodeTypeSmsWord'
            || sentCodeType === 'auth.SentCodeTypeSmsPhrase'
            || sentCodeType === 'auth.SentCodeTypeFirebaseSms';
    }

    private static telegramErrorText(error: any): string {
        return error?.errorMessage || error?.message || String(error);
    }

    private static async requestLoginCode(client: TelegramClient, apiId: number, apiHash: string, phone: string, options: { forceSms?: boolean } = {}, attempt = 0): Promise<LoginCodeRequestResult> {
        try {
            const sendResult = await client.invoke(
                new Api.auth.SendCode({
                    phoneNumber: phone,
                    apiId,
                    apiHash,
                    settings: new Api.CodeSettings({})
                })
            );

            const initialDetails = this.sentCodeDetails(sendResult);
            if (!options.forceSms || this.isSmsSentCodeType(initialDetails.sentCodeType)) {
                return {
                    sendResult,
                    forceSmsAttempted: Boolean(options.forceSms),
                    forceSmsSucceeded: false,
                    forceSmsError: null,
                    initialSentCodeType: initialDetails.sentCodeType
                };
            }

            try {
                const resendResult = await client.invoke(
                    new Api.auth.ResendCode({
                        phoneNumber: phone,
                        phoneCodeHash: initialDetails.phoneCodeHash
                    })
                );

                return {
                    sendResult: resendResult,
                    forceSmsAttempted: true,
                    forceSmsSucceeded: true,
                    forceSmsError: null,
                    initialSentCodeType: initialDetails.sentCodeType
                };
            } catch (resendError: any) {
                return {
                    sendResult,
                    forceSmsAttempted: true,
                    forceSmsSucceeded: false,
                    forceSmsError: this.telegramErrorText(resendError),
                    initialSentCodeType: initialDetails.sentCodeType
                };
            }
        } catch (error: any) {
            if (this.telegramErrorText(error).includes('AUTH_RESTART') && attempt < 1) {
                return this.requestLoginCode(client, apiId, apiHash, phone, options, attempt + 1);
            }
            throw error;
        }
    }

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

        const { apiId, apiHash } = this.resolveApiCredentials(connector);
        const client = this.createClient(connector.sessionString || '', apiId, apiHash);

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
    static async sendCode(connectorId: string, phone: string, options: { forceSms?: boolean } = {}) {
        const connector = await prisma.mTProtoConnector.findUnique({
            where: { id: connectorId }
        });

        if (!connector) throw new Error('Connector not found');

        const { apiId, apiHash } = this.resolveApiCredentials(connector);
        await this.forgetClient(connectorId);

        // Auth attempts must start from a clean StringSession. Reusing an old
        // authorized/revoked session makes Telegram code delivery nondeterministic.
        const client = this.createClient('', apiId, apiHash);
        await client.connect();

        const requestResult = await this.requestLoginCode(client, apiId, apiHash, phone, options);
        const details = {
            ...this.sentCodeDetails(requestResult.sendResult),
            forceSmsAttempted: requestResult.forceSmsAttempted,
            forceSmsSucceeded: requestResult.forceSmsSucceeded,
            forceSmsError: requestResult.forceSmsError,
            initialSentCodeType: requestResult.initialSentCodeType
        };
        const authSessionString = client.session.save() as unknown as string;

        await prisma.mTProtoConnector.update({
            where: { id: connectorId },
            data: {
                phone,
                status: 'CONNECTING',
                sessionString: null,
                connectedAt: null,
                authSessionString,
                authPhoneCodeHash: details.phoneCodeHash,
                authPhone: phone,
                authApiId: apiId,
                authApiHash: apiHash,
                authSentCodeType: details.sentCodeType,
                authNextCodeType: details.nextCodeType,
                authCodeLength: details.codeLength,
                authTimeoutAt: details.timeoutAt,
                authRequestedAt: new Date(),
                lastError: null
            }
        });

        this.clients.set(connectorId, client);
        return details;
    }

    /**
     * Step 2: SignIn
     */
    static async signIn(connectorId: string, phone: string | undefined, code: string, phoneCodeHash?: string, password?: string) {
        const connector = await prisma.mTProtoConnector.findUnique({
            where: { id: connectorId }
        });

        if (!connector) throw new Error('Connector not found');

        const authPhone = connector.authPhone || connector.phone || phone;
        const authPhoneCodeHash = phoneCodeHash || connector.authPhoneCodeHash;
        const authSessionString = connector.authSessionString || connector.sessionString || '';
        const normalizedCode = String(code || '').trim();

        if (!authPhone) throw new Error('MTPROTO_AUTH_PHONE_MISSING');
        if (!authPhoneCodeHash) throw new Error('MTPROTO_AUTH_CODE_HASH_MISSING');
        if (!authSessionString) throw new Error('MTPROTO_AUTH_SESSION_MISSING');
        if (phone && connector.authPhone && phone !== connector.authPhone) {
            throw new Error(`MTPROTO_AUTH_PHONE_MISMATCH: expected ${connector.authPhone}`);
        }
        if (!normalizedCode) throw new Error('MTPROTO_AUTH_CODE_MISSING');
        if (connector.authCodeLength && normalizedCode.length !== connector.authCodeLength) {
            throw new Error(`CODE_LENGTH_MISMATCH: expected ${connector.authCodeLength}-character Telegram login code, got ${normalizedCode.length}. Do not use my.telegram.org app configuration codes here.`);
        }

        const { apiId, apiHash } = this.resolveApiCredentials(connector, true);
        await this.forgetClient(connectorId);

        const client = this.createClient(authSessionString, apiId, apiHash);
        await client.connect();

        try {
            await client.invoke(
                new Api.auth.SignIn({
                    phoneNumber: authPhone,
                    phoneCodeHash: authPhoneCodeHash,
                    phoneCode: normalizedCode,
                })
            );
        } catch (e: any) {
            if (this.telegramErrorText(e).includes('SESSION_PASSWORD_NEEDED')) {
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
                connectedAt: new Date(),
                lastError: null,
                ...clearAuthAttemptData
            }
        });

        this.clients.set(connectorId, client);
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
            data: {
                status: 'DISCONNECTED',
                sessionString: null,
                ...clearAuthAttemptData
            }
        });
    }

    static async forgetClient(connectorId: string) {
        const client = this.clients.get(connectorId);
        if (client) {
            await client.disconnect().catch(() => undefined);
            this.clients.delete(connectorId);
        }
    }

    /**
     * Discovery Logic
     */
    static async discoverDialogs(connectorId: string) {
        const client = await this.getClient(connectorId);
        await client.connect();

        try {
            const dialogs = await client.getDialogs({ limit: 50 }); // Limit to top 50 active
            let discovered = 0;

            for (const d of dialogs) {
                if (d.isChannel || d.isGroup) {
                    const entity = d.entity as any;
                    const channelId = entity.id.toString(); // BigInt

                    // Check if exists
                    const exists = await prisma.channelSource.findUnique({
                        where: { connectorId_channelId: { connectorId, channelId } }
                    });

                    if (!exists) {
                        await channelSourceRepo.create({
                            connectorId,
                            channelId,
                            title: entity.title || 'Unknown',
                            username: entity.username || undefined,
                            importRules: { autoPublish: false }, // Safe default
                            status: 'PAUSED', // Don't auto-sync yet
                            lastError: null
                        });
                        discovered++;
                    }
                }
            }
            return discovered;
        } catch (e: any) {
            logger.error(`Discovery failed for ${connectorId}: ${e.message || e}`);
            return 0;
        }
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

        return await channelSourceRepo.create({
            connectorId,
            channelId: channel.id,
            title: channel.title,
            username: channel.username,
            importRules: importRules || {},
            status: 'ACTIVE',
            lastError: null
        });
    }

    static async getChannelSources(connectorId: string) {
        return await prisma.channelSource.findMany({
            where: { connectorId },
            orderBy: { createdAt: 'desc' }
        });
    }

    static async deleteChannelSource(id: string) {
        return await channelSourceRepo.delete(id);
    }

    /**
     * History & Sync
     */
    static async getHistory(
        connectorId: string,
        channelId: string,
        limit = 20,
        offsetId = 0,
        offsetDate?: number,
        options?: { username?: string | null; sourceId?: string | null }
    ) {
        const client = await this.getClient(connectorId);
        await client.connect();

        try {
            let entity: any | null = null;
            let sourceStatus: string | null = null;
            const sanitizeUsername = (value?: string | null) => {
                if (!value) return undefined;
                let cleaned = String(value).trim();
                cleaned = cleaned.replace(/^@/, '');
                cleaned = cleaned.replace(/^https?:\/\/t\.me\//, '');
                cleaned = cleaned.replace(/\/+$/, '');
                return cleaned.trim() || undefined;
            };
            let username = sanitizeUsername(options?.username);
            if (options?.sourceId) {
                const source = await prisma.channelSource.findUnique({
                    where: { id: options.sourceId },
                    select: { username: true, status: true }
                });
                sourceStatus = source?.status || null;
                if (!username) username = sanitizeUsername(source?.username);
            }

            if (username) {
                entity = await client.getEntity(username);
            }

            if (!entity) {
                try {
                    entity = await client.getEntity(channelId);
                } catch {
                    entity = null;
                }
            }

            if (!entity) {
                throw new Error('Failed to resolve channel entity');
            }

            if (entity.className !== 'Channel' && entity.className !== 'Chat') {
                throw new Error('Target is not a channel or group');
            }

            const resolvedId = entity.id ? entity.id.toString() : channelId;
            const resolvedUpdateData: any = {};
            if (resolvedId && resolvedId !== channelId) resolvedUpdateData.channelId = resolvedId;
            if (entity.username && !username) resolvedUpdateData.username = entity.username;

            const messages = await client.getMessages(entity, {
                limit,
                offsetId,
                ...(offsetDate ? { offsetDate } : {})
            });

            if (options?.sourceId) {
                const updateData: any = {
                    ...resolvedUpdateData,
                    lastError: null,
                    lastSyncedAt: new Date()
                };
                if (sourceStatus === 'ERROR') updateData.status = 'ACTIVE';
                await channelSourceRepo.update(options.sourceId, updateData).catch(() => null);
            } else if (Object.keys(resolvedUpdateData).length > 0) {
                await prisma.channelSource.update({
                    where: { connectorId_channelId: { connectorId, channelId } },
                    data: resolvedUpdateData
                }).catch(() => null);
            }

            return messages;
        } catch (e: any) {
            logger.error(e);
            if (options?.sourceId) {
                await channelSourceRepo.update(options.sourceId, {
                    status: 'ERROR',
                    lastError: e.message || 'Failed to fetch history'
                }).catch(() => null);
            }
            throw new Error(`Failed to fetch history: ${e.message}`);
        }
    }

    static async extractMediaItems(
        client: TelegramClient,
        msg: any,
        context: MediaExtractionContext
    ): Promise<{ mediaUrls: string[]; mediaItems: MediaItem[] }> {
        try {
            const isPhoto = !!(msg.photo || msg.media?.photo || msg.media?.className === 'MessageMediaPhoto');
            if (!msg.media || (!isPhoto && !msg.media.document)) {
                return { mediaUrls: [], mediaItems: [] };
            }

            // check policy
            const policy = context.mediaPolicy || 'download';

            if (policy === 'refs_only') {
                // Return metadata without downloading
                const item = {
                    url: undefined, // No public URL
                    previewUrl: undefined,
                    source: 'MTPROTO',
                    tgFileId: msg.media?.photo?.id?.toString() || msg.media?.document?.id?.toString(),
                    tgMeta: {
                        messageId: msg.id,
                        groupedId: msg.groupedId?.toString(),
                        accessHash: msg.media?.photo?.accessHash?.toString() || msg.media?.document?.accessHash?.toString(),
                        fileReference: msg.media?.photo?.fileReference?.toString('base64') || msg.media?.document?.fileReference?.toString('base64')
                    }
                };
                return { mediaUrls: [], mediaItems: [item] };
            }

            if (!isPhoto) {
                // For now, only download photos if policy is download. 
                // Documents/Videos might be too large.
                return { mediaUrls: [], mediaItems: [] };
            }

            const sizeCandidates = [
                msg.media?.document?.size,
                msg.media?.photo?.sizes?.map((s: any) => s?.size || 0),
                msg.photo?.sizes?.map((s: any) => s?.size || 0)
            ].flat().filter((v: any) => typeof v === 'number' && v > 0) as number[];
            const estimatedSize = sizeCandidates.length ? Math.max(...sizeCandidates) : undefined;
            const maxBytes = Number(process.env.MEDIA_MAX_BYTES || 25 * 1024 * 1024);
            if (estimatedSize && estimatedSize > maxBytes) {
                throw new MediaLimitError(estimatedSize, maxBytes);
            }
            const raw = await client.downloadMedia(msg);
            if (!raw) {
                return { mediaUrls: [], mediaItems: [] };
            }
            const buffer = raw instanceof Buffer ? raw : Buffer.from(raw as any);
            const filename = `${context.sourceMessageId}_${Date.now()}.jpg`;
            const saved = await saveMediaBuffer({
                buffer,
                filename,
                companyId: context.companyId,
                sourceChatId: context.sourceChatId,
                sourceMessageId: context.sourceMessageId
            });
            const item = {
                url: saved.url,
                previewUrl: saved.url,
                source: 'MTPROTO',
                tgMeta: {
                    messageId: msg.id,
                    groupedId: msg.groupedId?.toString()
                }
            };
            return { mediaUrls: [saved.url], mediaItems: [item] };
        } catch (e) {
            if (e instanceof MediaLimitError) {
                await logIntegrationEvent({
                    companyId: context.companyId,
                    integration: 'TELEGRAM_MTPROTO',
                    entityId: context.channelSourceId || undefined,
                    action: 'media_skipped',
                    status: 'WARN',
                    message: 'MEDIA_TOO_LARGE',
                    meta: {
                        sourceChatId: context.sourceChatId,
                        sourceMessageId: context.sourceMessageId,
                        sizeBytes: e.sizeBytes,
                        limitBytes: e.limitBytes
                    }
                });
            }
            return { mediaUrls: [], mediaItems: [] };
        }
    }

    static mediaGroupKey(msg: any): string | null {
        return msg?.groupedId?.toString?.() || null;
    }

    static collectMediaGroupMessages(messages: any[], msg: any): any[] {
        const key = MTProtoService.mediaGroupKey(msg);
        if (!key) return [msg];
        const group = messages.filter((item) =>
            MTProtoService.mediaGroupKey(item) === key && !!(item.media || item.photo)
        );
        return group.length ? group : [msg];
    }

    static async extractMediaItemsFromMessages(
        client: TelegramClient,
        messages: any[],
        context: MediaExtractionContext
    ): Promise<{ mediaUrls: string[]; mediaItems: MediaItem[] }> {
        const mediaUrls: string[] = [];
        const mediaItems: MediaItem[] = [];
        const items = context.mediaPolicy === 'first_only' ? messages.slice(0, 1) : messages;

        for (const mediaMsg of items) {
            const extracted = await MTProtoService.extractMediaItems(client, mediaMsg, {
                ...context,
                sourceMessageId: Number(mediaMsg?.id || context.sourceMessageId)
            });
            mediaUrls.push(...extracted.mediaUrls);
            mediaItems.push(...extracted.mediaItems);
        }

        const uniqueUrls = Array.from(new Set(mediaUrls.filter(Boolean)));
        const uniqueItems = Array.from(new Map(
            mediaItems.map((item) => [
                item.url || item.previewUrl || item.tgFileId || JSON.stringify(item.tgMeta || item),
                item
            ])
        ).values());

        return { mediaUrls: uniqueUrls, mediaItems: uniqueItems };
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
        return channelSourceRepo.update(channelSourceId, {
            importRules: data.importRules
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

        const isReady = source.connector.status === 'READY' && !!source.connector.sessionString;

        // Mark sync start
        await channelSourceRepo.update(sourceId, { lastSyncedAt: new Date() });

        // No demo fallback: require authenticated session
        if (!isReady) {
            await channelSourceRepo.update(sourceId, {
                status: 'ERROR',
                lastError: 'MTProto connector is not authenticated',
                lastSyncedAt: new Date()
            });
            throw new Error('MTProto connector is not authenticated');
        }

        try {
            const client = await this.getClient(connectorId);
            await client.connect();

            const messages = await MTProtoService.getHistory(connectorId, source.channelId, 20, 0, undefined, {
                username: source.username || undefined,
                sourceId: source.id
            });
            let imported = 0;

            for (const msg of messages) {
                if (!msg.message) continue;

                const mediaMessages = MTProtoService.collectMediaGroupMessages(messages, msg);
                const media = await MTProtoService.extractMediaItemsFromMessages(client, mediaMessages, {
                    companyId: source.connector?.companyId,
                    sourceChatId: source.channelId,
                    sourceMessageId: msg.id,
                    channelSourceId: source.id,
                    mediaPolicy: (source.importRules as any)?.mediaPolicy
                });

                await processParsedMessage({
                    chatId: source.channelId,
                    messageId: msg.id,
                    text: msg.message,
                    date: new Date((msg.date as any) * 1000),
                    mediaUrls: media.mediaUrls,
                    mediaItems: media.mediaItems,
                    mediaGroupKey: (msg as any).groupedId?.toString()
                } as any, source as any);
                imported++;
            }

            await channelSourceRepo.update(sourceId, {
                status: 'ACTIVE',
                lastError: null,
                lastSyncedAt: new Date()
            });

            return { success: true, imported };

        } catch (e: any) {
            logger.error(`Sync failed for ${source.title}: ${e.message}`);
            await channelSourceRepo.update(sourceId, {
                status: 'ERROR',
                lastError: e.message || 'Sync failed'
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
