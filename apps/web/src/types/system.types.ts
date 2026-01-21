
export interface SystemBranding {
    primaryColor?: string;
    logoUrl?: string;
    faviconUrl?: string;
    timezone?: string;
    currency?: string;
    dateFormat?: string;
    defaultLanguage?: string;
}

export type FeatureKey = 'scenarios' | 'inventory' | 'analytics' | 'bots' | 'crm' | 'finance';

export interface SystemModules {
    scenarios?: boolean;
    inventory?: boolean;
    analytics?: boolean;
    bots?: boolean;
}

export interface NavigationItem {
    key: string;
    label: string;
    href: string;
    icon?: string;
    roles?: string[];
}

export interface SystemNavigation {
    primary?: NavigationItem[];
    secondary?: NavigationItem[];
}

export interface SystemSettings {
    id?: number;
    branding?: SystemBranding;
    modules?: SystemModules;
    navigation?: SystemNavigation;
    features?: any; // legacy
    integrations?: any;
    autoriaApiKey?: string;
    metaPixelId?: string;
    metaToken?: string;
    metaTestCode?: string;
}

export interface DictionaryCollection {
    id: string;
    brands: string[];
    cities: string[];
}

export interface SystemNotification {
    id: string;
    type: string;
    message: string;
    read: boolean;
    createdAt: string;
}

export interface ActivityLog {
    id: string;
    userId: string;
    action: string;
    details: string;
    entityType: string;
    timestamp: string;
}
