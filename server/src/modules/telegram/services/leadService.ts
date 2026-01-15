import { LeadStatus } from '@prisma/client';
import { prisma } from '../../../services/prisma.js';
import { normalizePhone } from '../../normalization/normalizePhone.js';
import { emitPlatformEvent } from '../events/eventEmitter.js';
import { generatePublicId, mapRequestInput } from '../../../services/dto.js';

export type LeadCreateInput = {
  botId: string;
  companyId?: string | null;
  chatId?: string | null;
  userId?: string | null;
  name: string;
  phone?: string | null;
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

const findDuplicateLead = async (botId: string, phone?: string | null, userId?: string | null, name?: string | null, days = 14) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  if (phone) {
    const byPhone = await prisma.lead.findFirst({
      where: {
        botId,
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
        botId,
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
        botId,
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
  const dup = await findDuplicateLead(input.botId, normalizedPhone, input.userId || input.chatId || undefined, input.name, dedupDays);

  if (dup) {
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
        payload: {
          ...(dup.payload as any || {}),
          lastInteractionAt: new Date().toISOString()
        }
      }
    }).catch(() => null);

    await emitPlatformEvent({
      companyId: input.companyId,
      botId: input.botId,
      eventType: 'lead.duplicate_merged',
      userId: input.userId || input.chatId || undefined,
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
      userTgId: input.chatId || undefined,
      status: LeadStatus.NEW,
      source: input.source || undefined,
      botId: input.botId,
      payload: {
        ...(input.payload || {}),
        leadType: input.leadType || undefined,
        phone: normalizedPhone || undefined
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
    userId: input.userId || input.chatId || undefined,
    chatId: input.chatId || undefined,
    payload: {
      leadId: lead.id,
      phone: normalizedPhone || undefined
    }
  });

  return { lead, isDuplicate: false, request: createdRequest };
};
