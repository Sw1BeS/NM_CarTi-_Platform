import { prisma } from '../src/services/prisma.js';
import {
  errorMessage,
  readBotConfig,
  repairMenuButtons
} from '../src/scripts/repair_miniapp_menu_config.helpers.js';

const modeArg = process.argv.find(arg => arg === '--dry-run' || arg === '--apply');
const APPLY = modeArg === '--apply';

if (!modeArg) {
  console.error('[repair-miniapp-menu-config] pass --dry-run or --apply');
  process.exit(1);
}

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
    const currentConfig = readBotConfig(bot);
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
    console.error(`[repair-miniapp-menu-config] failed: ${errorMessage(err)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
