import type { BotConfig } from '@prisma/client';

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');

export const buildMiniAppUrl = (bot: BotConfig, filters: Record<string, any>) => {
  const config = (bot.config || {}) as any;

  const baseUrl = config?.miniAppConfig?.url
    || config?.miniAppConfig?.baseUrl
    || config?.publicBaseUrl
    || process.env.MINIAPP_URL;

  if (!baseUrl) return '';

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return '';
  }

  const slug = config?.defaultShowcaseSlug || config?.miniAppConfig?.showcaseSlug || 'system';

  // If the path already includes /p/app/{slug}, keep it; otherwise, ensure exactly one /p/app/{slug}
  const path = stripTrailingSlash(url.pathname || '');
  const match = path.match(/\/p\/app\/([^/]+)$/);

  if (!/\/p\/app\//.test(path)) {
    url.pathname = `${stripTrailingSlash(path || '')}/p/app/${slug}`.replace(/\/+/g, '/');
  } else if (!match) {
    // has /p/app but no slug -> append slug
    url.pathname = `${path}/p/app/${slug}`.replace(/\/+/g, '/');
  } else if (match[1] && match[1] !== slug) {
    // different slug present: respect existing one
    url.pathname = path;
  } // else: already correct

  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
};
