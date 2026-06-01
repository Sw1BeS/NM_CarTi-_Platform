import type { BotConfig } from '@prisma/client';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');
let cachedFallbackBuildSha: string | undefined;

const readBuildSha = () => {
  const envSha = String(process.env.BUILD_SHA || '').trim();
  if (envSha) return envSha;
  if (cachedFallbackBuildSha !== undefined) return cachedFallbackBuildSha;

  const candidateFiles = [
    '/app/server/BUILD_SHA',
    `${process.cwd()}/BUILD_SHA`,
    `${process.cwd()}/apps/server/BUILD_SHA`
  ];
  for (const file of candidateFiles) {
    try {
      const fromFile = fs.readFileSync(file, 'utf8').trim();
      if (fromFile) {
        cachedFallbackBuildSha = fromFile;
        return cachedFallbackBuildSha;
      }
    } catch {
      // Keep probing. Host-side production scripts may not run from the container path.
    }
  }

  try {
    cachedFallbackBuildSha = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000 }).trim();
    return cachedFallbackBuildSha;
  } catch {
    cachedFallbackBuildSha = '';
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

type MiniAppUrlOptions = {
  includeBuildTag?: boolean;
  preserveBaseQuery?: boolean;
};

const normalizeStartParamFilters = (value?: string | null): MiniAppFilters => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return {};
  const aliases: Record<string, MiniAppFilters> = {
    home: { entry: 'home' },
    app: { entry: 'home' },
    miniapp: { entry: 'home' },
    view_inventory: { entry: 'inventory', status: 'AVAILABLE', availabilityState: 'IN_STOCK' },
    inventory: { entry: 'inventory' },
    stock: { entry: 'inventory', status: 'AVAILABLE', availabilityState: 'IN_STOCK' },
    view_stock: { entry: 'inventory', status: 'AVAILABLE', availabilityState: 'IN_STOCK' },
    view_transit: { entry: 'inventory', status: 'PENDING', availabilityState: 'IN_TRANSIT' },
    transit: { entry: 'inventory', status: 'PENDING', availabilityState: 'IN_TRANSIT' },
    pending: { entry: 'inventory', status: 'PENDING', availabilityState: 'IN_TRANSIT' },
    view_request: { entry: 'request', type: 'BUY' },
    request: { entry: 'request', type: 'BUY' },
    buy: { entry: 'request', type: 'BUY' },
    sell_car: { entry: 'request', type: 'SELL' },
    sell: { entry: 'request', type: 'SELL' },
    view_favorites: { entry: 'favorites' },
    favorites: { entry: 'favorites' },
    favourites: { entry: 'favorites' },
    support: { entry: 'support' },
    contacts: { entry: 'contacts' },
    contact: { entry: 'contacts' },
    profile: { entry: 'profile' },
    status: { entry: 'status' },
    view_status: { entry: 'status' }
  };
  return aliases[normalized] || {};
};

export const buildMiniAppUrl = (bot: BotConfig, filters: MiniAppFilters = {}, options: MiniAppUrlOptions = {}) => {
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

  if (options.preserveBaseQuery === false) {
    url.search = '';
  }

  const slug = String(config?.defaultShowcaseSlug || config?.miniAppConfig?.showcaseSlug || 'system').trim() || 'system';

  // Ensure exactly one /p/app/{configuredSlug}; stale persisted URLs must not launch another bot/showcase.
  const path = stripTrailingSlash(url.pathname || '');
  const appPathMatch = path.match(/^(.*\/p\/app)(?:\/([^/]+))?$/);

  if (!/\/p\/app(?:\/|$)/.test(path)) {
    url.pathname = `${stripTrailingSlash(path || '')}/p/app/${slug}`.replace(/\/+/g, '/');
  } else if (appPathMatch) {
    url.pathname = `${appPathMatch[1]}/${slug}`.replace(/\/+/g, '/');
  }

  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  const buildSha = options.includeBuildTag === false ? '' : readBuildSha();
  if (buildSha) {
    url.searchParams.set('v', buildSha.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24));
  } else if (options.includeBuildTag === false) {
    url.searchParams.delete('v');
  }

  return url.toString();
};

export const buildMiniAppTelegramLaunchUrl = (bot: BotConfig, filters: MiniAppFilters = {}) =>
  buildMiniAppUrl(bot, filters, { includeBuildTag: false, preserveBaseQuery: false });

export const normalizeMiniAppButtonUrl = (
  bot: BotConfig,
  rawValue?: string | null,
  fallbackFilters: MiniAppFilters = {}
) => {
  const raw = String(rawValue || '').trim();
  const isPlaceholder = raw === '{{MINI_APP_URL}}' || raw === '{MINI_APP_URL}';
  if (!raw || isPlaceholder) return buildMiniAppUrl(bot, fallbackFilters);

  try {
    const rawUrl = new URL(raw);
    const isTelegramMiniAppLink = /(^|\.)t\.me$/i.test(rawUrl.hostname) && /\/app\/?$/i.test(rawUrl.pathname);
    const isMiniAppPath = /\/p\/app(?:\/|$)/i.test(rawUrl.pathname);
    const explicitStart = rawUrl.searchParams.get('startapp')
      || rawUrl.searchParams.get('tgWebAppStartParam')
      || rawUrl.searchParams.get('start_param');

    if (!isTelegramMiniAppLink && !isMiniAppPath && !explicitStart) return raw;

    const filters: MiniAppFilters = { ...fallbackFilters };
    rawUrl.searchParams.forEach((value, key) => {
      if (['startapp', 'tgWebAppStartParam', 'start_param', 'v'].includes(key)) return;
      filters[key] = value;
    });
    Object.assign(filters, normalizeStartParamFilters(explicitStart));
    return buildMiniAppUrl(bot, filters);
  } catch {
    return raw;
  }
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
      filters.availabilityState = 'IN_STOCK';
      break;
    case 'in_transit':
      filters.entry = 'inventory';
      filters.status = 'PENDING';
      filters.availabilityState = 'IN_TRANSIT';
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
