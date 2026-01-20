
import { TelegramDestination } from './entities/destination.types';

export type Language = 'EN' | 'RU' | 'UK';

export enum RequestStatus {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
    COLLECTING_VARIANTS = 'COLLECTING_VARIANTS',
    SHORTLIST = 'SHORTLIST',
    CONTACT_SHARED = 'CONTACT_SHARED',
    WON = 'WON',
    LOST = 'LOST'
}

export enum VariantStatus {
    SUBMITTED = 'SUBMITTED',
    REVIEWED = 'REVIEWED',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    SENT_TO_CLIENT = 'SENT_TO_CLIENT'
}

export interface CarCard {
    id?: string;
    canonicalId: string;
    source: 'INTERNAL' | 'AUTORIA' | 'OLX' | 'REONO' | 'EXTERNAL' | 'MANUAL';
    sourceId?: string;
    sourceUrl: string;
    title: string;
    price: { amount: number; currency: 'USD' | 'EUR' | 'UAH' };
    year: number;
    mileage: number;
    location: string;
    thumbnail: string;
    mediaUrls?: string[];
    specs: {
        engine?: string;
        transmission?: string;
        fuel?: string;
        vin?: string;
        drive?: string;
        color?: string;
    };
    description?: string;
    status: 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'PENDING' | 'HIDDEN';
    postedAt: string;
}

export interface Variant extends Omit<CarCard, 'status'> {
    id: string;
    requestId: string;
    status: VariantStatus;
    fitScore?: number;
    managerNotes?: string;
    contentStatus?: 'NONE' | 'DRAFT' | 'PUBLISHED';
    url?: string;
}

export type CarListing = CarCard;

export interface ChannelPost {
    id: string;
    requestId: string;
    botId?: string;
    channelId: string;
    messageId: number;
    status: 'ACTIVE' | 'UPDATED' | 'CLOSED' | string;
    payload?: Record<string, any>;
    createdAt: string;
    updatedAt: string;
}

export interface MessageLog {
    id: string;
    requestId?: string;
    variantId?: string;
    botId?: string;
    chatId: string;
    direction: 'INCOMING' | 'OUTGOING';
    text?: string;
    payload?: Record<string, any>;
    createdAt: string;
}

export interface B2BRequest {
    id: string;
    publicId: string;
    platform: 'TG' | 'WA' | 'IG';
    title: string;
    budgetMin: number;
    budgetMax: number;
    yearMin: number;
    yearMax: number;
    city: string;
    description: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    assigneeId?: string;
    tags?: string[];
    notes?: string;
    internalNote?: string;
    status: RequestStatus;
    createdAt: string;
    updatedAt?: string;
    variants: Variant[];
    channelPosts?: ChannelPost[];
    messages?: MessageLog[];
    language?: Language;
    clientChatId?: string;
}

export enum LeadStatus {
    NEW = 'NEW',
    CONTACTED = 'CONTACTED',
    WON = 'WON',
    LOST = 'LOST'
}

export interface Lead {
    id: string;
    name: string;
    status: LeadStatus;
    source: 'MANUAL' | 'WEB' | 'TELEGRAM' | 'WA' | 'IG' | 'WHATSAPP' | 'INSTAGRAM';
    telegramChatId?: string;
    telegramUsername?: string;
    phone?: string;
    email?: string;
    goal?: string;
    notes?: string;
    linkedRequestId?: string;
    language?: Language;
    createdAt: string;
    lastInteractionAt?: string;
}

export interface Proposal {
    id: string;
    leadId?: string;
    requestId: string;
    variantIds: string[];
    status: 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED';
    createdAt: string;
    views: number;
    clientFeedback?: Record<string, 'LIKE' | 'DISLIKE' | 'INTERESTED'>;
    publicLink: string;
}

export interface CarSearchFilter {
    brand?: string;
    model?: string;
    yearMin?: number;
    yearMax?: number;
    priceMin?: number;
    priceMax?: number;
    city?: string;
}

export interface Company {
    id: string;
    name: string;
    plan: 'FREE' | 'PRO' | 'ENTERPRISE';
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: string;
}
