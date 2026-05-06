const DEFAULT_PUBLIC_BASE_URL = 'https://cartie2.umanoff-analytics.space';

const clean = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const publicBase = (override?: string): string => {
  return String(override || process.env.PUBLIC_BASE_URL || process.env.MINIAPP_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
};

export const normalizeMediaUrl = (
  value: unknown,
  options: { absolute?: boolean; publicBaseUrl?: string } = {}
): string => {
  const raw = clean(value);
  if (!raw) return '';

  let next = raw;
  try {
    const parsed = new URL(raw);
    const isLocalApi = ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)
      && ['3000', '3001', '3002', '8080', '8082'].includes(parsed.port || '');
    if (isLocalApi) {
      next = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    next = raw;
  }

  if (options.absolute && next.startsWith('/')) {
    return `${publicBase(options.publicBaseUrl)}${next}`;
  }

  return next;
};

const readMediaItem = (item: unknown): string[] => {
  if (!item) return [];
  if (typeof item === 'string') return [item];
  if (typeof item !== 'object' || Array.isArray(item)) return [];
  const raw = item as Record<string, unknown>;
  return [raw.url, raw.previewUrl, raw.tgFileId, raw.fileId, raw.media]
    .map(value => normalizeMediaUrl(value))
    .filter(Boolean);
};

export const collectNormalizedMediaUrls = (
  car: Record<string, unknown>,
  options: { limit?: number; absolute?: boolean; publicBaseUrl?: string } = {}
): string[] => {
  const limit = Math.max(1, Number(options.limit || 1000));
  const candidates = [
    car.thumbnail,
    ...(Array.isArray(car.mediaUrls) ? car.mediaUrls : []),
    ...(Array.isArray(car.mediaItems) ? car.mediaItems.flatMap(readMediaItem) : [])
  ];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const url = normalizeMediaUrl(candidate, options);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
    if (result.length >= limit) break;
  }
  return result;
};
