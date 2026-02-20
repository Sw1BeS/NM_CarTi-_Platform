import { prisma } from '../../../../../services/prisma.js';
import { sendMessage, sendReplyKeyboard } from '../adapters/telegram.adapter.js';
import {
  buildMainMenuButtons,
  buildWelcomeMessage,
  getLanguage
} from './helpers.js';
import { completeScenarioFlow } from './lifecycle.js';
import type { BotRuntime, ScenarioRecord } from '../types.js';

interface GoBackRuntimeContext {
  bot: BotRuntime;
  session: any;
  vars: Record<string, any>;
  history: string[];
  executeNode: (scenario: ScenarioRecord, nodeId: string, isBack?: boolean, depth?: number) => Promise<void>;
}

export const goBackRuntime = async ({
  bot,
  session,
  vars,
  history,
  executeNode
}: GoBackRuntimeContext): Promise<void> => {
  const lang = getLanguage(vars);

  if (!vars.__activeScenarioId || history.length === 0) {
    const msg = lang === 'UK' ? 'Нікуди повертатися.' : lang === 'RU' ? 'Некуда возвращаться.' : 'Nothing to go back to.';
    await sendMessage(bot, session.chatId, msg);

    if (!vars.__activeScenarioId) {
      await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
    }

    return;
  }

  const prevNodeId = history.pop();
  const scenario = await prisma.scenario.findUnique({ where: { id: vars.__activeScenarioId } });

  if (scenario && prevNodeId) {
    await executeNode(scenario as any, prevNodeId, true, 0);
    return;
  }

  await completeScenarioFlow({
    bot,
    chatId: session.chatId,
    vars,
    history,
    scenarioId: vars.__activeScenarioId,
    payload: { reason: 'back_reset' },
    userId: vars.__telegramUserId,
    lang
  });
};
