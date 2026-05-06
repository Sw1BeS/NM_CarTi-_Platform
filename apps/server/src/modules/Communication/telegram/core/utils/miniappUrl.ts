import type { BotConfig } from '@prisma/client';
import fs from 'node:fs';

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');
const readBuildSha = () => {
  const envSha = String(process.env.BUILD_SHA || '').trim();
  if (envSha) return envSha;
  try {
    const fromFile = fs.readFileSync('/app/server/BUILD_SHA', 'utf8').trim();
    return fromFile;
  } catch {
    return '';
  }
};

export type MiniAppEntryType = 
  | 'home'
  | 'request'        // Підібрати авто за 1 хвилину
  | 'inventory'      // Авто в наявності
  | 'in_transit'     // Авто в дорозі
  | 'favorites'      // Обране
  | 'sell'           // Продати авто
  | 'support'        // Підтримка
  | 'profile';       // Профіль

export interface MiniAppFilters {
  entry?: MiniAppEntryType | 'status' | string;
  status?: 'AVAILABLE' | 'PENDING' | 'SOLD' | string;
  type?: 'BUY' | 'SELL' | string;
  carId?: string;
  [key: string]: string | number | boolean | undefined | null;
}

export const buildMiniAppUrl = (bot: BotConfig, filters: MiniAppFilters = {}) => {
  const config = (bot.config || {}) as any;

  const baseUrl = config?.miniAppConfig?.url
    || config?.miniAppConfig?.baseUrl
    || config?.publicBaseUrl
    || process.env.MINIAPP_URL
    || 'https://cartie2.umanoff-analytics.space';

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

  const buildSha = readBuildSha();
  if (buildSha && !url.searchParams.has('v')) {
    url.searchParams.set('v', buildSha.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24));
  }

  return url.toString();
};

/**
 * Helper to build URL for specific entry points
 */
export const buildMiniAppEntryUrl = (
  bot: BotConfig,
  entry: MiniAppEntryType,
  additionalParams?: Record<string, string>
): string => {
  const filters: MiniAppFilters = { entry };
  
  // Pre-configured filters for common entry points
  switch (entry) {
    case 'inventory':
      filters.status = 'AVAILABLE';
      break;
    case 'in_transit':
      filters.entry = 'inventory';
      filters.status = 'PENDING';
      break;
    case 'sell':
      filters.entry = 'request';
      filters.type = 'SELL';
      break;
    case 'request':
      filters.entry = 'request';
      break;
  }

  if (additionalParams) {
    Object.assign(filters, additionalParams);
  }

  return buildMiniAppUrl(bot, filters);
};
