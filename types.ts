
export interface TelegramMessage {
    id: string;
    messageId: number;
    chatId: string;
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

// Updated to match backend
export type UserRole = 'ADMIN' | 'MANAGER' | 'VIEWER' | 'SUPER_ADMIN' | 'OPERATOR' | 'DEALER'; 

// Updated User Interface
export interface User {
    id: string; // Changed to string to match system standard
    name: string;
    email: string;
    role: UserRole;
    // Optional legacy fields to prevent instant crashes in other components
    username?: string; 
    avatar?: string;
    companyId?: string;
    telegramUserId?: string;
}

export interface Company {
    id: string;
    name: string;
    status: 'ACTIVE' | 'BLOCKED' | 'PENDING';
    notes?: string;
    inviteCode?: string;
    createdAt: string;
    members?: string[];
}

export type Permission = 'MANAGE_USERS' | 'MANAGE_SETTINGS' | 'VIEW_ANALYTICS' | 'APPROVE_CONTENT' | 'SEND_CAMPAIGNS' | 'MANAGE_LEADS' | 'MANAGE_REQUESTS' | 'VIEW_LOGS' | 'MANAGE_COMPANIES' | 'MANAGE_ENTITIES';

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
    'ADMIN': ['MANAGE_USERS', 'MANAGE_SETTINGS', 'VIEW_ANALYTICS', 'APPROVE_CONTENT', 'SEND_CAMPAIGNS', 'MANAGE_LEADS', 'MANAGE_REQUESTS', 'VIEW_LOGS', 'MANAGE_COMPANIES', 'MANAGE_ENTITIES'],
    'SUPER_ADMIN': ['MANAGE_USERS', 'MANAGE_SETTINGS', 'VIEW_ANALYTICS', 'APPROVE_CONTENT', 'SEND_CAMPAIGNS', 'MANAGE_LEADS', 'MANAGE_REQUESTS', 'VIEW_LOGS', 'MANAGE_COMPANIES', 'MANAGE_ENTITIES'],
    'MANAGER': ['VIEW_ANALYTICS', 'APPROVE_CONTENT', 'SEND_CAMPAIGNS', 'MANAGE_LEADS', 'MANAGE_REQUESTS'],
    'VIEWER': ['VIEW_ANALYTICS'],
    'OPERATOR': ['MANAGE_LEADS', 'MANAGE_REQUESTS'] // Legacy
};

export type Language = 'EN' | 'RU' | 'UK';

export enum RequestStatus {
    NEW = 'NEW',
    IN_PROGRESS = 'IN_PROGRESS',
    READY_FOR_REVIEW = 'READY_FOR_REVIEW',
    PUBLISHED = 'PUBLISHED',
    CLOSED = 'CLOSED'
}

export enum VariantStatus {
    PENDING = 'PENDING',
    FIT = 'FIT',
    REJECT = 'REJECT'
}

// UNIFIED CAR CARD DTO
export interface CarCard {
    canonicalId: string; // Unique Fingerprint
    source: 'INTERNAL' | 'AUTORIA' | 'OLX' | 'REONO' | 'EXTERNAL' | 'MANUAL';
    sourceUrl: string;
    title: string;
    price: { amount: number; currency: 'USD' | 'EUR' | 'UAH' };
    year: number;
    mileage: number; // km
    location: string;
    thumbnail: string;
    mediaUrls?: string[]; // Multiple photos
    specs: { 
        engine?: string; 
        transmission?: string; 
        fuel?: string; 
        vin?: string;
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
    fitScore?: number; // 0-5
    managerNotes?: string;
    contentStatus?: 'NONE' | 'DRAFT' | 'PUBLISHED';
    url?: string; 
}

export type CarListing = CarCard;

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
    status: RequestStatus;
    createdAt: string;
    updatedAt?: string;
    variants: Variant[];
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

export interface TelegramDestination {
    id: string;
    name: string;
    type: 'USER' | 'GROUP' | 'CHANNEL';
    identifier: string;
    tags: string[];
    verified: boolean;
}

export interface BotMenuButtonConfig {
    id: string;
    label: string;
    label_uk?: string; // Localization support
    label_ru?: string; // Localization support
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
        icon: string; // Icon name
        actionType: 'SCENARIO' | 'LINK' | 'VIEW';
        value: string;
    }[];
}

export interface Bot {
    id: string;
    name: string;
    username: string;
    token: string;
    role: 'CLIENT' | 'CHANNEL' | 'BOTH';
    active: boolean;
    publicBaseUrl?: string; // Overrides window.location.origin for WebApp button
    autoSync?: boolean;
    lastUpdateId?: number;
    defaultScenarioId?: string; 
    menuConfig?: {
        buttons: BotMenuButtonConfig[];
        welcomeMessage?: string;
    };
    miniAppConfig?: MiniAppConfig;
    adminChannelId?: string; 
    processedUpdateIds?: number[]; // IDs of processed updates to avoid duplicates
    stats?: {
        processed: number;
        ignored: number;
        lastRun: string;
        errors: number;
    };
}

export interface ActivityLog {
    id: string;
    userId: string;
    action: string;
    details: string;
    timestamp: string;
    entityType: string;
    entityId?: string;
}

export interface BotSession {
    chatId: string;
    platform: 'TG' | 'WA' | 'IG';
    botId: string;
    language: Language;
    variables: Record<string, any>;
    history: string[];
    lastMessageAt: number;
    messageCount: number;
    activeScenarioId?: string;
    currentNodeId?: string;
    tempResults?: CarListing[]; // Stored search results for carousel
    b2bDraft?: {
        requestId: string;
        step: 'LINK' | 'PRICE' | 'CONFIRM';
        data: Partial<Variant>;
    };
}

export type NodeType = 
    'MESSAGE' | 
    'QUESTION_TEXT' | 
    'QUESTION_CHOICE' | 
    'MENU_REPLY' | // New: Persistent Keyboard
    'SEARCH_CARS' | 
    'HANDOFF' | 
    'REQUEST_CONTACT' | 
    'ACTION' | 
    'CONDITION' | // New: Branching
    'DELAY' |     // New: UX
    'GALLERY' |   // Added missing type
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
        // Condition Logic
        conditionVariable?: string;
        conditionOperator?: 'EQUALS' | 'CONTAINS' | 'GT' | 'LT' | 'HAS_VALUE';
        conditionValue?: string | number;
        trueNodeId?: string;
        falseNodeId?: string;
        // Action Logic
        actionType?: 'NORMALIZE_REQUEST' | 'CREATE_LEAD' | 'CREATE_REQUEST' | 'TAG_USER' | 'SET_LANG' | 'NOTIFY_ADMIN';
    };
    nextNodeId?: string;
    position?: { x: number; y: number };
}

export interface Scenario {
    id: string;
    name: string;
    triggerCommand: string;
    keywords?: string[]; // New: Trigger by text
    isActive: boolean;
    entryNodeId: string;
    createdAt: string;
    updatedAt: string;
    nodes: ScenarioNode[];
}

export type FeatureKey = 'MODULE_SCENARIOS' | 'MODULE_SEARCH' | 'MODULE_CAMPAIGNS' | 'MODULE_WHATSAPP' | 'MODULE_INSTAGRAM' | 'MODULE_COMPANIES';

export interface NavItemConfig {
    id: string;
    labelKey: string;
    path: string;
    iconName: string;
    visible: boolean;
    order: number;
    roles: string[]; // Use string array to allow mix of legacy and new roles
    featureKey?: FeatureKey;
}

export interface IntegrationConfig {
    platform: 'WA' | 'IG';
    isEnabled: boolean;
    credentials: {
        accessToken: string;
        accountId: string;
        verifyToken?: string;
        webhookSecret?: string;
    };
}

export interface SystemSettings {
    adminDestinationId?: string;
    features?: Partial<Record<FeatureKey, boolean>>;
    navigation?: NavItemConfig[];
    integrations?: {
        wa: IntegrationConfig;
        ig: IntegrationConfig;
    };
}

export interface SystemNotification {
    id: string;
    type: 'INFO' | 'SUCCESS' | 'ERROR';
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
    link?: string;
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

export interface DictionaryEntry {
    key: string;
    values: string[]; 
    metadata?: any;
}

export interface DictionaryCollection {
    brands: DictionaryEntry[];
    cities: DictionaryEntry[];
}

export interface ChatMacro {
    id: string;
    shortcut: string; 
    text: string;
    category?: string;
}
