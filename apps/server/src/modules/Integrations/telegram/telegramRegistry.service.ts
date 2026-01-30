import { prisma } from '../../../services/prisma.js';
import { ChannelSourceRepository, TelegramDestinationRepository } from '../../../repositories/index.js';
import { MTProtoService } from '../mtproto/mtproto.service.js';

type RegistryAccess = 'BOT' | 'MTPROTO';
type RegistryRole = 'SOURCE' | 'DESTINATION' | 'BOTH';
type RegistryStatus = 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISCOVERED';
type RegistryType = 'USER' | 'GROUP' | 'CHANNEL';

type RegistryUpsertInput = {
    companyId: string;
    tgId: string;
    type: RegistryType;
    title: string;
    username?: string | null;
    access: RegistryAccess;
    role: RegistryRole;
    status?: RegistryStatus;
    lastSyncAt?: Date | null;
    lastError?: string | null;
    connectorId?: string | null;
    channelSourceId?: string | null;
    botId?: string | null;
};

const channelSourceRepo = new ChannelSourceRepository(prisma);
const telegramDestinationRepo = new TelegramDestinationRepository(prisma);

const normalizeType = (value: any): RegistryType => {
    const t = String(value || '').toUpperCase();
    if (t === 'CHANNEL' || t === 'GROUP') return t;
    return 'USER';
};

const mergeRole = (current?: string | null, incoming?: string | null): RegistryRole => {
    const currentRole = String(current || '').toUpperCase();
    const incomingRole = String(incoming || '').toUpperCase();
    if (!currentRole) return (incomingRole as RegistryRole) || 'DESTINATION';
    if (!incomingRole) return currentRole as RegistryRole;
    if (currentRole === 'BOTH' || incomingRole === 'BOTH') return 'BOTH';
    if (currentRole !== incomingRole) return 'BOTH';
    return currentRole as RegistryRole;
};

const ensureString = (value: any, fallback = '') => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return fallback;
};

export class TelegramRegistryService {
    private async upsertRegistryItem(input: RegistryUpsertInput, preserveStatus: boolean) {
        const existing = await prisma.telegramDestination.findUnique({
            where: {
                companyId_tgId_access: {
                    companyId: input.companyId,
                    tgId: input.tgId,
                    access: input.access
                }
            }
        });

        const role = mergeRole(existing?.role, input.role);
        const status = preserveStatus && existing?.status ? existing.status : (input.status || existing?.status || 'ACTIVE');

        if (existing) {
            return telegramDestinationRepo.update(existing.id, {
                tgId: input.tgId,
                type: input.type,
                title: input.title,
                username: input.username ?? existing.username,
                access: input.access,
                role,
                status,
                lastSyncAt: input.lastSyncAt ?? existing.lastSyncAt,
                lastError: input.lastError ?? existing.lastError,
                connectorId: input.connectorId ?? existing.connectorId,
                channelSourceId: input.channelSourceId ?? existing.channelSourceId,
                botId: input.botId ?? existing.botId
            });
        }

        return telegramDestinationRepo.create({
            companyId: input.companyId,
            tgId: input.tgId,
            type: input.type,
            title: input.title,
            username: input.username ?? null,
            access: input.access,
            role,
            status: input.status || 'ACTIVE',
            lastSyncAt: input.lastSyncAt ?? null,
            lastError: input.lastError ?? null,
            connectorId: input.connectorId ?? null,
            channelSourceId: input.channelSourceId ?? null,
            botId: input.botId ?? null
        });
    }

    private async syncFromMtproto(companyId: string) {
        const sources = await prisma.channelSource.findMany({
            where: { connector: { companyId } },
            include: { connector: true }
        });

        for (const source of sources) {
            await this.upsertRegistryItem({
                companyId,
                tgId: String(source.channelId),
                type: 'CHANNEL',
                title: source.title,
                username: source.username,
                access: 'MTPROTO',
                role: 'SOURCE',
                status: (source.status as RegistryStatus) || 'ACTIVE',
                lastSyncAt: source.lastSyncedAt,
                lastError: source.lastError,
                connectorId: source.connectorId,
                channelSourceId: source.id
            }, false);
        }
    }

    private async syncFromBots(companyId: string) {
        const bots = await prisma.botConfig.findMany({
            where: { companyId }
        });

        for (const bot of bots) {
            if (bot.channelId) {
                await this.upsertRegistryItem({
                    companyId,
                    tgId: String(bot.channelId),
                    type: 'CHANNEL',
                    title: `${bot.name || 'Bot'} Channel`,
                    username: null,
                    access: 'BOT',
                    role: 'DESTINATION',
                    status: bot.isEnabled ? 'ACTIVE' : 'PAUSED',
                    botId: bot.id
                }, true);
            }

            if (bot.adminChatId) {
                await this.upsertRegistryItem({
                    companyId,
                    tgId: String(bot.adminChatId),
                    type: 'USER',
                    title: `${bot.name || 'Bot'} Admin Chat`,
                    username: null,
                    access: 'BOT',
                    role: 'DESTINATION',
                    status: bot.isEnabled ? 'ACTIVE' : 'PAUSED',
                    botId: bot.id
                }, true);
            }
        }
    }

    private async syncFromMessages(companyId: string) {
        const messages = await prisma.botMessage.findMany({
            where: { bot: { companyId } },
            select: { chatId: true, payload: true, botId: true },
            orderBy: { createdAt: 'desc' },
            take: 500
        });

        const seen = new Set<string>();

        for (const row of messages) {
            const tgId = ensureString(row.chatId);
            if (!tgId || seen.has(tgId)) continue;
            seen.add(tgId);

            const payload = (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload))
                ? row.payload as any
                : {};
            const chat = payload.chat || {};
            const from = payload.from || {};

            const type = normalizeType(chat.type);
            const title = ensureString(chat.title)
                || ensureString(`${from.first_name || ''} ${from.last_name || ''}`.trim())
                || ensureString(from.username)
                || tgId;
            const username = ensureString(chat.username) || ensureString(from.username) || null;

            await this.upsertRegistryItem({
                companyId,
                tgId,
                type,
                title,
                username,
                access: 'BOT',
                role: 'DESTINATION',
                status: 'DISCOVERED',
                botId: row.botId
            }, true);
        }
    }

    async list(companyId: string) {
        await this.syncFromMtproto(companyId);
        await this.syncFromBots(companyId);
        await this.syncFromMessages(companyId);

        return prisma.telegramDestination.findMany({
            where: { companyId },
            orderBy: { updatedAt: 'desc' }
        });
    }

    async create(companyId: string, payload: any) {
        const tgId = ensureString(payload?.tgId || payload?.identifier || payload?.chatId);
        if (!tgId) throw new Error('tgId is required');

        const access = String(payload?.access || 'BOT').toUpperCase() as RegistryAccess;
        const role = String(payload?.role || 'DESTINATION').toUpperCase() as RegistryRole;

        return telegramDestinationRepo.create({
            companyId,
            tgId,
            type: normalizeType(payload?.type),
            title: ensureString(payload?.title || payload?.name, tgId),
            username: payload?.username || null,
            access,
            role,
            status: (payload?.status ? String(payload.status).toUpperCase() : 'ACTIVE') as RegistryStatus,
            lastSyncAt: payload?.lastSyncAt ? new Date(payload.lastSyncAt) : null,
            lastError: payload?.lastError || null,
            connectorId: payload?.connectorId || null,
            channelSourceId: payload?.channelSourceId || null,
            botId: payload?.botId || null
        });
    }

    async update(companyId: string, id: string, payload: any) {
        const existing = await prisma.telegramDestination.findFirst({
            where: { id, companyId }
        });
        if (!existing) throw new Error('Destination not found');

        const role = mergeRole(existing.role, payload?.role);

        return telegramDestinationRepo.update(existing.id, {
            type: payload?.type ? normalizeType(payload.type) : existing.type,
            title: payload?.title ? String(payload.title) : existing.title,
            username: payload?.username !== undefined ? payload.username : existing.username,
            role,
            status: payload?.status ? String(payload.status).toUpperCase() : existing.status,
            lastError: payload?.lastError !== undefined ? payload.lastError : existing.lastError,
            lastSyncAt: payload?.lastSyncAt ? new Date(payload.lastSyncAt) : existing.lastSyncAt
        });
    }

    async setStatus(companyId: string, id: string, status: RegistryStatus) {
        const existing = await prisma.telegramDestination.findFirst({
            where: { id, companyId }
        });
        if (!existing) throw new Error('Destination not found');

        const updated = await telegramDestinationRepo.update(existing.id, { status });

        if (existing.channelSourceId) {
            await channelSourceRepo.update(existing.channelSourceId, { status });
        }

        return updated;
    }

    async syncNow(companyId: string, id: string) {
        const existing = await prisma.telegramDestination.findFirst({
            where: { id, companyId }
        });
        if (!existing) throw new Error('Destination not found');

        if (existing.access !== 'MTPROTO' || !existing.channelSourceId) {
            throw new Error('Sync is only available for MTProto sources');
        }

        const channelSource = await prisma.channelSource.findUnique({
            where: { id: existing.channelSourceId }
        });
        if (!channelSource) throw new Error('Channel source not found');

        const connectorId = existing.connectorId || channelSource.connectorId;

        MTProtoService.syncChannel(connectorId, channelSource.id)
            .catch(() => null);

        await telegramDestinationRepo.update(existing.id, {
            lastSyncAt: new Date(),
            lastError: null
        });

        return { success: true };
    }

    async getLogs(companyId: string, id: string) {
        const existing = await prisma.telegramDestination.findFirst({
            where: { id, companyId }
        });
        if (!existing) throw new Error('Destination not found');

        if (existing.access === 'MTPROTO') {
            const listings = await prisma.carListing.findMany({
                where: { sourceChatId: existing.tgId, companyId },
                orderBy: { createdAt: 'desc' },
                take: 20
            });

            return listings.map(item => ({
                type: 'CAR_IMPORT',
                messageId: item.sourceMessageId,
                title: item.title,
                createdAt: item.createdAt,
                status: item.status
            }));
        }

        const messages = await prisma.botMessage.findMany({
            where: { chatId: existing.tgId, bot: { companyId } },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        return messages.map(msg => ({
            type: 'BOT_MESSAGE',
            messageId: msg.messageId,
            direction: msg.direction,
            text: msg.text,
            createdAt: msg.createdAt
        }));
    }
}
