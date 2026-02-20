import { sendReplyKeyboard } from '../adapters/telegram.adapter.js';
import { buildMainMenuButtons, buildWelcomeMessage, emitScenarioCompleted, getLanguage } from './helpers.js';
import type { BotRuntime } from '../types.js';

interface CompleteScenarioFlowOptions {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
  history: string[];
  scenarioId?: string;
  payload?: Record<string, any>;
  userId?: string;
  lang?: string;
  persistSession?: () => Promise<void>;
}

export const clearActiveScenario = (vars: Record<string, any>, history: string[]) => {
  delete vars.__activeScenarioId;
  delete vars.__currentNodeId;
  history.length = 0;
};

export const completeScenarioFlow = async ({
  bot,
  chatId,
  vars,
  history,
  scenarioId,
  payload,
  userId,
  lang,
  persistSession
}: CompleteScenarioFlowOptions) => {
  if (scenarioId) {
    await emitScenarioCompleted(bot, chatId, scenarioId, payload || { reason: 'end' }, userId);
  }

  clearActiveScenario(vars, history);

  const effectiveLang = lang || getLanguage(vars);
  await sendReplyKeyboard(
    bot,
    chatId,
    buildWelcomeMessage(bot, effectiveLang),
    buildMainMenuButtons(bot, effectiveLang)
  );

  if (persistSession) {
    await persistSession();
  }
};
