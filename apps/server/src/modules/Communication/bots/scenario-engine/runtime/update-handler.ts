import { prisma } from '../../../../../services/prisma.js';
import { emitPlatformEvent } from '../../../telegram/core/events/eventEmitter.js';
import { parseStartPayload } from '../../../../../utils/deeplink.utils.js';
import { sendMessage, sendReplyKeyboard } from '../adapters/telegram.adapter.js';
import {
  buildMainMenuButtons,
  buildWelcomeMessage,
  getLanguage,
  getMenuConfig,
  normalizeTextCommand,
  resolveMenuLink
} from './helpers.js';
import { handleCallbackQuery as handleCallbackQueryAction } from '../actions/callback.actions.js';
import { handleDealerFlow as handleDealerFlowAction } from '../actions/dealer-flow.actions.js';
import {
  handleStartCommand as handleStartCommandAction,
  handleWebAppData as handleWebAppDataAction
} from '../actions/entry.actions.js';
import { handleSetupCommands as handleSetupCommandsAction } from '../actions/setup.actions.js';
import { clearActiveScenario } from './lifecycle.js';
import { loadPublishedScenarios } from './scenario-registry.js';
import type { BotRuntime, ScenarioRecord } from '../types.js';

interface HandleUpdateRuntimeContext {
  bot: BotRuntime;
  session: any;
  update: any;
  persistSession: (vars: Record<string, any>, history: string[]) => Promise<void>;
  handleManagerRequestAction: (data: string, userId?: string) => Promise<any>;
  handleInput: (vars: Record<string, any>, history: string[], input: string, isCallback: boolean) => Promise<boolean>;
  goBack: (vars: Record<string, any>, history: string[]) => Promise<void>;
  executeNode: (
    vars: Record<string, any>,
    history: string[],
    scenario: ScenarioRecord,
    nodeId: string,
    isBack?: boolean,
    depth?: number
  ) => Promise<void>;
  handleCarSelection: (vars: Record<string, any>, carId: string, userId?: string) => Promise<any>;
  handleAddToRequest: (vars: Record<string, any>, carId: string) => Promise<any>;
  handleAddToCatalog: (vars: Record<string, any>, carId: string) => Promise<any>;
}

export const handleUpdateRuntime = async ({
  bot,
  session,
  update,
  persistSession,
  handleManagerRequestAction,
  handleInput,
  goBack,
  executeNode,
  handleCarSelection,
  handleAddToRequest,
  handleAddToCatalog
}: HandleUpdateRuntimeContext): Promise<boolean> => {
  const vars: Record<string, any> = (session.variables && typeof session.variables === 'object' && !Array.isArray(session.variables))
    ? { ...session.variables }
    : {};
  const history: string[] = Array.isArray(session.history) ? [...session.history] : [];

  const inputRaw = update.message?.text || update.callback_query?.data || '';
  const input = normalizeTextCommand(inputRaw);
  const messageTextRaw = update.message?.text || '';
  const chatId = String(update.message?.chat?.id || update.callback_query?.message?.chat?.id || session.chatId);
  const chatType = update.message?.chat?.type || update.callback_query?.message?.chat?.type || 'unknown';
  const fromUser = update.message?.from || update.callback_query?.from || update.inline_query?.from;
  const userIdRaw = fromUser?.id;
  const userId = userIdRaw ? String(userIdRaw) : undefined;
  if (userId) vars.__telegramUserId = userId;
  if (fromUser?.username) vars.__telegramUsername = fromUser.username;
  if (fromUser?.first_name) vars.__telegramFirstName = fromUser.first_name;
  if (fromUser?.last_name) vars.__telegramLastName = fromUser.last_name;
  vars.__telegramChatType = chatType;
  const lang = getLanguage(vars);
  const startPayloadRaw = messageTextRaw.startsWith('/start') ? messageTextRaw.split(' ')[1] : '';
  const hasStartPayload = !!(startPayloadRaw && parseStartPayload(startPayloadRaw));
  const isDealerFlow = vars.role === 'DEALER' || vars.dealer_invite_id || vars.ref_request_id;
  const saveSession = async () => persistSession(vars, history);

  // Manager Actions
  if (inputRaw.startsWith('REQ:')) {
    await handleManagerRequestAction(inputRaw, userId);
    return true;
  }

  // setup flow delegated to actions layer
  const handledSetup = await handleSetupCommandsAction({
    bot,
    input,
    chatId,
    vars,
    update,
    saveSession
  });
  if (handledSetup) return true;

  const scenarios = await loadPublishedScenarios(bot);
  const menuConfig = getMenuConfig(bot);
  const hasMenuButtons = Array.isArray(menuConfig.buttons) && menuConfig.buttons.length > 0;
  const allowKeywordTriggers = bot?.config?.allowKeywordTriggers === true;
  const emitScenarioEvent = async (eventType: string, payload: Record<string, any>) => {
    await emitPlatformEvent({
      companyId: bot.companyId || null,
      botId: bot.id,
      eventType,
      userId: userId || chatId,
      chatId,
      payload
    });
  };
  const buildStatusHistory = (variant: any, nextStatus: string) => {
    const nextHistory = Array.isArray(variant?.statusHistory) ? [...variant.statusHistory] : [];
    nextHistory.push({ status: nextStatus, at: new Date().toISOString(), by: userId || chatId });
    return nextHistory;
  };

  const sendMainMenu = async (textOverride?: string) => {
    const buttons = buildMainMenuButtons(bot, lang);
    const message = buildWelcomeMessage(bot, lang, textOverride);
    await sendReplyKeyboard(bot, chatId, message, buttons);
  };

  const resetFlow = () => {
    if (vars.__activeScenarioId) {
      emitScenarioEvent('scenario.completed', { scenarioId: vars.__activeScenarioId }).catch(() => null);
    }
    clearActiveScenario(vars, history);
    delete vars.__tempResults;
  };

  const startScenario = async (scenarioId: string) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) {
      await sendMessage(bot, chatId, '⚠️ Scenario not found.');
      resetFlow();
      await saveSession();
      await sendMainMenu();
      return;
    }
    vars.__activeScenarioId = scenario.id;
    vars.__currentNodeId = null;
    vars.__tempResults = [];
    history.length = 0;
    await emitScenarioEvent('scenario.started', { scenarioId: scenario.id });
    const entryId = scenario.entryNodeId || (Array.isArray(scenario.nodes) ? (scenario.nodes.find((n: any) => n.type === 'START')?.id || scenario.nodes[0]?.id) : undefined);
    if (entryId) {
      await executeNode(vars, history, scenario, entryId, false, 0);
    }
    await saveSession();
  };

  const startScenarioByCommand = async (rawCommand: string) => {
    const normalized = normalizeTextCommand(rawCommand);
    const command = normalized.startsWith('/') ? normalized.slice(1) : normalized;
    if (!command) return false;
    const triggered = scenarios.find(s => s.triggerCommand === command);
    if (triggered) {
      await startScenario(triggered.id);
      return true;
    }
    return false;
  };

  const checkKeywords = async () => {
    if (!allowKeywordTriggers) return false;
    const triggered = scenarios.find(s =>
      s.isActive && Array.isArray(s.keywords) && s.keywords.some((k: any) => input.includes(String(k).toLowerCase()))
    );
    if (triggered) {
      await startScenario(triggered.id);
      return true;
    }
    return false;
  };

  // WEB APP DATA
  const handledWebAppData = await handleWebAppDataAction({
    bot,
    update,
    vars,
    chatId,
    userId,
    lang,
    startScenario: (scenarioId: string) => startScenario(scenarioId),
    resetFlow,
    saveSession,
    sendMainMenu: () => sendMainMenu()
  });
  if (handledWebAppData) return true;

  if (!scenarios.length && !hasMenuButtons && !isDealerFlow && !hasStartPayload) {
    return false;
  }

  const handleDealerFlow = async () => {
    return handleDealerFlowAction({
      bot,
      chatId,
      vars,
      update,
      messageTextRaw,
      userId,
      saveSession
    });
  };

  // Dealer flow handling
  if (isDealerFlow) {
    const handledDealer = await handleDealerFlow();
    if (handledDealer) return true;
  }

  // CALLBACK QUERIES
  if (update.callback_query) {
    const handledCallback = await handleCallbackQueryAction({
      bot,
      session,
      update,
      chatId,
      userId,
      lang,
      vars,
      history,
      saveSession,
      buildStatusHistory,
      handleInput: (choiceVal: string, isCallback: boolean) => handleInput(vars, history, choiceVal, isCallback),
      goBack: () => goBack(vars, history),
      handleCarSelection: (carId: string) => handleCarSelection(vars, carId, userId),
      handleAddToRequest: (carId: string) => handleAddToRequest(vars, carId),
      handleAddToCatalog: (carId: string) => handleAddToCatalog(vars, carId),
      resetFlow,
      sendMainMenu: () => sendMainMenu()
    });
    if (handledCallback) return true;
  }

  // /start handling
  const handledStart = await handleStartCommandAction({
    bot,
    input,
    inputRaw,
    messageTextRaw,
    vars,
    lang,
    saveSession,
    sendMainMenu,
    startScenarioByCommand,
    handleDealerFlow,
    resetFlow,
    session
  });
  if (handledStart) return true;

  if (['/menu', 'menu', 'меню', 'в меню', '🏠 menu', 'cmd:menu', 'main menu'].includes(input)) {
    resetFlow();
    await saveSession();
    await sendMainMenu();
    return true;
  }

  if (['/back', 'back', 'назад', '⬅️ back', 'cmd:back'].includes(input)) {
    await goBack(vars, history);
    await saveSession();
    return true;
  }

  if (input.startsWith('/') && input !== '/start') {
    const handledCommand = await startScenarioByCommand(input);
    if (handledCommand) return true;
  }

  // Menu button match
  const menuBtn = (menuConfig.buttons || []).find((btn: any) => {
    const normInput = input;
    const labelDefault = normalizeTextCommand(btn.label);
    const labelUk = btn.label_uk ? normalizeTextCommand(btn.label_uk) : null;
    const labelRu = btn.label_ru ? normalizeTextCommand(btn.label_ru) : null;
    return normInput === labelDefault || (labelUk && normInput === labelUk) || (labelRu && normInput === labelRu);
  });

  if (menuBtn && !update.callback_query) {
    resetFlow();
    await saveSession();
    if (menuBtn.type === 'SCENARIO') {
      await startScenario(menuBtn.value);
    } else if (menuBtn.type === 'COMMAND') {
      const handled = await startScenarioByCommand(menuBtn.value || '');
      if (!handled && menuBtn.value) {
        await sendMessage(bot, chatId, menuBtn.value);
      }
    } else if (menuBtn.type === 'TEXT') {
      const menuValue = String(menuBtn.value || '').trim();
      if (menuValue === '/menu' || menuValue.toLowerCase() === 'menu') {
        await sendMainMenu();
        return true;
      }
      if (menuValue.startsWith('/')) {
        const handled = await startScenarioByCommand(menuValue);
        if (!handled) {
          await sendMessage(bot, chatId, '⚠️ Команда недоступна для цього бота.');
        }
      } else {
        await sendMessage(bot, chatId, menuValue || 'Інформація');
      }
    } else if (menuBtn.type === 'LINK') {
      const linkValue = resolveMenuLink(bot, menuBtn.value);
      await sendMessage(bot, chatId, `🔗 ${linkValue || menuBtn.value}`);
    } else if (menuBtn.type === 'WEB_APP') {
      const linkValue = resolveMenuLink(bot, menuBtn.value);
      await sendMessage(bot, chatId, `🔗 ${linkValue || menuBtn.value}`);
    }
    return true;
  }

  const activeScenario = vars.__activeScenarioId
    ? scenarios.find(s => s.id === vars.__activeScenarioId)
    : null;
  const activeNodes = Array.isArray(activeScenario?.nodes) ? activeScenario?.nodes : [];
  const activeNode = activeNodes.find((n: any) => n.id === vars.__currentNodeId);

  const bypassPhotoNodeInput = ['/back', 'back', 'назад', '⬅️ back', 'cmd:back', '/menu', 'menu', 'меню', 'в меню', '🏠 menu', 'main menu'].includes(input);
  if (activeNode?.type === 'QUESTION_PHOTO' && !bypassPhotoNodeInput) {
    const variableName = String(activeNode.content?.variableName || 'photos');
    const doneValues = ['done', 'готово', '/done', 'skip', 'пропустити', 'пропустить'];
    const done = doneValues.includes(input);
    const allowEmpty = activeNode.content?.allowEmpty === true;
    const allowMultiple = activeNode.content?.allowMultiple !== false;
    const maxCountRaw = Number(activeNode.content?.maxCount);
    const maxCount = Number.isFinite(maxCountRaw) && maxCountRaw > 0 ? Math.min(maxCountRaw, 10) : 8;
    const currentPhotos = Array.isArray(vars[variableName]) ? [...vars[variableName]] : [];
    const incomingPhoto = update.message?.photo?.[update.message.photo.length - 1]?.file_id;

    if (incomingPhoto) {
      if (!currentPhotos.includes(incomingPhoto)) currentPhotos.push(incomingPhoto);
      vars[variableName] = currentPhotos.slice(0, maxCount);
      await saveSession();

      if (!allowMultiple || currentPhotos.length >= maxCount) {
        if (activeNode.nextNodeId) {
          await executeNode(vars, history, activeScenario as any, activeNode.nextNodeId, false, 0);
          await saveSession();
          return true;
        }
      }

      await sendMessage(
        bot,
        chatId,
        `📸 Фото збережено (${currentPhotos.length}/${maxCount}). Надішліть ще фото або напишіть "готово".`
      );
      return true;
    }

    if (done) {
      if (!allowEmpty && currentPhotos.length === 0) {
        await sendMessage(bot, chatId, 'Спочатку надішліть хоча б одне фото.');
        return true;
      }
      if (activeNode.nextNodeId) {
        await executeNode(vars, history, activeScenario as any, activeNode.nextNodeId, false, 0);
        await saveSession();
        return true;
      }
    }

    await sendMessage(bot, chatId, 'Надішліть фото авто. Коли завершите — напишіть "готово".');
    return true;
  }

  // Contact sharing
  if (update.message?.contact) {
    vars.phone = update.message.contact.phone_number;
    const handled = await handleInput(vars, history, '[CONTACT]', false);
    await saveSession();
    if (!handled) {
      await sendMainMenu('Дякуємо! Контакт збережено.');
    }
    return true;
  }

  // Language enforcement
  const hasSetLanguage = !!vars.language || !!vars.lang;
  if (!hasSetLanguage && input !== '/start') {
    const langScn = scenarios.find(s => s.triggerCommand === 'lang');
    if (langScn) {
      await startScenario(langScn.id);
      return true;
    }
  }

  // Active scenario input
  if (inputRaw) {
    const handled = await handleInput(vars, history, inputRaw, false);
    await saveSession();
    if (handled) return true;
    if (vars.__activeScenarioId) {
      const scenario = scenarios.find(s => s.id === vars.__activeScenarioId);
      const nodes = Array.isArray(scenario?.nodes) ? scenario?.nodes : [];
      const node = nodes.find((n: any) => n.id === vars.__currentNodeId);
      if (node?.type === 'QUESTION_CHOICE') {
        const errMsg = lang === 'UK' ? 'Будь ласка, оберіть опцію з меню.' :
          lang === 'RU' ? 'Пожалуйста, выберите опцию.' : 'Please use the buttons provided.';
        await sendMessage(bot, chatId, errMsg);
        await executeNode(vars, history, scenario as any, node.id, true, 0);
        await saveSession();
        return true;
      }
      const keywordHandled = await checkKeywords();
      if (keywordHandled) return true;
    } else {
      const keywordHandled = await checkKeywords();
      if (keywordHandled) return true;
    }
  }

  // processing should fall back to next handler if no scenario matched
  return false;
};
