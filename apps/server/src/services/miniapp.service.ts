import { prisma } from './prisma.js';
import { mapInventoryOutput } from './dto.js';
import { resolvePublicSlug, type PublicSlugResolution } from './publicSlug.service.js';
import { requestContractService } from './requestContract.service.js';

export type MiniAppIdentity = {
  tgUserId?: string;
  visitorId?: string;
};

export type MiniAppTracking = Record<string, unknown>;

export type MiniAppTelegram = {
  userId?: string;
  username?: string;
  name?: string;
};

export type MiniAppRequestInput = {
  slug: string;
  title?: string;
  description?: string;
  budgetMax?: number | string;
  yearMin?: number | string;
  phone?: string;
  comment?: string;
  carListingId?: string;
  carListingIds?: string[];
  tracking?: MiniAppTracking;
  telegram?: MiniAppTelegram;
  payload?: Record<string, unknown>;
};

export type MiniAppRequestStatusQuery = {
  requestId?: string;
  phone?: string;
  telegramUserId?: string;
};

const normalizeIdentity = (identity: MiniAppIdentity): MiniAppIdentity => {
  const tgUserId = typeof identity.tgUserId === 'string' ? identity.tgUserId.trim() || undefined : undefined;
  const visitorId = typeof identity.visitorId === 'string' ? identity.visitorId.trim() || undefined : undefined;
  return { tgUserId, visitorId };
};

const resolveCompanyIdBySlug = async (slug: string): Promise<string | null> => {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const resolved = await resolvePublicSlug(trimmed, { allowWorkspaceFallback: true });
  return resolved.companyId || null;
};

const resolveBotForSlug = async (slug: string, companyId?: string | null, resolved?: PublicSlugResolution) => {
  const trimmed = slug.trim();
  if (!trimmed) return { botId: undefined, companyId };

  const resolution = resolved || await resolvePublicSlug(trimmed, { allowWorkspaceFallback: true });
  if (resolution?.botId) return { botId: resolution.botId, companyId: resolution.companyId || companyId };
  if (resolution?.showcase?.botId) return { botId: resolution.showcase.botId, companyId: resolution.showcase.workspaceId || companyId };

  const botFromConfig = await prisma.botConfig.findFirst({
    where: {
      ...(companyId ? { companyId } : {}),
      OR: [
        { config: { path: ['defaultShowcaseSlug'], equals: trimmed } },
        { config: { path: ['botUsername'], equals: trimmed } },
        { config: { path: ['username'], equals: trimmed } }
      ]
    }
  });
  if (botFromConfig) return { botId: botFromConfig.id, companyId: botFromConfig.companyId };

  const fallback = await prisma.botConfig.findFirst({
    where: { ...(companyId ? { companyId } : {}), isEnabled: true },
    orderBy: { createdAt: 'asc' }
  });
  return { botId: fallback?.id, companyId: fallback?.companyId || companyId };
};

export class MiniAppService {
  async listFavorites(slug: string, identity: MiniAppIdentity) {
    const companyId = await resolveCompanyIdBySlug(slug);
    if (!companyId) throw new Error('Company not found');

    const normalized = normalizeIdentity(identity);
    const { tgUserId, visitorId } = normalized;
    if (!tgUserId && !visitorId) throw new Error('Identity is required');

    const where: Record<string, unknown> = { companyId };
    if (tgUserId) {
      where.tgUserId = tgUserId;
    } else if (visitorId) {
      where.visitorId = visitorId;
    }

    const favorites = await prisma.miniAppFavorite.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    const ids = favorites.map(fav => fav.carListingId);
    if (ids.length === 0) return { ids: [], items: [] };

    const cars = await prisma.carListing.findMany({
      where: {
        id: { in: ids },
        companyId
      }
    });

    const carMap = new Map(cars.map(car => [car.id, car]));
    const items = ids
      .map(id => carMap.get(id))
      .filter((car): car is typeof cars[number] => Boolean(car))
      .map(mapInventoryOutput);

    return { ids, items };
  }

  async toggleFavorite(carListingId: string, identity: MiniAppIdentity, slug?: string) {
    const normalized = normalizeIdentity(identity);
    const { tgUserId, visitorId } = normalized;
    if (!tgUserId && !visitorId) throw new Error('Identity is required');

    const listing = await prisma.carListing.findUnique({ where: { id: carListingId } });
    if (!listing) throw new Error('Listing not found');

    let companyId = listing.companyId;
    if (!companyId && slug) {
      companyId = await resolveCompanyIdBySlug(slug);
    }
    if (!companyId) throw new Error('Company not found');

    const where: Record<string, unknown> = { companyId, carListingId };
    if (tgUserId) {
      where.tgUserId = tgUserId;
    } else if (visitorId) {
      where.visitorId = visitorId;
    }

    const existing = await prisma.miniAppFavorite.findFirst({ where });
    if (existing) {
      await prisma.miniAppFavorite.delete({ where: { id: existing.id } });
      return { action: 'removed', favoriteId: existing.id } as const;
    }

    const created = await prisma.miniAppFavorite.create({
      data: {
        companyId,
        carListingId,
        tgUserId: tgUserId || null,
        visitorId: visitorId || null
      }
    });

    return { action: 'added', favoriteId: created.id } as const;
  }

  async createRequest(input: MiniAppRequestInput) {
    return await requestContractService.createMiniAppRequest(input);
  }

  async getRequestStatus(slug: string, query: MiniAppRequestStatusQuery) {
    return await requestContractService.getRequestStatusBySlug(slug, query);
  }

  async getConfig(slug: string) {
    const resolved = await resolvePublicSlug(slug, { allowWorkspaceFallback: true });
    const companyId = resolved.companyId;

    if (!companyId) throw new Error('Company not found');

    const { botId } = await resolveBotForSlug(slug, companyId, resolved);

    let botConfig;
    if (botId) {
      botConfig = await prisma.botConfig.findFirst({
        where: { id: botId, companyId }
      });
    }

    // Default showcase slug from company if not found on bot?
    // For now, minimal safe config
    const buildSha = (process.env.BUILD_SHA || 'dev').slice(0, 12);
    return {
      companyId,
      botId,
      publicSlug: resolved.slug || slug,
      template: botConfig?.template || undefined,
      miniapp: botConfig?.config ? (botConfig.config as Record<string, any>)?.miniAppConfig : undefined,
      botUsername: (botConfig?.config as Record<string, any>)?.botUsername
        || (botConfig?.config as Record<string, any>)?.username,
      appName: (botConfig?.config as Record<string, any>)?.name,
      modeHints: {
        requiresTelegram: false,
        previewReadOnly: true,
        requiresInitDataForWrites: true
      },
      diagnostics: {
        presetStatus: (botConfig?.config as Record<string, any>)?.presetStatus,
        presetVersion: (botConfig?.config as Record<string, any>)?.presetVersion,
        buildSha
      }
    };
  }
}

export const miniAppService = new MiniAppService();
