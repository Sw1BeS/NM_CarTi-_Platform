import { sendChoices, sendContactRequest, sendMessage, sendReplyKeyboard } from '../adapters/telegram.adapter.js';
import type { BotRuntime, ScenarioNode } from '../types.js';
import { FORM_SKIP_TEXT } from './form.actions.js';

interface NodeInteractionContext {
  bot: BotRuntime;
  session: any;
  vars: Record<string, any>;
  history: string[];
  node: ScenarioNode;
  text: string;
  lang: string;
  persistSession: () => Promise<void>;
}

export const executeQuestionTextNode = async ({
  bot,
  session,
  node,
  text,
  persistSession
}: Omit<NodeInteractionContext, 'vars' | 'history' | 'lang'>) => {
  const isOptional = node.content?.optional === true;
  if (isOptional) {
    await sendReplyKeyboard(bot, session.chatId, text, [[FORM_SKIP_TEXT]]);
  } else {
    await sendMessage(bot, session.chatId, text);
  }
  await persistSession();
};

export const executeQuestionChoiceNode = async ({
  bot,
  session,
  vars,
  history,
  node,
  text,
  lang,
  persistSession
}: NodeInteractionContext) => {
  await sendChoices(bot, session.chatId, text, node.content?.choices || [], lang, history.length > 0);
  await persistSession();
};

export const executeMenuReplyNode = async ({
  bot,
  session,
  node,
  text,
  lang,
  persistSession
}: Omit<NodeInteractionContext, 'vars' | 'history'>) => {
  const choices = node.content?.choices || [];
  const buttons: string[][] = [];

  for (let i = 0; i < choices.length; i += 2) {
    const left = (lang === 'UK' && choices[i].label_uk)
      ? choices[i].label_uk
      : (lang === 'RU' && choices[i].label_ru)
        ? choices[i].label_ru
        : choices[i].label;
    const row = [left || ''];

    if (i + 1 < choices.length) {
      const right = (lang === 'UK' && choices[i + 1].label_uk)
        ? choices[i + 1].label_uk
        : (lang === 'RU' && choices[i + 1].label_ru)
          ? choices[i + 1].label_ru
          : choices[i + 1].label;
      row.push(right || '');
    }

    buttons.push(row);
  }

  const backTxt = '⬅️ Назад';
  const menuTxt = '🏠 Меню';
  buttons.push([backTxt, menuTxt]);

  await sendReplyKeyboard(bot, session.chatId, text, buttons);
  await persistSession();
};

export const executeRequestContactNode = async ({
  bot,
  session,
  text,
  persistSession
}: Omit<NodeInteractionContext, 'vars' | 'history' | 'node' | 'lang'>) => {
  await sendContactRequest(bot, session.chatId, text);
  await persistSession();
};

export const executeQuestionPhotoNode = async ({
  bot,
  session,
  text,
  persistSession
}: Omit<NodeInteractionContext, 'vars' | 'history' | 'node' | 'lang'>) => {
  await sendMessage(bot, session.chatId, text || 'Надішліть фото авто. Коли завершите — напишіть "готово".');
  await persistSession();
};

export const resolveConditionNextNodeId = (node: ScenarioNode, vars: Record<string, any>) => {
  const val = vars[node.content?.conditionVariable || ''] || (vars.__tempResults || []).length || 0;
  const target = node.content?.conditionValue;
  let result = false;

  if (node.content?.conditionOperator === 'GT') result = Number(val) > Number(target);
  else if (node.content?.conditionOperator === 'LT') result = Number(val) < Number(target);
  else if (node.content?.conditionOperator === 'CONTAINS') result = String(val || '').includes(String(target || ''));
  else if (node.content?.conditionOperator === 'HAS_VALUE') result = !!val && val !== 0 && val !== '';
  else result = String(val) === String(target);

  return result ? node.content?.trueNodeId : node.content?.falseNodeId;
};
