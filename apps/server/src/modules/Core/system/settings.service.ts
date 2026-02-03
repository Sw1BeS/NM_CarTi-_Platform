
import { prisma } from '../../../services/prisma.js';
import { DEFAULT_NAVIGATION } from './defaults.js';

const DEFAULT_FEATURES = {
    // Default fallbacks if DB is empty/old
    MODULE_SCENARIOS: true,
    MODULE_SEARCH: true,
    MODULE_CAMPAIGNS: true,
    MODULE_COMPANIES: false,
    MODULE_CONTENT: true,
    MODULE_INTEGRATIONS: false
};

const DEFAULT_PUBLIC_SETTINGS = {
    branding: {},
    modules: {},
    navigation: DEFAULT_NAVIGATION,
    features: DEFAULT_FEATURES
};

const normalizeNavigation = (nav: any) => {
    const primary = Array.isArray(nav?.primary)
        ? nav.primary
        : Array.isArray(nav?.items)
            ? nav.items
            : Array.isArray(nav)
                ? nav
                : [];

    const keyOf = (item: any) => item?.id || item?.path || item?.label || '';
    const map = new Map<string, any>();

    (primary || []).forEach((item: any, idx: number) => {
        const key = keyOf(item) || `custom_${idx}`;
        map.set(key, item);
    });

    (DEFAULT_NAVIGATION.primary || []).forEach((item: any, idx: number) => {
        const key = keyOf(item) || `default_${idx}`;
        const existing = map.get(key);
        map.set(key, { ...item, ...(existing || {}) });
    });

    const merged = Array.from(map.values()).map((item: any) => {
        const isLeads = item?.id === 'nav_leads' || item?.path === '/leads' || item?.label === 'Leads';
        if (isLeads) return { ...item, visible: true };
        return item;
    });

    return { primary: merged };
};

export class SettingsService {
    static async getSettings(isPublic = true) {
        const settings = await prisma.systemSettings.findFirst({
            orderBy: { id: 'desc' }
        });

        if (!settings) return DEFAULT_PUBLIC_SETTINGS;

        if (isPublic) {
            const nav = settings.navigation as any;
            const normalized = normalizeNavigation(nav);
            const hasNav = Array.isArray(normalized.primary) && normalized.primary.length > 0;

            return {
                branding: settings.branding || {},
                modules: settings.modules || {},
                navigation: hasNav ? normalized : DEFAULT_NAVIGATION,
                features: settings.features || DEFAULT_FEATURES
            };
        }

        return settings;
    }

    static async updateSettings(payload: any) {
        // If no settings exist, create one. Otherwise update.
        const existing = await prisma.systemSettings.findFirst();

        if (!existing) {
            return await prisma.systemSettings.create({
                data: {
                    branding: payload.branding ?? {},
                    modules: payload.modules ?? {},
                    navigation: payload.navigation ?? {},
                    features: payload.features ?? {}, // keep compat
                    autoriaApiKey: payload.autoriaApiKey,
                    metaPixelId: payload.metaPixelId,
                    metaToken: payload.metaToken,
                    metaTestCode: payload.metaTestCode,
                    sendpulseId: payload.sendpulseId,
                    sendpulseSecret: payload.sendpulseSecret
                }
            });
        }

        return await prisma.systemSettings.update({
            where: { id: existing.id },
            data: {
                branding: payload.branding ?? undefined,
                modules: payload.modules ?? undefined,
                navigation: payload.navigation ?? undefined,
                features: payload.features ?? undefined,
                autoriaApiKey: payload.autoriaApiKey ?? undefined,
                metaPixelId: payload.metaPixelId ?? undefined,
                metaToken: payload.metaToken ?? undefined,
                metaTestCode: payload.metaTestCode ?? undefined,
                sendpulseId: payload.sendpulseId ?? undefined,
                sendpulseSecret: payload.sendpulseSecret ?? undefined
            }
        });
    }
}
