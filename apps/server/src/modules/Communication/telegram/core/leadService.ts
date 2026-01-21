import { LeadStatus } from '@prisma/client';
import { prisma } from '../../../../services/prisma.js';
import { normalizePhone } from '../../../Inventory/normalization/normalizePhone.js';
import { emitPlatformEvent } from './events/eventEmitter.js';
import { generatePublicId, mapRequestInput } from '../../../../services/dto.js';
import { MetaService } from '../../../Integrations/meta/meta.service.js';

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

const buildScope = (botId: string, companyId?: string | null) => {
  if (companyId) return { bot: { companyId } };
  return { botId };
};

const findDuplicateLead = async (
  scope: Record<string, any>,
  phone?: string | null,
  userId?: string | null,
  name?: string | null,
  days = 14
) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  if (phone) {
    const byPhone = await prisma.lead.findFirst({
      where: {
        ...scope,
        phone,
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (byPhone) return byPhone;
  }
  if (userId) {
    const byUser = await prisma.lead.findFirst({
      where: {
        ...scope,
        userTgId: userId,
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (byUser) return byUser;
  }
  if (name && phone) {
    return prisma.lead.findFirst({
      where: {
        ...scope,
        phone,
        clientName: name,
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
  return null;
};

export const createOrMergeLead = async (input: LeadCreateInput, botConfig?: any) => {
  const normalizedPhone = normalizePhone(input.phone || undefined);
  const dedupDays = getDedupWindowDays(botConfig);
  const telegramUserId = resolveTelegramUserId(input);
  const scope = buildScope(input.botId, input.companyId);
  const dup = await findDuplicateLead(scope, normalizedPhone, telegramUserId, input.name, dedupDays);

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

    await prisma.lead.update({
      where: { id: dup.id },
      data: {
        payload: nextPayload
      }
    }).catch(() => null);

    await emitPlatformEvent({
      companyId: input.companyId,
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

  const lead = await prisma.lead.create({
    data: {
      leadCode: buildLeadCode(),
      clientName: input.name,
      phone: normalizedPhone || undefined,
      request: input.request || undefined,
      userTgId: telegramUserId || undefined,
      status: LeadStatus.NEW,
      source: input.source || undefined,
      botId: input.botId,
      payload: {
        ...(input.payload || {}),
        leadType: input.leadType || undefined,
        phone: normalizedPhone || undefined,
        telegramChatId: input.chatId || undefined,
        telegramUserId: telegramUserId || undefined
      }
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

    createdRequest = await prisma.b2bRequest.create({
      data: {
        ...reqInput,
        publicId: generatePublicId(),
        chatId: input.chatId || undefined,
        companyId: input.companyId || null
      }
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        payload: {
          ...(lead.payload as any || {}),
          linkedRequestId: createdRequest.publicId
        }
      }
    });
  }

  await emitPlatformEvent({
    companyId: input.companyId,
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

  // Meta CAPI Event
  if (input.companyId) {
    import('../../../Integrations/meta.service.js').then(({ sendMetaEvent }) => {
      sendMetaEvent('Lead', {
        user: { phone: normalizedPhone, id: input.userId },
        customData: { leadId: lead.id, source: lead.source }
      }).catch(err => console.error('[LeadService] Meta event failed:', err));
    });
  }

  // SendPulse Integration
  if (input.email || normalizedPhone) {
    import('../../../Integrations/sendpulse/sendpulse.service.js').then(async ({ SendPulseService }) => {
      const settings = await prisma.systemSettings.findFirst();
      const s = settings as any; // Cast to any to avoid stale type errors
      if (s?.sendpulseId && s?.sendpulseSecret) {
        console.log('[LeadService] Syncing to SendPulse...');
        // TODO: Add addressBookId to settings or use a default one
        // const config = { ...settings, addressBookId: settings.sendpulseListId };
        // SendPulseService.getInstance().syncContact(config, email, ...);
      }
    }).catch(err => console.error('[LeadService] SendPulse sync failed:', err));
  }

  return { lead, isDuplicate: false, request: createdRequest };
};

