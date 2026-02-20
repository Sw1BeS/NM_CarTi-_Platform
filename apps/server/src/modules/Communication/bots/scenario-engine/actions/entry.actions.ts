import { prisma } from '../../../../../services/prisma.js';
import { parseStartPayload } from '../../../../../utils/deeplink.utils.js';
import { logger } from '../../../../../utils/logger.js';
// @ts-ignore
import { createOrMergeLead } from '../../../telegram/core/leadService.js';
import { emitPlatformEvent } from '../../../telegram/core/events/eventEmitter.js';
import { notifyRequestAdmin } from './b2b.actions.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import type { BotRuntime } from '../types.js';

interface WebAppDataContext {
  bot: BotRuntime;
  update: any;
  vars: Record<string, any>;
  chatId: string;
  userId?: string;
  lang: string;
  startScenario: (scenarioId: string) => Promise<void>;
  resetFlow: () => void;
  saveSession: () => Promise<void>;
  sendMainMenu: () => Promise<void>;
}

interface StartCommandContext {
  bot: BotRuntime;
  input: string;
  inputRaw: string;
  messageTextRaw: string;
  vars: Record<string, any>;
  lang: string;
  saveSession: () => Promise<void>;
  sendMainMenu: (textOverride?: string) => Promise<void>;
  startScenarioByCommand: (rawCommand: string) => Promise<boolean>;
  handleDealerFlow: () => Promise<boolean>;
  legacyB2BFallbackEnabled: boolean;
  resetFlow: () => void;
  session: any;
}

export const handleWebAppData = async ({
  bot,
  update,
  vars,
  chatId,
  userId,
  lang,
  startScenario,
  resetFlow,
  saveSession,
  sendMainMenu
}: WebAppDataContext): Promise<boolean> => {
  if (!update.message?.web_app_data?.data) return false;

  try {
    const webData = JSON.parse(update.message.web_app_data.data);
    const type = String(webData.type || '').toUpperCase();
    if (type === 'RUN_SCENARIO' && webData.scenarioId) {
      await startScenario(webData.scenarioId);
      return true;
    }

    if (type === 'LEAD') {
      if (webData.name) vars.name = webData.name;
      if (webData.phone) vars.phone = webData.phone;
      if (webData.lang) vars.language = webData.lang;

      const preset = webData.requestPreset || webData.request || {};
      let requestTitle = '';
      if (preset.brand) requestTitle = `${preset.brand} ${preset.model || ''}`.trim();

      if (!requestTitle && webData.carId) {
        const car = await prisma.carListing.findUnique({ where: { id: webData.carId } });
        if (car) requestTitle = car.title;
      }

      const leadResult = await createOrMergeLead({
        botId: bot.id,
        companyId: bot.companyId || null,
        chatId,
        userId,
        name: webData.name || vars.name || 'Client',
        phone: webData.phone || vars.phone,
        request: requestTitle || undefined,
        source: 'TELEGRAM',
        payload: { goal: webData.carId ? `MiniApp: ${webData.carId}` : undefined },
        leadType: 'BUY',
        createRequest: !!requestTitle,
        requestData: {
          title: requestTitle || undefined,
          yearMin: preset.year || undefined,
          budgetMax: preset.budget || undefined,
          description: `Via MiniApp. Lead: ${webData.name || 'Client'}`,
          language: vars.language
        }
      }, bot.config);

      if (leadResult.request) {
        vars.requestId = leadResult.request.publicId;
        vars.requestPublicId = leadResult.request.publicId;
        await notifyRequestAdmin(bot, leadResult.request);
      }

      const notifyHeader = leadResult.isDuplicate ? '♻️ Duplicate lead merged' : '📥 <b>MiniApp Lead</b>';
      const notifyText = [
        notifyHeader,
        webData.name ? `👤 ${webData.name}` : undefined,
        preset.brand || preset.model ? `🚗 ${requestTitle}` : undefined,
        preset.budget ? `💰 Budget: ${preset.budget}` : undefined,
        preset.year ? `🗓 Year: ${preset.year}+` : undefined,
        webData.carId ? `🔎 Car ID: ${webData.carId}` : undefined
      ].filter(Boolean).join('\n');

      if (bot.adminChatId) {
        await sendMessage(bot, bot.adminChatId, notifyText);
      }

      const confirmMsg = lang === 'UK'
        ? '✅ Ваша заявка прийнята!'
        : lang === 'RU'
          ? '✅ Ваша заявка принята!'
          : '✅ Request received!';
      await sendMessage(bot, chatId, confirmMsg);
      await emitPlatformEvent({
        companyId: bot.companyId || null,
        botId: bot.id,
        eventType: 'miniapp.submitted',
        userId: userId || chatId,
        chatId,
        payload: { legacy: true, type: 'LEAD', duplicate: leadResult.isDuplicate }
      });

      resetFlow();
      await saveSession();
      await sendMainMenu();
      return true;
    }
  } catch (e) {
    logger.error('[ScenarioEngine] web_app_data parse error', e);
  }

  return false;
};

export const handleStartCommand = async ({
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
  legacyB2BFallbackEnabled,
  resetFlow,
  session
}: StartCommandContext): Promise<boolean> => {
  if (!(input === '/start' || input.startsWith('/start '))) return false;

  resetFlow();
  const payloadText = messageTextRaw.startsWith('/start')
    ? messageTextRaw.split(' ')[1]
    : inputRaw.split(' ')[1];
  let deepLinkMsg = '';

  if (payloadText) {
    const payload = parseStartPayload(payloadText);
    if (payload) {
      vars.start_payload = payloadText;
      if (payload.type === 'dealer_invite') {
        let requestOk = true;
        if (payload.metadata?.requestId) {
          const request = await prisma.b2bRequest.findFirst({
            where: { OR: [{ id: payload.metadata.requestId }, { publicId: payload.metadata.requestId }] }
          });
          requestOk = !!request;
          if (requestOk) vars.requestId = request?.publicId || request?.id;
        }

        if (!requestOk) {
          deepLinkMsg = lang === 'UK'
            ? '⚠️ Запит не знайдено або посилання застаріло.'
            : lang === 'RU'
              ? '⚠️ Запрос не найден или ссылка устарела.'
              : '⚠️ Запит не знайдено або посилання застаріло.';
        } else {
          vars.role = 'DEALER';
          vars.dealerId = payload.id;
          vars.dealer_invite_id = payload.id;
          vars.dealer_state = 'INIT';
          deepLinkMsg = lang === 'UK'
            ? '👋 Вітаємо! Ви запрошені як партнер. Поділіться контактом і надішліть варіант.'
            : lang === 'RU'
              ? '👋 Добро пожаловать! Вы приглашены как партнер. Поделитесь контактом и отправьте вариант.'
              : '👋 Вітаємо! Ви запрошені як партнер. Поділіться контактом і надішліть варіант.';
        }
      } else if (payload.type === 'request') {
        const req = await prisma.b2bRequest.findFirst({
          where: { OR: [{ id: payload.id }, { publicId: payload.id }] }
        });
        if (!req) {
          deepLinkMsg = lang === 'UK'
            ? '⚠️ Запит не знайдено.'
            : lang === 'RU'
              ? '⚠️ Запрос не найден.'
              : '⚠️ Запит не знайдено.';
        } else {
          vars.role = 'DEALER';
          vars.requestId = req.publicId || req.id;
          vars.requestPublicId = req.publicId || req.id;
          vars.ref_request_id = req.publicId || req.id;
          vars.dealer_state = 'INIT';
          deepLinkMsg = lang === 'UK'
            ? `📄 Запит #${req.publicId || req.id}. Надішли варіант.`
            : lang === 'RU'
              ? `📄 Запрос #${req.publicId || req.id}. Отправьте вариант.`
              : `📄 Запит #${req.publicId || req.id}. Надішліть варіант.`;
        }
      } else if (payload.type === 'offer') {
        vars.role = 'DEALER';
        vars.requestId = payload.id;
        if (payload.metadata?.offerId) vars.offerId = payload.metadata.offerId;
        vars.ref_offer_id = payload.id;
        deepLinkMsg = lang === 'UK'
          ? `💰 Перегляд пропозиції #${payload.id}`
          : lang === 'RU'
            ? `💰 Просмотр предложения #${payload.id}`
            : `💰 Перегляд пропозиції #${payload.id}`;
      }
    }
  }

  await saveSession();
  session.variables = vars;

  const parsedPayload = payloadText ? parseStartPayload(payloadText) : null;
  const requestPayload = parsedPayload && (parsedPayload.type === 'request' || parsedPayload.type === 'offer');
  if (requestPayload) {
    if (legacyB2BFallbackEnabled && vars.dealer_state === 'INIT') {
      await handleDealerFlow();
      return true;
    }
    const startedOfferFlow = await startScenarioByCommand('/offer');
    if (startedOfferFlow) return true;
    if (!deepLinkMsg) {
      deepLinkMsg = lang === 'UK'
        ? '⚠️ Сценарій подачі варіанту недоступний. Зверніться до адміністратора.'
        : lang === 'RU'
          ? '⚠️ Сценарий подачи варианта недоступен. Обратитесь к администратору.'
          : '⚠️ Offer flow is not available. Contact administrator.';
    }
  }

  await sendMainMenu(deepLinkMsg);
  return true;
};
