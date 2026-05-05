import { prisma } from '../src/services/prisma.js';
import { applyTemplatePreset } from '../src/services/templatePreset.service.js';

async function main() {
  const bots = await prisma.botConfig.findMany({
    where: {
      isEnabled: true,
      template: 'CLIENT_LEAD'
    },
    include: {
      defaultShowcase: {
        select: { slug: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  let updated = 0;
  for (const bot of bots) {
    const config = (bot.config || {}) as Record<string, any>;
    const showcaseSlug = String(
      config.defaultShowcaseSlug
      || config.miniAppConfig?.showcaseSlug
      || bot.defaultShowcase?.slug
      || config.botUsername
      || config.username
      || ''
    ).trim() || undefined;

    const applied = await applyTemplatePreset({
      template: 'CLIENT_LEAD',
      companyId: bot.companyId,
      botId: bot.id,
      config,
      defaultShowcaseSlug: showcaseSlug,
      fallbackName: bot.name || undefined,
      applyPreset: true,
      forcePreset: false,
      channelId: bot.channelId,
      adminChatId: bot.adminChatId
    });
    const requiredButtonIds = new Set(['btn_pick', 'btn_sell', 'btn_stock', 'btn_transit', 'btn_favorites', 'btn_support']);
    if (Array.isArray(applied.config.menuConfig?.buttons)) {
      applied.config.menuConfig.buttons = applied.config.menuConfig.buttons
        .filter((button: any) => requiredButtonIds.has(String(button?.id || '')))
        .sort((a: any, b: any) => (Number(a.row) - Number(b.row)) || (Number(a.col) - Number(b.col)));
    }

    const changed = JSON.stringify(config) !== JSON.stringify(applied.config);
    if (!changed) {
      console.log(`[client-miniapp-menu-repair] unchanged ${bot.id} (${bot.name || 'unnamed'})`);
      continue;
    }

    await prisma.botConfig.update({
      where: { id: bot.id },
      data: {
        config: applied.config as any
      }
    });
    updated += 1;
    console.log(`[client-miniapp-menu-repair] updated ${bot.id} (${bot.name || 'unnamed'}) -> ${applied.showcaseSlug}`);
  }

  console.log(`[client-miniapp-menu-repair] completed, bots updated: ${updated}/${bots.length}`);
}

main()
  .catch((err) => {
    console.error('[client-miniapp-menu-repair] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
