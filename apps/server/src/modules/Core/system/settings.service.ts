
import { prisma } from '../../../services/prisma.js';

export class SettingsService {
    static async getSettings(isPublic = true) {
        const settings = await prisma.systemSettings.findFirst({
            orderBy: { id: 'desc' }
        });

        if (!settings) return null;

        if (isPublic) {
            return {
                branding: settings.branding,
                modules: settings.modules,
                navigation: settings.navigation,
                features: settings.features // keep compat
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
