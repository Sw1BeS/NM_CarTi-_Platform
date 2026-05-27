import {
  attributionSessionService,
  type AttributionLookupOptions
} from './attributionSession.service.js';
import type { AttributionSnapshot } from './attributionTypes.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
};

const readNestedRecord = (value: unknown, key: string): Record<string, unknown> => {
  if (!isRecord(value)) return {};
  const nested = value[key];
  return isRecord(nested) ? nested : {};
};

export const readAttributionToken = (payload: unknown): string | undefined => {
  const root = isRecord(payload) ? payload : {};
  const tracking = readNestedRecord(root, 'tracking');
  const attribution = readNestedRecord(root, 'attribution');

  return toOptionalString(root.attributionToken)
    || toOptionalString(root.attribution_token)
    || toOptionalString(root.startParam)
    || toOptionalString(root.start_param)
    || toOptionalString(tracking.attributionToken)
    || toOptionalString(tracking.attribution_token)
    || toOptionalString(tracking.startParam)
    || toOptionalString(tracking.start_param)
    || toOptionalString(attribution.token);
};

export const readAttributionSnapshot = (payload: unknown): AttributionSnapshot | null => {
  const root = isRecord(payload) ? payload : {};
  const attribution = isRecord(root.attribution) ? root.attribution : null;
  if (!attribution) return null;
  const token = toOptionalString(attribution.token);
  const destination = toOptionalString(attribution.destination);
  const identifiers = isRecord(attribution.identifiers) ? attribution.identifiers : {};
  const query = isRecord(attribution.query) ? attribution.query : {};
  const createdAt = toOptionalString(attribution.created_at);
  const expiresAt = toOptionalString(attribution.expires_at);
  if (!token || !destination || !createdAt || !expiresAt) return null;
  return {
    token,
    destination,
    ...(toOptionalString(attribution.source) ? { source: toOptionalString(attribution.source) } : {}),
    query: Object.fromEntries(
      Object.entries(query)
        .map(([key, value]) => [key, toOptionalString(value)])
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
    ),
    identifiers: Object.fromEntries(
      Object.entries(identifiers)
        .map(([key, value]) => [key, toOptionalString(value)])
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
    ) as AttributionSnapshot['identifiers'],
    ...(toOptionalString(attribution.event_source_url) ? { event_source_url: toOptionalString(attribution.event_source_url) } : {}),
    created_at: createdAt,
    expires_at: expiresAt
  };
};

export const mergeAttributionSnapshot = (
  payload: Record<string, unknown> | null | undefined,
  attribution: AttributionSnapshot | null | undefined
): Record<string, unknown> | null | undefined => {
  if (!attribution) return payload;
  return {
    ...(payload || {}),
    attribution
  };
};

export const resolveAttributionSnapshotForPayload = async (
  payload: Record<string, unknown> | null | undefined,
  options: AttributionLookupOptions = {}
): Promise<AttributionSnapshot | null> => {
  const existing = readAttributionSnapshot(payload);
  if (existing) return existing;

  const token = readAttributionToken(payload);
  if (!token) return null;

  return attributionSessionService.resolveSnapshotFromToken(token, options).catch(() => null);
};
