import { prisma } from './prisma.js';
import { Prisma } from '@prisma/client';
import { ShowcaseService } from '../modules/Marketing/showcase/showcase.service.js';
import { generatePublicId, mapInventoryOutput, mapRequestInput, mapRequestOutput } from './dto.js';
import { createOrMergeLead } from '../modules/Communication/telegram/core/leadService.js';
import { resolvePublicSlug, type PublicSlugResolution } from './publicSlug.service.js';
import { platformEvents, EVENTS } from './platform-events.js';

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
  tracking?: MiniAppTracking;
  telegram?: MiniAppTelegram;
  payload?: Record<string, unknown>;
};

export type MiniAppRequestStatusQuery = {
  requestId?: string;
  phone?: string;
  telegramUserId?: string;
};

const showcaseService = new ShowcaseService();

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str ? str : undefined;
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

const normalizeIdentity = (identity: MiniAppIdentity): MiniAppIdentity => {
  const tgUserId = toOptionalString(identity.tgUserId);
  const visitorId = toOptionalString(identity.visitorId);
  return { tgUserId, visitorId };
};

const resolveCompanyIdBySlug = async (slug: string): Promise<string | null> => {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const resolved = await resolvePublicSlug(trimmed);
  return resolved.companyId || null;
};

const resolveBotForSlug = async (slug: string, companyId?: string | null, resolved?: PublicSlugResolution) => {
  const trimmed = slug.trim();
  if (!trimmed) return { botId: undefined, companyId };

  const resolution = resolved || await resolvePublicSlug(trimmed);
  if (resolution?.botId) return { botId: resolution.botId, companyId: resolution.companyId || companyId };
  if (resolution?.showcase?.botId) return { botId: resolution.showcase.botId, companyId: resolution.showcase.workspaceId || companyId };

  const botFromConfig = await prisma.botConfig.findFirst({
    where: {
      ...(companyId ? { companyId } : {}),
      OR: [
        { config: { path: ['defaultShowcaseSlug'], equals: trimmed } },
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
    const resolved = await resolvePublicSlug(input.slug);
    const companyId = resolved.companyId;
    if (!companyId) throw new Error('Company not found');
    const botResolution = await resolveBotForSlug(input.slug, companyId, resolved);
    const botId = botResolution.botId;

    const titleFromInput = toOptionalString(input.title);
    const descriptionFromInput = toOptionalString(input.description);
    const phone = toOptionalString(input.phone);
    const comment = toOptionalString(input.comment);
    const carListingId = toOptionalString(input.carListingId);

    let listingTitle: string | undefined;
    if (carListingId) {
      const listing = await prisma.carListing.findUnique({ where: { id: carListingId } });
      listingTitle = listing?.title || undefined;
    }

    const title = titleFromInput || (listingTitle ? `Request: ${listingTitle}` : 'Mini App Request');

    const descriptionParts: string[] = [];
    if (listingTitle) descriptionParts.push(`Listing: ${listingTitle}`);
    if (comment) descriptionParts.push(`Comment: ${comment}`);
    if (phone) descriptionParts.push(`Phone: ${phone}`);
    const description = descriptionFromInput || (descriptionParts.length ? descriptionParts.join('\n') : undefined);

    const tracking = isRecord(input.tracking) ? input.tracking : {};
    const telegram = isRecord(input.telegram) ? input.telegram : {};
    const payloadFromInput = isRecord(input.payload) ? input.payload : {};

    const payload = {
      ...payloadFromInput,
      source: 'miniapp',
      phone: phone || undefined,
      tracking,
      telegram,
      request: {
        carListingId: carListingId || undefined,
        phone: phone || undefined,
        comment: comment || undefined
      }
    };

    const requestInput = mapRequestInput({
      title,
      description,
      budgetMax: toOptionalNumber(input.budgetMax),
      yearMin: toOptionalNumber(input.yearMin),
      chatId: toOptionalString((telegram as Record<string, unknown>)?.userId),
      botId,
      payload
    });

    if (!requestInput.publicId) requestInput.publicId = generatePublicId();
    requestInput.companyId = companyId;

    const tgUserId = toOptionalString((telegram as Record<string, unknown>)?.userId);
    const tgUsername = toOptionalString((telegram as Record<string, unknown>)?.username);
    const tgName = toOptionalString((telegram as Record<string, unknown>)?.name);
    const leadName = tgName || (tgUsername ? `@${tgUsername.replace(/^@/, '')}` : undefined) || 'Client';

    let leadId: string | undefined;
    if (botId) {
      try {
        const botConfig = await prisma.botConfig.findUnique({ where: { id: botId } });
        const leadResult = await createOrMergeLead({
          botId,
          companyId,
          chatId: tgUserId || undefined,
          userId: tgUserId || undefined,
          name: leadName,
          telegramUsername: tgUsername,
          telegramName: tgName,
          phone: phone || undefined,
          request: title || undefined,
          source: 'TELEGRAM',
          payload: payload as Record<string, any>,
          leadType: 'BUY',
          createRequest: false
        }, botConfig?.config as any);
        leadId = leadResult.lead?.id || undefined;
      } catch {
        // best-effort lead creation
      }
    }

    const request = await prisma.b2bRequest.create({
      data: {
        ...requestInput,
        leadId: leadId || undefined,
        botId: botId || undefined
      }
    });

    platformEvents.emit(EVENTS.MINIAPP_REQUEST_CREATED, {
      requestId: request.id,
      companyId,
      botId,
      phone,
      telegramUserId: tgUserId,
      payload: request.payload
    });

    return mapRequestOutput(request);
  }

  async getRequestStatus(slug: string, query: MiniAppRequestStatusQuery) {
    const companyId = await resolveCompanyIdBySlug(slug);
    if (!companyId) throw new Error('Company not found');

    const requestId = toOptionalString(query.requestId);
    const phone = toOptionalString(query.phone);
    const telegramUserId = toOptionalString(query.telegramUserId);

    if (!requestId && !phone && !telegramUserId) throw new Error('Search params required');

    const where: Prisma.B2bRequestWhereInput = { companyId };
    const or: Record<string, unknown>[] = [];

    if (requestId) {
      or.push({ id: requestId });
      or.push({ publicId: requestId });
    }
    if (telegramUserId) {
      or.push({ chatId: telegramUserId });
    }
    if (phone) {
      or.push({
        payload: {
          path: ['phone'],
          equals: phone
        }
      });
      or.push({
        payload: {
          path: ['request', 'phone'],
          equals: phone
        }
      });
    }

    if (or.length) {
      where.OR = or as Prisma.B2bRequestWhereInput[];
    }

    const request = await prisma.b2bRequest.findFirst({
      where,
      orderBy: { createdAt: 'desc' }
    });

    if (!request) return null;

    return {
      id: request.id,
      publicId: request.publicId || request.id,
      status: request.status,
      title: request.title,
      createdAt: request.createdAt
    };
  }

  async getConfig(slug: string) {
    const resolved = await resolvePublicSlug(slug);
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
    return {
      companyId,
      botId,
      publicSlug: resolved.slug || slug,
      miniapp: botConfig?.config ? (botConfig.config as Record<string, any>)?.miniAppConfig : undefined,
      botUsername: (botConfig?.config as Record<string, any>)?.username,
      appName: (botConfig?.config as Record<string, any>)?.name
    };
  }
}

export const miniAppService = new MiniAppService();
