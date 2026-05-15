import { isProtectedProxyMediaUrl, normalizeMediaUrl } from '../../../../../services/mediaUrl.service.js';

const clean = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const readMediaItem = (item: unknown): unknown[] => {
  if (!item) return [];
  if (typeof item === 'string') return [item];
  if (typeof item !== 'object' || Array.isArray(item)) return [];
  const raw = item as Record<string, unknown>;
  return [raw.url, raw.previewUrl, raw.media, raw.tgFileId, raw.fileId];
};

export const collectCarMediaSources = (car: unknown, limit = 10): string[] => {
  if (!car || typeof car !== 'object') return [];
  const raw = car as Record<string, unknown>;
  const candidates = [
    raw.thumbnail,
    ...(Array.isArray(raw.mediaUrls) ? raw.mediaUrls : []),
    ...(Array.isArray(raw.mediaItems) ? raw.mediaItems.flatMap(readMediaItem) : [])
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const source = clean(candidate);
    if (!source) continue;
    const normalized = normalizeMediaUrl(source, { absolute: true });
    if (!normalized || seen.has(normalized)) continue;
    if (isProtectedProxyMediaUrl(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
};

export const buildTelegramPhotoMedia = (media: string[], caption?: string) => {
  return media.map((item, index) => ({
    type: 'photo' as const,
    media: item,
    caption: index === 0 ? caption : undefined,
    parse_mode: index === 0 && caption ? 'HTML' : undefined
  }));
};
