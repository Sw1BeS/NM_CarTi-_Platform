import { FitQueueStatus, Prisma, RequestStatus, RequesterDecision, VariantStatus } from '@prisma/client';
import { prisma } from './prisma.js';
import {
  generatePublicId,
  mapAdminFitQueueItemOutput,
  mapFitQueueUpdateOutput,
  mapPartnerRequestListItemOutput,
  mapPublicRequestListItemOutput,
  mapReceivedVariantContractOutput,
  mapRequestContractCreateOutput,
  mapRequestInput,
  mapRequestStatusContractOutput,
  mapVariantDecisionContractOutput,
  mapVariantInput
} from './dto.js';
import { createOrMergeLead } from '../modules/Communication/telegram/core/leadService.js';
import { platformEvents, EVENTS } from './platform-events.js';
import { resolvePublicSlug, type PublicSlugResolution } from './publicSlug.service.js';
import { buildOperatorRequestPresentation, buildRequestPresentationSnapshot } from './requestPresentation.js';
import { findRecentMiniAppSelectedCarsDuplicate } from './miniappRequestDedupe.js';
import { IntegrationService } from '../modules/Integrations/integration.service.js';
import { logger } from '../utils/logger.js';

type MiniAppTracking = Record<string, unknown>;
type MiniAppTelegram = {
  userId?: string;
  username?: string;
  name?: string;
};

type MiniAppCreateRequestInput = {
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

type MiniAppLeadIntentType = 'INTEREST' | 'REQUEST';

type MiniAppLeadIntentInput = {
  slug: string;
  intentType: MiniAppLeadIntentType;
  title?: string;
  description?: string;
  budgetMax?: number | string;
  yearMin?: number | string;
  comment?: string;
  carListingId?: string;
  carListingIds?: string[];
  tracking?: MiniAppTracking;
  payload?: Record<string, unknown>;
  telegram?: MiniAppTelegram;
};

type MiniAppPendingIntent = {
  version: 1;
  intentType: MiniAppLeadIntentType;
  slug: string;
  title: string;
  description?: string;
  budgetMax?: number;
  yearMin?: number;
  comment?: string;
  carId?: string;
  carIds?: string[];
  tracking?: MiniAppTracking;
  payload?: Record<string, unknown>;
  telegram?: MiniAppTelegram;
  createdAt: string;
};

type RequestStatusLookupInput = {
  requestId?: string;
  phone?: string;
  telegramUserId?: string;
};

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

const isAdminRole = (role?: string | null) =>
  ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(String(role || '').toUpperCase());

const extractRequestContact = (request: any) => {
  const payload = isRecord(request?.payload) ? request.payload : {};
  const nested = isRecord(payload.request) ? payload.request : {};
  return toOptionalString(request?.contact)
    || toOptionalString(payload.contact)
    || toOptionalString(payload.phone)
    || toOptionalString(nested.contact)
    || toOptionalString(nested.phone);
};

const readSubmitId = (tracking: unknown) => {
  if (!isRecord(tracking)) return undefined;
  return toOptionalString(tracking.submitId) || toOptionalString(tracking.submit_id);
};

export const buildMiniAppSubmitKey = (params: {
  companyId: string;
  botId?: string | null;
  telegramUserId?: string | null;
  submitId?: string | null;
}) => [
  'miniapp-submit',
  params.companyId,
  params.botId || 'no-bot',
  params.telegramUserId || 'anonymous',
  params.submitId || 'no-submit'
].join(':');

class RequestContractService {
  private buildPendingIntentFromLegacyDraft(draft: Record<string, unknown>, fallbackSlug: string): MiniAppPendingIntent | null {
    const title = toOptionalString(draft.title) || 'Авто з Mini App';
    const carIds = Array.isArray(draft.carIds)
      ? draft.carIds.map((item) => toOptionalString(item)).filter((item): item is string => Boolean(item))
      : [];
    const carId = toOptionalString(draft.carId) || carIds[0];

    return {
      version: 1,
      intentType: 'INTEREST',
      slug: fallbackSlug,
      title,
      carId: carId || undefined,
      carIds: carIds.length ? carIds : (carId ? [carId] : undefined),
      tracking: isRecord(draft.meta) ? draft.meta : undefined,
      createdAt: new Date().toISOString()
    };
  }

  async resolvePublicContext(slug: string, opts: { allowWorkspaceFallback?: boolean } = {}) {
    const trimmed = String(slug || '').trim();
    if (!trimmed) throw new Error('slug is required');

    const resolved = await resolvePublicSlug(trimmed, {
      allowWorkspaceFallback: opts.allowWorkspaceFallback ?? true
    });
    if (!resolved.companyId) throw new Error('Company not found');

    const botResolution = await this.resolveBotForSlug(trimmed, resolved.companyId, resolved);
    return {
      resolved,
      companyId: resolved.companyId,
      botId: botResolution.botId
    };
  }

  private async resolveBotForSlug(slug: string, companyId?: string | null, resolved?: PublicSlugResolution) {
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
  }

    private async resolveMiniAppCarSelection(input: {
      companyId?: string | null;
      carListingId?: string;
      carListingIds?: string[];
    }) {
    const carListingId = toOptionalString(input.carListingId);
    const carListingIds = Array.isArray(input.carListingIds)
      ? input.carListingIds.map((item) => toOptionalString(item)).filter((item): item is string => Boolean(item))
      : [];
    const selectedCarIds = Array.from(new Set([carListingId, ...carListingIds].filter((item): item is string => Boolean(item))));

      if (!selectedCarIds.length) {
        return {
          carListingId,
          selectedCarIds,
          listingTitle: undefined as string | undefined,
          listingTitles: [] as string[],
          selectedCars: [] as any[]
        };
      }

      const listings = await prisma.carListing.findMany({
        where: { id: { in: selectedCarIds }, ...(input.companyId ? { companyId: input.companyId } : {}) },
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
      const listingTitles = selectedCarIds.map((id) => titleMap.get(id)).filter((item): item is string => Boolean(item));
      const selectedCars = selectedCarIds.map((id) => carMap.get(id)).filter(Boolean);

      return {
        carListingId,
        selectedCarIds,
        listingTitle: listingTitles[0],
        listingTitles,
        selectedCars
      };
  }

  private buildMiniAppIntentTitle(params: {
    intentType: MiniAppLeadIntentType;
    title?: string;
    listingTitles: string[];
    listingTitle?: string;
  }) {
    if (params.listingTitles.length > 1) {
      return params.intentType === 'REQUEST'
        ? `Підбір: ${params.listingTitles.length} авто`
        : `Інтерес: ${params.listingTitles.length} авто`;
    }
    if (params.listingTitle) {
      return params.intentType === 'REQUEST'
        ? `Підбір: ${params.listingTitle}`
        : params.listingTitle;
    }
    const inputTitle = toOptionalString(params.title);
    if (inputTitle) return inputTitle;
    return params.intentType === 'REQUEST' ? 'Підбір авто з Mini App' : 'Авто з Mini App';
  }

  async createPendingLeadIntent(input: MiniAppLeadIntentInput) {
    const context = await this.resolvePublicContext(input.slug, { allowWorkspaceFallback: true });
    if (!context.botId) throw new Error('Bot not found or disabled');

    const telegram = isRecord(input.telegram) ? input.telegram : {};
    const tgUserId = toOptionalString((telegram as Record<string, unknown>)?.userId);
    if (!tgUserId) throw new Error('Telegram user required');

    const selection = await this.resolveMiniAppCarSelection({
      companyId: context.companyId,
      carListingId: input.carListingId,
      carListingIds: input.carListingIds
    });
    const requestPresentation = buildRequestPresentationSnapshot({
      cars: selection.selectedCars,
      slug: context.resolved.slug || input.slug,
      customerIntent: input.intentType === 'REQUEST' ? 'PICKUP' : 'PRICE_TERMS',
      sourceView: toOptionalString(input.payload?.sourceView)
        || toOptionalString(input.payload?.source),
      criteria: isRecord(input.payload?.criteria)
        ? input.payload.criteria as Record<string, unknown>
        : undefined,
      comment: toOptionalString(input.comment)
    });
    const presentationTitles = requestPresentation.selectedCars
      .map((car) => toOptionalString(car.title))
      .filter((item): item is string => Boolean(item));
    const title = this.buildMiniAppIntentTitle({
      intentType: input.intentType,
      title: input.title,
      listingTitles: presentationTitles.length ? presentationTitles : selection.listingTitles,
      listingTitle: presentationTitles[0] || selection.listingTitle
    });

    const pendingIntent: MiniAppPendingIntent = {
      version: 1,
      intentType: input.intentType,
      slug: context.resolved.slug || input.slug,
      title,
      description: toOptionalString(input.description),
      budgetMax: toOptionalNumber(input.budgetMax),
      yearMin: toOptionalNumber(input.yearMin),
      comment: toOptionalString(input.comment),
      carId: selection.selectedCarIds[0],
      carIds: selection.selectedCarIds.length ? selection.selectedCarIds : undefined,
      tracking: isRecord(input.tracking) ? input.tracking : undefined,
      payload: isRecord(input.payload) ? input.payload : undefined,
      telegram: {
        userId: tgUserId,
        username: toOptionalString((telegram as Record<string, unknown>)?.username),
        name: toOptionalString((telegram as Record<string, unknown>)?.name)
      },
      createdAt: new Date().toISOString()
    };
    pendingIntent.payload = {
      ...(pendingIntent.payload || {}),
      selectedCars: requestPresentation.selectedCars,
      vehiclePresentation: requestPresentation.vehiclePresentation,
      requestSummary: requestPresentation.requestSummary,
      requestPresentation
    };
    const pendingIntentVariables = JSON.parse(JSON.stringify({
      miniappPendingIntent: pendingIntent,
      miniappInterestDraft: null
    })) as Prisma.InputJsonValue;

    const existingSession = await prisma.botSession.findUnique({
      where: {
        botId_chatId: {
          botId: context.botId,
          chatId: tgUserId
        }
      }
    });
    const submitId = readSubmitId(pendingIntent.tracking);
    const existingPending = isRecord((existingSession?.variables as Record<string, unknown> | undefined)?.miniappPendingIntent)
      ? ((existingSession?.variables as Record<string, unknown>).miniappPendingIntent as MiniAppPendingIntent)
      : null;
    if (
      submitId
      && existingPending
      && readSubmitId(existingPending.tracking) === submitId
    ) {
      return {
        companyId: context.companyId,
        botId: context.botId,
        chatId: tgUserId,
        title: existingPending.title || title,
        intentType: existingPending.intentType || input.intentType,
        carIds: Array.isArray(existingPending.carIds) ? existingPending.carIds : selection.selectedCarIds,
        isDuplicate: true
      };
    }

    if (existingSession) {
      await prisma.botSession.update({
        where: { id: existingSession.id },
        data: {
          state: 'CL_MINIAPP_CONTACT',
          variables: JSON.parse(JSON.stringify({
            ...((existingSession.variables as Record<string, unknown>) || {}),
            ...(pendingIntentVariables as Record<string, unknown>)
          })) as Prisma.InputJsonValue,
          lastActive: new Date()
        }
      });
    } else {
      await prisma.botSession.create({
        data: {
          botId: context.botId,
          chatId: tgUserId,
          platform: 'TG',
          state: 'CL_MINIAPP_CONTACT',
          variables: pendingIntentVariables
        }
      });
    }

    await prisma.integrationEventLog.create({
      data: {
        companyId: context.companyId,
        integration: 'telegram',
        action: 'miniapp.lead_intent_created',
        status: 'SUCCESS',
        entityType: 'bot_session',
        entityId: `${context.botId}:${tgUserId}`,
        message: `${input.intentType} pending intent created`
      }
    }).catch(() => null);

    return {
      companyId: context.companyId,
      botId: context.botId,
      chatId: tgUserId,
      title,
      intentType: input.intentType,
      carIds: selection.selectedCarIds,
      isDuplicate: false
    };
  }

  async clearPendingLeadIntent(params: { slug: string; telegramUserId: string }) {
    const context = await this.resolvePublicContext(params.slug, { allowWorkspaceFallback: true });
    if (!context.botId) return { cleared: false };

    const existing = await prisma.botSession.findUnique({
      where: {
        botId_chatId: {
          botId: context.botId,
          chatId: params.telegramUserId
        }
      }
    });
    if (!existing) return { cleared: false };

    const nextVariables = {
      ...((existing.variables as Record<string, unknown>) || {}),
      miniappPendingIntent: null,
      miniappInterestDraft: null
    };

    await prisma.botSession.update({
      where: { id: existing.id },
      data: {
        state: 'CL_MENU',
        variables: nextVariables,
        lastActive: new Date()
      }
    });

    return { cleared: true };
  }

  async findKnownLeadContact(params: {
    companyId: string;
    botId?: string | null;
    telegramUserId?: string | null;
  }) {
    const companyId = toOptionalString(params.companyId);
    const botId = toOptionalString(params.botId);
    const telegramUserId = toOptionalString(params.telegramUserId);
    if (!companyId || !telegramUserId) return null;

    const lead = await prisma.lead.findFirst({
      where: {
        companyId,
        ...(botId ? { botId } : {}),
        phone: { not: null },
        OR: [
          { userTgId: telegramUserId },
          { payload: { path: ['telegramUserId'], equals: telegramUserId } },
          { payload: { path: ['telegram', 'userId'], equals: telegramUserId } },
          { payload: { path: ['telegram', 'id'], equals: telegramUserId } }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    });

    const phone = toOptionalString(lead?.phone);
    if (!lead?.id || !phone) return null;
    return {
      leadId: lead.id,
      phone
    };
  }

  private async findExistingMiniAppSubmit(params: {
    companyId: string;
    botId?: string | null;
    telegramUserId?: string | null;
    submitId?: string | null;
  }) {
    const submitId = toOptionalString(params.submitId);
    const companyId = toOptionalString(params.companyId);
    if (!companyId || !submitId) return null;

    const idempotencyKey = buildMiniAppSubmitKey({
      companyId,
      botId: params.botId,
      telegramUserId: params.telegramUserId,
      submitId
    });

    return prisma.b2bRequest.findFirst({
      where: {
        companyId,
        OR: [
          { payload: { path: ['idempotencyKey'], equals: idempotencyKey } },
          { payload: { path: ['tracking', 'submitId'], equals: submitId } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async finalizePendingLeadIntent(params: {
    botId: string;
    companyId: string;
    telegramUserId: string;
    phone: string;
    displayName: string;
    telegramUsername?: string;
    telegramName?: string;
  }) {
    const session = await prisma.botSession.findUnique({
      where: {
        botId_chatId: {
          botId: params.botId,
          chatId: params.telegramUserId
        }
      }
    });
    if (!session) throw new Error('Pending intent not found');

    const vars = (session.variables as Record<string, unknown>) || {};
    const botConfig = await prisma.botConfig.findUnique({ where: { id: params.botId } });
    const botConfigData = isRecord(botConfig?.config) ? botConfig.config : {};
    const fallbackSlug = toOptionalString((botConfigData as Record<string, unknown>)?.defaultShowcaseSlug)
      || toOptionalString((botConfigData as Record<string, unknown>)?.botUsername)
      || toOptionalString((botConfigData as Record<string, unknown>)?.username)
      || 'system';

    const pendingIntent = isRecord(vars.miniappPendingIntent)
      ? vars.miniappPendingIntent as MiniAppPendingIntent
      : (
        isRecord(vars.miniappInterestDraft)
          ? this.buildPendingIntentFromLegacyDraft(vars.miniappInterestDraft as Record<string, unknown>, fallbackSlug)
          : null
      );

    if (!pendingIntent) throw new Error('Pending intent not found');

    const selectedCarIds = Array.isArray(pendingIntent.carIds)
      ? pendingIntent.carIds.map((item) => toOptionalString(item)).filter((item): item is string => Boolean(item))
      : (pendingIntent.carId ? [pendingIntent.carId] : []);

      const pendingPayload = isRecord(pendingIntent.payload) ? pendingIntent.payload as Record<string, unknown> : {};
      const pendingPresentation = isRecord(pendingPayload.requestPresentation)
        ? pendingPayload.requestPresentation as Record<string, any>
        : null;
      const pendingSelectedCarSnapshots = Array.isArray(pendingPresentation?.selectedCars)
        ? pendingPresentation.selectedCars
        : (Array.isArray(pendingPayload.selectedCars) ? pendingPayload.selectedCars : []);
      const selectedCars = selectedCarIds.length && !pendingSelectedCarSnapshots.length
        ? await prisma.carListing.findMany({
          where: { id: { in: selectedCarIds }, companyId: params.companyId },
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
      })
        : [];
      const selectedCarsMap = new Map(selectedCars.map((car) => [car.id, car]));
      const selectedCarsOrdered = pendingSelectedCarSnapshots.length
        ? pendingSelectedCarSnapshots
        : selectedCarIds
          .map((id) => selectedCarsMap.get(id))
          .filter((item): item is typeof selectedCars[number] => Boolean(item));

    const selectedTitles = selectedCarsOrdered
      .map((car) => toOptionalString((car as any).title))
      .filter((item): item is string => Boolean(item));
    const title = this.buildMiniAppIntentTitle({
      intentType: pendingIntent.intentType,
      title: selectedTitles.length ? undefined : pendingIntent.title,
      listingTitles: selectedTitles,
      listingTitle: selectedTitles[0]
    });
    const descriptionParts = [
      pendingIntent.intentType === 'REQUEST'
        ? 'Запит сформовано з Mini App.'
        : 'Інтерес зафіксовано з Mini App.',
      toOptionalString(pendingIntent.description),
      toOptionalString(pendingIntent.comment),
      selectedCarsOrdered.length > 1
        ? `Обрані авто: ${selectedCarsOrdered.map((car) => car.title).join(', ')}`
        : null
    ].filter((item): item is string => Boolean(item));
    const description = descriptionParts.join('\n');
      const payloadInput = pendingPayload;
    const criteria = isRecord((payloadInput as Record<string, unknown>).criteria)
      ? (payloadInput as Record<string, unknown>).criteria as Record<string, unknown>
      : isRecord((payloadInput as Record<string, unknown>).request)
        ? (((payloadInput as Record<string, unknown>).request as Record<string, unknown>).criteria as Record<string, unknown> | undefined)
        : undefined;
    const sourceView = toOptionalString((payloadInput as Record<string, unknown>).sourceView)
      || toOptionalString((payloadInput as Record<string, unknown>).source);
      const requestPresentation = pendingPresentation || buildRequestPresentationSnapshot({
        cars: selectedCarsOrdered,
        slug: pendingIntent.slug,
        customerIntent: pendingIntent.intentType === 'REQUEST' ? 'PICKUP' : 'PRICE_TERMS',
        sourceView,
        criteria: isRecord(criteria) ? criteria : undefined,
        comment: pendingIntent.comment
      });

    const requestPayload = {
      source: 'miniapp_intent',
      sourceContext: pendingIntent.intentType === 'REQUEST' ? 'miniapp_request' : 'miniapp_interest',
      phone: params.phone,
      tracking: pendingIntent.tracking || undefined,
      telegram: {
        userId: params.telegramUserId,
        username: params.telegramUsername || undefined,
        name: params.telegramName || undefined
      },
      request: {
        intentType: pendingIntent.intentType,
        title,
        description: toOptionalString(pendingIntent.description),
        comment: toOptionalString(pendingIntent.comment),
        budgetMax: pendingIntent.budgetMax,
        yearMin: pendingIntent.yearMin,
        phone: params.phone,
        contact: params.phone,
        carListingId: pendingIntent.carId || undefined,
        carListingIds: selectedCarIds.length ? selectedCarIds : undefined
      },
      selectedCars: requestPresentation.selectedCars,
      vehiclePresentation: requestPresentation.vehiclePresentation,
      requestSummary: requestPresentation.requestSummary,
      requestPresentation,
      payload: pendingIntent.payload || undefined
    } as Record<string, unknown>;
    requestPayload.operatorPresentation = buildOperatorRequestPresentation({
      title,
      description,
      budgetMax: pendingIntent.budgetMax ?? undefined,
      yearMin: pendingIntent.yearMin ?? undefined,
      chatId: params.telegramUserId,
      botId: params.botId,
      payload: requestPayload,
      createdAt: new Date()
    }, { includeContact: true });
    const submitId = readSubmitId(pendingIntent.tracking);
    requestPayload.idempotencyKey = buildMiniAppSubmitKey({
      companyId: params.companyId,
      botId: params.botId,
      telegramUserId: params.telegramUserId,
      submitId
    });
    let existingRequest = submitId
      ? await this.findExistingMiniAppSubmit({
          companyId: params.companyId,
          botId: params.botId,
          telegramUserId: params.telegramUserId,
          submitId
        })
      : null;
    if (!existingRequest) {
      existingRequest = await findRecentMiniAppSelectedCarsDuplicate({
        companyId: params.companyId,
        botId: params.botId,
        chatId: params.telegramUserId,
        requestType: 'BUY',
        selectedCarIds
      });
    }
    if (existingRequest) {
      await prisma.botSession.update({
        where: { id: session.id },
        data: {
          state: 'CL_MENU',
          variables: {
            ...vars,
            miniappPendingIntent: null,
            miniappInterestDraft: null
          },
          lastActive: new Date()
        }
      });

      await prisma.integrationEventLog.create({
        data: {
          companyId: params.companyId,
          integration: 'telegram',
          action: 'miniapp.lead_intent_duplicate',
          status: 'SUCCESS',
          entityType: 'request',
          entityId: String(existingRequest.id),
          idempotencyKey: `miniapp-duplicate:${requestPayload.idempotencyKey}`,
          message: `${pendingIntent.intentType} duplicate submit ignored`
        }
      }).catch(() => null);

      return {
        intentType: pendingIntent.intentType,
        title,
        phone: params.phone,
        isDuplicate: true,
        lead: null,
        request: existingRequest,
        selectedCars: requestPresentation.selectedCars,
        requestPresentation
      };
    }

    const leadResult = await createOrMergeLead({
      botId: params.botId,
      companyId: params.companyId,
      chatId: params.telegramUserId,
      userId: params.telegramUserId,
      name: params.displayName,
      telegramUsername: params.telegramUsername,
      telegramName: params.telegramName,
      phone: params.phone,
      request: title,
      source: 'TELEGRAM',
      payload: requestPayload as Record<string, any>,
      leadType: 'BUY',
      createRequest: true,
      requestData: {
        title,
        budgetMax: pendingIntent.budgetMax ?? null,
        yearMin: pendingIntent.yearMin ?? null,
        description: description || undefined,
        language: 'UK'
      }
    }, botConfig?.config as any);

    let request = leadResult.request;
    if (!request) {
      const manualRequestInput = mapRequestInput({
        title,
        description: description || undefined,
        budgetMax: pendingIntent.budgetMax ?? undefined,
        yearMin: pendingIntent.yearMin ?? undefined,
        status: 'COLLECTING_VARIANTS',
        language: 'UK',
        chatId: params.telegramUserId,
        payload: requestPayload
      });
      request = await prisma.b2bRequest.create({
        data: {
          ...manualRequestInput,
          publicId: manualRequestInput.publicId || generatePublicId(),
          companyId: params.companyId,
          botId: params.botId,
          leadId: leadResult.lead?.id || undefined
        }
      });
    } else {
      const existingPayload = isRecord(request.payload) ? request.payload : {};
      const existingRequestPayload = isRecord((existingPayload as Record<string, unknown>).request)
        ? ((existingPayload as Record<string, unknown>).request as Record<string, unknown>)
        : {};
      request = await prisma.b2bRequest.update({
        where: { id: request.id },
        data: {
          description: request.description || description || undefined,
          payload: {
            ...existingPayload,
            ...requestPayload,
            request: {
              ...existingRequestPayload,
              ...(requestPayload.request as Record<string, unknown>)
            }
          } as Prisma.InputJsonValue
        }
      });
    }

    await prisma.botSession.update({
      where: { id: session.id },
      data: {
        state: 'CL_MENU',
        variables: {
          ...vars,
          miniappPendingIntent: null,
          miniappInterestDraft: null
        },
        lastActive: new Date()
      }
    });

    await prisma.integrationEventLog.create({
      data: {
        companyId: params.companyId,
        integration: 'telegram',
        action: 'miniapp.lead_intent_finalized',
        status: 'SUCCESS',
        entityType: 'request',
        entityId: String(request.id),
        message: `${pendingIntent.intentType} finalized from Mini App contact share`
      }
    }).catch(() => null);

    const tracking = isRecord(pendingIntent.tracking) ? pendingIntent.tracking as Record<string, unknown> : {};
    new IntegrationService().metaPixelTrackEvent(params.companyId, 'SubmitApplication', {
      entityType: 'request',
      entityId: request.id,
      stage: 'miniapp_finalized',
      externalId: params.telegramUserId ? `telegram:${params.telegramUserId}` : undefined,
      phone: params.phone,
      actionSource: 'chat',
      fbp: toOptionalString(tracking.fbp),
      fbc: toOptionalString(tracking.fbc),
      eventSourceUrl: toOptionalString(tracking.eventSourceUrl),
      contentName: title,
      contentCategory: 'MiniApp Lead Request',
      contentIds: [request.publicId || request.id],
      customData: {
        botId: params.botId,
        source: 'miniapp_lead_intent',
        intentType: pendingIntent.intentType
      }
    }).catch(logger.error);

    return {
      intentType: pendingIntent.intentType,
      title,
      phone: params.phone,
      isDuplicate: leadResult.isDuplicate,
      lead: leadResult.lead,
      request,
      selectedCars: requestPresentation.selectedCars,
      requestPresentation
    };
  }

  async createPublicSlugRequest(slug: string, input: Record<string, unknown>) {
    const context = await this.resolvePublicContext(slug, { allowWorkspaceFallback: true });
    const payloadFromInput = isRecord(input.payload) ? input.payload : {};
    const createData: any = mapRequestInput({
      ...input,
      payload: {
        ...payloadFromInput,
        source: 'public',
        surfaceSlug: context.resolved.slug || slug,
        surfaceSource: context.resolved.source,
        compatibilityMode: context.resolved.compatibility?.kind
      }
    });

    if (!createData.title) throw new Error('Title is required');
    if (!createData.publicId) createData.publicId = generatePublicId();
    createData.companyId = context.companyId;
    if (context.botId && !createData.botId) createData.botId = context.botId;

    const request = await prisma.b2bRequest.create({
      data: createData
    });

    return mapRequestContractCreateOutput(request);
  }

  async createLegacyPublicRequest(input: Record<string, unknown>) {
    const payloadFromInput = isRecord(input.payload) ? input.payload : {};
    const createData: any = mapRequestInput({
      ...input,
      payload: {
        ...payloadFromInput,
        source: 'public_compat',
        compatibilityMode: 'legacy_public_requests_route'
      }
    });

    if (!createData.title) throw new Error('Title is required');
    if (!createData.publicId) createData.publicId = generatePublicId();

    const requestedBotId = toOptionalString(input.botId);
    if (requestedBotId) {
      const bot = await prisma.botConfig.findUnique({
        where: { id: requestedBotId },
        select: { id: true, companyId: true }
      });
      if (bot) {
        createData.botId = bot.id;
        createData.companyId = bot.companyId || createData.companyId || null;
      }
    }

    const variants = Array.isArray(input.variants) ? input.variants : [];
    if (variants.length > 0) {
      createData.variants = {
        create: variants.map((item) => mapVariantInput(item))
      };
    }

    const request = await prisma.b2bRequest.create({
      data: createData,
      include: { variants: true }
    });

    return mapRequestContractCreateOutput(request);
  }

  async createMiniAppRequest(input: MiniAppCreateRequestInput) {
    const context = await this.resolvePublicContext(input.slug, { allowWorkspaceFallback: true });
    const companyId = context.companyId;
    const botId = context.botId;

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
    if (selectedCarIds.length) {
      const listings = await prisma.carListing.findMany({
        where: { id: { in: selectedCarIds } },
        select: { id: true, title: true }
      });
      const titleMap = new Map(listings.map((item) => [item.id, item.title]));
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

    const payload: Record<string, any> = {
      ...payloadFromInput,
      source: 'miniapp',
      phone: phone || undefined,
      surfaceSlug: context.resolved.slug || input.slug,
      surfaceSource: context.resolved.source,
      compatibilityMode: context.resolved.compatibility?.kind,
      tracking,
      telegram,
      request: {
        carListingId: carListingId || undefined,
        carListingIds: selectedCarIds.length ? selectedCarIds : undefined,
        phone: phone || undefined,
        comment: comment || undefined
      }
    };
    payload.operatorPresentation = buildOperatorRequestPresentation({
      title,
      description,
      budgetMax: toOptionalNumber(input.budgetMax),
      yearMin: toOptionalNumber(input.yearMin),
      chatId: toOptionalString((telegram as Record<string, unknown>)?.userId),
      botId,
      payload,
      createdAt: new Date()
    }, { includeContact: true });

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

    return mapRequestContractCreateOutput(request);
  }

  async getRequestStatusBySlug(slug: string, query: RequestStatusLookupInput) {
    const context = await this.resolvePublicContext(slug, { allowWorkspaceFallback: true });
    const requestId = toOptionalString(query.requestId);
    const phone = toOptionalString(query.phone);
    const telegramUserId = toOptionalString(query.telegramUserId);

    if (!requestId && !phone && !telegramUserId) throw new Error('Search params required');

    const where: Prisma.B2bRequestWhereInput = { companyId: context.companyId };
    const or: Prisma.B2bRequestWhereInput[] = [];

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

    if (or.length) where.OR = or;

    const request = await prisma.b2bRequest.findFirst({
      where,
      orderBy: { createdAt: 'desc' }
    });

    if (!request) return null;
    return mapRequestStatusContractOutput(request);
  }

  async listPublicRequests(params: { page: number; limit: number }) {
    const where = {
      status: {
        in: [RequestStatus.PUBLISHED, RequestStatus.COLLECTING_VARIANTS]
      }
    } as Prisma.B2bRequestWhereInput;

    const [total, requests] = await Promise.all([
      prisma.b2bRequest.count({ where }),
      prisma.b2bRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit,
        skip: (params.page - 1) * params.limit
      })
    ]);

    return {
      items: requests.map((request) => mapPublicRequestListItemOutput(request)),
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit)
    };
  }

  async listPartnerRequests(params: { companyId: string; partnerId?: string | null }) {
    const requests = await prisma.b2bRequest.findMany({
      where: {
        companyId: params.companyId,
        ...(params.partnerId ? { requesterPartnerId: params.partnerId } : {})
      },
      orderBy: { createdAt: 'desc' },
      include: {
        variants: true
      }
    });

    return requests.map((request) => mapPartnerRequestListItemOutput(request));
  }

  async listReceivedVariants(params: { companyId: string; partnerId?: string | null }) {
    const requests = await prisma.b2bRequest.findMany({
      where: {
        companyId: params.companyId,
        ...(params.partnerId ? { requesterPartnerId: params.partnerId } : {})
      },
      select: { id: true, publicId: true }
    });

    const requestIds = requests.map((request) => request.id);
    if (!requestIds.length) return [];

    const requestPublicIdMap = new Map(requests.map((request) => [request.id, request.publicId || request.id]));

    const variants = await prisma.requestVariant.findMany({
      where: { requestId: { in: requestIds } },
      include: { request: true },
      orderBy: { createdAt: 'desc' }
    });

    return variants.map((variant) => mapReceivedVariantContractOutput(variant, {
      requestPublicId: requestPublicIdMap.get(variant.requestId)
    }));
  }

  async applyRequesterDecision(params: {
    companyId: string;
    variantId: string;
    decision: 'FIT' | 'NOT_FIT';
    partnerId?: string | null;
    isAdmin?: boolean;
  }) {
    const variant = await prisma.requestVariant.findUnique({
      where: { id: params.variantId },
      include: { request: true }
    });
    if (!variant || variant.request?.companyId !== params.companyId) throw new Error('Variant not found');
    if (!params.isAdmin) {
      if (!params.partnerId) throw new Error('Forbidden');
      if (variant.request?.requesterPartnerId !== params.partnerId) throw new Error('Forbidden');
    }

    const requesterDecision = params.decision === 'FIT' ? RequesterDecision.FIT : RequesterDecision.NOT_FIT;
    const updated = await prisma.requestVariant.update({
      where: { id: params.variantId },
      data: {
        requesterDecision,
        requesterDecisionAt: new Date(),
        status: requesterDecision === RequesterDecision.FIT ? VariantStatus.APPROVED : VariantStatus.REJECTED,
        fitQueueStatus: requesterDecision === RequesterDecision.FIT ? FitQueueStatus.NEW : null,
        fitQueuedAt: requesterDecision === RequesterDecision.FIT ? new Date() : null
      }
    });

    await prisma.integrationEventLog.create({
      data: {
        companyId: params.companyId,
        integration: 'telegram',
        action: requesterDecision === RequesterDecision.FIT ? 'variant.fit_marked' : 'variant.not_fit_marked',
        status: 'SUCCESS',
        entityType: 'request_variant',
        entityId: updated.id,
        message: `Decision ${requesterDecision}`
      }
    }).catch(() => null);

    return mapVariantDecisionContractOutput(updated, {
      includeFitQueueStatus: Boolean(params.isAdmin)
    });
  }

  async listAdminFitQueue(params: { companyId: string; status?: string }) {
    const items = await prisma.requestVariant.findMany({
      where: {
        requesterDecision: RequesterDecision.FIT,
        request: { companyId: params.companyId },
        ...(params.status ? { fitQueueStatus: params.status as FitQueueStatus } : {})
      },
      include: {
        request: true,
        sellerPartner: true
      },
      orderBy: { fitQueuedAt: 'desc' }
    });

    return items.map((item) => mapAdminFitQueueItemOutput(item));
  }

  async updateAdminFitQueue(params: {
    companyId: string;
    variantId: string;
    fitQueueStatus: string;
    location?: string;
    meetingAt?: string;
    result?: string;
  }) {
    const allowed: FitQueueStatus[] = [
      FitQueueStatus.NEW,
      FitQueueStatus.IN_PROGRESS,
      FitQueueStatus.AGREED,
      FitQueueStatus.MEETING_SCHEDULED,
      FitQueueStatus.CLOSED
    ];
    const statusRaw = String(params.fitQueueStatus || '').toUpperCase() as FitQueueStatus;
    if (!allowed.includes(statusRaw)) throw new Error('Invalid fitQueueStatus');

    const variant = await prisma.requestVariant.findUnique({
      where: { id: params.variantId },
      include: { request: true }
    });
    if (!variant || variant.request?.companyId !== params.companyId) throw new Error('Variant not found');

    const updated = await prisma.requestVariant.update({
      where: { id: params.variantId },
      data: {
        fitQueueStatus: statusRaw,
        fitClosedAt: statusRaw === FitQueueStatus.CLOSED ? new Date() : null,
        specs: {
          ...(variant.specs as any || {}),
          fitQueueMeta: {
            location: toOptionalString(params.location),
            meetingAt: toOptionalString(params.meetingAt),
            result: toOptionalString(params.result),
            updatedAt: new Date().toISOString()
          }
        }
      }
    });

    return mapFitQueueUpdateOutput(updated);
  }

  async shareAdminFitQueueContacts(params: {
    companyId: string;
    variantId: string;
  }) {
    const variant = await prisma.requestVariant.findUnique({
      where: { id: params.variantId },
      include: {
        request: true,
        sellerPartner: true
      }
    });
    if (!variant || variant.request?.companyId !== params.companyId) throw new Error('Variant not found');

    const requesterContact = extractRequestContact(variant.request);
    const sellerContact = toOptionalString(variant.contact);
    if (!requesterContact || !sellerContact) throw new Error('Contacts unavailable');

    const requestPayload = isRecord(variant.request.payload) ? variant.request.payload : {};
    const updatedRequest = await prisma.b2bRequest.update({
      where: { id: variant.requestId },
      data: {
        status: RequestStatus.CONTACT_SHARED,
        payload: {
          ...requestPayload,
          contactSharedAt: new Date().toISOString(),
          contactSharedVariantId: variant.id
        } as Prisma.InputJsonValue
      }
    });

    await prisma.integrationEventLog.create({
      data: {
        companyId: params.companyId,
        integration: 'telegram',
        action: 'fit_queue.contact_shared',
        status: 'SUCCESS',
        entityType: 'request_variant',
        entityId: variant.id,
        message: `Contacts shared for request ${updatedRequest.publicId || updatedRequest.id}`
      }
    }).catch(() => null);

    return {
      id: variant.id,
      requestId: variant.requestId,
      requestPublicId: updatedRequest.publicId || updatedRequest.id,
      requestStatus: updatedRequest.status,
      fitQueueStatus: variant.fitQueueStatus,
      sellerCompany: variant.sellerPartner?.name || variant.companyName || '',
      requesterContact,
      sellerContact
    };
  }

  ensurePartnerScope(partnerId: string | null | undefined, role?: string | null) {
    if (!partnerId && !isAdminRole(role)) {
      throw new Error('partnerId or tgUserId is required for partner scope');
    }
  }
}

export const requestContractService = new RequestContractService();
