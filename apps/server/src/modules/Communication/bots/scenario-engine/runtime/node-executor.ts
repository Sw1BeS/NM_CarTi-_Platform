import { emitPlatformEvent } from '../../../telegram/core/events/eventEmitter.js';
import { logger } from '../../../../../utils/logger.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import { getLanguage } from './helpers.js';
import { completeScenarioFlow } from './lifecycle.js';
import { executeActionNode as executeActionNodeAction } from '../actions/node-action.actions.js';
import {
  executeChannelPostNode as executeChannelPostNodeAction,
  executeOfferCollectNode as executeOfferCollectNodeAction,
  executeRequestBroadcastNode as executeRequestBroadcastNodeAction,
  executeSearchCarsNode as executeSearchCarsNodeAction,
  executeSearchFallbackNode as executeSearchFallbackNodeAction
} from '../actions/node-broadcast.actions.js';
import {
  executeMenuReplyNode as executeMenuReplyNodeAction,
  executeQuestionChoiceNode as executeQuestionChoiceNodeAction,
  executeQuestionPhotoNode as executeQuestionPhotoNodeAction,
  executeQuestionTextNode as executeQuestionTextNodeAction,
  executeRequestContactNode as executeRequestContactNodeAction,
  resolveConditionNextNodeId as resolveConditionNextNodeIdAction
} from '../actions/node-interaction.actions.js';
import {
  executeDelayNode as executeDelayNodeAction,
  executeGalleryNode as executeGalleryNodeAction
} from '../actions/node-runtime.actions.js';
import type { BotRuntime, ScenarioNode, ScenarioRecord } from '../types.js';

interface ExecuteNodeRuntimeContext {
  bot: BotRuntime;
  session: any;
  vars: Record<string, any>;
  history: string[];
  scenario: ScenarioRecord;
  nodeId: string;
  isBack?: boolean;
  depth?: number;
  executeNode: (scenario: ScenarioRecord, nodeId: string, isBack?: boolean, depth?: number) => Promise<void>;
  persistSession: () => Promise<void>;
}

export const executeNodeRuntime = async ({
  bot,
  session,
  vars,
  history,
  scenario,
  nodeId,
  isBack = false,
  depth = 0,
  executeNode,
  persistSession
}: ExecuteNodeRuntimeContext): Promise<void> => {
  if (depth > 25) {
    logger.warn(`[ScenarioEngine] Infinite loop detected for scenario ${scenario.id}, node ${nodeId}`);
    await sendMessage(bot, session.chatId, '⚠️ Помилка: виявлено зациклення сценарію.');
    return;
  }

  const nodes = Array.isArray(scenario.nodes) ? (scenario.nodes as ScenarioNode[]) : [];
  const node: ScenarioNode | undefined = nodes.find((candidate: ScenarioNode) => candidate.id === nodeId);
  const lang = getLanguage(vars);

  if (!node) {
    await completeScenarioFlow({
      bot,
      chatId: session.chatId,
      vars,
      history,
      scenarioId: vars.__activeScenarioId || scenario.id,
      payload: { reason: 'missing_node' },
      userId: vars.__telegramUserId,
      lang,
      persistSession
    });
    return;
  }

  if (
    !isBack
    && vars.__currentNodeId
    && vars.__currentNodeId !== nodeId
    && ['QUESTION_TEXT', 'QUESTION_CHOICE', 'MENU_REPLY', 'REQUEST_CONTACT', 'QUESTION_PHOTO'].includes(node.type)
  ) {
    history.push(vars.__currentNodeId);
    if (history.length > 30) history.shift();
  }

  vars.__activeScenarioId = scenario.id;
  vars.__currentNodeId = node.id;

  await emitPlatformEvent({
    companyId: bot.companyId || null,
    botId: bot.id,
    eventType: 'scenario.step',
    userId: vars.__telegramUserId || session.chatId,
    chatId: session.chatId,
    payload: {
      scenarioId: scenario.id,
      nodeId: node.id,
      nodeType: node.type,
      isBack
    }
  });

  const getText = () => {
    if (lang === 'UK' && node.content?.text_uk) return node.content.text_uk;
    if (lang === 'RU' && node.content?.text_ru) return node.content.text_ru;
    return node.content?.text || '';
  };
  const replaceVars = (text: string) => text.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '');

  const textRaw = getText();
  const text = replaceVars(textRaw);
  const completeCurrentScenario = async (reason: string = 'end') => {
    await completeScenarioFlow({
      bot,
      chatId: session.chatId,
      vars,
      history,
      scenarioId: scenario.id,
      payload: { reason },
      userId: vars.__telegramUserId,
      lang,
      persistSession
    });
  };
  const continueToNextOrComplete = async () => {
    if (node.nextNodeId) {
      await executeNode(scenario, node.nextNodeId, isBack, depth + 1);
    } else {
      await completeCurrentScenario('end');
    }
  };

  switch (node.type) {
    case 'START':
    case 'JUMP':
      if (node.nextNodeId) await executeNode(scenario, node.nextNodeId, isBack, depth + 1);
      break;

    case 'MESSAGE':
      await sendMessage(bot, session.chatId, text);
      await continueToNextOrComplete();
      break;

    case 'QUESTION_TEXT':
      await executeQuestionTextNodeAction({
        bot,
        session,
        node,
        text,
        persistSession
      });
      break;

    case 'QUESTION_CHOICE':
      await executeQuestionChoiceNodeAction({
        bot,
        session,
        vars,
        history,
        node,
        text,
        lang,
        persistSession
      });
      break;

    case 'MENU_REPLY': {
      await executeMenuReplyNodeAction({
        bot,
        session,
        node,
        text,
        lang,
        persistSession
      });
      break;
    }

    case 'REQUEST_CONTACT':
      await executeRequestContactNodeAction({
        bot,
        session,
        text,
        persistSession
      });
      break;

    case 'QUESTION_PHOTO':
      await executeQuestionPhotoNodeAction({
        bot,
        session,
        text,
        persistSession
      });
      break;

    case 'CONDITION': {
      const nextId = resolveConditionNextNodeIdAction(node, vars);
      if (nextId) await executeNode(scenario, nextId, isBack, depth + 1);
      else await completeCurrentScenario('end');
      break;
    }

    case 'DELAY': {
      const delayResult = await executeDelayNodeAction({
        bot,
        session,
        node,
        scenarioId: scenario.id,
        persistSession
      });
      if (delayResult === 'scheduled') return;
      if (node.nextNodeId) await executeNode(scenario, node.nextNodeId, isBack, depth + 1);
      break;
    }

    case 'GALLERY': {
      await executeGalleryNodeAction({ bot, session, vars, text, lang });
      await continueToNextOrComplete();
      break;
    }

    case 'ACTION': {
      const actionResult = await executeActionNodeAction({
        bot,
        session,
        vars,
        node,
        text,
        scenarioId: scenario.id
      });
      if (actionResult === 'halt') break;

      await continueToNextOrComplete();
      break;
    }

    case 'SEARCH_CARS': {
      await executeSearchCarsNodeAction({ vars, bot });

      await continueToNextOrComplete();
      break;
    }

    case 'SEARCH_FALLBACK': {
      await executeSearchFallbackNodeAction({ vars, bot });

      await continueToNextOrComplete();
      break;
    }

    case 'CHANNEL_POST': {
      const result = await executeChannelPostNodeAction({
        bot,
        session,
        vars,
        node,
        text,
        lang,
        scenarioId: scenario.id
      });
      if (result === 'halt') break;

      await continueToNextOrComplete();
      break;
    }

    case 'REQUEST_BROADCAST': {
      const result = await executeRequestBroadcastNodeAction({
        bot,
        session,
        vars,
        node,
        text
      });
      if (result === 'halt') break;

      await continueToNextOrComplete();
      break;
    }

    case 'OFFER_COLLECT': {
      const result = await executeOfferCollectNodeAction({
        bot,
        session,
        vars,
        node,
        text
      });
      if (result === 'halt') break;

      await continueToNextOrComplete();
      break;
    }
  }
};
