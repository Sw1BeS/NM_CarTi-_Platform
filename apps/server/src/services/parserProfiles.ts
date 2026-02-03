
// @ts-ignore
import { prisma } from './prisma.js';
import { logger } from '../utils/logger.js';

export interface ParserSelectors {
    title?: string;
    price?: string;
    currency?: string;
    year?: string;
    mileage?: string;
    location?: string;
    vin?: string;
    description?: string;
    engine?: string;
    transmission?: string;
    imageContainer?: string; // container for gallery
}

const GENERIC_SELECTORS: ParserSelectors = {
    title: 'h1',
    price: '[itemprop="price"], .price, .price_value, [class*="price"], [id*="price"]',
    currency: '[itemprop="priceCurrency"], [class*="currency"]',
    year: '[itemprop="productionDate"], [itemprop="vehicleModelDate"], [class*="year"], .year',
    mileage: '[itemprop="mileageFromOdometer"], [class*="mileage"], [class*="odo"], [class*="run"]',
    location: '[itemprop="addressLocality"], .location, .city, [class*="location"]',
    description: '[itemprop="description"], .description, [class*="description"]',
    vin: '[itemprop="vehicleIdentificationNumber"], [class*="vin"]'
};

const DEFAULT_PARSER_PROFILES: Record<string, ParserSelectors> = {
    // Ukraine
    'auto.ria.com': {
        ...GENERIC_SELECTORS,
        price: '.price_value, [itemprop="price"], [class*="price"]',
        mileage: '.mileage, [class*="mileage"], [itemprop="mileageFromOdometer"]'
    },
    'olx.ua': {
        ...GENERIC_SELECTORS,
        price: '[data-testid="ad-price-container"], [itemprop="price"], [class*="price"]'
    },
    'rst.ua': {
        ...GENERIC_SELECTORS,
        price: '.price, [class*="price"]'
    },
    'autoplus.ua': {
        ...GENERIC_SELECTORS,
        price: '.price, [class*="price"]'
    },

    // US
    'autotrader.com': {
        ...GENERIC_SELECTORS,
        price: '[data-cmp="pricing"], [class*="first-price"], [class*="price"]'
    },
    'cars.com': {
        ...GENERIC_SELECTORS,
        price: '[data-testid="vehicle-price"], [class*="price"]'
    },
    'cargurus.com': {
        ...GENERIC_SELECTORS,
        price: '[data-cg-ft="price"], [class*="price"]'
    },
    'carsforsale.com': {
        ...GENERIC_SELECTORS,
        price: '[class*="price"], [itemprop="price"]'
    },

    // Auctions
    'copart.com': {
        ...GENERIC_SELECTORS,
        price: '[data-uname="lotdetailEstimatedRetailValue"], [class*="price"]'
    },
    'iaai.com': {
        ...GENERIC_SELECTORS,
        price: '[data-uname="lotdetailEstimatedRetailValue"], [class*="price"]'
    },

    // Aggregators
    'autotempest.com': {
        ...GENERIC_SELECTORS,
        price: '[class*="price"]'
    }
};

const resolveDefaultProfile = (domain: string): ParserSelectors | null => {
    if (!domain) return null;
    if (DEFAULT_PARSER_PROFILES[domain]) return DEFAULT_PARSER_PROFILES[domain];
    const match = Object.keys(DEFAULT_PARSER_PROFILES).find(key => domain.endsWith(key));
    return match ? DEFAULT_PARSER_PROFILES[match] : null;
};

export const getProfile = async (domain: string): Promise<ParserSelectors | null> => {
    try {
        const settings = await prisma.systemSettings.findFirst({ orderBy: { id: 'desc' } });
        if (!settings?.modules) {
            return resolveDefaultProfile(domain);
        }
        const modules = settings.modules as any;
        const stored = modules.parserMappings?.[domain] || modules.parserProfiles?.[domain] || null;
        if (stored) return stored;

        const storedKeys = Object.keys(modules.parserMappings || {});
        const storedMatch = storedKeys.find(key => domain.endsWith(key));
        if (storedMatch) return modules.parserMappings?.[storedMatch] || modules.parserProfiles?.[storedMatch] || null;

        return resolveDefaultProfile(domain);
    } catch (e) {
        logger.error('Failed to get parser profile', e);
        return null;
    }
};

export const saveProfile = async (domain: string, selectors: ParserSelectors) => {
    try {
        const settings = await prisma.systemSettings.findFirst({ orderBy: { id: 'desc' } });
        let modules: any = settings?.modules || {};

        if (!modules.parserMappings) modules.parserMappings = {};
        modules.parserMappings[domain] = selectors;

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
         logger.error('Failed to save parser profile', e);
         throw e;
    }
};
