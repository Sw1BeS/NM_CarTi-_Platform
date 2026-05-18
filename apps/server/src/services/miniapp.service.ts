import { prisma } from './prisma.js';
import { Prisma } from '@prisma/client';
import { ShowcaseService } from '../modules/Marketing/showcase/showcase.service.js';
import { generatePublicId, mapInventoryOutput, mapRequestInput, mapRequestOutput } from './dto.js';
import { createOrMergeLead } from '../modules/Communication/telegram/core/leadService.js';
import { resolvePublicSlug, type PublicSlugResolution } from './publicSlug.service.js';
import { platformEvents, EVENTS } from './platform-events.js';
import { buildRequestPresentationSnapshot } from './requestPresentation.js';
import { buildMiniAppSubmitKey } from './requestContract.service.js';
import { findRecentMiniAppSelectedCarsDuplicate } from './miniappRequestDedupe.js';

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
  requestType?: string;
  requestSubtype?: string;
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
        { config: { path: ['miniAppConfig', 'showcaseSlug'], equals: trimmed } },
        { config: { path: ['botUsername'], equals: trimmed } },
        { config: { path: ['username'], equals: trimmed } }
      ]
    }
  });
  if (botFromConfig) return { botId: botFromConfig.id, companyId: botFromConfig.companyId };

  const fallbackBots = await prisma.botConfig.findMany({
    where: { ...(companyId ? { companyId } : {}), isEnabled: true },
    orderBy: { createdAt: 'asc' },
    take: 2
  });
  const singleFallback = fallbackBots.length === 1 ? fallbackBots[0] : null;
  return { botId: singleFallback?.id, companyId: singleFallback?.companyId || companyId };
};

export class MiniAppService {
  async listFavorites(slug: string, identity: MiniAppIdentity) {
    const companyId = await resolveCompanyIdBySlug(slug);
    if (!companyId) throw new Error('Company not found');

    const normalized = normalizeIdentity(identity);
    const { tgUserId, visitorId } = normalized;
    if (!tgUserId && !visitorId) throw new Error('Identity is required');

    const where: Prisma.MiniAppFavoriteWhereInput = { companyId };
    if (tgUserId && visitorId) {
      where.OR = [{ tgUserId }, { visitorId }];
    } else if (tgUserId) {
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

    const where: Prisma.MiniAppFavoriteWhereInput = { companyId, carListingId };
    if (tgUserId && visitorId) {
      where.OR = [{ tgUserId }, { visitorId }];
    } else if (tgUserId) {
      where.tgUserId = tgUserId;
    } else if (visitorId) {
      where.visitorId = visitorId;
    }

    const existing = await prisma.miniAppFavorite.findFirst({ where });
    if (existing) {
      await prisma.miniAppFavorite.delete({ where: { id: existing.id } });
      platformEvents.emit(EVENTS.MINIAPP_FAVORITE_REMOVED, {
        companyId,
        carListingId,
        tgUserId,
        visitorId
      });
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

    platformEvents.emit(EVENTS.MINIAPP_FAVORITE_ADDED, {
      companyId,
      carListingId,
      tgUserId,
      visitorId
    });

    return { action: 'added', favoriteId: created.id } as const;
  }

  async createRequest(input: MiniAppRequestInput) {
    const resolved = await resolvePublicSlug(input.slug);
    const companyId = resolved.companyId;
    if (!companyId) throw new Error('Company not found');
    const botResolution = await resolveBotForSlug(input.slug, companyId, resolved);
    const botId = botResolution.botId;
    const botConfig = botId
      ? await prisma.botConfig.findUnique({ where: { id: botId } })
      : null;
    const botConfigPayload = isRecord(botConfig?.config) ? botConfig.config as Record<string, unknown> : {};
    const miniAppConfig = isRecord(botConfigPayload.miniAppConfig) ? botConfigPayload.miniAppConfig as Record<string, unknown> : {};
    const isB2BMiniApp = String(botConfig?.template || '').toUpperCase() === 'B2B'
      || String(miniAppConfig.surfaceMode || '').toUpperCase() === 'B2B';

    const titleFromInput = toOptionalString(input.title);
    const descriptionFromInput = toOptionalString(input.description);
    const phone = toOptionalString(input.phone);
    const comment = toOptionalString(input.comment);
    const carListingId = toOptionalString(input.carListingId);
    const carListingIds = Array.isArray(input.carListingIds)
      ? input.carListingIds.map((item) => toOptionalString(item)).filter((item): item is string => Boolean(item))
      : [];
    const selectedCarIds = Array.from(new Set([carListingId, ...carListingIds].filter((item): item is string => Boolean(item))));

    let listingTitle: string | undefined;
    let listingTitles: string[] = [];
    let selectedCars: any[] = [];
    if (selectedCarIds.length) {
        const listings = await prisma.carListing.findMany({
          where: { id: { in: selectedCarIds }, companyId },
        select: {
          id: true,
          title: true,
          price: true,
          currency: true,
          year: true,
          mileage: true,
          location: true,
          thumbnail: true,
          mediaUrls: true,
          mediaItems: true,
          specs: true,
          status: true
        }
      });
      const titleMap = new Map(listings.map((item) => [item.id, item.title]));
      const carMap = new Map(listings.map((item) => [item.id, item]));
      selectedCars = selectedCarIds.map((id) => carMap.get(id)).filter(Boolean);
      listingTitles = selectedCarIds.map((id) => titleMap.get(id)).filter((item): item is string => Boolean(item));
      listingTitle = listingTitles[0];
    }

    const title = titleFromInput
      || (listingTitles.length > 1
        ? `Запит: ${listingTitles.length} авто`
        : (listingTitle ? `Запит: ${listingTitle}` : 'Запит з Mini App'));

    const descriptionParts: string[] = [];
    if (listingTitles.length > 1) {
      descriptionParts.push(`Картки: ${listingTitles.join(', ')}`);
    } else if (listingTitle) {
      descriptionParts.push(`Картка: ${listingTitle}`);
    }
    if (comment) descriptionParts.push(`Коментар: ${comment}`);
    if (phone) descriptionParts.push(`Контакт: ${phone}`);
    const description = descriptionFromInput || (descriptionParts.length ? descriptionParts.join('\n') : undefined);

      const tracking = isRecord(input.tracking) ? input.tracking : {};
      const telegram = isRecord(input.telegram) ? input.telegram : {};
    const payloadFromInput = isRecord(input.payload) ? input.payload : {};
    const requestType = String(
      toOptionalString(input.requestType)
      || toOptionalString((payloadFromInput as Record<string, unknown>).requestType)
      || toOptionalString((tracking as Record<string, unknown>).requestType)
      || 'BUY'
    ).toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const rawSubtype = String(
      toOptionalString(input.requestSubtype)
      || toOptionalString((payloadFromInput as Record<string, unknown>).requestSubtype)
      || ''
    ).toUpperCase();
    const derivedSubtype = selectedCarIds.length > 1 ? 'MULTI_SELECT' : (selectedCarIds.length === 1 ? 'SPECIFIC' : 'GENERAL');
    const requestSubtype = selectedCarIds.length
      ? derivedSubtype
      : (['GENERAL', 'SPECIFIC', 'MULTI_SELECT'].includes(rawSubtype) ? rawSubtype : derivedSubtype);
    const submitId = toOptionalString((tracking as Record<string, unknown>).submitId)
      || toOptionalString((payloadFromInput as Record<string, unknown>).submitId);
    const criteria = isRecord((payloadFromInput as Record<string, unknown>).criteria)
      ? (payloadFromInput as Record<string, unknown>).criteria as Record<string, unknown>
      : isRecord((payloadFromInput as Record<string, unknown>).request)
        ? (((payloadFromInput as Record<string, unknown>).request as Record<string, unknown>).criteria as Record<string, unknown> | undefined)
        : undefined;
    const requestPresentation = buildRequestPresentationSnapshot({
      cars: selectedCars,
      slug: input.slug,
      customerIntent: requestType === 'SELL' ? 'SELL' : (selectedCarIds.length ? 'PRICE_TERMS' : 'B2B_REQUEST'),
      sourceView: toOptionalString((payloadFromInput as Record<string, unknown>).sourceView)
        || toOptionalString((tracking as Record<string, unknown>).sourceView),
      criteria: isRecord(criteria) ? criteria : undefined,
      comment
    });

      const tgUserId = toOptionalString((telegram as Record<string, unknown>)?.userId);
      const tgUsername = toOptionalString((telegram as Record<string, unknown>)?.username);
      const tgName = toOptionalString((telegram as Record<string, unknown>)?.name);
      const leadName = tgName || (tgUsername ? `@${tgUsername.replace(/^@/, '')}` : undefined) || 'Client';
      let requesterPartnerId: string | undefined;
      let requesterPartnerName: string | undefined;
      let requesterPartnerRole: string | undefined;

      if (isB2BMiniApp) {
        if (!tgUserId) throw new Error('B2B partner access required');
        const partnerUser = await prisma.partnerUser.findFirst({
          where: {
            telegramId: tgUserId,
            companyId
          },
          include: { partner: true }
        });
        requesterPartnerId = toOptionalString(partnerUser?.partnerId);
        requesterPartnerName = toOptionalString(partnerUser?.partner?.name);
        requesterPartnerRole = toOptionalString(partnerUser?.role);
        if (!requesterPartnerId) throw new Error('B2B partner access required');
      }

      const idempotencyKey = buildMiniAppSubmitKey({
        companyId,
        botId,
        telegramUserId: tgUserId,
        submitId
      });

      const payload: Record<string, any> = {
        ...payloadFromInput,
        source: 'miniapp',
        slug: input.slug,
        phone: phone || undefined,
        idempotencyKey,
        tracking,
        telegram,
        requestType,
        requestSubtype,
        selectedCars: requestPresentation.selectedCars,
        vehiclePresentation: requestPresentation.vehiclePresentation,
        requestSummary: requestPresentation.requestSummary,
        requestPresentation,
        request: {
          carListingId: carListingId || undefined,
          carListingIds: selectedCarIds.length ? selectedCarIds : undefined,
          phone: phone || undefined,
          comment: comment || undefined,
          subtype: requestSubtype
        }
      };

      if (requesterPartnerId) {
        payload.requesterPartner = {
          id: requesterPartnerId,
          name: requesterPartnerName,
          role: requesterPartnerRole
        };
      }

      if (submitId) {
        const existing = await prisma.b2bRequest.findFirst({
          where: {
            companyId,
            ...(botId ? { botId } : {}),
            ...(isB2BMiniApp ? { requesterPartnerId } : {}),
            ...(tgUserId && !isB2BMiniApp ? { chatId: tgUserId } : {}),
            OR: [
              ...(idempotencyKey ? [{ payload: { path: ['idempotencyKey'], equals: idempotencyKey } }] : []),
              { payload: { path: ['tracking', 'submitId'], equals: submitId } }
            ]
          },
          orderBy: { createdAt: 'desc' }
        });
        if (existing) return mapRequestOutput(existing);
      }

    const recentDuplicate = await findRecentMiniAppSelectedCarsDuplicate({
      companyId,
      botId,
      chatId: tgUserId,
      requesterPartnerId,
      requestType,
      selectedCarIds
    });
    if (recentDuplicate) return mapRequestOutput(recentDuplicate);

    const requestInput = mapRequestInput({
      title,
      description,
      budgetMax: toOptionalNumber(input.budgetMax),
      yearMin: toOptionalNumber(input.yearMin),
      chatId: toOptionalString((telegram as Record<string, unknown>)?.userId),
      botId,
      payload
    });
    requestInput.type = requestType;

    if (!requestInput.publicId) requestInput.publicId = generatePublicId();
    requestInput.companyId = companyId;

      if (isB2BMiniApp) {
        requestInput.requesterPartnerId = requesterPartnerId;
      }

    let leadId: string | undefined;
    if (botId && !isB2BMiniApp) {
      try {
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
          leadType: requestType,
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

    if (telegramUserId) {
      where.chatId = telegramUserId;
    }

    if (requestId) {
      or.push({ id: requestId });
      or.push({ publicId: requestId });
    }
    if (phone && !telegramUserId) {
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
        requiresTelegram: true,
        previewReadOnly: false,
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
