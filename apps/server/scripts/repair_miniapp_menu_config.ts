import { prisma } from '../src/services/prisma.js';
import {
  buildMiniAppUrl,
  normalizeMiniAppButtonUrl
} from '../src/modules/Communication/telegram/core/utils/miniappUrl.js';

const modeArg = process.argv.find(arg => arg === '--dry-run' || arg === '--apply');
const APPLY = modeArg === '--apply';

if (!modeArg) {
  console.error('[repair-miniapp-menu-config] pass --dry-run or --apply');
  process.exit(1);
}

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

  const configForUrl = { ...config, defaultShowcaseSlug: slug };
  if (config.publicBaseUrl) {
    configForUrl.miniAppConfig = { ...miniAppConfig, url: undefined, showcaseSlug: slug };
  }

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

const repairMenuButtons = (bot: any) => {
  const sourceConfig = isRecord(bot.config) ? bot.config : {};
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
  const hasButtonChanges = nextButtons.some((button, index) => button !== buttons[index]);

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

async function main() {
  console.log(`[repair-miniapp-menu-config] mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);

  const bots = await prisma.botConfig.findMany({
    where: { isEnabled: true },
    include: {
      defaultShowcase: {
        select: { slug: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  let changed = 0;
  for (const bot of bots) {
    const currentConfig = isRecord(bot.config) ? bot.config : {};
    const nextConfig = repairMenuButtons(bot);
    const hasChanges = JSON.stringify(currentConfig) !== JSON.stringify(nextConfig);

    if (!hasChanges) {
      console.log(`[repair-miniapp-menu-config] unchanged ${bot.id} (${bot.name || 'unnamed'})`);
      continue;
    }

    changed += 1;
    console.log(`[repair-miniapp-menu-config] ${APPLY ? 'update' : 'would_update'} ${bot.id} (${bot.name || 'unnamed'})`);

    if (APPLY) {
      await prisma.botConfig.update({
        where: { id: bot.id },
        data: { config: nextConfig as any }
      });
    }
  }

  console.log(`[repair-miniapp-menu-config] done scanned=${bots.length} changed=${changed} mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);
}

main()
  .catch((err) => {
    console.error('[repair-miniapp-menu-config] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
