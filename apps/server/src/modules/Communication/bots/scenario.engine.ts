import { prisma } from '../../../services/prisma.js';
import { RequestStatus, LeadStatus } from '@prisma/client';
import { emitScenarioCompleted } from './scenario-engine/runtime/helpers.js';
import {
  handleAddToCatalog as handleAddToCatalogAction,
  handleAddToRequest as handleAddToRequestAction,
  handleCarSelection as handleCarSelectionAction,
  handleManagerRequestAction as handleManagerRequestActionAction,
  resolveRequestId as resolveRequestIdAction
} from './scenario-engine/actions/session.actions.js';
import { handleInputRuntime, startScenarioRuntime } from './scenario-engine/runtime/session-flow.js';
import { goBackRuntime } from './scenario-engine/runtime/navigation.js';
import { executeNodeRuntime } from './scenario-engine/runtime/node-executor.js';
import { handleUpdateRuntime } from './scenario-engine/runtime/update-handler.js';
import type { BotRuntime, ScenarioRecord } from './scenario-engine/types.js';

export type { BotRuntime, ScenarioNode, ScenarioRecord } from './scenario-engine/types.js';
export class ScenarioEngine {
  static async persistSession(session: any, vars: Record<string, any>, history: string[]) {
    if (!session?.id) return;
    const lastActive = new Date();
    session.variables = vars;
    session.history = history;
    session.lastActive = lastActive;
    await prisma.botSession.update({
      where: { id: session.id },
      data: {
        variables: vars,
        history,
        lastActive
      }
    });
  }

  static async handleUpdate(bot: BotRuntime, session: any, update: any): Promise<boolean> {
    return handleUpdateRuntime({
      bot,
      session,
      update,
      persistSession: (vars, history) => ScenarioEngine.persistSession(session, vars, history),
      handleManagerRequestAction: (data, userId) => this.handleManagerRequestAction(bot, session, data, userId),
      handleInput: (vars, history, input, isCallback) => this.handleInput(bot, session, vars, history, input, isCallback),
      goBack: (vars, history) => this.goBack(bot, session, vars, history),
      executeNode: (vars, history, scenario, nodeId, isBack = false, depth = 0) =>
        this.executeNode(bot, session, vars, history, scenario, nodeId, isBack, depth),
      handleCarSelection: (vars, carId, userId) => this.handleCarSelection(bot, session.chatId, vars, carId, userId),
      handleAddToRequest: (vars, carId) => this.handleAddToRequest(bot, session.chatId, vars, carId),
      handleAddToCatalog: (vars, carId) => this.handleAddToCatalog(bot, session.chatId, vars, carId)
    });
  }

  static async goBack(bot: BotRuntime, session: any, vars: Record<string, any>, history: string[]) {
    return goBackRuntime({
      bot,
      session,
      vars,
      history,
      executeNode: (scenario, nodeId, isBack = false, depth = 0) =>
        this.executeNode(bot, session, vars, history, scenario, nodeId, isBack, depth)
    });
  }

  static async handleInput(bot: BotRuntime, session: any, vars: Record<string, any>, history: string[], input: string, isCallback: boolean): Promise<boolean> {
    return handleInputRuntime({
      bot,
      session,
      vars,
      history,
      input,
      isCallback,
      executeNode: (scenario, nodeId, isBack = false, depth = 0) =>
        this.executeNode(bot, session, vars, history, scenario, nodeId, isBack, depth),
      persistSession: () => ScenarioEngine.persistSession(session, vars, history)
    });
  }

  static async startScenario(bot: BotRuntime, session: any, scenarioId: string, update?: any): Promise<boolean> {
    return startScenarioRuntime({
      bot,
      session,
      scenarioId,
      update,
      executeNode: async (vars, history, scenario, nodeId, isBack = false, depth = 0) => {
        await this.executeNode(bot, session, vars, history, scenario, nodeId, isBack, depth);
      },
      persistSession: async (vars, history) => {
        await this.persistSession(session, vars, history);
      }
    });
  }

  static async executeNode(bot: BotRuntime, session: any, vars: Record<string, any>, history: string[], scenario: ScenarioRecord, nodeId: string, isBack = false, depth = 0): Promise<void> {
    return executeNodeRuntime({
      bot,
      session,
      vars,
      history,
      scenario,
      nodeId,
      isBack,
      depth,
      executeNode: (nextScenario, nextNodeId, nextIsBack = false, nextDepth = 0) =>
        this.executeNode(bot, session, vars, history, nextScenario, nextNodeId, nextIsBack, nextDepth),
      persistSession: () => ScenarioEngine.persistSession(session, vars, history)
    });
  }

  static async handleCarSelection(bot: BotRuntime, chatId: string, vars: Record<string, any>, carId: string, userId?: string) {
    return handleCarSelectionAction(bot, chatId, vars, carId, userId);
  }

  static async resolveRequestId(vars: Record<string, any>) {
    return resolveRequestIdAction(vars);
  }

  static async handleAddToRequest(bot: BotRuntime, chatId: string, vars: Record<string, any>, carId: string) {
    return handleAddToRequestAction(bot, chatId, vars, carId);
  }

  static async handleAddToCatalog(bot: BotRuntime, chatId: string, vars: Record<string, any>, carId: string) {
    return handleAddToCatalogAction(bot, chatId, vars, carId);
  }

  static async handleManagerRequestAction(bot: BotRuntime, session: any, data: string, userId?: string) {
    return handleManagerRequestActionAction(bot, session, data, userId);
  }
}
