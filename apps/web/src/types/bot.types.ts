
import { CarListing, Variant, ChannelPost, MessageLog } from './entities.types';
import { TelegramDestination } from './entities/destination.types';

export interface Bot {
    id: string;
    name: string;
    username: string;
    token: string;
    role: 'CLIENT' | 'CHANNEL' | 'BOTH';
    active: boolean;
    publicBaseUrl?: string;
    autoSync?: boolean;
    lastUpdateId?: number;
    defaultScenarioId?: string;
    menuConfig?: {
        buttons: BotMenuButtonConfig[];
        welcomeMessage?: string;
    };
    miniAppConfig?: MiniAppConfig;
    adminChannelId?: string;
    channelId?: string;
    processedUpdateIds?: number[];
    defaultShowcaseId?: string;
    defaultShowcaseSlug?: string;
    stats?: {
        processed: number;
        ignored: number;
        lastRun: string;
        errors: number;
    };
}

export interface BotMenuButtonConfig {
    id: string;
    label: string;
    label_uk?: string;
    label_ru?: string;
    type: 'SCENARIO' | 'LINK' | 'TEXT';
    value: string;
    row: number;
    col: number;
}

export interface MiniAppConfig {
    isEnabled: boolean;
    title: string;
    welcomeText: string;
    headerImageUrl?: string;
    primaryColor: string;
    layout: 'GRID' | 'LIST';
    actions: {
        id: string;
        label: string;
        icon: string;
        actionType: 'SCENARIO' | 'LINK' | 'VIEW';
        value: string;
    }[];
}

export type NodeType =
    'MESSAGE' |
    'QUESTION_TEXT' |
    'QUESTION_CHOICE' |
    'MENU_REPLY' |
    'SEARCH_CARS' |
    'SEARCH_FALLBACK' |
    'HANDOFF' |
    'REQUEST_CONTACT' |
    'ACTION' |
    'CONDITION' |
    'DELAY' |
    'GALLERY' |
    'CHANNEL_POST' |
    'REQUEST_BROADCAST' |
    'OFFER_COLLECT' |
    'START' |
    'JUMP';

export interface ScenarioNode {
    id: string;
    type: NodeType;
    content: {
        text?: string;
        text_uk?: string;
        text_ru?: string;
        variableName?: string;
        choices?: {
            label: string;
            label_uk?: string;
            label_ru?: string;
            value: string;
            nextNodeId?: string
        }[];
        conditionVariable?: string;
        conditionOperator?: 'EQUALS' | 'CONTAINS' | 'GT' | 'LT' | 'HAS_VALUE';
        conditionValue?: string | number;
        trueNodeId?: string;
        falseNodeId?: string;
        actionType?: 'NORMALIZE_REQUEST' | 'CREATE_LEAD' | 'CREATE_REQUEST' | 'TAG_USER' | 'SET_LANG' | 'NOTIFY_ADMIN';
        destinationId?: string;
        destinationVar?: string;
        imageUrl?: string;
        imageVar?: string;
        scheduledAt?: string;
        scheduledAtVar?: string;
        requestIdVar?: string;
        buttonText?: string;
        dealerChatVar?: string;
    };
    nextNodeId?: string;
    position?: { x: number; y: number };
}

export interface Scenario {
    id: string;
    name: string;
    triggerCommand: string;
    keywords?: string[];
    isActive: boolean;
    entryNodeId: string;
    createdAt: string;
    updatedAt: string;
    nodes: ScenarioNode[];
}

export interface BotSession {
    chatId: string;
    platform: 'TG' | 'WA' | 'IG';
    botId: string;
    language: 'EN' | 'RU' | 'UK';
    variables: Record<string, any>;
    history: string[];
    lastMessageAt: number;
    messageCount: number;
    activeScenarioId?: string;
    currentNodeId?: string;
    tempResults?: CarListing[];
    b2bDraft?: {
        requestId: string;
        step: 'LINK' | 'PRICE' | 'CONFIRM';
        data: Partial<Variant>;
    };
}

export interface TelegramMessage {
    id: string;
    messageId: number;
    chatId: string;
    botId?: string;
    platform?: 'TG' | 'WA' | 'IG';
    direction: 'INCOMING' | 'OUTGOING';
    from: string;
    fromId?: string;
    text: string;
    mediaUrl?: string;
    date: string;
    status: 'NEW' | 'READ' | 'REPLIED';
    linkedLeadId?: string;
    isAuto?: boolean;
    buttons?: { text: string; value: string }[];
}



export interface ChatMacro {
    id: string;
    shortcut: string;
    text: string;
    category: string;
}

export enum ContentStatus {
    DRAFT = 'DRAFT',
    REVIEW = 'REVIEW',
    APPROVED = 'APPROVED',
    SENT = 'SENT',
    SCHEDULED = 'SCHEDULED'
}

export interface TelegramContent {
    id: string;
    title: string;
    body: string;
    type: 'POST' | 'STORY';
    status: ContentStatus;
    isTemplate?: boolean;
    category?: string;
    mediaUrls?: string[];
    requestId?: string;
    createdAt: string;
    actions?: { text: string; type: 'LINK' | 'CALLBACK'; value: string }[];
}

export interface DeliveryLog {
    destinationId: string;
    status: 'SUCCESS' | 'FAILED';
    sentAt: string;
    messageId?: number;
    error?: string;
}

export interface Campaign {
    id: string;
    name: string;
    botId: string;
    contentId: string;
    destinationIds: string[];
    status: 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
    scheduledAt?: string;
    createdAt: string;
    progress: { sent: number; total: number; failed: number };
    logs: DeliveryLog[];
}
