import { collectNormalizedMediaUrls } from '../../../../../services/mediaUrl.service.js';

export const collectCarMediaSources = (car: unknown, limit = 10): string[] => {
  if (!car || typeof car !== 'object') return [];
  return collectNormalizedMediaUrls(car as Record<string, unknown>, {
    absolute: true,
    limit
  });
};

export const buildTelegramPhotoMedia = (media: string[], caption?: string) => {
  return media.map((item, index) => ({
    type: 'photo' as const,
    media: item,
    caption: index === 0 ? caption : undefined,
    parse_mode: index === 0 && caption ? 'HTML' : undefined
  }));
};
