import { CarListing, CarSearchFilter } from '../types';
import { Data } from './data';
import { NormalizationService } from './normalization';

// --- ROBUST FETCHING STRATEGY ---
// Uses cache-busting timestamp to avoid stale proxies
const PROXIES = [
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

            const res = await fetch(proxy.url(url), { signal: controller.signal });
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
class AutoRiaProvider implements ICarProvider {
    name = 'AutoRia';

    async search(filter: CarSearchFilter): Promise<CarListing[]> {
        if (!filter.brand) return []; // Need at least brand for search

        try {
            // Build AutoRia search URL
            const searchUrl = `https://auto.ria.com/uk/search/?categories.main.id=1&brand.id[0]=${encodeURIComponent(filter.brand || '')}&model.id[0]=${encodeURIComponent(filter.model || '')}&price.USD.gte=${filter.priceMin || ''}&price.USD.lte=${filter.priceMax || ''}&year.gte=${filter.yearMin || ''}&year.lte=${filter.yearMax || ''}`;

            const html = await fetchHtml(searchUrl);
            const doc = parseDOM(html);

            // Extract listing URLs from search results
            const listingLinks = Array.from(doc.querySelectorAll('a.m-link-ticket'))
                .map((a: any) => a.href)
                .filter((href: string) => href && href.includes('auto.ria.com') && href.includes('.html'))
                .slice(0, 10); // Limit to first 10 results

            if (listingLinks.length === 0) {
                console.log('[AutoRia] No search results found');
                return [];
            }

            // Parse each listing (with error handling)
            const results: CarListing[] = [];
            for (const url of listingLinks) {
                try {
                    const car = await this.parse(url);
                    if (car) results.push(car);
                } catch (e) {
                    console.warn(`[AutoRia] Failed to parse ${url}:`, e);
                }
            }

            return results;
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

            // Extract sourceId from URL
            const idMatch = url.match(/auto_.*?(\d+)\.html/);
            const sourceId = idMatch ? idMatch[1] : null;

            // 1. JSON-LD Strategy with STRICT URL/ID validation
            const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
            const jsonLdCandidates: any[] = [];

            scripts.forEach(script => {
                try {
                    const json = JSON.parse(script.textContent || '{}');
                    // Collect all Product/Vehicle entries
                    if (json['@type'] === 'Product' || json['@type'] === 'Vehicle' || json['@type'] === 'Car') {
                        jsonLdCandidates.push(json);
                    }
                } catch (e) { }
            });

            // Find the CORRECT JSON-LD by matching URL or sourceId
            let data: any = null;
            if (jsonLdCandidates.length > 0) {
                // Priority 1: Exact URL match
                data = jsonLdCandidates.find(ld => ld.url === url);

                // Priority 2: URL contains sourceId
                if (!data && sourceId) {
                    data = jsonLdCandidates.find(ld =>
                        ld.url?.includes(sourceId) ||
                        ld.identifier?.value === sourceId ||
                        ld.sku === sourceId
                    );
                }

                // Priority 3: First valid candidate (fallback)
                if (!data) {
                    data = jsonLdCandidates[0];
                    console.warn(`[AutoRia] Multiple JSON-LD found, using first. URL: ${url}`);
                }
            }

            // Fallback: scrape from DOM if no valid JSON-LD
            data = data || {};

            const id = sourceId || `ar_${Date.now()}`;

            // Fallback Extraction if JSON-LD missing or incomplete
            const title = data.name || doc.querySelector('h1.head')?.textContent?.trim() || 'Unknown Car';

            // Safe extraction helpers
            const safeText = (sel: string) => doc.querySelector(sel)?.textContent?.trim() || '';

            const priceText = doc.querySelector('.price_value strong')?.textContent?.replace(/\s/g, '') || String(data.offers?.price || '0');
            const price = parseInt(priceText) || 0;
            const currency = data.offers?.priceCurrency || 'USD';

            const mileageText = safeText('.base-information .size18');
            const mileage = (parseInt(mileageText.replace(/\D/g, '')) || 0) * 1000;

            const location = safeText('#userInfoBlock .item .check-aria') || 'Ukraine';

            // Images
            const images = Array.from(doc.querySelectorAll('.gallery-order-carousel img')).map((img: any) => img.src || img.getAttribute('data-src')).filter(Boolean);
            const thumbnail = images[0] || data.image || '';

            // Extract more specs from DOM
            const engineText = safeText('.technical-info .item:has(.label:contains("Двигун"))');
            const transmissionText = safeText('.technical-info .item:has(.label:contains("Коробка передач"))');
            const vinText = safeText('.vin-code') || data.vehicleIdentificationNumber;

            return {
                canonicalId: `autoria_${id}`,
                source: 'AUTORIA',
                sourceUrl: url,
                title: title,
                price: { amount: price, currency: currency === 'UAH' ? 'UAH' : 'USD' },
                year: parseInt(data.productionDate) || parseInt(title.match(/\d{4}/)?.[0] || String(new Date().getFullYear())),
                mileage: mileage,
                location: location,
                thumbnail: thumbnail,
                mediaUrls: images,
                specs: {
                    engine: engineText || 'See link',
                    transmission: transmissionText || 'See link',
                    fuel: data.fuelType || 'Gasoline',
                    vin: vinText || undefined
                },
                status: 'AVAILABLE',
                postedAt: new Date().toISOString()
            };

        } catch (e: any) {
            console.error("AutoRia Parse Error", e);
            throw new Error("Failed to parse AutoRia listing: " + e.message);
        }
    }
}
}

class CarSearchEngineService {
    private providers: ICarProvider[] = [new InternalProvider(), new AutoRiaProvider()];

    async searchAll(filter: CarSearchFilter): Promise<CarListing[]> {
        const promises = this.providers.map(p => p.search(filter).catch(e => {
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
