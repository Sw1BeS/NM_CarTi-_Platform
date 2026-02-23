const toCleanString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (value === null || value === undefined) return null;
  const asText = String(value).trim();
  return asText ? asText : null;
};

const extractFromMediaItem = (item: unknown): string[] => {
  if (!item) return [];
  if (typeof item === 'string') return [item];
  if (typeof item !== 'object') return [];

  const raw = item as Record<string, unknown>;
  return [
    raw.url,
    raw.previewUrl,
    raw.tgFileId,
    raw.fileId,
    raw.media
  ]
    .map(toCleanString)
    .filter((value): value is string => Boolean(value));
};

export const collectCarMediaSources = (car: unknown, limit = 10): string[] => {
  if (!car || typeof car !== 'object') return [];
  const raw = car as Record<string, unknown>;

  const mediaUrls = Array.isArray(raw.mediaUrls) ? raw.mediaUrls : [];
  const mediaItems = Array.isArray(raw.mediaItems) ? raw.mediaItems : [];

  const candidates: string[] = [
    ...(toCleanString(raw.thumbnail) ? [toCleanString(raw.thumbnail)!] : []),
    ...mediaUrls.map(toCleanString).filter((value): value is string => Boolean(value)),
    ...mediaItems.flatMap(extractFromMediaItem)
  ];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of candidates) {
    const key = candidate.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
    if (result.length >= Math.max(1, limit)) break;
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
