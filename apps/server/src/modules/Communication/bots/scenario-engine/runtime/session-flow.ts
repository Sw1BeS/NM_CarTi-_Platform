import { prisma } from '../../../../../services/prisma.js';
import { logger } from '../../../../../utils/logger.js';
import { emitPlatformEvent } from '../../../telegram/core/events/eventEmitter.js';
import { completeScenarioFlow } from './lifecycle.js';
import { getLanguage, normalizeTextCommand } from './helpers.js';
import type { BotRuntime, ScenarioNode, ScenarioRecord } from '../types.js';

interface HandleInputRuntimeContext {
  bot: BotRuntime;
  session: any;
  vars: Record<string, any>;
  history: string[];
  input: string;
  isCallback: boolean;
  executeNode: (scenario: ScenarioRecord, nodeId: string, isBack?: boolean, depth?: number) => Promise<void>;
  persistSession: () => Promise<void>;
}

interface StartScenarioRuntimeContext {
  bot: BotRuntime;
  session: any;
  scenarioId: string;
  update?: any;
  executeNode: (
    vars: Record<string, any>,
    history: string[],
    scenario: ScenarioRecord,
    nodeId: string,
    isBack?: boolean,
    depth?: number
  ) => Promise<void>;
  persistSession: (vars: Record<string, any>, history: string[]) => Promise<void>;
}

export const handleInputRuntime = async ({
  bot,
  session,
  vars,
  history,
  input,
  isCallback,
  executeNode,
  persistSession
}: HandleInputRuntimeContext): Promise<boolean> => {
  if (!vars.__activeScenarioId || !vars.__currentNodeId) {
    if (vars.__activeScenarioId && !vars.__currentNodeId) {
      logger.warn(`[ScenarioEngine] Missing current node for scenario ${vars.__activeScenarioId} (session ${session?.id || 'unknown'})`);
    }
    return false;
  }

  const scenario = await prisma.scenario.findUnique({ where: { id: vars.__activeScenarioId } });
  if (!scenario) return false;

  const nodes = Array.isArray((scenario as any).nodes) ? ((scenario as any).nodes as ScenarioNode[]) : [];
  const node = nodes.find((n: ScenarioNode) => n.id === vars.__currentNodeId);
  if (!node) return false;

  if (node.type === 'QUESTION_CHOICE' || node.type === 'MENU_REPLY') {
    const choices = node.content?.choices || [];
    const match = choices.find((choice: any) => {
      if (isCallback) return String(choice.value) === String(input);
      const labelMatch = normalizeTextCommand(choice.label) === normalizeTextCommand(input);
      const valMatch = String(choice.value) === String(input);
      const lang = getLanguage(vars);
      const locLabel = lang === 'UK' ? choice.label_uk : lang === 'RU' ? choice.label_ru : choice.label;
      const locMatch = locLabel && normalizeTextCommand(locLabel) === normalizeTextCommand(input);
      return valMatch || labelMatch || locMatch;
    });

    if (match && match.nextNodeId) {
      if (node.content?.variableName) vars[node.content.variableName] = match.value;
      await executeNode(scenario as any, match.nextNodeId, false, 0);
      return true;
    }
    return false;
  }

  if (node.type === 'REQUEST_CONTACT') {
    if (input === '[CONTACT]' || input.length > 5) {
      if (input !== '[CONTACT]') vars.phone = input;
      if (node.nextNodeId) {
        await executeNode(scenario as any, node.nextNodeId, false, 0);
        return true;
      }
    }
    return false;
  }

  if (node.content?.variableName) {
    vars[node.content.variableName] = input;
  }

  if (node.nextNodeId) {
    await executeNode(scenario as any, node.nextNodeId, false, 0);
    return true;
  }

  await completeScenarioFlow({
    bot,
    chatId: session.chatId,
    vars,
    history,
    scenarioId: scenario.id,
    payload: { reason: 'end' },
    userId: vars.__telegramUserId,
    lang: getLanguage(vars),
    persistSession
  });

  return true;
};

export const startScenarioRuntime = async ({
  bot,
  session,
  scenarioId,
  update,
  executeNode,
  persistSession
}: StartScenarioRuntimeContext): Promise<boolean> => {
  const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } });
  if (!scenario || !scenario.isActive) {
    return false;
  }

  const vars: Record<string, any> = (session.variables && typeof session.variables === 'object' && !Array.isArray(session.variables))
    ? { ...session.variables }
    : {};
  const history: string[] = [];

  vars.__activeScenarioId = scenario.id;
  vars.__currentNodeId = null;
  vars.__tempResults = [];

  const fromUser = update?.message?.from || update?.callback_query?.from;
  if (fromUser) {
    if (fromUser.id) vars.__telegramUserId = String(fromUser.id);
    if (fromUser.username) vars.__telegramUsername = fromUser.username;
    if (fromUser.first_name) vars.__telegramFirstName = fromUser.first_name;
    if (fromUser.last_name) vars.__telegramLastName = fromUser.last_name;
  }

  await emitPlatformEvent({
    companyId: bot.companyId || null,
    botId: bot.id,
    eventType: 'scenario.started',
    userId: vars.__telegramUserId || session.chatId,
    chatId: session.chatId,
    payload: { scenarioId: scenario.id }
  });

  const nodes = Array.isArray(scenario.nodes) ? (scenario.nodes as unknown as ScenarioNode[]) : [];
  const entryId = scenario.entryNodeId || (nodes.find((n: any) => n.type === 'START')?.id || nodes[0]?.id);

  if (entryId) {
    await executeNode(vars, history, scenario as any, entryId, false, 0);
  }

  await persistSession(vars, history);
  return true;
};
