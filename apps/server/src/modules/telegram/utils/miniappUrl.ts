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

  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
};
