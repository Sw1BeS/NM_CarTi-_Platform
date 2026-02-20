import { prisma } from '../../../../../services/prisma.js';
import type { BotRuntime, ScenarioRecord } from '../types.js';

export const loadPublishedScenarios = async (bot: BotRuntime): Promise<ScenarioRecord[]> => {
  let rawScenarios: ScenarioRecord[] = [];

  if (bot.companyId) {
    const scoped = await prisma.scenario.findMany({
      where: {
        companyId: bot.companyId,
        botId: bot.id,
        status: 'PUBLISHED',
        isActive: true
      },
      orderBy: { createdAt: 'desc' }
    });

    if (scoped.length) {
      rawScenarios = scoped as ScenarioRecord[];
    } else {
      rawScenarios = await prisma.scenario.findMany({
        where: {
          companyId: bot.companyId,
          status: 'PUBLISHED',
          isActive: true,
          OR: [{ botId: bot.id }, { botId: null }]
        },
        orderBy: { createdAt: 'desc' }
      }) as ScenarioRecord[];
    }
  }

  const scenariosByKey = new Map<string, ScenarioRecord>();
  const scoreScenario = (scenario: ScenarioRecord) => (scenario.botId === bot.id ? 2 : scenario.botId ? 1 : 0);

  for (const scenario of rawScenarios) {
    const commandKey = String(scenario.triggerCommand || '').trim().toLowerCase();
    const key = commandKey ? `cmd:${commandKey}` : `id:${scenario.id}`;
    const existing = scenariosByKey.get(key);

    if (!existing) {
      scenariosByKey.set(key, scenario);
      continue;
    }

    const nextScore = scoreScenario(scenario);
    const prevScore = scoreScenario(existing);
    if (nextScore > prevScore) {
      scenariosByKey.set(key, scenario);
    }
  }

  return Array.from(scenariosByKey.values());
};
