export interface TelegramRegistryItem {
    id: string;
    tgId: string;
    type: 'USER' | 'GROUP' | 'CHANNEL' | string;
    title: string;
    username?: string | null;
    access: 'BOT' | 'MTPROTO' | string;
    role: 'SOURCE' | 'DESTINATION' | 'BOTH' | string;
    status: 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISCOVERED' | string;
    lastSyncAt?: string | null;
    lastError?: string | null;
    connectorId?: string | null;
    channelSourceId?: string | null;
    botId?: string | null;
    createdAt?: string;
    updatedAt?: string;
}
