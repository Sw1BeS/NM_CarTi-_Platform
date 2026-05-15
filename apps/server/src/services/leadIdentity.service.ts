import { Prisma } from '@prisma/client';
import { normalizePhone } from '../modules/Inventory/normalization/normalizePhone.js';
import { generateULID } from '../utils/ulid.js';
import { prisma } from './prisma.js';

export type LeadIdentityProvider = 'TELEGRAM' | 'PHONE' | 'WEBSITE' | 'META';

export type LeadIdentityCandidate = {
  provider: LeadIdentityProvider;
  externalId: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  payload?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const toText = (value: unknown) => String(value || '').trim();

const normalizeProviderExternalId = (provider: LeadIdentityProvider, externalId: string) => {
  const value = toText(externalId);
  if (!value) return undefined;
  if (provider === 'PHONE') return normalizePhone(value);
  return value;
};

export const buildLeadIdentityCandidates = (input: {
  telegramUserId?: string | null;
  phone?: string | null;
  payload?: Record<string, unknown> | null;
  metaExternalId?: string | null;
  visitorId?: string | null;
}): LeadIdentityCandidate[] => {
  const payload = isRecord(input.payload) ? input.payload : {};
  const telegram = isRecord(payload.telegram) ? payload.telegram : {};
  const tracking = isRecord(payload.tracking) ? payload.tracking : {};
  const candidates: LeadIdentityCandidate[] = [];

  const add = (provider: LeadIdentityProvider, externalId: unknown, payloadSource: string, confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH') => {
    const normalized = normalizeProviderExternalId(provider, toText(externalId));
    if (!normalized) return;
    candidates.push({
      provider,
      externalId: normalized,
      confidence,
      payload: { source: payloadSource }
    });
  };

  add('TELEGRAM', input.telegramUserId, 'input.telegramUserId');
  add('TELEGRAM', payload.telegramUserId, 'payload.telegramUserId');
  add('TELEGRAM', telegram.userId || telegram.id, 'payload.telegram.userId');
  add('PHONE', input.phone, 'input.phone');
  add('PHONE', payload.phone, 'payload.phone');
  add('META', input.metaExternalId, 'input.metaExternalId', 'MEDIUM');
  add('META', tracking.externalId || tracking.external_id, 'payload.tracking.externalId', 'MEDIUM');
  add('WEBSITE', input.visitorId, 'input.visitorId', 'LOW');
  add('WEBSITE', tracking.visitorId || payload.visitorId, 'payload.tracking.visitorId', 'LOW');

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.provider}:${candidate.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const resolveLeadByIdentity = async (params: {
  companyId: string;
  candidates: LeadIdentityCandidate[];
}) => {
  const candidates = params.candidates.filter((candidate) => candidate.externalId);
  if (!params.companyId || !candidates.length) return null;

  for (const candidate of candidates) {
    const identity = await prisma.leadIdentity.findUnique({
      where: {
        companyId_provider_externalId: {
          companyId: params.companyId,
          provider: candidate.provider,
          externalId: candidate.externalId
        }
      },
      include: { lead: true }
    });
    if (identity?.lead) return identity.lead;
  }

  return null;
};

export const upsertLeadIdentities = async (params: {
  companyId: string;
  leadId: string;
  candidates: LeadIdentityCandidate[];
}) => {
  const candidates = params.candidates.filter((candidate) => candidate.externalId);
  if (!params.companyId || !params.leadId || !candidates.length) return;

  for (const candidate of candidates) {
    await prisma.leadIdentity.upsert({
      where: {
        companyId_provider_externalId: {
          companyId: params.companyId,
          provider: candidate.provider,
          externalId: candidate.externalId
        }
      },
      create: {
        id: generateULID(),
        companyId: params.companyId,
        leadId: params.leadId,
        provider: candidate.provider,
        externalId: candidate.externalId,
        confidence: candidate.confidence || 'HIGH',
        payload: candidate.payload as Prisma.InputJsonValue | undefined
      },
      update: {
        leadId: params.leadId,
        confidence: candidate.confidence || 'HIGH',
        payload: candidate.payload as Prisma.InputJsonValue | undefined
      }
    });
  }
};

export const buildLeadTimeline = async (params: { leadId: string; companyId?: string | null }) => {
  const leadId = toText(params.leadId);
  if (!leadId) return [];

  const [activities, requests, logs] = await Promise.all([
    prisma.leadActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'asc' },
      take: 100
    }),
    prisma.b2bRequest.findMany({
      where: {
        leadId,
        ...(params.companyId ? { companyId: params.companyId } : {})
      },
      orderBy: { createdAt: 'asc' },
      take: 100
    }),
    prisma.integrationEventLog.findMany({
      where: {
        entityId: leadId,
        ...(params.companyId ? { companyId: params.companyId } : {})
      },
      orderBy: { createdAt: 'asc' },
      take: 100
    })
  ]);

  return [
    ...activities.map((item) => ({
      at: item.createdAt,
      type: item.type,
      label: item.type.replace(/_/g, ' ').toLowerCase(),
      payload: item.payload
    })),
    ...requests.map((item) => ({
      at: item.createdAt,
      type: 'REQUEST_CREATED',
      label: `request ${item.publicId || item.id}`,
      payload: { requestId: item.id, publicId: item.publicId, status: item.status }
    })),
    ...logs.map((item) => ({
      at: item.createdAt,
      type: `INTEGRATION_${item.action}`,
      label: `${item.integration}: ${item.action}`,
      payload: { status: item.status, message: item.message, meta: item.meta }
    }))
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
};
