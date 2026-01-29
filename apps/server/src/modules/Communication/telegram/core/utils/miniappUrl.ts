import type { BotConfig } from '@prisma/client';

export const buildMiniAppUrl = (bot: BotConfig, filters: Record<string, any>) => {
  const config = (bot.config || {}) as any;
  const baseUrl = config?.miniAppConfig?.url || config?.miniAppConfig?.baseUrl || config?.publicBaseUrl || process.env.MINIAPP_URL;
  if (!baseUrl) return '';

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return '';
  }

  const slug = config?.defaultShowcaseSlug || config?.miniAppConfig?.showcaseSlug || 'system';
  const hasMiniAppPath = url.pathname.includes('/p/app/');
  if (!url.pathname || url.pathname === '/') {
    url.pathname = `/p/app/${slug}`;
  } else if (!hasMiniAppPath && /\/p\/app\/?$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/p\/app\/?$/, `/p/app/${slug}`);
  } else if (!hasMiniAppPath && !url.pathname.endsWith('/')) {
    // Preserve custom path; do not auto-append if user provided full path
  }

  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
};
