import {
  buildMiniAppUrl,
  normalizeMiniAppButtonUrl
} from '../modules/Communication/telegram/core/utils/miniappUrl.js';

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const sanitizeSlug = (value?: string | null) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/[^a-z0-9_-]/g, '').slice(0, 50);
};

const buildNormalizationBot = (bot: any, config: Record<string, any>) => {
  const miniAppConfig = isRecord(config.miniAppConfig) ? config.miniAppConfig : {};
  const defaultShowcase = isRecord(bot.defaultShowcase) ? bot.defaultShowcase : {};
  const slug = sanitizeSlug(config.defaultShowcaseSlug)
    || sanitizeSlug(miniAppConfig.showcaseSlug)
    || sanitizeSlug(defaultShowcase.slug)
    || sanitizeSlug(config.botUsername)
    || sanitizeSlug(config.username)
    || sanitizeSlug(bot.name)
    || 'system';

  const configForUrl = {
    ...config,
    defaultShowcaseSlug: slug,
    miniAppConfig: {
      ...miniAppConfig,
      url: undefined,
      baseUrl: undefined,
      showcaseSlug: slug
    }
  };
  const configuredMiniAppUrl = buildMiniAppUrl({ ...bot, config: configForUrl } as any);

  return {
    ...bot,
    config: {
      ...config,
      defaultShowcaseSlug: slug,
      miniAppConfig: {
        ...miniAppConfig,
        url: configuredMiniAppUrl || miniAppConfig.url,
        showcaseSlug: slug
      }
    }
  };
};

export const readBotConfig = (bot: any) => isRecord(bot?.config) ? bot.config : {};

export const repairMenuButtons = (bot: any) => {
  const sourceConfig = readBotConfig(bot);
  const buttons = Array.isArray(sourceConfig.menuConfig?.buttons)
    ? sourceConfig.menuConfig.buttons
    : [];
  if (buttons.length === 0) return sourceConfig;

  const normalizationBot = buildNormalizationBot(bot, sourceConfig);
  const nextButtons = buttons.map((button: any) => {
    if (!isRecord(button)) return button;
    const type = String(button.type || '').toUpperCase();
    if (type !== 'WEB_APP' && type !== 'LINK') return button;
    const value = normalizeMiniAppButtonUrl(normalizationBot as any, button.value);
    return value === button.value ? button : { ...button, value };
  });
  const hasButtonChanges = nextButtons.some((button: any, index: number) => button !== buttons[index]);

  if (!hasButtonChanges) return sourceConfig;

  return {
    ...sourceConfig,
    defaultShowcaseSlug: normalizationBot.config.defaultShowcaseSlug,
    menuConfig: {
      ...(isRecord(sourceConfig.menuConfig) ? sourceConfig.menuConfig : {}),
      buttons: nextButtons
    }
  };
};

export const errorMessage = (err: unknown) => {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
};
