
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

export class SettingsService {
    static async getSettings(isPublic = true) {
        const settings = await prisma.systemSettings.findFirst({
            orderBy: { id: 'desc' }
        });

        if (!settings) return DEFAULT_PUBLIC_SETTINGS;

        if (isPublic) {
            const nav = settings.navigation as any;
            const hasNav = nav && nav.items && nav.items.length > 0;

            return {
                branding: settings.branding || {},
                modules: settings.modules || {},
                navigation: hasNav ? settings.navigation : DEFAULT_NAVIGATION,
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
