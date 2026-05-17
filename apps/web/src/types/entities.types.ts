
import { TelegramDestination } from './entities/destination.types';

export type Language = 'EN' | 'RU' | 'UK';

export enum RequestStatus {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
    COLLECTING_VARIANTS = 'COLLECTING_VARIANTS',
    SHORTLIST = 'SHORTLIST',
    CONTACT_SHARED = 'CONTACT_SHARED',
    WON = 'WON',
    LOST = 'LOST',
    CLOSED = 'CLOSED'
}

export enum VariantStatus {
    SUBMITTED = 'SUBMITTED',
    REVIEWED = 'REVIEWED',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    SENT_TO_CLIENT = 'SENT_TO_CLIENT'
}

export type RequesterDecision = 'PENDING' | 'FIT' | 'NOT_FIT';
export type FitQueueStatus = 'NEW' | 'IN_PROGRESS' | 'AGREED' | 'MEETING_SCHEDULED' | 'CLOSED';

export interface CarCard {
    id?: string;
    canonicalId: string;
    source: 'INTERNAL' | 'AUTORIA' | 'OLX' | 'REONO' | 'EXTERNAL' | 'MANUAL';
    sourceId?: string;
    sourceUrl: string;
    title: string;
    brand?: string;
    model?: string;
    price: { amount: number; currency: 'USD' | 'EUR' | 'UAH' };
    year: number;
    mileage: number;
    location: string;
    thumbnail: string;
    mediaUrls?: string[];
    mediaItems?: Array<{ url?: string; previewUrl?: string; tgFileId?: string; tgMeta?: any; source?: string }>;
    specs: {
        brand?: string;
        model?: string;
        engine?: string;
        transmission?: string;
        fuel?: string;
        vin?: string;
        drive?: string;
        color?: string;
        condition?: string;
    };
    description?: string;
    status: 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'PENDING' | 'HIDDEN';
    availabilityState?: 'IN_STOCK' | 'IN_TRANSIT' | 'IMPORT_TO_ORDER' | 'RESERVED' | 'SOLD' | 'UNKNOWN';
    publicationStatus?: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'HIDDEN';
    postedAt: string;
    presentation?: VehiclePresentation;
}

export interface VehiclePresentation {
    title: string;
    subtitle: string;
    priceLabel: string;
    mileageLabel: string;
    statusLabel: string;
    specChips: string[];
    detailRows: Array<{ label: string; value: string }>;
    badges: string[];
    mediaUrls: string[];
}

export interface RequestPresentation {
    title: string;
    sourceLabel: 'MiniApp' | 'Telegram Bot' | 'B2B Bot' | 'Admin';
    customerLabel: string;
    contactLabel?: string;
    intentLabel: 'Підбір авто' | 'Ціна/умови' | 'Продаж авто' | 'B2B заявка';
    selectedCarLabels: string[];
    criteriaChips: string[];
    timeline: Array<{ at: string; label: string }>;
}

export interface Variant extends Omit<CarCard, 'status'> {
    id: string;
    requestId: string;
    status: VariantStatus;
    companyName?: string;
    contact?: string;
    requesterDecision?: RequesterDecision;
    fitQueueStatus?: FitQueueStatus;
    requesterDecisionAt?: string;
    fitQueuedAt?: string;
    fitClosedAt?: string;
    sellerPartnerId?: string;
    statusHistory?: Array<{ status: string; at: string; by?: string }>;
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
    type: 'BUY' | 'SELL';
    budgetMin: number;
    budgetMax: number;
    yearMin: number;
    yearMax: number;
    city: string;
    description: string;
    priority: 'HIGH' | 'NORMAL' | 'LOW' | 'URGENT';
    assigneeId?: string;
    tags?: string[];
    notes?: string;
    internalNote?: string;
    presentation?: RequestPresentation;
    operatorPresentation?: RequestPresentation;
    payload?: Record<string, unknown>;
    status: RequestStatus;
    leadId?: string;
    botId?: string;
    requesterPartnerId?: string;
    channelPostUrl?: string;
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
    telegramUserId?: string;
    telegramUsername?: string;
    telegramName?: string;
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

export interface ShowcaseRules {
    mode: 'FILTER' | 'MANUAL' | 'HYBRID';
    filters?: {
        status?: string[];
        availabilityState?: string[];
        publicationStatus?: string[];
        priceMin?: number;
        priceMax?: number;
        yearMin?: number;
        yearMax?: number;
    };
    includeIds?: string[];
    excludeIds?: string[];
}

export interface Showcase {
    id: string;
    name: string;
    slug: string;
    botId?: string;
    isPublic: boolean;
    rules: ShowcaseRules;
}
