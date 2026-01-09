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

    async search(filter: CarSearchFilter): Promise<CarListing[]> { return []; }

    async parse(url: string): Promise<CarListing | null> {
        if (!url.includes('auto.ria.com')) return null;
        
        try {
            const html = await fetchHtml(url);
            const doc = parseDOM(html);
            let data: any = {};
            
            // 1. JSON-LD Strategy (Most Reliable)
            const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
            scripts.forEach(script => {
                try {
                    const json = JSON.parse(script.textContent || '{}');
                    // AutoRia often puts vehicle data in a Product or Vehicle type
                    if (json['@type'] === 'Product' || json['@type'] === 'Vehicle' || json['@type'] === 'Car') {
                        data = { ...data, ...json };
                    }
                } catch (e) {}
            });

            const idMatch = url.match(/auto_.*?(\d+)\.html/);
            const id = idMatch ? idMatch[1] : `ar_${Date.now()}`;

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
            // AutoRia images are often loaded dynamically or in a gallery script. 
            // We look for basic img tags first.
            const images = Array.from(doc.querySelectorAll('.gallery-order-carousel img')).map((img: any) => img.src || img.getAttribute('data-src')).filter(Boolean);
            const thumbnail = images[0] || data.image || '';

            return {
                canonicalId: `autoria_${id}`,
                source: 'AUTORIA',
                sourceUrl: url,
                title: title,
                price: { amount: price, currency: currency === 'UAH' ? 'UAH' : 'USD' },
                year: parseInt(data.productionDate) || new Date().getFullYear(),
                mileage: mileage,
                location: location,
                thumbnail: thumbnail,
                mediaUrls: images,
                specs: {
                    engine: 'See link',
                    transmission: 'See link',
                    fuel: 'See link'
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

class CarSearchEngineService {
    private providers: ICarProvider[] = [new InternalProvider(), new AutoRiaProvider()];

    async searchAll(filter: CarSearchFilter): Promise<CarListing[]> {
        const promises = this.providers.map(p => p.search(filter).catch(e => {
            console.warn(`[Search] Provider ${p.name} failed:`, e);
            return [];
        }));
        const results = await Promise.all(promises);
        return results.flat().sort((a,b) => b.price.amount - a.price.amount);
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
