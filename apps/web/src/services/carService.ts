import { CarListing, CarSearchFilter } from '../types';
import { Data } from './data';
import { getApiBase } from './apiConfig';

// --- ROBUST FETCHING STRATEGY ---
// Uses cache-busting timestamp to avoid stale proxies
const PROXIES = [
    {
        name: 'ServerProxy',
        url: (u: string) => `${getApiBase()}/proxy?url=${encodeURIComponent(u)}`,
        extract: async (res: Response) => res.text()
    },
    {
        name: 'AllOrigins',
        url: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}&timestamp=${Date.now()}`,
        extract: async (res: Response) => {
            const json = await res.json();
            return json.contents;
        }
    },
    {
        name: 'CorsProxy',
        url: (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}&_t=${Date.now()}`,
        extract: async (res: Response) => res.text()
    }
];

async function fetchHtml(url: string): Promise<string> {
    const errors: string[] = [];
    for (const proxy of PROXIES) {
        let timeoutId;
        try {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 10000);

            const headers: Record<string, string> = {};
            if (proxy.name === 'ServerProxy') {
                const token = typeof window !== 'undefined' ? localStorage.getItem('cartie_token') : null;
                if (token) headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(proxy.url(url), { signal: controller.signal, headers });
            clearTimeout(timeoutId);

            if (res.ok) {
                const html = await proxy.extract(res);
                // Validation: Check if HTML looks like a blocked or error page
                if (html && html.length > 500 && !html.includes('403 Forbidden') && !html.includes('404 Not Found') && !html.includes('Access Denied')) {
                    return html;
                }
                errors.push(`${proxy.name}: Invalid content or short response`);
            } else {
                errors.push(`${proxy.name}: HTTP ${res.status}`);
            }
        } catch (e: any) {
            if (timeoutId) clearTimeout(timeoutId);
            errors.push(`${proxy.name}: ${e.message}`);
        }
    }
    throw new Error(`Parse failed. ${errors.join('; ')}`);
}

function parseDOM(html: string): Document {
    return new DOMParser().parseFromString(html, 'text/html');
}

const AUTORIA_CACHE_TTL_MS = 15 * 60 * 1000;
const autoriaMemoryCache = new Map<string, { ts: number; data: CarListing[] }>();

const hasLocalStorage = () => {
    try {
        return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    } catch {
        return false;
    }
};

const buildSearchCacheKey = (filter: CarSearchFilter) => {
    const parts = [
        filter.brand || '',
        filter.model || '',
        filter.yearMin || '',
        filter.yearMax || '',
        filter.priceMin || '',
        filter.priceMax || ''
    ];
    return `autoria_search:${parts.join('|').toLowerCase()}`;
};

const readSearchCache = (key: string) => {
    const now = Date.now();
    if (hasLocalStorage()) {
        const raw = localStorage.getItem(key);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed?.ts && Array.isArray(parsed.data) && now - parsed.ts < AUTORIA_CACHE_TTL_MS) {
                    return parsed.data as CarListing[];
                }
            } catch { }
        }
    }
    const mem = autoriaMemoryCache.get(key);
    if (mem && now - mem.ts < AUTORIA_CACHE_TTL_MS) return mem.data;
    return null;
};

const writeSearchCache = (key: string, data: CarListing[]) => {
    const entry = { ts: Date.now(), data };
    autoriaMemoryCache.set(key, entry);
    if (hasLocalStorage()) {
        try { localStorage.setItem(key, JSON.stringify(entry)); } catch { }
    }
};

const normalizeUrl = (value: string) => {
    try {
        const url = new URL(value);
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    } catch {
        return (value || '').split('#')[0].replace(/\/$/, '');
    }
};

const extractJsonLdObjects = (input: any): any[] => {
    if (!input) return [];
    if (Array.isArray(input)) return input.flatMap(extractJsonLdObjects);
    if (typeof input === 'object') {
        if (Array.isArray(input['@graph'])) return input['@graph'].flatMap(extractJsonLdObjects);
        return [input];
    }
    return [];
};

const isTargetJsonLdType = (obj: any) => {
    const rawType = obj?.['@type'];
    const types = Array.isArray(rawType) ? rawType : rawType ? [rawType] : [];
    return types.some((t: string) => ['Product', 'Vehicle', 'Car'].includes(String(t)));
};

const extractCandidateUrl = (obj: any) => {
    return obj?.url || obj?.offers?.url || obj?.['@id'] || '';
};

const extractCandidateSourceId = (obj: any) => {
    const candidates = [obj?.sku, obj?.productID, obj?.identifier, obj?.mpn, obj?.['@id']];
    return candidates.find(v => typeof v === 'string' && v.trim().length > 0) || '';
};

const extractSpecValue = (doc: Document, labelMatch: string) => {
    const items = Array.from(doc.querySelectorAll('.technical-info .item'));
    for (const item of items) {
        const label = item.querySelector('.label')?.textContent?.trim().toLowerCase() || '';
        if (label.includes(labelMatch.toLowerCase())) {
            const value = item.querySelector('.argument')?.textContent?.trim();
            if (value) return value;
            const fallback = item.textContent?.replace(label, '').trim();
            return fallback || '';
        }
    }
    return '';
};

const normalizeCurrency = (value?: string) => {
    const raw = (value || '').toUpperCase();
    if (raw.includes('USD') || raw.includes('$')) return 'USD';
    if (raw.includes('EUR') || raw.includes('€')) return 'EUR';
    return 'UAH';
};

export interface ICarProvider {
    name: string;
    search(filter: CarSearchFilter): Promise<CarListing[]>;
    parse?(url: string): Promise<CarListing | null>;
}

// --- INTERNAL INVENTORY PROVIDER ---
class InternalProvider implements ICarProvider {
    name = 'Internal Stock';
    async search(filter: CarSearchFilter): Promise<CarListing[]> {
        // Updated to use async Data service
        const inventory = await Data.getInventory();
        return inventory.filter(car => {
            if (car.status !== 'AVAILABLE') return false;

            const matchesBrand = !filter.brand || car.title.toLowerCase().includes(filter.brand.toLowerCase());
            let matchesModel = true;
            if (filter.model) {
                const titleWords = car.title.toLowerCase().split(' ');
                const modelWords = filter.model.toLowerCase().split(' ');
                matchesModel = modelWords.some(w => w.length > 1 && titleWords.includes(w));
            }
            const matchesPrice = (!filter.priceMin || car.price.amount >= filter.priceMin) &&
                (!filter.priceMax || car.price.amount <= filter.priceMax);

            return matchesBrand && matchesModel && matchesPrice;
        });
    }
}

// --- AUTORIA PROVIDER (STRICT) ---
// --- AUTORIA PROVIDER (STRICT & MAPPED) ---
const BRAND_MAP: Record<string, number> = {
    'acura': 1, 'audi': 6, 'bmw': 9, 'bentley': 8, 'buick': 10, 'byd': 2623,
    'cadillac': 11, 'chevrolet': 13, 'chrysler': 14, 'citroen': 15,
    'dodge': 19, 'fiat': 23, 'ferrari': 22, 'ford': 24, 'gmc': 25,
    'honda': 28, 'hummer': 30, 'hyundai': 29, 'infiniti': 32,
    'jaguar': 31, 'jeep': 32, 'kia': 33, 'lamborghini': 35,
    'land rover': 36, 'lexus': 38, 'lincoln': 39, 'mazda': 43,
    'mercedes-benz': 48, 'mercedes': 48, 'mitsubishi': 52, 'mini': 51,
    'nissan': 55, 'opel': 56, 'peugeot': 58, 'porsche': 60,
    'renault': 62, 'rolls-royce': 64, 'skoda': 70, 'subaru': 75,
    'suzuki': 76, 'tesla': 5608, 'toyota': 79, 'volkswagen': 84, 'volvo': 85
};

class AutoRiaProvider implements ICarProvider {
    name = 'AutoRia';

    async search(filter: CarSearchFilter): Promise<CarListing[]> {
        if (!filter.brand) return [];

        const cacheKey = buildSearchCacheKey(filter);
        const cached = readSearchCache(cacheKey);
        if (cached) return cached;

        const brandKey = filter.brand.toLowerCase();
        const brandId = BRAND_MAP[brandKey];
        if (!brandId) {
            console.warn(`[AutoRia] Brand '${filter.brand}' not in hardcoded map. Search may be inaccurate.`);
            // Continue? If we don't send brand.id, AutoRia returns everything. Better to fail or warn.
        }

        try {
            // Build AutoRia search URL
            // API Format: https://auto.ria.com/search/?...
            let searchUrl = `https://auto.ria.com/uk/search/?categories.main.id=1&price.currency=1`; // 1 = USD

            if (brandId) searchUrl += `&brand.id[0]=${brandId}`;
            // Optional: Model ID mapping is too distinct (thousands). 
            // We rely on post-filtering or text search if AutoRia supported it.
            // For now, we search by Brand + filters, and client filters by Model? 
            // Or just fetch latest by brand.

            if (filter.priceMin) searchUrl += `&price.USD.gte=${filter.priceMin}`;
            if (filter.priceMax) searchUrl += `&price.USD.lte=${filter.priceMax}`;
            if (filter.yearMin) searchUrl += `&year.gte=${filter.yearMin}`;
            if (filter.yearMax) searchUrl += `&year.lte=${filter.yearMax}`;

            const html = await fetchHtml(searchUrl);
            const doc = parseDOM(html);

            const listingLinks = Array.from(doc.querySelectorAll('.ticket-item a.m-link-ticket'))
                .map((a: any) => a.href)
                .filter((href: string) => href && href.includes('auto.ria.com') && href.includes('.html'))
                // Unique
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, 10);

            if (listingLinks.length === 0) {
                console.log('[AutoRia] No search results found for URL:', searchUrl);
                return [];
            }

            const results: CarListing[] = [];
            for (const url of listingLinks) {
                try {
                    const car = await this.parse(url);
                    if (car) results.push(car);
                } catch (e) {
                    // console.debug(`[AutoRia] Skip ${url}`);
                }
            }

            // Post-filter by Model string if present (since we didn't use model.id)
            let finalResults = results;
            if (filter.model) {
                const modelKey = filter.model.toLowerCase();
                finalResults = results.filter(r => r.title.toLowerCase().includes(modelKey));
            }

            writeSearchCache(cacheKey, finalResults);
            return finalResults;
        } catch (e: any) {
            console.error('[AutoRia Search] Error:', e.message);
            return [];
        }
    }

    async parse(url: string): Promise<CarListing | null> {
        if (!url.includes('auto.ria.com')) return null;

        try {
            const html = await fetchHtml(url);
            const doc = parseDOM(html);

            const idMatch = url.match(/auto_.*?(\d+)\.html/);
            const sourceId = idMatch ? idMatch[1] : null;

            // 1. JSON-LD Strategy
            const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
            let data: any = null;
            const normalizedTarget = normalizeUrl(url);
            const candidates: any[] = [];

            for (let i = 0; i < scripts.length; i++) {
                try {
                    const json = JSON.parse(scripts[i].textContent || '{}');
                    candidates.push(...extractJsonLdObjects(json));
                } catch (e) { }
            }

            const productCandidates = candidates.filter(isTargetJsonLdType);
            if (productCandidates.length > 0) {
                const scored = productCandidates.map(candidate => {
                    const candidateUrl = extractCandidateUrl(candidate);
                    const urlMatch = candidateUrl ? normalizeUrl(candidateUrl) === normalizedTarget : false;
                    const sourceMatch = sourceId
                        ? (candidateUrl && candidateUrl.includes(sourceId)) || extractCandidateSourceId(candidate) === sourceId
                        : false;
                    const score = (urlMatch ? 2 : 0) + (sourceMatch ? 1 : 0);
                    return { candidate, score, urlMatch, sourceMatch };
                });

                scored.sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    if (b.urlMatch !== a.urlMatch) return b.urlMatch ? 1 : -1;
                    if (b.sourceMatch !== a.sourceMatch) return b.sourceMatch ? 1 : -1;
                    return 0;
                });

                data = scored[0]?.candidate;
            }

            // Fallback Extraction
            data = data || {};

            const title = data.name || doc.querySelector('h1.head')?.textContent?.trim() || 'Unknown Car';
            const safeText = (sel: string) => doc.querySelector(sel)?.textContent?.trim() || '';

            let price = parseInt(data.offers?.price) || 0;
            let currency = data.offers?.priceCurrency || 'USD';

            if (!price) {
                const priceStr = doc.querySelector('.price_value strong')?.textContent?.replace(/\s/g, '');
                if (priceStr) price = parseInt(priceStr);
                const currStr = doc.querySelector('.price_value .currency')?.textContent;
                if (currStr?.includes('грн')) currency = 'UAH';
                else if (currStr?.includes('$')) currency = 'USD';
                else if (currStr?.includes('€')) currency = 'EUR';
            }

            const mileageText = safeText('.base-information .size18');
            let mileage = (parseInt(mileageText.replace(/\D/g, '')) || 0) * 1000;
            if (!mileage && data.mileageFromOdometer) {
                const odoVal = typeof data.mileageFromOdometer === 'object'
                    ? data.mileageFromOdometer.value
                    : data.mileageFromOdometer;
                const parsedOdo = parseInt(String(odoVal || '').replace(/\D/g, ''));
                if (parsedOdo) mileage = parsedOdo * 1000;
            }
            const location = safeText('#userInfoBlock .item .check-aria') || 'Ukraine';

            // Images logic: Galleria
            let images: string[] = [];

            // Try extracting from script vars if possible, or standard gallery DOM
            const galleryImgs = Array.from(doc.querySelectorAll('.gallery-order-carousel img'));
            images = galleryImgs.map((img: any) => img.src || img.getAttribute('data-src')).filter(Boolean);

            if (images.length === 0 && data.image) {
                images = Array.isArray(data.image) ? data.image : [data.image];
            }
            // Ensure high quality
            images = images.map(src => src.replace('s.jpg', 'f.jpg').replace('xs.jpg', 'f.jpg'));

            const thumbnail = images[0] || '';

            const vinFromJsonLd = data.vehicleIdentificationNumber || data.vin || '';
            const vin = vinFromJsonLd || extractSpecValue(doc, 'vin');
            const engine = extractSpecValue(doc, 'двигун') || extractSpecValue(doc, 'engine');
            const transmission = extractSpecValue(doc, 'коробка') || extractSpecValue(doc, 'transmission');
            const drive = extractSpecValue(doc, 'привод') || extractSpecValue(doc, 'drive');

            return {
                canonicalId: `autoria_${sourceId || Date.now()}`,
                sourceId: sourceId || undefined,
                source: 'AUTORIA',
                sourceUrl: url,
                title: title,
                price: { amount: price, currency: currency as any },
                year: parseInt(data.productionDate) || 2020,
                mileage: mileage,
                location: location,
                thumbnail: thumbnail,
                mediaUrls: images,
                specs: {
                    engine: engine || undefined,
                    transmission: transmission || undefined,
                    drive: drive || undefined,
                    vin: vin || undefined
                },
                status: 'AVAILABLE',
                postedAt: new Date().toISOString()
            };

        } catch (e: any) {
            // console.error("AutoRia Parse Error", e);
            throw new Error("Failed to parse AutoRia listing");
        }
    }
}

class OlxProvider implements ICarProvider {
    name = 'OLX';

    async search(): Promise<CarListing[]> {
        return [];
    }

    async parse(url: string): Promise<CarListing | null> {
        if (!url.includes('olx.ua')) return null;

        try {
            const html = await fetchHtml(url);
            const doc = parseDOM(html);
            const normalizedTarget = normalizeUrl(url);

            const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
            const candidates: any[] = [];

            for (let i = 0; i < scripts.length; i++) {
                try {
                    const json = JSON.parse(scripts[i].textContent || '{}');
                    candidates.push(...extractJsonLdObjects(json));
                } catch { }
            }

            const productCandidates = candidates.filter(isTargetJsonLdType);
            let data: any = null;
            if (productCandidates.length > 0) {
                const scored = productCandidates.map(candidate => {
                    const candidateUrl = extractCandidateUrl(candidate);
                    const urlMatch = candidateUrl ? normalizeUrl(candidateUrl) === normalizedTarget : false;
                    const score = urlMatch ? 1 : 0;
                    return { candidate, score };
                });
                scored.sort((a, b) => b.score - a.score);
                data = scored[0]?.candidate || null;
            }

            const title = data?.name || doc.querySelector('h1')?.textContent?.trim() || 'Unknown Car';
            const yearMatch = title.match(/\b(19|20)\d{2}\b/);
            const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;

            const priceRaw = data?.offers?.price || doc.querySelector('[itemprop="price"]')?.getAttribute('content') || '';
            const price = parseInt(String(priceRaw).replace(/[^\d]/g, '')) || 0;
            const currency = normalizeCurrency(data?.offers?.priceCurrency || doc.querySelector('[itemprop="priceCurrency"]')?.getAttribute('content') || '');

            let images: string[] = [];
            if (data?.image) {
                images = Array.isArray(data.image) ? data.image : [data.image];
            }
            if (!images.length) {
                const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
                if (ogImage) images = [ogImage];
            }

            const thumbnail = images[0] || '';
            const sourceIdMatch = url.match(/-id([a-z0-9]+)\.html/i);
            const sourceId = sourceIdMatch ? sourceIdMatch[1] : undefined;

            const odoVal = data?.mileageFromOdometer?.value || data?.mileageFromOdometer;
            const mileage = parseInt(String(odoVal || '').replace(/[^\d]/g, '')) || 0;
            const location = data?.offers?.availableAtOrFrom?.address?.addressLocality
                || data?.availableAtOrFrom?.address?.addressLocality
                || 'Ukraine';

            return {
                canonicalId: `olx_${sourceId || Date.now()}`,
                sourceId,
                source: 'OLX',
                sourceUrl: url,
                title,
                price: { amount: price, currency: currency as any },
                year: year || new Date().getFullYear(),
                mileage,
                location,
                thumbnail,
                mediaUrls: images,
                specs: {
                    vin: data?.vehicleIdentificationNumber || undefined
                },
                description: doc.querySelector('meta[name="description"]')?.getAttribute('content') || undefined,
                status: 'AVAILABLE',
                postedAt: new Date().toISOString()
            };
        } catch (e) {
            console.warn('[OLX] parse failed:', e);
            return null;
        }
    }
}

class CarSearchEngineService {
    private internalProvider = new InternalProvider();
    private externalProviders: ICarProvider[] = [new AutoRiaProvider(), new OlxProvider()];
    private providers: ICarProvider[] = [this.internalProvider, ...this.externalProviders];

    async searchAll(filter: CarSearchFilter): Promise<CarListing[]> {
        const promises = this.providers.map(p => p.search(filter).catch(e => {
            console.warn(`[Search] Provider ${p.name} failed:`, e);
            return [];
        }));
        const results = await Promise.all(promises);
        return results.flat().sort((a, b) => b.price.amount - a.price.amount);
    }

    async searchInternal(filter: CarSearchFilter): Promise<CarListing[]> {
        return this.internalProvider.search(filter);
    }

    async searchExternal(filter: CarSearchFilter): Promise<CarListing[]> {
        const promises = this.externalProviders.map(p => p.search(filter).catch(e => {
            console.warn(`[Search] Provider ${p.name} failed:`, e);
            return [];
        }));
        const results = await Promise.all(promises);
        return results.flat().sort((a, b) => b.price.amount - a.price.amount);
    }

    async parseUrl(url: string): Promise<CarListing> {
        for (const provider of this.providers) {
            if (provider.parse) {
                const result = await provider.parse(url);
                if (result) return result;
            }
        }
        throw new Error("No provider available for this URL");
    }
}

export const CarSearchEngine = new CarSearchEngineService();
