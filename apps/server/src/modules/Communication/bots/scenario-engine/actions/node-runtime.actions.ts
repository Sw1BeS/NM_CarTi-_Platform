import { prisma } from '../../../../../services/prisma.js';
import { sendChatAction, sendMessage, sendPhoto } from '../adapters/telegram.adapter.js';
import { renderCarCardForBot } from '../../../../../services/carCardRenderer.v2.js';
import { createCarCardKeyboard } from './b2b.actions.js';
import type { BotRuntime, ScenarioNode } from '../types.js';

type DelayResult = 'scheduled' | 'continue';

interface DelayNodeContext {
  bot: BotRuntime;
  session: any;
  node: ScenarioNode;
  scenarioId: string;
  persistSession: () => Promise<void>;
}

interface GalleryNodeContext {
  bot: BotRuntime;
  session: any;
  vars: Record<string, any>;
  text: string;
  lang: string;
}

export const executeDelayNode = async ({
  bot,
  session,
  node,
  scenarioId,
  persistSession
}: DelayNodeContext): Promise<DelayResult> => {
  const ms = parseInt(String(node.content?.conditionValue || '1000'), 10);

  // Long delays (> 10 sec) are handled by Scheduler
  if (ms > 10000) {
    await persistSession();
    await prisma.scheduledJob.create({
      data: {
        type: 'SCENARIO_RESUME',
        runAt: new Date(Date.now() + ms),
        status: 'PENDING',
        payload: {
          botId: bot.id,
          chatId: session.chatId,
          scenarioId,
          nodeId: node.nextNodeId
        }
      }
    });
    return 'scheduled';
  }

  await sendChatAction(bot, session.chatId, 'typing');
  await new Promise(r => setTimeout(r, ms));
  return 'continue';
};

export const executeGalleryNode = async ({
  bot,
  session,
  vars,
  text,
  lang
}: GalleryNodeContext) => {
  await sendMessage(bot, session.chatId, text);
  const temp = Array.isArray(vars.__tempResults) ? vars.__tempResults : [];

  for (const car of temp.slice(0, 5)) {
    const caption = await renderCarCardForBot({
      car,
      lang,
      companyId: bot.companyId || null,
      botId: bot.id
    });
    const keyboard = createCarCardKeyboard(car, lang);
    if (car.thumbnail) {
      await sendPhoto(bot, session.chatId, car.thumbnail, caption, keyboard);
    } else {
      await sendMessage(bot, session.chatId, caption, keyboard);
    }
    await new Promise(r => setTimeout(r, 600));
  }
};
