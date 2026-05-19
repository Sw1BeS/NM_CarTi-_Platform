import { LeadStatus } from '@prisma/client';
import { prisma } from '../../../../services/prisma.js';
import { LeadRepository, RequestRepository } from '../../../../repositories/index.js';
import { normalizePhone } from '../../../Inventory/normalization/normalizePhone.js';
import { emitPlatformEvent } from './events/eventEmitter.js';
import { generatePublicId, mapRequestInput } from '../../../../services/dto.js';
import { IntegrationService } from '../../../Integrations/integration.service.js';
import { logger } from '../../../../utils/logger.js';
import { enqueueSalesDriveRequestSync } from '../../../Integrations/salesdrive/salesdriveSync.service.js';
import { logIntegrationEvent } from '../../../../services/integrationEventLog.service.js';
import {
  buildLeadIdentityCandidates,
  resolveLeadByIdentity,
  upsertLeadIdentities
} from '../../../../services/leadIdentity.service.js';


const leadRepo = new LeadRepository(prisma);
const requestRepo = new RequestRepository(prisma);

const GENERIC_NAMES = new Set(['client', 'user', 'unknown', 'unknown user']);

export type LeadCreateInput = {
  botId: string;
  companyId?: string | null;
  chatId?: string | null;
  userId?: string | null;
  name: string;
  telegramUsername?: string | null;
  telegramName?: string | null;
  phone?: string | null;
  email?: string | null;
  request?: string | null;
  source?: string | null;
  payload?: Record<string, any> | null;
  leadType?: string | null;
  createRequest?: boolean;
  requestData?: {
    title?: string | null;
    budgetMin?: number | null;
    budgetMax?: number | null;
    yearMin?: number | null;
    yearMax?: number | null;
    city?: string | null;
    description?: string | null;
    language?: string | null;
  };
};

export type IncomingLeadMessageInput = {
  botId: string;
  companyId?: string | null;
  chatId?: string | null;
  userId?: string | null;
  text: string;
  telegramUsername?: string | null;
  telegramName?: string | null;
  messageId?: number | null;
  payload?: Record<string, any> | null;
};

const getDedupWindowDays = (botConfig?: any) => {
  const configValue = botConfig?.dedupWindowDays || botConfig?.leadDedupDays;
  const envValue = process.env.LEAD_DEDUP_DAYS;
  const parsed = Number(configValue || envValue || 14);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
};

const buildLeadCode = () => `L-${Math.floor(Math.random() * 900000 + 100000)}`;

const resolveTelegramUserId = (input: LeadCreateInput) => {
  if (input.userId) return String(input.userId);
  const chatId = input.chatId ? String(input.chatId) : '';
  if (!chatId) return undefined;
  if (chatId.startsWith('-')) return undefined;
  return chatId;
};

const isGenericName = (name?: string | null) => {
  const raw = String(name || '').trim();
  if (!raw) return true;
  return GENERIC_NAMES.has(raw.toLowerCase());
};

const normalizeLeadName = (input: LeadCreateInput) => {
  const raw = String(input.name || '').trim();
  const telegramName = String(input.telegramName || '').trim();
  const telegramUsername = String(input.telegramUsername || '').trim().replace(/^@/, '');
  if (raw && !isGenericName(raw)) return raw;
  if (telegramName) return telegramName;
  if (telegramUsername) return `@${telegramUsername}`;
  return raw || 'Client';
};

export const createOrMergeLead = async (input: LeadCreateInput, botConfig?: any) => {
  const normalizedPhone = normalizePhone(input.phone || undefined);
  const normalizedName = normalizeLeadName(input);
  const dedupDays = getDedupWindowDays(botConfig);
  const telegramUserId = resolveTelegramUserId(input);
  const companyId = input.companyId
    || (await prisma.botConfig.findUnique({ where: { id: input.botId }, select: { companyId: true } }))?.companyId
    || null;

  if (!companyId) {
    throw new Error('companyId is required to create lead');
  }

  const scope = { companyId };
  const identityCandidates = buildLeadIdentityCandidates({
    telegramUserId,
    phone: normalizedPhone,
    payload: input.payload,
    metaExternalId: input.payload?.metaExternalId,
    visitorId: input.payload?.visitorId
  });
  const identityLead = await resolveLeadByIdentity({
    companyId,
    candidates: identityCandidates
  });
  const dup = await leadRepo.findDuplicate(scope, {
    phone: normalizedPhone,
    userTgId: telegramUserId,
    name: normalizedName,
    days: dedupDays
  }) || identityLead;

  if (dup) {
    const shouldUpdateClientName = !dup.clientName || isGenericName(dup.clientName);
    const shouldUpdatePhone = Boolean(normalizedPhone && normalizedPhone !== dup.phone);
    const nextPayload = {
      ...(dup.payload as any || {}),
      lastInteractionAt: new Date().toISOString(),
      phone: normalizedPhone || (dup.payload as any)?.phone,
      telegramChatId: input.chatId || (dup.payload as any)?.telegramChatId,
      telegramUserId: telegramUserId || (dup.payload as any)?.telegramUserId,
      telegramUsername: input.telegramUsername || (dup.payload as any)?.telegramUsername,
      telegramName: input.telegramName || (dup.payload as any)?.telegramName  // P0-1 FIX: Add missing telegramName
    };

    if (!nextPayload.name || isGenericName((nextPayload as any).name)) {
      (nextPayload as any).name = normalizedName;
    }

    await prisma.leadActivity.create({
      data: {
        leadId: dup.id,
        type: 'DUPLICATE_MERGED',
        payload: {
          source: input.source || 'TELEGRAM',
          botId: input.botId,
          chatId: input.chatId,
          userId: input.userId,
          request: input.request || undefined
        }
      }
    }).catch(() => null);

    let mergedLead = dup;
    try {
      mergedLead = await prisma.lead.update({
        where: { id: dup.id },
        data: {
          ...(shouldUpdateClientName ? { clientName: normalizedName } : {}),
          ...(shouldUpdatePhone ? { phone: normalizedPhone } : {}),
          payload: nextPayload
        }
      });
    } catch {
      await leadRepo.updatePayload(dup.id, nextPayload).catch(() => null);
      if (shouldUpdateClientName) {
        await prisma.lead.update({
          where: { id: dup.id },
          data: { clientName: normalizedName }
        }).catch(() => null);
      }
      if (shouldUpdatePhone) {
        await prisma.lead.update({
          where: { id: dup.id },
          data: { phone: normalizedPhone }
        }).catch(() => null);
      }
    }

    await upsertLeadIdentities({
      companyId,
      leadId: mergedLead.id,
      candidates: identityCandidates
    }).catch(() => null);

    await emitPlatformEvent({
      companyId,
      botId: input.botId,
      eventType: 'lead.duplicate_merged',
      userId: telegramUserId || undefined,
      chatId: input.chatId || undefined,
      payload: {
        leadId: dup.id,
        phone: normalizedPhone || undefined
      }
    });

    let createdRequest: any = null;
    if (input.createRequest) {
      const reqInput = mapRequestInput({
        title: input.requestData?.title || input.request || 'Request',
        budgetMin: input.requestData?.budgetMin ?? undefined,
        budgetMax: input.requestData?.budgetMax ?? undefined,
        yearMin: input.requestData?.yearMin ?? undefined,
        yearMax: input.requestData?.yearMax ?? undefined,
        city: input.requestData?.city ?? undefined,
        description: input.requestData?.description || undefined,
        status: 'COLLECTING_VARIANTS',
        language: input.requestData?.language || undefined
      });

      createdRequest = await requestRepo.createRequest({
        ...reqInput,
        publicId: generatePublicId(),
        chatId: input.chatId || undefined,
        leadId: mergedLead.id,
        botId: input.botId,
        companyId
      });

      await leadRepo.updatePayload(mergedLead.id, {
        ...(mergedLead.payload as any || {}),
        linkedRequestId: createdRequest.publicId || createdRequest.id
      }).catch(() => null);

      await enqueueSalesDriveRequestSync({
        companyId,
        botId: input.botId || undefined,
        leadId: mergedLead.id,
        requestId: createdRequest.id,
        requestPublicId: createdRequest.publicId || undefined,
        source: 'leadbot_request'
      }).catch((error) => logger.warn('[SalesDrive] request sync enqueue failed', error?.message || error));
    }

    return { lead: mergedLead, isDuplicate: true, request: createdRequest };
  }

  const lead = await leadRepo.createLead({
    companyId,
    clientName: normalizedName,
    phone: normalizedPhone || undefined,
    request: input.request || undefined,
    userTgId: telegramUserId || undefined,
    status: LeadStatus.NEW,
    source: input.source || undefined,
    botId: input.botId,
    leadCode: buildLeadCode(),
    payload: {
      ...(input.payload || {}),
      name: normalizedName,
      leadType: input.leadType || undefined,
      phone: normalizedPhone || undefined,
      telegramChatId: input.chatId || undefined,
      telegramUserId: telegramUserId || undefined,
      telegramUsername: input.telegramUsername || undefined,
      telegramName: input.telegramName || undefined  // P0-1 FIX: Add missing telegramName
    }
  });

  await upsertLeadIdentities({
    companyId,
    leadId: lead.id,
    candidates: identityCandidates
  }).catch(() => null);

  let createdRequest: any = null;
  if (input.createRequest) {
    const reqInput = mapRequestInput({
      title: input.requestData?.title || input.request || 'Request',
      budgetMin: input.requestData?.budgetMin ?? undefined,
      budgetMax: input.requestData?.budgetMax ?? undefined,
      yearMin: input.requestData?.yearMin ?? undefined,
      yearMax: input.requestData?.yearMax ?? undefined,
      city: input.requestData?.city ?? undefined,
      description: input.requestData?.description || undefined,
      status: 'COLLECTING_VARIANTS',
      language: input.requestData?.language || undefined
    });

    createdRequest = await requestRepo.createRequest({
      ...reqInput,
      publicId: generatePublicId(),
      chatId: input.chatId || undefined,
      leadId: lead.id,
      botId: input.botId,
      companyId
    });

    await leadRepo.updatePayload(lead.id, {
      ...(lead.payload as any || {}),
      linkedRequestId: createdRequest.publicId || createdRequest.id
    });

    await enqueueSalesDriveRequestSync({
      companyId,
      botId: input.botId || undefined,
      leadId: lead.id,
      requestId: createdRequest.id,
      requestPublicId: createdRequest.publicId || undefined,
      source: 'leadbot_request'
    }).catch((error) => logger.warn('[SalesDrive] request sync enqueue failed', error?.message || error));
  }

  await emitPlatformEvent({
    companyId,
    botId: input.botId,
    eventType: 'lead.created',
    userId: telegramUserId || undefined,
    chatId: input.chatId || undefined,
    payload: {
      leadId: lead.id,
      phone: normalizedPhone || undefined
    }
  });

  await logIntegrationEvent({
    companyId,
    integration: 'TELEGRAM_BOTAPI',
    entityId: lead.id,
    action: 'lead_created',
    status: 'OK',
    meta: {
      botId: input.botId,
      chatId: input.chatId || undefined,
      userId: telegramUserId || undefined
    }
  });

  // Meta CAPI Event: prefer company-scoped Integration config; keep env fallback only for legacy installs.
  new IntegrationService().metaPixelTrackEvent(companyId, 'Lead', {
    entityType: 'lead',
    entityId: lead.id,
    stage: 'created',
    externalId: telegramUserId ? `telegram:${telegramUserId}` : `lead:${lead.id}`,
    phone: normalizedPhone || undefined,
    email: input.email || input.payload?.email || undefined,
    name: normalizedName,
    actionSource: 'chat',
    contentName: `Lead ${normalizedName}`,
    contentCategory: 'Lead',
    contentIds: [lead.id],
    value: 0,
    currency: 'USD',
    customData: {
      botId: input.botId,
      source: input.source || 'TELEGRAM',
      leadType: input.leadType || undefined
    }
  }).catch(logger.error);

  // SendPulse Integration - Add lead to mailing list
  if (normalizedPhone || input.payload?.email) {
    import('../../../Integrations/sendpulse/sendpulse.service.js').then(({ SendPulseService }) => {
      const spService = SendPulseService.getInstance();
      // Get integration config from SystemSettings
      prisma.systemSettings.findFirst().then(settings => {
        if (settings?.sendpulseId && settings?.sendpulseSecret) {
          const config = {
            clientId: settings.sendpulseId,
            clientSecret: settings.sendpulseSecret,
            addressBookId: (settings as any).sendpulseListId || undefined
          };
          const email = input.payload?.email || `${normalizedPhone?.replace(/\+/g, '')}@leads.cartie.local`;
          spService.syncContact(config, email, {
            name: input.name,
            phone: normalizedPhone || '',
            source: input.source || 'TELEGRAM',
            leadId: lead.id
          }).catch(logger.error);
        }
      }).catch(logger.error);
    }).catch(logger.error);
  }

  return { lead, isDuplicate: false, request: createdRequest };
};

export const recordIncomingLeadMessage = async (input: IncomingLeadMessageInput) => {
  const text = String(input.text || '').trim();
  if (!text) throw new Error('text is required');

  const displayName = input.telegramName
    || (input.telegramUsername ? `@${String(input.telegramUsername).replace(/^@/, '')}` : undefined)
    || 'Telegram client';

  const result = await createOrMergeLead({
    botId: input.botId,
    companyId: input.companyId,
    chatId: input.chatId,
    userId: input.userId,
    name: displayName,
    telegramUsername: input.telegramUsername || undefined,
    telegramName: input.telegramName || undefined,
    request: text,
    source: 'TELEGRAM_CHAT',
    leadType: 'MESSAGE',
    createRequest: false,
    payload: {
      ...(input.payload || {}),
      leadType: 'MESSAGE',
      lastMessageText: text,
      lastMessageAt: new Date().toISOString()
    }
  });

  await prisma.leadActivity.create({
    data: {
      leadId: result.lead.id,
      type: 'INCOMING_MESSAGE',
      payload: {
        source: 'TELEGRAM_CHAT',
        botId: input.botId,
        chatId: input.chatId || undefined,
        userId: input.userId || undefined,
        messageId: input.messageId || undefined,
        text,
        telegramUsername: input.telegramUsername || undefined,
        telegramName: input.telegramName || undefined
      }
    }
  }).catch((error) => {
    logger.warn('[LeadService] failed to record incoming lead activity', {
      botId: input.botId,
      chatId: input.chatId,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  return result;
};
