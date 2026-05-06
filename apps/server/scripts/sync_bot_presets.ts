import axios from 'axios';
import type { BotTemplate } from '@prisma/client';
import { prisma } from '../src/services/prisma.js';
import { applyTemplatePreset } from '../src/services/templatePreset.service.js';
import { buildMiniAppUrl } from '../src/modules/Communication/telegram/core/utils/miniappUrl.js';

const SUPPORTED_TEMPLATES = new Set<BotTemplate>(['CLIENT_LEAD', 'B2B', 'CATALOG']);

const isValidCommand = (value?: string | null) => /^[a-z0-9_]{1,32}$/.test(String(value || '').trim());

const syncTelegramCommands = async (bot: { id: string; token: string; template: BotTemplate; companyId: string }) => {
  const commandMap = new Map<string, string>([
    ['start', 'Головне меню'],
    ['menu', 'Відкрити меню']
  ]);

  const allowGlobalScenarioFallback = String(process.env.TELEGRAM_SCENARIO_SCOPE_FALLBACK || 'false').toLowerCase() === 'true';

  const scopedScenarios = await prisma.scenario.findMany({
    where: {
      companyId: bot.companyId,
      botId: bot.id,
      isActive: true,
      status: 'PUBLISHED'
    },
    select: { triggerCommand: true, name: true, botId: true },
    orderBy: { updatedAt: 'desc' }
  });

  const scenarios = scopedScenarios.length || !allowGlobalScenarioFallback
    ? scopedScenarios
    : await prisma.scenario.findMany({
      where: {
        companyId: bot.companyId,
        isActive: true,
        status: 'PUBLISHED',
        OR: [{ botId: bot.id }, { botId: null }]
      },
      select: { triggerCommand: true, name: true, botId: true },
      orderBy: { updatedAt: 'desc' }
    });

  const scenarioByCommand = new Map<string, { triggerCommand: string | null; name: string | null; botId?: string | null }>();
  for (const scenario of scenarios as any[]) {
    const cmd = String(scenario.triggerCommand || '').trim().toLowerCase();
    if (!cmd) continue;
    const prev = scenarioByCommand.get(cmd);
    if (!prev) {
      scenarioByCommand.set(cmd, scenario);
      continue;
    }
    const prevScoped = prev.botId === bot.id;
    const nextScoped = scenario.botId === bot.id;
    if (nextScoped && !prevScoped) {
      scenarioByCommand.set(cmd, scenario);
    }
  }

  for (const scenario of scenarioByCommand.values()) {
    const cmd = String(scenario.triggerCommand || '').trim().toLowerCase();
    if (!isValidCommand(cmd) || commandMap.has(cmd)) continue;
    commandMap.set(cmd, String(scenario.name || cmd).slice(0, 120));
  }

  const legacyFallback = String(process.env.TELEGRAM_B2B_LEGACY_FALLBACK || 'false').toLowerCase() === 'true';
  if (legacyFallback && bot.template === 'B2B' && !commandMap.has('request')) {
    commandMap.set('request', 'Створити запит');
  }

  const commands = Array.from(commandMap.entries()).map(([command, description]) => ({ command, description }));
  await axios.post(`https://api.telegram.org/bot${bot.token}/setMyCommands`, { commands }, { timeout: 10000 });
};

const syncTelegramMenuButton = async (bot: { id: string; token: string; config?: any }) => {
  const miniAppUrl = buildMiniAppUrl(bot as any, {});
  if (!miniAppUrl) return;
  const menuText = String(bot.config?.menuButtonText || 'Каталог авто').trim() || 'Каталог авто';
  await axios.post(`https://api.telegram.org/bot${bot.token}/setChatMenuButton`, {
    menu_button: {
      type: 'web_app',
      text: menuText.slice(0, 64),
      web_app: { url: miniAppUrl }
    }
  }, { timeout: 10000 });
};

async function main() {
  const forcePreset = ['1', 'true', 'yes'].includes(String(process.env.PRESET_FORCE || '').toLowerCase());
  const bots = await prisma.botConfig.findMany({
    where: { isEnabled: true },
    select: {
      id: true,
      name: true,
      template: true,
      token: true,
      companyId: true,
      channelId: true,
      adminChatId: true,
      config: true
    }
  });

  let updated = 0;
  for (const bot of bots) {
    if (!SUPPORTED_TEMPLATES.has(bot.template)) continue;
    const currentConfig = (bot.config || {}) as Record<string, unknown>;

    const applied = await applyTemplatePreset({
      template: bot.template,
      companyId: bot.companyId,
      botId: bot.id,
      config: currentConfig as any,
      defaultShowcaseSlug: (currentConfig.defaultShowcaseSlug as string) || undefined,
      fallbackName: bot.name || undefined,
      applyPreset: true,
      forcePreset,
      channelId: bot.channelId,
      adminChatId: bot.adminChatId
    });

    const changed = JSON.stringify(currentConfig) !== JSON.stringify(applied.config);
    if (changed) {
      await prisma.botConfig.update({
        where: { id: bot.id },
        data: { config: applied.config as any }
      });
      updated += 1;
      console.log(`[preset-sync] updated config for bot ${bot.id} (${bot.name || 'unnamed'})`);
    }

    try {
      await syncTelegramCommands(bot);
      console.log(`[preset-sync] commands synced for bot ${bot.id}`);
    } catch (err: any) {
      console.warn(`[preset-sync] setMyCommands failed for bot ${bot.id}: ${err?.message || err}`);
    }

    try {
      await syncTelegramMenuButton(bot);
      console.log(`[preset-sync] chat menu synced for bot ${bot.id}`);
    } catch (err: any) {
      console.warn(`[preset-sync] setChatMenuButton failed for bot ${bot.id}: ${err?.message || err}`);
    }
  }

  console.log(`[preset-sync] completed, bots updated: ${updated}/${bots.length}`);
}

main()
  .catch((err) => {
    console.error('[preset-sync] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
