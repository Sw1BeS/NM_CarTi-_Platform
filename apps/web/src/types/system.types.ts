
import { Language } from './entities.types';

export type FeatureKey = 'MODULE_SCENARIOS' | 'MODULE_SEARCH' | 'MODULE_CAMPAIGNS' | 'MODULE_WHATSAPP' | 'MODULE_INSTAGRAM' | 'MODULE_COMPANIES';

export interface NavItemConfig {
    id: string;
    labelKey: string;
    path: string;
    iconName: string;
    visible: boolean;
    order: number;
    roles: string[];
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
    theme?: {
        primaryColor?: string;
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

export interface Company {
    id: string;
    name: string;
    status: 'ACTIVE' | 'BLOCKED' | 'PENDING';
    notes?: string;
    inviteCode?: string;
    createdAt: string;
    members?: string[];
}

export interface PartnerCompany {
    id: string;
    name: string;
    city?: string;
    contact?: string;
    notes?: string;
    companyId?: string;
}

export interface PartnerUser {
    id: string;
    name: string;
    telegramId?: string;
    phone?: string;
    partnerId?: string;
    companyId?: string;
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
