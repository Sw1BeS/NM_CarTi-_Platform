import { LeadStatus } from '@prisma/client';
import { prisma } from '../../../../services/prisma.js';
import { LeadRepository, RequestRepository } from '../../../../repositories/index.js';
import { normalizePhone } from '../../../Inventory/normalization/normalizePhone.js';
import { emitPlatformEvent } from './events/eventEmitter.js';
import { generatePublicId, mapRequestInput } from '../../../../services/dto.js';
import { MetaService } from '../../../Integrations/meta/meta.service.js';


const leadRepo = new LeadRepository(prisma);
const requestRepo = new RequestRepository(prisma);

export type LeadCreateInput = {
  botId: string;
  companyId?: string | null;
  chatId?: string | null;
  userId?: string | null;
  name: string;
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

export const createOrMergeLead = async (input: LeadCreateInput, botConfig?: any) => {
  const normalizedPhone = normalizePhone(input.phone || undefined);
  const dedupDays = getDedupWindowDays(botConfig);
  const telegramUserId = resolveTelegramUserId(input);
  const companyId = input.companyId
    || (await prisma.botConfig.findUnique({ where: { id: input.botId }, select: { companyId: true } }))?.companyId
    || null;

  if (!companyId) {
    throw new Error('companyId is required to create lead');
  }

  const scope = { companyId };
  const dup = await leadRepo.findDuplicate(scope, {
    phone: normalizedPhone,
    userTgId: telegramUserId,
    name: input.name,
    days: dedupDays
  });

  if (dup) {
    const nextPayload = {
      ...(dup.payload as any || {}),
      lastInteractionAt: new Date().toISOString(),
      telegramChatId: input.chatId || (dup.payload as any)?.telegramChatId,
      telegramUserId: telegramUserId || (dup.payload as any)?.telegramUserId
    };

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


    await leadRepo.updatePayload(dup.id, nextPayload).catch(() => null);

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

    return { lead: dup, isDuplicate: true, request: null };
  }

  const lead = await leadRepo.createLead({
    companyId,
    clientName: input.name,
    phone: normalizedPhone || undefined,
    request: input.request || undefined,
    userTgId: telegramUserId || undefined,
    status: LeadStatus.NEW,
    source: input.source || undefined,
    botId: input.botId,
    leadCode: buildLeadCode(),
    payload: {
      ...(input.payload || {}),
      leadType: input.leadType || undefined,
      phone: normalizedPhone || undefined,
      telegramChatId: input.chatId || undefined,
      telegramUserId: telegramUserId || undefined
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
      companyId
    });

    await leadRepo.updatePayload(lead.id, {
      ...(lead.payload as any || {}),
      linkedRequestId: createdRequest.publicId || createdRequest.id
    });
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

  // Meta CAPI Event
  MetaService.getInstance().sendEvent('Lead', {
    ph: normalizedPhone, // hashed inside service if needed
    client_user_agent: 'Telegram Bot' // server-side event
  }, {
    content_name: 'Lead ' + (input.name || 'Unknown'),
    content_category: 'Lead',
    content_ids: [lead.id],
    value: 0,
    currency: 'USD'
  }).catch(console.error);

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
          }).catch(console.error);
        }
      }).catch(console.error);
    }).catch(console.error);
  }

  return { lead, isDuplicate: false, request: createdRequest };
};
