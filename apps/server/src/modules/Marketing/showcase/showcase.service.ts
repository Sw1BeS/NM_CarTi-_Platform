import { PrismaClient, Showcase, CarListing } from '@prisma/client';
import { prisma } from '../../../services/prisma.js';
import { CarRepository } from '../../../repositories/car.repository.js';

const MINIAPP_PUBLIC_STATUSES = new Set(['AVAILABLE', 'PENDING', 'RESERVED', 'SOLD']);
const TRANSIT_TEXT_CONDITION = {
    OR: [
        { title: { contains: '#вдорозі', mode: 'insensitive' } },
        { title: { contains: 'в дорозі', mode: 'insensitive' } },
        { title: { contains: 'in_transit', mode: 'insensitive' } },
        { title: { contains: 'прямує', mode: 'insensitive' } },
        { description: { contains: '#вдорозі', mode: 'insensitive' } },
        { description: { contains: 'в дорозі', mode: 'insensitive' } },
        { description: { contains: 'in_transit', mode: 'insensitive' } },
        { description: { contains: 'прямує', mode: 'insensitive' } }
    ]
};

interface ShowcaseRules {
    mode: 'FILTER' | 'MANUAL' | 'HYBRID';
    partnerCompanyId?: string;
    filters?: {
        status?: string[];
        priceMin?: number;
        priceMax?: number;
        yearMin?: number;
        yearMax?: number;
        makes?: string[]; // search or tag based
        partnerCompanyId?: string;
    };
    includeIds?: string[];
    excludeIds?: string[];
}

export class ShowcaseService {
    private carRepo: CarRepository;

    constructor() {
        this.carRepo = new CarRepository(prisma);
    }

    async createShowcase(data: {
        workspaceId: string;
        name: string;
        slug: string;
        botId?: string;
        rules: ShowcaseRules;
        isPublic?: boolean;
    }): Promise<Showcase> {
        return prisma.showcase.create({
            data: {
                workspaceId: data.workspaceId,
                name: data.name,
                slug: data.slug,
                botId: data.botId,
                rules: data.rules as any,
                isPublic: data.isPublic ?? true
            }
        });
    }

    async updateShowcase(id: string, data: Partial<{
        name: string;
        slug: string;
        botId?: string;
        rules: ShowcaseRules;
        isPublic?: boolean;
    }>): Promise<Showcase> {
        return prisma.showcase.update({
            where: { id },
            data: {
                ...data,
                rules: data.rules as any
            }
        });
    }

    async deleteShowcase(id: string): Promise<boolean> {
        await prisma.showcase.delete({ where: { id } });
        return true;
    }

    async getShowcaseById(id: string): Promise<Showcase | null> {
        return prisma.showcase.findUnique({ where: { id } });
    }

    async getShowcaseBySlug(slug: string): Promise<Showcase | null> {
        return prisma.showcase.findUnique({ where: { slug } });
    }

    async getShowcases(workspaceId: string): Promise<Showcase[]> {
        return prisma.showcase.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' }
        });
    }

    async getInventoryForShowcase(slug: string, options: {
        page?: number;
        limit?: number;
        search?: string;
        minPrice?: number;
        maxPrice?: number;
        minYear?: number;
        maxYear?: number;
        status?: string;
    } = {}): Promise<{ showcase: Showcase; items: CarListing[]; total: number }> {
        let showcase = await this.getShowcaseBySlug(slug);
        if (!showcase) {
            const bot = await prisma.botConfig.findFirst({
                where: {
                    isEnabled: true,
                    OR: [
                        { config: { path: ['defaultShowcaseSlug'], equals: slug } },
                        { config: { path: ['miniAppConfig', 'showcaseSlug'], equals: slug } },
                        { config: { path: ['botUsername'], equals: slug } },
                        { config: { path: ['username'], equals: slug } }
                    ]
                },
                orderBy: { createdAt: 'asc' }
            });

            if (!bot?.companyId) throw new Error('Showcase not found');

            const now = new Date();
            showcase = {
                id: `bot:${bot.id}`,
                workspaceId: bot.companyId,
                name: bot.name || slug,
                slug,
                isPublic: true,
                botId: bot.id,
                rules: {
                    mode: 'FILTER',
                    filters: {
                        status: ['AVAILABLE']
                    }
                } as any,
                createdAt: now,
                updatedAt: now
            } as Showcase;
        }

        const rules = showcase.rules as unknown as ShowcaseRules;
        const mode = rules.mode || 'FILTER';
        const requestedStatus = String(options.status || '').trim().toUpperCase();
        const runtimeStatus = MINIAPP_PUBLIC_STATUSES.has(requestedStatus) ? requestedStatus : '';

        let items: CarListing[] = [];
        let total = 0;

        // Base Where
        const where: any = {
            companyId: showcase.workspaceId,
            status: 'AVAILABLE'
        };
        const scopedPartnerCompanyId = String((rules as any)?.partnerCompanyId || (rules?.filters as any)?.partnerCompanyId || '').trim();
        if (scopedPartnerCompanyId) {
            where.partnerCompanyId = scopedPartnerCompanyId;
        }

        // --- Apply Runtime Options (User Search/Filter) ---
        if (options.search) {
             where.OR = [
                { title: { contains: options.search, mode: 'insensitive' } },
                { description: { contains: options.search, mode: 'insensitive' } }
            ];
        }

        // --- Apply Rules ---
        if (mode === 'MANUAL') {
            const ids = rules.includeIds || [];
            // If manual, we only fetch these IDs.
            // AND apply runtime filters (like price search within this set).
            where.id = { in: ids };
        } else {
            // FILTER or HYBRID
            const filters = rules.filters || {};

            if (filters.status && filters.status.length > 0) {
                where.status = { in: filters.status };
            }

            // Exclusions
            if (rules.excludeIds && rules.excludeIds.length > 0) {
                where.id = { notIn: rules.excludeIds };
            }

            // Merge Ranges (Rules vs Options) - Strict Intersection
            const mergeRange = (ruleMin?: number, ruleMax?: number, optMin?: number, optMax?: number) => {
                const min = Math.max(ruleMin || 0, optMin || 0);
                const max = (ruleMax !== undefined && optMax !== undefined)
                    ? Math.min(ruleMax, optMax)
                    : (ruleMax !== undefined ? ruleMax : optMax);

                const range: any = {};
                if (min > 0) range.gte = min;
                if (max !== undefined) range.lte = max;

                // If min > max, impossible range
                if (max !== undefined && min > max) return null; // Conflict
                return Object.keys(range).length > 0 ? range : undefined;
            };

            const priceRange = mergeRange(filters.priceMin, filters.priceMax, options.minPrice, options.maxPrice);
            if (priceRange === null) {
                // Impossible range, return empty
                return { showcase, items: [], total: 0 };
            }
            if (priceRange) where.price = priceRange;

            const yearRange = mergeRange(filters.yearMin, filters.yearMax, options.minYear, options.maxYear);
            if (yearRange === null) {
                return { showcase, items: [], total: 0 };
            }
            if (yearRange) where.year = yearRange;
        }

        if (runtimeStatus) {
            if (runtimeStatus === 'PENDING') {
                const searchClause = Array.isArray(where.OR) ? where.OR : null;
                delete where.status;
                delete where.OR;
                const pendingClause = {
                    OR: [
                        { status: 'PENDING' },
                        {
                            AND: [
                                { status: 'AVAILABLE' },
                                TRANSIT_TEXT_CONDITION
                            ]
                        }
                    ]
                };
                if (searchClause) {
                    where.AND = [
                        ...(Array.isArray(where.AND) ? where.AND : []),
                        { OR: searchClause },
                        pendingClause
                    ];
                } else {
                    where.OR = pendingClause.OR;
                }
            } else {
                where.status = runtimeStatus;
            }
        }

        // --- Execution ---

        // Handle Hybrid Includes separate from main query?
        // If mode is HYBRID, and we have explicit includes, they should be included even if they violate filters?
        // Usually yes: "Pinned items".
        // But if user searches for "BMW", and pinned item is "Audi", should it show?
        // Strictly speaking, if user searches, they expect matches.
        // But "Pinned" usually implies "Always visible".
        // Let's assume pinned items ignore RULES but respect RUNTIME SEARCH/FILTERS if possible?
        // Or just always show pinned.
        // For simplicity: Hybrid items are added to ID list or OR condition?
        // Complex. Let's stick to: Hybrid items are fetched separately and prepended, BUT we might filter them in JS if search is active.

        let explicitItems: CarListing[] = [];
        if (mode === 'HYBRID' && rules.includeIds && rules.includeIds.length > 0) {
            // Fetch explicit items
            const explicitWhere: any = { id: { in: rules.includeIds } };
            if (scopedPartnerCompanyId) {
                explicitWhere.partnerCompanyId = scopedPartnerCompanyId;
            }
            // Apply runtime filters to them too?
            // If I search "BMW", I probably don't want to see the pinned Audi.
            if (options.search) {
                explicitWhere.OR = where.OR;
            }
            // Apply ranges?
            if (where.price) explicitWhere.price = where.price;
            if (where.year) explicitWhere.year = where.year;
            if (runtimeStatus) explicitWhere.status = runtimeStatus;

            explicitItems = await prisma.carListing.findMany({ where: explicitWhere });
        }

        // Fetch Main List
        const skip = ((options.page || 1) - 1) * (options.limit || 50);
        const take = options.limit || 50;

        const [filteredTotal, filteredItems] = await Promise.all([
            prisma.carListing.count({ where }),
            prisma.carListing.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take
            })
        ]);

        const combined = [...explicitItems, ...filteredItems];
        // Dedup
        const seen = new Set();
        items = combined.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        total = filteredTotal + explicitItems.length;

        return { showcase, items, total };
    }
}
