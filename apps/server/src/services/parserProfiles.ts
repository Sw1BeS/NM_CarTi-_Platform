
// @ts-ignore
import { prisma } from './prisma.js';

export interface ParserSelectors {
    title?: string;
    price?: string;
    year?: string;
    mileage?: string;
    description?: string;
    engine?: string;
    transmission?: string;
    imageContainer?: string; // container for gallery
}

export const getProfile = async (domain: string): Promise<ParserSelectors | null> => {
    try {
        const settings = await prisma.systemSettings.findFirst({ orderBy: { id: 'desc' } });
        if (!settings?.modules) return null;
        const modules = settings.modules as any;
        return modules.parserProfiles?.[domain] || null;
    } catch (e) {
        console.error('Failed to get parser profile', e);
        return null;
    }
};

export const saveProfile = async (domain: string, selectors: ParserSelectors) => {
    try {
        const settings = await prisma.systemSettings.findFirst({ orderBy: { id: 'desc' } });
        let modules: any = settings?.modules || {};

        if (!modules.parserProfiles) modules.parserProfiles = {};
        modules.parserProfiles[domain] = selectors;

        if (settings) {
            await prisma.systemSettings.update({
                where: { id: settings.id },
                data: { modules }
            });
        } else {
             await prisma.systemSettings.create({
                data: { modules }
            });
        }
        return true;
    } catch (e) {
         console.error('Failed to save parser profile', e);
         throw e;
    }
};
