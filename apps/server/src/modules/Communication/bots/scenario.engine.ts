import { prisma } from '../../../services/prisma.js';
import { RequestStatus, LeadStatus } from '@prisma/client';
import { telegramOutbox } from '../telegram/messaging/outbox/telegramOutbox.js';
import { emitPlatformEvent } from '../telegram/core/events/eventEmitter.js';
// @ts-ignore
import { createOrMergeLead } from '../telegram/core/leadService.js';
import {
  renderCarListingCard,
  renderRequestCard,
  renderLeadCard,
  renderVariantCard,
  managerActionsKeyboard
} from '../../../services/cardRenderer.js';
import {
  parseStartPayload,
  generateRequestLink,
  generateOfferLink,
  createDeepLinkKeyboard
} from '../../../utils/deeplink.utils.js';
// @ts-ignore
import { searchAutoRia } from '../../Integrations/autoria.service.js';
import { ulid } from 'ulid';

// Types & Interfaces
export interface BotRuntime {
  id: string;
  token: string;
  companyId?: string | null;
  config?: any;
  channelId?: string | null;
  adminChatId?: string | null;
}

export interface ScenarioRecord {
  id: string;
  triggerCommand: string | null;
  isActive?: boolean;
  keywords?: string[];
  nodes: any;
  flow?: any;
  entryNodeId?: string | null;
}

export interface ScenarioNode {
  id: string;
  type: string;
  text?: string;
  content?: any;
  nextNodeId?: string;
  buttons?: any[];
  next?: string | Record<string, string>;
}

// Helpers
const normalizeTextCommand = (cmd: string) => cmd?.trim().toLowerCase() || '';
const generatePublicId = () => ulid();
const formatCarCaption = (car: any, lang: string) => renderCarListingCard(car, lang);

const mapRequestInput = (vars: any) => ({
  title: vars.title || 'Car Request',
  budgetMin: Number(vars.budgetMin) || 0,
  budgetMax: Number(vars.budgetMax || vars.budget) || 0,
  yearMin: Number(vars.yearMin || vars.year) || 0,
  yearMax: Number(vars.yearMax) || 0,
  city: vars.city
});

const mapVariantInput = (vars: any) => ({
  price: Number(vars.price) || 0,
  currency: vars.currency || 'USD',
  year: Number(vars.year) || 0,
  mileage: Number(vars.mileage) || 0,
  description: vars.description,
  title: vars.title || 'Offer'
});

const mapRequestOutput = (req: any) => ({
  ...req,
  budget: req.budgetMax, // simplified view
  year: req.yearMin
}); const hasContactInfo = (text: string) => {
  if (!text) return false;
  const phoneRe = /(\+?\d[\d\-\s]{6,}\d)/g;
  const linkRe = /(https?:\/\/|t\.me|wa\.me|@[\w_]+)/i;
  return phoneRe.test(text) || linkRe.test(text);
};



const parseDealerDetails = (text: string) => {
  const priceMatch = text.match(/(\d[\d\s]{2,})\s*(usd|\$|eur|uah)?/i);
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const vinMatch = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);
  return {
    price: priceMatch ? parseInt(priceMatch[1].replace(/\s/g, ''), 10) : undefined,
    currency: priceMatch?.[2]?.toUpperCase()?.includes('EUR') ? 'EUR' : (priceMatch?.[2]?.includes('$') || priceMatch?.[2]?.includes('USD')) ? 'USD' : undefined,
    year: yearMatch ? parseInt(yearMatch[0], 10) : undefined,
    vin: vinMatch ? vinMatch[0].toUpperCase() : undefined
  };
};

const getLanguage = (vars: Record<string, any>) => {
  const raw = vars.language || vars.lang || 'EN';
  const up = String(raw).toUpperCase();
  if (up.startsWith('UK') || up.startsWith('UA')) return 'UK';
  if (up.startsWith('RU')) return 'RU';
  return 'EN';
};

const normalizeMenuConfig = (menuConfig: any) => {
  const buttonsRaw = Array.isArray(menuConfig?.buttons) ? menuConfig.buttons : [];
  const buttons = buttonsRaw
    .filter((btn: any) => btn && typeof btn === 'object')
    .map((btn: any, idx: number) => {
      const label = typeof btn.label === 'string' ? btn.label.trim() : '';
      const labelUk = typeof btn.label_uk === 'string' ? btn.label_uk.trim() : '';
      const labelRu = typeof btn.label_ru === 'string' ? btn.label_ru.trim() : '';
      return {
        ...btn,
        id: btn.id || `btn_${idx}`,
        label,
        label_uk: labelUk || undefined,
        label_ru: labelRu || undefined,
        row: Number.isFinite(Number(btn.row)) ? Number(btn.row) : 0,
        col: Number.isFinite(Number(btn.col)) ? Number(btn.col) : idx
      };
    })
    .filter((btn: any) => btn.label || btn.label_uk || btn.label_ru);

  return {
    welcomeMessage: menuConfig?.welcomeMessage || 'Menu:',
    buttons
  };
};

const getMenuConfig = (bot: BotRuntime) => normalizeMenuConfig(bot.config?.menuConfig);

const buildMainMenuButtons = (bot: BotRuntime, lang: string) => {
  const config = getMenuConfig(bot);
  const buttons: string[][] = [];
  const sorted = [...config.buttons].sort((a, b) => (a.row - b.row) || (a.col - b.col));
  const rows: Record<number, string[]> = {};

  sorted.forEach((btn: any) => {
    if (!rows[btn.row]) rows[btn.row] = [];
    const fallbackLabel = btn.label || btn.label_uk || btn.label_ru || '';
    const label = (lang === 'UK' && btn.label_uk) ? btn.label_uk :
      (lang === 'RU' && btn.label_ru) ? btn.label_ru : fallbackLabel;
    if (label) rows[btn.row].push(label);
  });

  Object.keys(rows)
    .map(key => Number(key))
    .filter(key => Number.isFinite(key))
    .sort((a, b) => a - b)
    .forEach(key => buttons.push(rows[key]));
  return buttons;
};

const buildWelcomeMessage = (bot: BotRuntime, lang: string, textOverride?: string) => {
  const config = getMenuConfig(bot);
  const text = textOverride || config.welcomeMessage || 'Main Menu:';
  if (text === '👋 Welcome to CarTié! Choose an option below:') {
    if (lang === 'UK') return '👋 Вітаємо в CarTié! Оберіть опцію нижче:';
    if (lang === 'RU') return '👋 Добро пожаловать в CarTié! Выберите опцию ниже:';
  }
  return text;
};

const sendMessage = async (bot: BotRuntime, chatId: string, text: string, replyMarkup?: any) => {
  return telegramOutbox.sendMessage({
    botId: bot.id,
    token: bot.token,
    chatId,
    text,
    replyMarkup,
    companyId: bot.companyId || null
  });
};

const sendPhoto = async (bot: BotRuntime, chatId: string, photo: string, caption: string, replyMarkup?: any) => {
  return telegramOutbox.sendPhoto({
    botId: bot.id,
    token: bot.token,
    chatId,
    photo,
    caption,
    replyMarkup,
    companyId: bot.companyId || null
  });
};

const answerCallback = async (bot: BotRuntime, callbackId: string, text?: string) => {
  await telegramOutbox.answerCallback({ token: bot.token, callbackId, text });
};

const sendChatAction = async (bot: BotRuntime, chatId: string, action = 'typing') => {
  await telegramOutbox.sendChatAction({
    botId: bot.id,
    token: bot.token,
    chatId,
    action,
    companyId: bot.companyId || null
  });
};

const sendReplyKeyboard = async (bot: BotRuntime, chatId: string, text: string, keyboard: string[][]) => {
  if (!keyboard.length) {
    return sendMessage(bot, chatId, text);
  }
  return sendMessage(bot, chatId, text, { keyboard, resize_keyboard: true, one_time_keyboard: false });
};

const sendContactRequest = async (bot: BotRuntime, chatId: string, text: string) => {
  return sendMessage(bot, chatId, text, {
    keyboard: [[{ text: '📱 Share Contact', request_contact: true }]],
    resize_keyboard: true
  });
};

const notifyRequestAdmin = async (bot: BotRuntime, request: any) => {
  if (!bot.adminChatId) return;
  const text = `📄 Новий запит\n${renderRequestCard(request)}`;
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔍 Znayty Variant', callback_data: `REQ:${request.id}:FIND` }],
      [{ text: '📢 Post to Channel', callback_data: `REQ:${request.id}:POST` }],
      [{ text: '❌ Close', callback_data: `REQ:${request.id}:CLOSE` }]
    ]
  };
  await sendMessage(bot, bot.adminChatId, text, keyboard);
};

const sendChoices = async (bot: BotRuntime, chatId: string, text: string, choices: any[], lang: string) => {
  const inline_keyboard = (choices || []).map(choice => {
    const label = (lang === 'UK' && choice.label_uk) ? choice.label_uk :
      (lang === 'RU' && choice.label_ru) ? choice.label_ru : choice.label;
    return [{ text: label || choice.label, callback_data: `SCN:CHOICE:${choice.value}` }];
  });
  return sendMessage(bot, chatId, text, { inline_keyboard });
};

const emitScenarioCompleted = async (
  bot: BotRuntime,
  chatId: string,
  scenarioId?: string,
  payload?: Record<string, any>,
  userId?: string
) => {
  if (!scenarioId) return;
  await emitPlatformEvent({
    companyId: bot.companyId || null,
    botId: bot.id,
    eventType: 'scenario.completed',
    userId: userId || chatId,
    chatId,
    payload: { scenarioId, ...(payload || {}) }
  });
};

// formatCarCaption removed. Using renderCarListingCard from cardRenderer.ts

const createCarCardKeyboard = (car: any, lang: string) => {
  const t = {
    EN: { addToRequest: '➕ Add to Request', viewCatalog: '📋 To Catalog', openSource: '🔗 Open Source (URL)' },
    UK: { addToRequest: '➕ Додати в запит', viewCatalog: '📋 В каталог', openSource: '🔗 Відкрити джерело (URL)' },
    RU: { addToRequest: '➕ Добавить в запрос', viewCatalog: '📋 В каталог', openSource: '🔗 Открыть источник (URL)' }
  } as const;

  const loc = t[lang as keyof typeof t] || t.EN;
  return {
    inline_keyboard: [
      [{ text: loc.addToRequest, callback_data: `CAR:ADD_REQUEST:${car.canonicalId}` }],
      [
        { text: loc.viewCatalog, callback_data: `CAR:ADD_CATALOG:${car.canonicalId}` },
        { text: loc.openSource, url: car.sourceUrl }
      ]
    ]
  };
};

const mapDbCar = (car: any) => ({
  canonicalId: car.id,
  sourceId: car.sourceId || undefined,
  source: car.source || 'INTERNAL',
  sourceUrl: car.sourceUrl || '',
  title: car.title,
  price: { amount: car.price, currency: car.currency || 'USD' },
  year: car.year,
  mileage: car.mileage,
  location: car.location || '',
  thumbnail: car.thumbnail || '',
  mediaUrls: car.mediaUrls || [],
  specs: car.specs || {},
  status: car.status || 'AVAILABLE',
  postedAt: car.postedAt?.toISOString?.() || car.createdAt?.toISOString?.() || new Date().toISOString()
});

// AutoRia logic moved to urlParser.ts

const mapRequestForMessage = (req: any) => {
  const data = mapRequestOutput(req);
  const budgetMin = data.budgetMin > 0 ? data.budgetMin.toLocaleString() : 'Open';
  const budgetMax = data.budgetMax > 0 ? data.budgetMax.toLocaleString() : 'Open';
  return `🆘 <b>Looking for Car!</b>\n\n🚙 ${data.title}\n💰 Budget: ${budgetMin}-${budgetMax}\n📍 City: ${data.city || 'Ukraine'}\n📅 Year: ${data.yearMin || 'Any'}+\n\n📝 Reqs: ${data.description || 'No special requirements'}\n\nTap below if you have it! 👇`;
};

export class ScenarioEngine {
  static async handleUpdate(bot: BotRuntime, session: any, update: any): Promise<boolean> {
    const vars: Record<string, any> = (session.variables && typeof session.variables === 'object' && !Array.isArray(session.variables))
      ? { ...session.variables }
      : {};
    const history: string[] = Array.isArray(session.history) ? [...session.history] : [];

    const inputRaw = update.message?.text || update.callback_query?.data || '';
    const input = normalizeTextCommand(inputRaw);
    const messageTextRaw = update.message?.text || '';
    const chatId = String(update.message?.chat?.id || update.callback_query?.message?.chat?.id || session.chatId);
    const userIdRaw = update.message?.from?.id || update.callback_query?.from?.id || update.inline_query?.from?.id;
    const userId = userIdRaw ? String(userIdRaw) : undefined;
    if (userId) vars.__telegramUserId = userId;
    const lang = getLanguage(vars);
    const startPayloadRaw = messageTextRaw.startsWith('/start') ? messageTextRaw.split(' ')[1] : '';
    const hasStartPayload = !!(startPayloadRaw && parseStartPayload(startPayloadRaw));
    const isDealerFlow = vars.role === 'DEALER' || vars.dealer_invite_id || vars.ref_request_id;

    // Manager Actions
    if (inputRaw.startsWith('REQ:')) {
      await this.handleManagerRequestAction(bot, session, inputRaw, userId);
      return true;
    }

    const scenarios: ScenarioRecord[] = bot.companyId
      ? await prisma.scenario.findMany({
        where: { companyId: bot.companyId, status: 'PUBLISHED', isActive: true },
        orderBy: { createdAt: 'desc' }
      })
      : [];
    const menuConfig = getMenuConfig(bot);
    const hasMenuButtons = Array.isArray(menuConfig.buttons) && menuConfig.buttons.length > 0;
    const actionKeyboard = (variantId: string) => managerActionsKeyboard(variantId);
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

    const saveSession = async () => {
      await prisma.botSession.update({
        where: { id: session.id },
        data: {
          variables: vars,
          history,
          lastActive: new Date()
        }
      });
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
      delete vars.__activeScenarioId;
      delete vars.__currentNodeId;
      delete vars.__tempResults;
      history.length = 0;
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
      await saveSession();
      await emitScenarioEvent('scenario.started', { scenarioId: scenario.id });
      const entryId = scenario.entryNodeId || (Array.isArray(scenario.nodes) ? (scenario.nodes.find((n: any) => n.type === 'START')?.id || scenario.nodes[0]?.id) : undefined);
      if (entryId) {
        await this.executeNode(bot, session, vars, history, scenario, entryId);
      }
    };

    const checkKeywords = async () => {
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
    if (update.message?.web_app_data?.data) {
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
            userId: userId,
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

          const confirmMsg = lang === 'UK' ? '✅ Ваша заявка прийнята!' :
            lang === 'RU' ? '✅ Ваша заявка принята!' : '✅ Request received!';
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
        console.error('[ScenarioEngine] web_app_data parse error', e);
      }
    }

    if (!scenarios.length && !hasMenuButtons && !isDealerFlow && !hasStartPayload) {
      return false;
    }

    const handleDealerFlow = async () => {
      const dealerState = vars.dealer_state || 'INIT';
      const requestId = await ScenarioEngine.resolveRequestId(vars);
      const flow = vars.dealer_flow || {};

      const summaryCard = (override?: any) => {
        const variantData = {
          title: flow.title || flow.details || 'Пропозиція',
          price: flow.price,
          currency: flow.currency || 'USD',
          year: flow.year,
          specs: { vin: flow.vin, note: flow.details },
          location: flow.city,
          sourceUrl: flow.url,
          thumbnail: (vars.dealer_photos || [])[0],
          ...(override || {})
        };
        const photoCount = (vars.dealer_photos || []).length || 0;
        return `${renderVariantCard(variantData)}\n🖼 Фото: ${photoCount}`;
      };

      if (dealerState === 'INIT') {
        vars.dealer_flow = {};
        vars.dealer_state = 'AWAIT_CONTACT';
        await saveSession();
        await sendMessage(bot, chatId, '🤝 Вітаємо! Поділися контактом, щоб продовжити.', {
          keyboard: [[{ text: "📱 Поділитися контактом", request_contact: true }], [{ text: "❌ Скасувати" }]],
          resize_keyboard: true
        });
        return true;
      }

      if (!requestId) {
        await sendMessage(bot, chatId, 'Не знайшли запит. Перевір посилання або звернись до менеджера.');
        return true;
      }

      if (dealerState === 'AWAIT_CONTACT' && update.message?.contact) {
        flow.contact = update.message.contact.phone_number;
        vars.dealer_flow = flow;
        vars.dealer_state = 'AWAIT_PHOTOS';
        await saveSession();
        await sendMessage(bot, chatId, 'Дякую! Надішли фото авто (можна кілька). Після фото перейдемо до деталей.');
        return true;
      }
      if (dealerState === 'AWAIT_CONTACT' && messageTextRaw) {
        await sendMessage(bot, chatId, 'Надішли контакт кнопкою, щоб продовжити.');
        return true;
      }

      if (dealerState === 'AWAIT_PHOTOS') {
        if (update.message?.photo) {
          const photo = update.message.photo[update.message.photo.length - 1];
          const list = Array.isArray(vars.dealer_photos) ? vars.dealer_photos : [];
          list.push(photo.file_id);
          vars.dealer_photos = list.slice(0, 10);
          vars.dealer_state = 'AWAIT_PRICE';
          await saveSession();
          await sendMessage(bot, chatId, `Фото отримали (${list.length}). Вкажи ціну (USD):`);
          return true;
        }
        await sendMessage(bot, chatId, 'Спочатку надішли хоча б одне фото.');
        return true;
      }

      if (dealerState === 'AWAIT_PRICE' && messageTextRaw) {
        const num = parseInt(messageTextRaw.replace(/[^\d]/g, ''), 10) || 0;
        flow.price = num;
        flow.currency = messageTextRaw.toUpperCase().includes('EUR') ? 'EUR' : 'USD';
        vars.dealer_flow = flow;
        vars.dealer_state = 'AWAIT_YEAR';
        await saveSession();
        await sendMessage(bot, chatId, 'Рік випуску? (наприклад, 2018)');
        return true;
      }

      if (dealerState === 'AWAIT_YEAR' && messageTextRaw) {
        const yr = parseInt(messageTextRaw.replace(/[^\d]/g, ''), 10);
        if (yr && yr > 1900 && yr < 2050) flow.year = yr;
        vars.dealer_flow = flow;
        vars.dealer_state = 'AWAIT_VIN';
        await saveSession();
        await sendMessage(bot, chatId, 'VIN (або напиши "skip"):');
        return true;
      }

      if (dealerState === 'AWAIT_VIN' && messageTextRaw) {
        const vin = messageTextRaw.trim();
        if (vin.toLowerCase() !== 'skip') {
          if (vin.length >= 6) flow.vin = vin.toUpperCase();
        }
        vars.dealer_flow = flow;
        vars.dealer_state = 'AWAIT_URL';
        await saveSession();
        await sendMessage(bot, chatId, 'URL лістингу (або "skip"):');
        return true;
      }

      if (dealerState === 'AWAIT_URL' && messageTextRaw) {
        const urlMatch = messageTextRaw.match(/https?:\/\/\S+/);
        if (urlMatch) flow.url = urlMatch[0];
        vars.dealer_flow = flow;
        vars.dealer_state = 'AWAIT_DETAILS';
        await saveSession();
        await sendMessage(bot, chatId, 'Додай короткий опис (стан/комплектація). Без контактів.');
        return true;
      }

      if (dealerState === 'AWAIT_DETAILS' && messageTextRaw) {
        if (hasContactInfo(messageTextRaw)) {
          await sendMessage(bot, chatId, 'Будь ласка, без телефонів/посилань на контакт. Додай лише інформацію про авто.');
          return true;
        }
        flow.details = messageTextRaw;
        vars.dealer_flow = flow;
        vars.dealer_state = 'CONFIRM';
        await saveSession();
        await sendMessage(bot, chatId, summaryCard(), {
          inline_keyboard: [
            [{ text: '✅ Надіслати менеджеру', callback_data: 'DEALER_SEND' }],
            [{ text: '🔄 Змінити опис', callback_data: 'DEALER_EDIT' }]
          ]
        });
        return true;
      }

      if (dealerState === 'CONFIRM' && update.callback_query) {
        const data = update.callback_query.data;
        if (data === 'DEALER_EDIT') {
          vars.dealer_state = 'AWAIT_DETAILS';
          await saveSession();
          await sendMessage(bot, chatId, 'Ок, надішли новий опис без контактів.');
          return true;
        }
        if (data === 'DEALER_SEND') {
          if (flow.url) {
            const dupUrl = await prisma.requestVariant.findFirst({ where: { requestId, sourceUrl: flow.url } });
            if (dupUrl) {
              await sendMessage(bot, chatId, 'Таке посилання вже є у варіантах. Додай інший лот.');
              return true;
            }
          }
          if (flow.vin) {
            const dupVin = await prisma.requestVariant.findFirst({
              where: { requestId, specs: { path: ['vin'], equals: flow.vin } }
            }).catch(() => null);
            if (dupVin) {
              await sendMessage(bot, chatId, 'Цей VIN вже є у варіантах. Додай інший лот.');
              return true;
            }
          }

          const mapped = mapVariantInput({
            title: flow.details?.split('\n')[0]?.slice(0, 120) || 'Пропозиція',
            url: flow.url,
            sourceUrl: flow.url,
            source: 'DEALER',
            status: 'SUBMITTED',
            specs: { note: flow.details, vin: flow.vin },
            year: flow.year,
            price: flow.price ? { amount: flow.price, currency: flow.currency } : undefined,
            thumbnail: (vars.dealer_photos || [])[0]
          });

          const variant = await prisma.requestVariant.create({
            data: {
              ...mapped,
              requestId
            }
          });

          await prisma.messageLog.create({
            data: {
              requestId,
              variantId: variant.id,
              botId: bot.id,
              chatId,
              direction: 'INCOMING',
              text: flow.details || '',
              payload: {
                photos: vars.dealer_photos || [],
                price: flow.price,
                currency: flow.currency,
                year: flow.year,
                vin: flow.vin,
                url: flow.url
              }
            }
          }).catch(() => { });

          vars.dealer_state = 'DONE';
          vars.dealer_flow = {};
          await saveSession();
          await sendMessage(bot, chatId, '✅ Надіслали менеджеру! Дякуємо.');

          if (bot.adminChatId) {
            const caption = `📨 Новий варіант по запиту ${requestId}\n${summaryCard({ specs: { vin: flow.vin, note: flow.details } })}`;
            if (Array.isArray(vars.dealer_photos) && vars.dealer_photos.length) {
              await telegramOutbox.sendMediaGroup({
                botId: bot.id,
                token: bot.token,
                chatId: String(bot.adminChatId),
                media: vars.dealer_photos.map((p: string, idx: number) => ({
                  type: 'photo',
                  media: p,
                  caption: idx === 0 ? caption : undefined,
                  parse_mode: 'HTML'
                })),
                companyId: bot.companyId || null
              });
              await sendMessage(bot, bot.adminChatId, 'Дії з варіантом:', managerActionsKeyboard(variant.id));
            } else {
              await sendMessage(bot, bot.adminChatId, caption, managerActionsKeyboard(variant.id));
            }
          }
          return true;
        }
      }

      return false;
    };

    // Dealer flow handling
    if (isDealerFlow) {
      const handledDealer = await handleDealerFlow();
      if (handledDealer) return true;
    }

    // CALLBACK QUERIES
    if (update.callback_query) {
      await answerCallback(bot, update.callback_query.id);
      const cbData = update.callback_query.data || '';
      if (cbData.startsWith('VARIANT:')) {
        const [, variantId, action] = cbData.split(':');
        if (variantId && action) {
          const target = await prisma.requestVariant.findUnique({ where: { id: variantId } });
          if (target) {
            let nextStatus = target.status;
            if (action === 'APPROVE') nextStatus = 'APPROVED';
            if (action === 'REJECT') nextStatus = 'REJECTED';
            if (action === 'SEND_TO_CLIENT') nextStatus = 'SENT_TO_CLIENT';
            await prisma.requestVariant.update({ where: { id: variantId }, data: { status: nextStatus } });
            await prisma.messageLog.create({
              data: {
                requestId: target.requestId,
                variantId: target.id,
                botId: bot.id,
                chatId,
                direction: 'OUTGOING',
                text: `Manager action: ${action}`,
                payload: { status: nextStatus }
              }
            }).catch(() => { });
            await sendMessage(bot, chatId, `✅ Статус оновлено: ${nextStatus}`);
          } else {
            await sendMessage(bot, chatId, 'Варіант не знайдено.');
          }
        }
        return true;
      }
      if (cbData.startsWith('SCN:CHOICE:')) {
        const choiceVal = cbData.split('SCN:CHOICE:')[1];
        const handled = await this.handleInput(bot, session, vars, history, choiceVal, true);
        if (!handled) {
          await sendMessage(bot, chatId, lang === 'UK' ? '⚠️ Сесія минула. Скидання...' : '⚠️ Session expired. Resetting...');
          resetFlow();
          await saveSession();
          await sendMainMenu();
        }
        return true;
      }
      if (cbData.startsWith('CAR:SELECT:')) {
        await this.handleCarSelection(bot, chatId, vars, cbData.split('CAR:SELECT:')[1], userId);
        await saveSession();
        return true;
      }
      if (cbData.startsWith('CAR:ADD_REQUEST:')) {
        await this.handleAddToRequest(bot, chatId, vars, cbData.split('CAR:ADD_REQUEST:')[1]);
        await saveSession();
        return true;
      }
      if (cbData.startsWith('CAR:ADD_CATALOG:')) {
        await this.handleAddToCatalog(bot, chatId, vars, cbData.split('CAR:ADD_CATALOG:')[1]);
        await saveSession();
        return true;
      }
      if (cbData === 'CMD:BACK') {
        await this.goBack(bot, session, vars, history);
        await saveSession();
        return true;
      }
    }

    // /start handling
    if (input === '/start' || input.startsWith('/start ')) {
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
                  : '⚠️ Request not found or invite expired.';
            } else {
              vars.role = 'DEALER';
              vars.dealerId = payload.id;
              vars.dealer_invite_id = payload.id;
              vars.dealer_state = 'INIT';
              deepLinkMsg = lang === 'UK'
                ? '👋 Вітаємо! Ви запрошені як партнер. Поділіться контактом і надішліть варіант.'
                : lang === 'RU'
                  ? '👋 Добро пожаловать! Вы приглашены как партнер. Поделитесь контактом и отправьте вариант.'
                  : '👋 Welcome partner! Share your contact and send your offer.';
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
                  : '⚠️ Request not found.';
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
                  : `📄 Request #${req.publicId || req.id}. Send your offer.`;
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
                : `💰 Viewing Offer #${payload.id}`;
          }
        }
      }

      await saveSession();

      const hasLang = !!vars.language || !!vars.lang;
      const langScenario = scenarios.find(s => s.triggerCommand === 'lang');
      if (hasLang) {
        await sendMainMenu(deepLinkMsg || undefined);
      } else if (langScenario) {
        await startScenario(langScenario.id);
      } else {
        await sendMainMenu(deepLinkMsg || '👋 Welcome!');
      }
      return true;
    }

    if (['/menu', 'menu', '🏠 menu', 'cmd:menu', 'main menu'].includes(input)) {
      resetFlow();
      await saveSession();
      await sendMainMenu();
      return true;
    }

    if (['/back', 'back', '⬅️ back', 'cmd:back'].includes(input)) {
      await this.goBack(bot, session, vars, history);
      await saveSession();
      return true;
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
      } else if (menuBtn.type === 'TEXT') {
        await sendMessage(bot, chatId, menuBtn.value || 'Info');
      } else if (menuBtn.type === 'LINK') {
        await sendMessage(bot, chatId, `🔗 ${menuBtn.value}`);
      }
      return true;
    }

    // Contact sharing
    if (update.message?.contact) {
      vars.phone = update.message.contact.phone_number;
      const handled = await this.handleInput(bot, session, vars, history, '[CONTACT]', false);
      await saveSession();
      if (!handled) {
        await sendMainMenu('Thanks! Contact saved.');
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
      const handled = await this.handleInput(bot, session, vars, history, inputRaw, false);
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
          await this.executeNode(bot, session, vars, history, scenario as any, node.id, true);
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

    return scenarios.length > 0;
  }

  static async goBack(bot: BotRuntime, session: any, vars: Record<string, any>, history: string[]) {
    const lang = getLanguage(vars);
    if (!vars.__activeScenarioId || history.length === 0) {
      const msg = lang === 'UK' ? 'Нікуди повертатися.' : lang === 'RU' ? 'Некуда возвращаться.' : 'Nothing to go back to.';
      await sendMessage(bot, session.chatId, msg);
      if (!vars.__activeScenarioId) await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
      return;
    }
    const prevNodeId = history.pop();
    const scenario = await prisma.scenario.findUnique({ where: { id: vars.__activeScenarioId } });
    if (scenario && prevNodeId) {
      await this.executeNode(bot, session, vars, history, scenario as any, prevNodeId, true);
    } else {
      await emitScenarioCompleted(bot, session.chatId, vars.__activeScenarioId, { reason: 'back_reset' }, vars.__telegramUserId);
      delete vars.__activeScenarioId;
      delete vars.__currentNodeId;
      history.length = 0;
      await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
    }
  }

  static async handleInput(bot: BotRuntime, session: any, vars: Record<string, any>, history: string[], input: string, isCallback: boolean): Promise<boolean> {
    if (!vars.__activeScenarioId || !vars.__currentNodeId) return false;
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
        await this.executeNode(bot, session, vars, history, scenario as any, match.nextNodeId, false);
        return true;
      }
      return false;
    }

    if (node.type === 'REQUEST_CONTACT') {
      if (input === '[CONTACT]' || input.length > 5) {
        if (input !== '[CONTACT]') vars.phone = input;
        if (node.nextNodeId) {
          await this.executeNode(bot, session, vars, history, scenario as any, node.nextNodeId, false);
          return true;
        }
      }
      return false;
    }

    if (node.content?.variableName) {
      vars[node.content.variableName] = input;
    }

    if (node.nextNodeId) {
      await this.executeNode(bot, session, vars, history, scenario as any, node.nextNodeId, false);
      return true;
    }

    await emitScenarioCompleted(bot, session.chatId, scenario.id, { reason: 'end' }, vars.__telegramUserId);
    delete vars.__activeScenarioId;
    delete vars.__currentNodeId;
    history.length = 0;
    await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, getLanguage(vars)), buildMainMenuButtons(bot, getLanguage(vars)));
    return true;
  }

  static async executeNode(bot: BotRuntime, session: any, vars: Record<string, any>, history: string[], scenario: ScenarioRecord, nodeId: string, isBack = false) {
    const nodes = Array.isArray(scenario.nodes) ? (scenario.nodes as ScenarioNode[]) : [];
    const node: ScenarioNode | undefined = nodes.find((n: ScenarioNode) => n.id === nodeId);
    const lang = getLanguage(vars);
    if (!node) {
      await emitScenarioCompleted(bot, session.chatId, vars.__activeScenarioId || scenario.id, { reason: 'missing_node' }, vars.__telegramUserId);
      delete vars.__activeScenarioId;
      delete vars.__currentNodeId;
      history.length = 0;
      await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
      return;
    }

    if (!isBack && vars.__currentNodeId && vars.__currentNodeId !== nodeId && ['QUESTION_TEXT', 'QUESTION_CHOICE', 'MENU_REPLY', 'REQUEST_CONTACT'].includes(node.type)) {
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

    switch (node.type) {
      case 'START':
      case 'JUMP':
        if (node.nextNodeId) await this.executeNode(bot, session, vars, history, scenario, node.nextNodeId, isBack);
        break;

      case 'MESSAGE':
        await sendMessage(bot, session.chatId, text);
        if (node.nextNodeId) await this.executeNode(bot, session, vars, history, scenario, node.nextNodeId, isBack);
        else {
          await emitScenarioCompleted(bot, session.chatId, scenario.id, { reason: 'end' }, vars.__telegramUserId);
          delete vars.__activeScenarioId;
          delete vars.__currentNodeId;
          history.length = 0;
          await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
        }
        break;

      case 'QUESTION_TEXT':
        await sendMessage(bot, session.chatId, text);
        break;

      case 'QUESTION_CHOICE':
        await sendChoices(bot, session.chatId, text, node.content?.choices || [], lang);
        break;

      case 'MENU_REPLY': {
        const choices = node.content?.choices || [];
        const buttons: string[][] = [];
        for (let i = 0; i < choices.length; i += 2) {
          const left = (lang === 'UK' && choices[i].label_uk) ? choices[i].label_uk :
            (lang === 'RU' && choices[i].label_ru) ? choices[i].label_ru : choices[i].label;
          const row = [left || ''];
          if (i + 1 < choices.length) {
            const right = (lang === 'UK' && choices[i + 1].label_uk) ? choices[i + 1].label_uk :
              (lang === 'RU' && choices[i + 1].label_ru) ? choices[i + 1].label_ru : choices[i + 1].label;
            row.push(right || '');
          }
          buttons.push(row);
        }
        const backTxt = lang === 'UK' ? '⬅️ Назад' : lang === 'RU' ? '⬅️ Назад' : '⬅️ Back';
        const menuTxt = lang === 'UK' ? '🏠 Меню' : lang === 'RU' ? '🏠 Меню' : '🏠 Menu';
        buttons.push([backTxt, menuTxt]);
        await sendReplyKeyboard(bot, session.chatId, text, buttons);
        break;
      }

      case 'REQUEST_CONTACT':
        await sendContactRequest(bot, session.chatId, text);
        break;

      case 'CONDITION': {
        const val = vars[node.content?.conditionVariable || ''] || (vars.__tempResults || []).length || 0;
        const target = node.content?.conditionValue;
        let result = false;
        if (node.content?.conditionOperator === 'GT') result = Number(val) > Number(target);
        else if (node.content?.conditionOperator === 'HAS_VALUE') result = !!val && val !== 0 && val !== '';
        else result = String(val) === String(target);

        const nextId = result ? node.content?.trueNodeId : node.content?.falseNodeId;
        if (nextId) await this.executeNode(bot, session, vars, history, scenario, nextId, isBack);
        else {
          await emitScenarioCompleted(bot, session.chatId, scenario.id, { reason: 'end' }, vars.__telegramUserId);
          delete vars.__activeScenarioId;
          delete vars.__currentNodeId;
          history.length = 0;
          await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
        }
        break;
      }

      case 'DELAY': {
        const ms = parseInt(String(node.content?.conditionValue || '1000'), 10);
        await sendChatAction(bot, session.chatId, 'typing');
        await new Promise(r => setTimeout(r, ms));
        if (node.nextNodeId) await this.executeNode(bot, session, vars, history, scenario, node.nextNodeId, isBack);
        break;
      }

      case 'GALLERY': {
        await sendMessage(bot, session.chatId, text);
        const temp = Array.isArray(vars.__tempResults) ? vars.__tempResults : [];
        for (const car of temp.slice(0, 5)) {
          const caption = formatCarCaption(car, lang);
          const keyboard = createCarCardKeyboard(car, lang);
          if (car.thumbnail) {
            await sendPhoto(bot, session.chatId, car.thumbnail, caption, keyboard);
          } else {
            await sendMessage(bot, session.chatId, caption, keyboard);
          }
          await new Promise(r => setTimeout(r, 600));
        }
        if (node.nextNodeId) await this.executeNode(bot, session, vars, history, scenario, node.nextNodeId, isBack);
        else {
          await emitScenarioCompleted(bot, session.chatId, scenario.id, { reason: 'end' }, vars.__telegramUserId);
          delete vars.__activeScenarioId;
          delete vars.__currentNodeId;
          history.length = 0;
          await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
        }
        break;
      }

      case 'ACTION': {
        const actionType = node.content?.actionType;
        if (actionType === 'SET_LANG') {
          const selectedLang = vars.language || vars.lang;
          const clean = String(selectedLang || '').includes('Ukra') || selectedLang === 'UK'
            ? 'UK'
            : String(selectedLang || '').includes('Russ') || selectedLang === 'RU'
              ? 'RU'
              : 'EN';
          vars.language = clean;
        }
        if (actionType === 'NORMALIZE_REQUEST') {
          const rawBrand = vars.brandRaw || vars.brand;
          if (rawBrand) vars.brand = String(rawBrand).trim();
        }
        if (actionType === 'CREATE_LEAD') {
          await createOrMergeLead({
            botId: bot.id,
            companyId: bot.companyId || null,
            chatId: session.chatId,
            userId: vars.__telegramUserId || undefined,
            name: vars.name || vars.first_name || 'Client',
            phone: vars.phone,
            source: 'TELEGRAM',
            payload: { language: vars.language },
            leadType: 'BUY',
            createRequest: false
          }, bot.config);
        }
        if (actionType === 'CREATE_REQUEST') {
          const payload = mapRequestInput({
            title: `${vars.brand || ''} ${vars.model || ''}`.trim(),
            yearMin: Number(vars.year || 0),
            budgetMax: Number(vars.budget || 0),
            description: `Via Bot. User: ${vars.name || vars.first_name || ''}`.trim(),
            status: 'COLLECTING_VARIANTS',
            source: 'TG',
            clientChatId: session.chatId,
            language: vars.language
          });
          const request = await prisma.b2bRequest.create({
            data: {
              ...payload,
              publicId: generatePublicId(),
              companyId: bot.companyId || null
            }
          });
          vars.requestId = request.publicId;
          vars.requestPublicId = request.publicId;

          await notifyRequestAdmin(bot, request);
        }
        if (actionType === 'NOTIFY_ADMIN' && bot.adminChatId) {
          await sendMessage(bot, bot.adminChatId, text || '🔔 Notification');
        }

        if (node.nextNodeId) await this.executeNode(bot, session, vars, history, scenario, node.nextNodeId, isBack);
        else {
          await emitScenarioCompleted(bot, session.chatId, scenario.id, { reason: 'end' }, vars.__telegramUserId);
          delete vars.__activeScenarioId;
          delete vars.__currentNodeId;
          history.length = 0;
          await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
        }
        break;
      }

      case 'SEARCH_CARS': {
        const filter = {
          brand: vars.brand,
          model: vars.model,
          priceMax: Number(vars.budget || 0),
          yearMin: Number(vars.year || 0)
        };
        const internal = await prisma.carListing.findMany({
          where: {
            status: 'AVAILABLE',
            ...(filter.brand ? { title: { contains: String(filter.brand), mode: 'insensitive' } } : {}),
            ...(filter.priceMax ? { price: { lte: filter.priceMax } } : {})
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        });
        let mapped = internal.map(mapDbCar);
        if (filter.model) {
          const key = String(filter.model).toLowerCase();
          mapped = mapped.filter(car => car.title.toLowerCase().includes(key));
        }
        let merged = mapped;
        if (mapped.length < 3) {
          const external = await searchAutoRia(filter);
          const seen = new Set(mapped.map(c => c.canonicalId || c.sourceUrl));
          const deduped = external.filter((car: any) => {
            const key = car.canonicalId || car.sourceUrl;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          merged = [...mapped, ...deduped];
        }

        vars.__tempResults = merged.slice(0, 5);
        vars.found_count = merged.length;

        if (node.nextNodeId) await this.executeNode(bot, session, vars, history, scenario, node.nextNodeId, isBack);
        else {
          await emitScenarioCompleted(bot, session.chatId, scenario.id, { reason: 'end' }, vars.__telegramUserId);
          delete vars.__activeScenarioId;
          delete vars.__currentNodeId;
          history.length = 0;
          await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
        }
        break;
      }

      case 'SEARCH_FALLBACK': {
        const filter = {
          brand: vars.brand,
          model: vars.model,
          priceMax: Number(vars.budget || 0),
          yearMin: Number(vars.year || 0)
        };
        const external = await searchAutoRia(filter);
        vars.__tempResults = external.slice(0, 5);
        vars.found_count = external.length;

        if (node.nextNodeId) await this.executeNode(bot, session, vars, history, scenario, node.nextNodeId, isBack);
        else {
          await emitScenarioCompleted(bot, session.chatId, scenario.id, { reason: 'end' }, vars.__telegramUserId);
          delete vars.__activeScenarioId;
          delete vars.__currentNodeId;
          history.length = 0;
          await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
        }
        break;
      }

      case 'CHANNEL_POST': {
        const destination = node.content?.destinationId
          || (node.content?.destinationVar ? vars[node.content.destinationVar] : undefined)
          || bot.channelId
          || bot.adminChatId;
        const imageUrl = node.content?.imageUrl
          || (node.content?.imageVar ? vars[node.content.imageVar] : undefined);
        const scheduledAt = node.content?.scheduledAt
          || (node.content?.scheduledAtVar ? vars[node.content.scheduledAtVar] : undefined);

        const fallbackCar = Array.isArray(vars.__tempResults) ? vars.__tempResults[0] : null;
        const postText = text || (fallbackCar ? renderCarListingCard(fallbackCar, lang) : '');

        if (!destination || !postText) {
          await sendMessage(bot, session.chatId, '⚠️ Channel post missing destination or text.');
          break;
        }

        if (scheduledAt) {
          await prisma.draft.create({
            data: {
              source: 'MANUAL',
              title: 'Scenario Post',
              description: postText,
              url: imageUrl || null,
              destination,
              scheduledAt: new Date(scheduledAt),
              status: 'SCHEDULED',
              botId: bot.id,
              metadata: { scenarioId: scenario.id, nodeId: node.id }
            }
          });
          await sendMessage(bot, session.chatId, '✅ Post scheduled.');
        } else {
          if (imageUrl) await sendPhoto(bot, destination, imageUrl, postText);
          else await sendMessage(bot, destination, postText);
          await prisma.draft.create({
            data: {
              source: 'MANUAL',
              title: 'Scenario Post',
              description: postText,
              url: imageUrl || null,
              destination,
              status: 'POSTED',
              postedAt: new Date(),
              botId: bot.id,
              metadata: { scenarioId: scenario.id, nodeId: node.id }
            }
          });
        }

        if (node.nextNodeId) await this.executeNode(bot, session, vars, history, scenario, node.nextNodeId, isBack);
        else {
          await emitScenarioCompleted(bot, session.chatId, scenario.id, { reason: 'end' }, vars.__telegramUserId);
          delete vars.__activeScenarioId;
          delete vars.__currentNodeId;
          history.length = 0;
          await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
        }
        break;
      }

      case 'REQUEST_BROADCAST': {
        const destination = node.content?.destinationId
          || (node.content?.destinationVar ? vars[node.content.destinationVar] : undefined)
          || bot.channelId;
        const requestVar = node.content?.requestIdVar || 'requestId';
        const requestRef = vars[requestVar] || vars.requestId || vars.requestPublicId;
        const username = bot.config?.username || '';
        if (!destination || !requestRef || !username) {
          await sendMessage(bot, session.chatId, '⚠️ Broadcast missing destination, requestId, or bot username.');
          break;
        }

        const req = await prisma.b2bRequest.findFirst({
          where: { OR: [{ id: requestRef }, { publicId: requestRef }] },
          include: { variants: true }
        });
        if (!req) {
          await sendMessage(bot, session.chatId, '⚠️ Request not found.');
          break;
        }

        const messageText = text || mapRequestForMessage(req);
        const buttonText = node.content?.buttonText || '💼 Подати пропозицію';
        const link = generateRequestLink(username, req.publicId || req.id);
        const keyboard = createDeepLinkKeyboard([{ text: buttonText, link }]);
        await sendMessage(bot, destination, messageText, keyboard);

        if (node.nextNodeId) await this.executeNode(bot, session, vars, history, scenario, node.nextNodeId, isBack);
        else {
          await emitScenarioCompleted(bot, session.chatId, scenario.id, { reason: 'end' }, vars.__telegramUserId);
          delete vars.__activeScenarioId;
          delete vars.__currentNodeId;
          history.length = 0;
          await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
        }
        break;
      }

      case 'OFFER_COLLECT': {
        const destination = node.content?.destinationId
          || (node.content?.dealerChatVar ? vars[node.content.dealerChatVar] : undefined)
          || (node.content?.destinationVar ? vars[node.content.destinationVar] : undefined);
        const requestVar = node.content?.requestIdVar || 'requestId';
        const requestRef = vars[requestVar] || vars.requestId || vars.requestPublicId;
        const username = bot.config?.username || '';
        if (!destination || !requestRef || !username) {
          await sendMessage(bot, session.chatId, '⚠️ Offer collect missing destination, requestId, or bot username.');
          break;
        }

        const req = await prisma.b2bRequest.findFirst({
          where: { OR: [{ id: requestRef }, { publicId: requestRef }] },
          include: { variants: true }
        });
        if (!req) {
          await sendMessage(bot, session.chatId, '⚠️ Request not found.');
          break;
        }

        const messageText = text || `💰 Запит: ${req.title}\n${req.description || ''}`.trim();
        const buttonText = node.content?.buttonText || '💰 Надіслати пропозицію';
        const link = generateOfferLink(username, req.publicId || req.id);
        const keyboard = createDeepLinkKeyboard([{ text: buttonText, link }]);
        await sendMessage(bot, destination, messageText, keyboard);

        if (node.nextNodeId) await this.executeNode(bot, session, vars, history, scenario, node.nextNodeId, isBack);
        else {
          await emitScenarioCompleted(bot, session.chatId, scenario.id, { reason: 'end' }, vars.__telegramUserId);
          delete vars.__activeScenarioId;
          delete vars.__currentNodeId;
          history.length = 0;
          await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
        }
        break;
      }
    }
  }

  static async handleCarSelection(bot: BotRuntime, chatId: string, vars: Record<string, any>, carId: string, userId?: string) {
    const inventory = await prisma.carListing.findMany({ where: { id: carId } });
    const car = inventory[0];
    await createOrMergeLead({
      botId: bot.id,
      companyId: bot.companyId || null,
      chatId,
      userId,
      name: vars.name || vars.first_name || `User ${chatId}`,
      phone: vars.phone,
      request: car?.title || carId,
      source: 'TELEGRAM',
      payload: { goal: `Selected: ${car?.title || carId}`, language: vars.language },
      leadType: 'BUY',
      createRequest: false
    }, bot.config);
    const lang = getLanguage(vars);
    const msg = lang === 'UK' ? '✅ Заявку прийнято!' : '✅ Request received!';
    await sendMessage(bot, chatId, msg);
  }

  static async resolveRequestId(vars: Record<string, any>) {
    const refId = vars.requestId || vars.requestPublicId || vars.ref_request_id;
    if (!refId) return null;
    const request = await prisma.b2bRequest.findFirst({
      where: { OR: [{ id: refId }, { publicId: refId }] }
    });
    return request?.id || null;
  }

  static async handleAddToRequest(bot: BotRuntime, chatId: string, vars: Record<string, any>, carId: string) {
    const lang = getLanguage(vars);
    const requestId = await this.resolveRequestId(vars);
    if (!requestId) {
      const msg = lang === 'UK' ? '⚠️ Немає активного запиту для додавання авто.' : '⚠️ No active request to attach this car.';
      await sendMessage(bot, chatId, msg);
      return;
    }

    const temp = Array.isArray(vars.__tempResults) ? vars.__tempResults : [];
    const fromResults = temp.find((c: any) => c.canonicalId === carId);
    const car = fromResults || await prisma.carListing.findUnique({ where: { id: carId } });
    if (!car) {
      await sendMessage(bot, chatId, '⚠️ Car not found.');
      return;
    }

    const mapped = mapVariantInput({
      title: car.title,
      price: car.price?.amount ?? car.price,
      year: car.year,
      mileage: car.mileage,
      location: car.location,
      thumbnail: car.thumbnail,
      url: car.sourceUrl,
      sourceUrl: car.sourceUrl,
      source: car.source,
      specs: car.specs,
      status: 'PENDING'
    });

    await prisma.requestVariant.create({
      data: {
        ...mapped,
        requestId
      }
    });

    const msg = lang === 'UK' ? '✅ Додано в запит.' : '✅ Added to request.';
    await sendMessage(bot, chatId, msg);
  }

  static async handleAddToCatalog(bot: BotRuntime, chatId: string, vars: Record<string, any>, carId: string) {
    const lang = getLanguage(vars);
    const existing = await prisma.carListing.findUnique({ where: { id: carId } });
    if (existing) {
      const msg = lang === 'UK' ? 'ℹ️ Авто вже в каталозі.' : 'ℹ️ Car is already in catalog.';
      await sendMessage(bot, chatId, msg);
      return;
    }

    const temp = Array.isArray(vars.__tempResults) ? vars.__tempResults : [];
    const fromResults = temp.find((c: any) => c.canonicalId === carId);
    if (!fromResults) {
      await sendMessage(bot, chatId, '⚠️ Car not found.');
      return;
    }

    await prisma.carListing.create({
      data: {
        id: fromResults.canonicalId,
        source: fromResults.source || 'MANUAL',
        sourceUrl: fromResults.sourceUrl || null,
        title: fromResults.title,
        price: typeof fromResults.price === 'object' ? fromResults.price?.amount || 0 : fromResults.price || 0,
        currency: typeof fromResults.price === 'object' ? fromResults.price?.currency || 'USD' : 'USD',
        year: fromResults.year || 0,
        mileage: fromResults.mileage || 0,
        location: fromResults.location || null,
        thumbnail: fromResults.thumbnail || null,
        mediaUrls: fromResults.mediaUrls || [],
        specs: fromResults.specs || {},
        status: 'AVAILABLE',
        companyId: bot.companyId || null
      }
    });

    const msg = lang === 'UK' ? '✅ Додано в каталог.' : '✅ Added to catalog.';
    await sendMessage(bot, chatId, msg);
  }

  static async handleManagerRequestAction(bot: BotRuntime, session: any, data: string, userId?: string) {
    const [_, reqId, action] = data.split(':');
    const chatId = session.chatId;

    if (action === 'CLOSE') {
      await prisma.b2bRequest.update({
        where: { id: reqId },
        data: { status: 'CLOSED' as any } // TODO: Use Enum
      });
      await sendMessage(bot, chatId, '✅ Request closed.');
      return;
    }

    if (action === 'POST') {
      const req = await prisma.b2bRequest.findUnique({ where: { id: reqId } });
      if (!req) return;

      const text = mapRequestForMessage(req);
      if (bot.channelId) {
        const link = generateRequestLink(bot.config?.username || 'CarTieBot', req.publicId || '');
        const keyboard = createDeepLinkKeyboard([{ text: '💼 Створити пропозицію', link }]);
        await sendMessage(bot, bot.channelId, text, keyboard);
        await sendMessage(bot, chatId, '✅ Posted to channel.');
      } else {
        await sendMessage(bot, chatId, '⚠️ Channel ID not configured.');
      }
      return;
    }

    if (action === 'FIND') {
      const req = await prisma.b2bRequest.findUnique({ where: { id: reqId } });
      if (!req) return;

      await sendMessage(bot, chatId, '🔍 Searching AutoRia...');
      const results = await searchAutoRia({
        brand: req.title.split(' ')[0], // Simple heuristic
        yearMin: req.yearMin,
        priceMax: req.budgetMax
      });

      if (results.length === 0) {
        await sendMessage(bot, chatId, '⚠️ No results found.');
        return;
      }

      for (const car of results.slice(0, 3)) {
        const caption = renderCarListingCard(car, 'UK'); // Admin usually sees UK/RU
        const keyboard = createCarCardKeyboard(car, 'UK');
        if (car.thumbnail) {
          await sendPhoto(bot, chatId, car.thumbnail, caption, keyboard);
        } else {
          await sendMessage(bot, chatId, caption, keyboard);
        }
      }
    }
  }
}
