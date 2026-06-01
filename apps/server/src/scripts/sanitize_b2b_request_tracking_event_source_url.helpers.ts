import { sanitizeMetaEventSourceUrl } from '../modules/Integrations/meta/metaEventSourceUrl.js';

export type B2bRequestTrackingCleanupCandidate = {
  id: string;
  payload: unknown;
};

export type B2bRequestTrackingCleanupResult = {
  id: string;
  changed: boolean;
  payload: Record<string, unknown> | null;
  beforeUrls: string[];
  afterUrls: string[];
};

const URL_PATHS = [
  ['tracking', 'eventSourceUrl'],
  ['tracking', 'event_source_url'],
  ['tracking', 'meta', 'eventSourceUrl'],
  ['tracking', 'meta', 'event_source_url']
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const clonePayload = (value: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

const readPath = (value: Record<string, unknown>, path: readonly string[]) => {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return typeof current === 'string' ? current.trim() : undefined;
};

const writePath = (value: Record<string, unknown>, path: readonly string[], nextValue: string | undefined) => {
  let current: Record<string, unknown> = value;
  for (const key of path.slice(0, -1)) {
    const child = current[key];
    if (!isRecord(child)) return false;
    current = child;
  }
  const leaf = path[path.length - 1];
  if (!leaf) return false;
  if (nextValue) {
    current[leaf] = nextValue;
  } else {
    delete current[leaf];
  }
  return true;
};

export const sanitizeB2bRequestTrackingPayload = (
  candidate: B2bRequestTrackingCleanupCandidate
): B2bRequestTrackingCleanupResult => {
  if (!isRecord(candidate.payload)) {
    return {
      id: candidate.id,
      changed: false,
      payload: null,
      beforeUrls: [],
      afterUrls: []
    };
  }

  const nextPayload = clonePayload(candidate.payload);
  const beforeUrls: string[] = [];
  const afterUrls: string[] = [];
  let changed = false;

  for (const path of URL_PATHS) {
    const current = readPath(nextPayload, path);
    if (!current) continue;

    beforeUrls.push(current);
    const sanitized = sanitizeMetaEventSourceUrl(current);
    if (sanitized) afterUrls.push(sanitized);

    if (sanitized !== current) {
      changed = writePath(nextPayload, path, sanitized) || changed;
    }
  }

  return {
    id: candidate.id,
    changed,
    payload: changed ? nextPayload : candidate.payload,
    beforeUrls,
    afterUrls
  };
};
