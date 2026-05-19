import { Prisma } from '@prisma/client';
import { normalizePhone } from '../modules/Inventory/normalization/normalizePhone.js';
import { generateULID } from '../utils/ulid.js';
import { prisma } from './prisma.js';

export type LeadIdentityProvider = 'TELEGRAM' | 'PHONE' | 'WEBSITE' | 'META' | 'SALESDRIVE';

export type LeadIdentityCandidate = {
  provider: LeadIdentityProvider;
  externalId: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  payload?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const SENSITIVE_PAYLOAD_KEYS = new Set([
  'token',
  'password',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'secret',
  'authorization',
  'cookie',
  'sessionstring',
  'bottoken',
  'initdata',
  'hash',
  'signature'
]);

const normalizePayloadKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const redactTimelinePayload = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => redactTimelinePayload(item));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_PAYLOAD_KEYS.has(normalizePayloadKey(key)) ? '[REDACTED]' : redactTimelinePayload(item)
    ])
  );
};

const toText = (value: unknown) => String(value || '').trim();

const newestFirstOrder = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

const typePriority = (type: string) => {
  if (type === 'REQUEST_CREATED') return 20;
  if (type.startsWith('MESSAGE_')) return 30;
  if (type === 'REQUEST_VARIANT_SUBMITTED') return 40;
  if (type.startsWith('INTEGRATION_')) return 50;
  return 10;
};

const sortTimeline = <T extends { at: Date; type: string; _sort: { sourceKey: string } }>(timeline: T[]) => {
  return timeline
    .sort((a, b) => {
      const atDiff = a.at.getTime() - b.at.getTime();
      if (atDiff) return atDiff;
      const priorityDiff = typePriority(a.type) - typePriority(b.type);
      if (priorityDiff) return priorityDiff;
      const typeDiff = a.type.localeCompare(b.type);
      if (typeDiff) return typeDiff;
      return a._sort.sourceKey.localeCompare(b._sort.sourceKey);
    })
    .map(({ _sort, ...item }) => item);
};

const mapMessageTimelineItem = (item: {
  id?: string | null;
  requestId?: string | null;
  variantId?: string | null;
  direction?: string | null;
  text?: string | null;
  payload?: unknown;
  createdAt: Date;
}) => {
  const direction = toText(item.direction).toUpperCase() === 'OUTGOING' ? 'OUTGOING' : 'INCOMING';
  return {
    _sort: { sourceKey: toText(item.id || item.requestId || item.variantId) },
    at: item.createdAt,
    type: `MESSAGE_${direction}`,
    label: `message ${direction.toLowerCase()}`,
    payload: redactTimelinePayload({
      requestId: item.requestId,
      variantId: item.variantId,
      text: item.text,
      direction,
      meta: item.payload
    })
  };
};

const mapVariantTimelineItem = (item: {
  id: string;
  requestId?: string | null;
  status?: unknown;
  requesterDecision?: unknown;
  fitQueueStatus?: unknown;
  title?: string | null;
  price?: number | null;
  location?: string | null;
  createdAt: Date;
}) => ({
  _sort: { sourceKey: toText(item.id) },
  at: item.createdAt,
  type: 'REQUEST_VARIANT_SUBMITTED',
  label: `variant ${item.title || item.id}`,
  payload: redactTimelinePayload({
    requestId: item.requestId,
    variantId: item.id,
    status: item.status,
    requesterDecision: item.requesterDecision,
    fitQueueStatus: item.fitQueueStatus,
    title: item.title,
    price: item.price,
    location: item.location
  })
});

const mapIntegrationTimelineItem = (item: {
  id?: string | null;
  integration: string;
  action: string;
  status: string;
  message?: string | null;
  meta?: unknown;
  createdAt: Date;
}) => ({
  _sort: { sourceKey: toText(item.id || `${item.integration}:${item.action}`) },
  at: item.createdAt,
  type: `INTEGRATION_${item.action}`,
  label: `${item.integration}: ${item.action}`,
  payload: redactTimelinePayload({ status: item.status, message: item.message, meta: item.meta })
});

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
      orderBy: newestFirstOrder,
      take: 100
    }),
    prisma.b2bRequest.findMany({
      where: {
        leadId,
        ...(params.companyId ? { companyId: params.companyId } : {})
      },
      orderBy: newestFirstOrder,
      take: 100
    }),
    prisma.integrationEventLog.findMany({
      where: {
        entityId: leadId,
        ...(params.companyId ? { companyId: params.companyId } : {})
      },
      orderBy: newestFirstOrder,
      take: 100
    })
  ]);

  const requestIds = requests.map((request) => request.id).filter(Boolean);
  const [messages, variants] = requestIds.length
    ? await Promise.all([
      prisma.messageLog.findMany({
        where: { requestId: { in: requestIds } },
        orderBy: newestFirstOrder,
        take: 200
      }),
      prisma.requestVariant.findMany({
        where: { requestId: { in: requestIds } },
        orderBy: newestFirstOrder,
        take: 200
      })
    ])
    : [[], []];

  const timeline = [
    ...activities.map((item) => ({
      _sort: { sourceKey: toText(item.id) },
      at: item.createdAt,
      type: item.type,
      label: item.type.replace(/_/g, ' ').toLowerCase(),
      payload: redactTimelinePayload(item.payload)
    })),
    ...requests.map((item) => ({
      _sort: { sourceKey: toText(item.id || item.publicId) },
      at: item.createdAt,
      type: 'REQUEST_CREATED',
      label: `request ${item.publicId || item.id}`,
      payload: redactTimelinePayload({ requestId: item.id, publicId: item.publicId, status: item.status })
    })),
    ...messages.map(mapMessageTimelineItem),
    ...variants.map(mapVariantTimelineItem),
    ...logs.map(mapIntegrationTimelineItem)
  ];

  return sortTimeline(timeline);
};

export const buildRequestTimeline = async (params: { requestId: string; companyId?: string | null }) => {
  const requestId = toText(params.requestId);
  if (!requestId) return [];

  const request = await prisma.b2bRequest.findUnique({ where: { id: requestId } });
  if (!request) return [];
  if (params.companyId && request.companyId && request.companyId !== params.companyId) return [];

  const [activities, messages, variants] = await Promise.all([
    request.leadId
      ? prisma.leadActivity.findMany({
        where: { leadId: request.leadId },
        orderBy: newestFirstOrder,
        take: 100
      })
      : Promise.resolve([]),
    prisma.messageLog.findMany({
      where: { requestId: request.id },
      orderBy: newestFirstOrder,
      take: 200
    }),
    prisma.requestVariant.findMany({
      where: { requestId: request.id },
      orderBy: newestFirstOrder,
      take: 200
    })
  ]);

  const variantIds = variants.map((variant) => variant.id).filter(Boolean);
  const integrationRefs = [
    { entityId: request.id },
    { traceId: request.id },
    ...variantIds.flatMap((id) => [{ entityId: id }, { traceId: id }])
  ];
  const logs = await prisma.integrationEventLog.findMany({
    where: {
      ...(request.companyId || params.companyId ? { companyId: request.companyId || params.companyId } : {}),
      OR: integrationRefs
    },
    orderBy: newestFirstOrder,
    take: 100
  });

  return sortTimeline([
    {
      _sort: { sourceKey: toText(request.id || request.publicId) },
      at: request.createdAt,
      type: 'REQUEST_CREATED',
      label: `request ${request.publicId || request.id}`,
      payload: redactTimelinePayload({
        requestId: request.id,
        publicId: request.publicId,
        status: request.status,
        leadId: request.leadId,
        assignedTo: request.assignedTo
      })
    },
    ...activities.map((item) => ({
      _sort: { sourceKey: toText(item.id) },
      at: item.createdAt,
      type: item.type,
      label: item.type.replace(/_/g, ' ').toLowerCase(),
      payload: redactTimelinePayload(item.payload)
    })),
    ...messages.map(mapMessageTimelineItem),
    ...variants.map(mapVariantTimelineItem),
    ...logs.map(mapIntegrationTimelineItem)
  ]);
};
