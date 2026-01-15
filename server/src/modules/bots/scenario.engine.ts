import axios from 'axios';
import { prisma } from '../../services/prisma.js';
import { generatePublicId, mapLeadCreateInput, mapRequestInput, mapRequestOutput, mapVariantInput } from '../../services/dto.js';
import { createDeepLinkKeyboard, generateOfferLink, generateRequestLink, parseStartPayload } from '../../utils/deeplink.utils.js';
import { TelegramSender } from '../../services/telegramSender.js';
import { renderVariantCard, managerActionsKeyboard, renderRequestCard } from '../../services/cardRenderer.js';

type BotRuntime = {
  id: string;
  name?: string | null;
  token: string;
  channelId?: string | null;
  adminChatId?: string | null;
  companyId?: string | null;
  config?: any;
  template?: string | null;
};

type ScenarioNode = {
  id: string;
  type: string;
  content?: any;
  nextNodeId?: string | null;
};

type ScenarioRecord = {
  id: string;
  name: string;
  triggerCommand?: string | null;
  keywords?: string[] | null;
  isActive: boolean;
  entryNodeId?: string | null;
  nodes?: any;
};

const normalizeTextCommand = (text: string) =>
  (text || '').trim().toLowerCase().replace(/\s+/g, ' ');

const stripTags = (value: string) => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

const hasContactInfo = (text: string) => {
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

const getMenuConfig = (bot: BotRuntime) => bot.config?.menuConfig || { buttons: [], welcomeMessage: 'Menu:' };

const buildMainMenuButtons = (bot: BotRuntime, lang: string) => {
  const config = getMenuConfig(bot);
  const buttons: string[][] = [];
  const sorted = [...(config.buttons || [])].sort((a, b) => (a.row - b.row) || (a.col - b.col));
  const rows: Record<number, string[]> = {};

  sorted.forEach((btn: any) => {
    if (!rows[btn.row]) rows[btn.row] = [];
    const label = (lang === 'UK' && btn.label_uk) ? btn.label_uk :
      (lang === 'RU' && btn.label_ru) ? btn.label_ru : btn.label;
    rows[btn.row].push(label);
  });

  Object.keys(rows).sort().forEach(key => buttons.push(rows[Number(key)]));
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

const TELEGRAM_BASE = (token: string) => `https://api.telegram.org/bot${token}`;

const logOutgoing = async (botId: string, chatId: string, text: string, messageId?: number | null, payload?: any) => {
  try {
    await prisma.$executeRaw`
      INSERT INTO "BotMessage" (id, "botId", "chatId", direction, text, "messageId", payload, "createdAt")
      VALUES (
        gen_random_uuid()::text,
        ${String(botId)},
        ${String(chatId)},
        'OUTGOING',
        ${String(text)},
        ${messageId ?? null},
        ${JSON.stringify(payload || {})}::jsonb,
        NOW()
      )
    `;
  } catch (e) {
    console.error('[ScenarioEngine] Failed to log outgoing message:', e);
  }
};

const sendMessage = async (bot: BotRuntime, chatId: string, text: string, replyMarkup?: any) => {
  const result = await TelegramSender.sendMessage(bot.token, chatId, text, replyMarkup);
  await logOutgoing(bot.id, chatId, text, (result as any)?.message_id, { markup: replyMarkup });
  return result;
};

const sendPhoto = async (bot: BotRuntime, chatId: string, photo: string, caption: string, replyMarkup?: any) => {
  const result = await TelegramSender.sendPhoto(bot.token, chatId, photo, caption, replyMarkup);
  await logOutgoing(bot.id, chatId, caption, (result as any)?.message_id, { markup: replyMarkup });
  return result;
};

const answerCallback = async (bot: BotRuntime, callbackId: string, text?: string) => {
  await TelegramSender.answerCallback(bot.token, callbackId, text);
};

const sendChatAction = async (bot: BotRuntime, chatId: string, action = 'typing') => {
  await TelegramSender.sendChatAction(bot.token, chatId, action);
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
  await sendMessage(bot, bot.adminChatId, text);
};

const sendChoices = async (bot: BotRuntime, chatId: string, text: string, choices: any[], lang: string) => {
  const inline_keyboard = (choices || []).map(choice => {
    const label = (lang === 'UK' && choice.label_uk) ? choice.label_uk :
      (lang === 'RU' && choice.label_ru) ? choice.label_ru : choice.label;
    return [{ text: label || choice.label, callback_data: `SCN:CHOICE:${choice.value}` }];
  });
  return sendMessage(bot, chatId, text, { inline_keyboard });
};

const formatCarCaption = (car: any, lang: string) => {
  const t = {
    EN: { mileage: 'km', price: 'Price', vin: 'VIN' },
    UK: { mileage: 'км', price: 'Ціна', vin: 'VIN' },
    RU: { mileage: 'км', price: 'Цена', vin: 'VIN' }
  } as const;

  const loc = t[lang as keyof typeof t] || t.EN;
  const rawTitle = car.title || '';
  const yearStr = car.year ? String(car.year) : '';
  const titleNoYear = rawTitle.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
  const header = [titleNoYear, yearStr].filter(Boolean).join(' ').trim();

  const parts: string[] = [`🚗 <b>${(header || rawTitle).toUpperCase()}</b>`];
  if (car.mileage) parts.push(`🛣 ${Math.round(car.mileage / 1000)} ${loc.mileage}`);
  if (car.specs?.engine) parts.push(`⚙️ ${car.specs.engine}`);
  if (car.specs?.drive) parts.push(`🛞 ${car.specs.drive}`);
  if (car.specs?.transmission) parts.push(`🕹 ${car.specs.transmission}`);
  if (car.specs?.vin) parts.push(`🔑 ${loc.vin}: ${car.specs.vin}`);
  if (car.price?.amount) parts.push(`💰 ${car.price.amount.toLocaleString()} ${car.price.currency}`);

  return parts.join('\n').trim();
};

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

const AUTORIA_BRAND_MAP: Record<string, number> = {
  'acura': 1, 'audi': 6, 'bmw': 9, 'bentley': 8, 'buick': 10, 'byd': 2623,
  'cadillac': 11, 'chevrolet': 13, 'chrysler': 14, 'citroen': 15,
  'dodge': 19, 'fiat': 23, 'ferrari': 22, 'ford': 24, 'gmc': 25,
  'honda': 28, 'hummer': 30, 'hyundai': 29, 'infiniti': 32,
  'jaguar': 31, 'jeep': 32, 'kia': 33, 'lamborghini': 35,
  'land rover': 36, 'lexus': 38, 'lincoln': 39, 'mazda': 43,
  'mercedes-benz': 48, 'mercedes': 48, 'mitsubishi': 52, 'mini': 51,
  'nissan': 55, 'opel': 56, 'peugeot': 58, 'porsche': 60,
  'renault': 62, 'rolls-royce': 64, 'skoda': 70, 'subaru': 75,
  'suzuki': 76, 'tesla': 5608, 'toyota': 79, 'volkswagen': 84, 'volvo': 85
};

const AUTORIA_CACHE = new Map<string, { ts: number; data: any[] }>();
const AUTORIA_CACHE_TTL = 15 * 60 * 1000;

const normalizeUrl = (value: string) => {
  try {
    const u = new URL(value);
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return (value || '').split('#')[0].replace(/\/$/, '');
  }
};

const extractJsonLdObjects = (input: any): any[] => {
  if (!input) return [];
  if (Array.isArray(input)) return input.flatMap(extractJsonLdObjects);
  if (typeof input === 'object') {
    if (Array.isArray(input['@graph'])) return input['@graph'].flatMap(extractJsonLdObjects);
    return [input];
  }
  return [];
};

const isTargetJsonLdType = (obj: any) => {
  const rawType = obj?.['@type'];
  const types = Array.isArray(rawType) ? rawType : rawType ? [rawType] : [];
  return types.some((t: string) => ['Product', 'Vehicle', 'Car'].includes(String(t)));
};

const extractCandidateUrl = (obj: any) => obj?.url || obj?.offers?.url || obj?.['@id'] || '';
const extractCandidateSourceId = (obj: any) => {
  const candidates = [obj?.sku, obj?.productID, obj?.identifier, obj?.mpn, obj?.['@id']];
  return candidates.find(v => typeof v === 'string' && v.trim().length > 0) || '';
};

const fetchHtml = async (url: string) => {
  const response = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CartieBot/1.0)' }
  });
  return typeof response.data === 'string' ? response.data : String(response.data || '');
};

const parseAutoRiaListing = async (url: string): Promise<any | null> => {
  if (!url.includes('auto.ria.com')) return null;
  const html = await fetchHtml(url);
  const normalizedTarget = normalizeUrl(url);

  const idMatch = url.match(/auto_.*?(\d+)\.html/);
  const sourceId = idMatch ? idMatch[1] : undefined;

  const scriptMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  const candidates: any[] = [];
  for (const block of scriptMatches) {
    const content = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
    try {
      const json = JSON.parse(content);
      candidates.push(...extractJsonLdObjects(json));
    } catch {
      continue;
    }
  }

  const productCandidates = candidates.filter(isTargetJsonLdType);
  let data = productCandidates[0] || {};
  if (productCandidates.length > 0) {
    const scored = productCandidates.map(candidate => {
      const candidateUrl = extractCandidateUrl(candidate);
      const urlMatch = candidateUrl ? normalizeUrl(candidateUrl) === normalizedTarget : false;
      const sourceMatch = sourceId
        ? (candidateUrl && candidateUrl.includes(sourceId)) || extractCandidateSourceId(candidate) === sourceId
        : false;
      const score = (urlMatch ? 2 : 0) + (sourceMatch ? 1 : 0);
      return { candidate, score, urlMatch, sourceMatch };
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.urlMatch !== a.urlMatch) return b.urlMatch ? 1 : -1;
      if (b.sourceMatch !== a.sourceMatch) return b.sourceMatch ? 1 : -1;
      return 0;
    });
    data = scored[0]?.candidate || {};
  }

  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = data.name || (titleMatch ? stripTags(titleMatch[1]) : 'AutoRia Listing');
  const price = Number(data.offers?.price || 0);
  const currency = data.offers?.priceCurrency || 'USD';
  const images = Array.isArray(data.image) ? data.image : data.image ? [data.image] : [];
  const yearRaw = data.productionDate || data.vehicleModelDate || data.modelDate;
  const year = yearRaw ? Number(String(yearRaw).slice(0, 4)) : 0;
  const odo = data.mileageFromOdometer?.value || data.mileageFromOdometer;
  const mileage = odo ? Number(String(odo).replace(/\D/g, '')) * 1000 : 0;

  return {
    canonicalId: `autoria_${sourceId || Date.now()}`,
    sourceId,
    source: 'AUTORIA',
    sourceUrl: url,
    title,
    price: { amount: price || 0, currency },
    year,
    mileage,
    location: '',
    thumbnail: images[0] || '',
    mediaUrls: images,
    specs: {},
    status: 'AVAILABLE',
    postedAt: new Date().toISOString()
  };
};

const searchAutoRia = async (filter: any): Promise<any[]> => {
  if (!filter.brand) return [];
  const cacheKey = `${filter.brand || ''}|${filter.model || ''}|${filter.yearMin || ''}|${filter.yearMax || ''}|${filter.priceMin || ''}|${filter.priceMax || ''}`;
  const cached = AUTORIA_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < AUTORIA_CACHE_TTL) return cached.data;

  const brandId = AUTORIA_BRAND_MAP[String(filter.brand).toLowerCase()];
  let searchUrl = 'https://auto.ria.com/uk/search/?categories.main.id=1&price.currency=1';
  if (brandId) searchUrl += `&brand.id[0]=${brandId}`;
  if (filter.priceMin) searchUrl += `&price.USD.gte=${filter.priceMin}`;
  if (filter.priceMax) searchUrl += `&price.USD.lte=${filter.priceMax}`;
  if (filter.yearMin) searchUrl += `&year.gte=${filter.yearMin}`;
  if (filter.yearMax) searchUrl += `&year.lte=${filter.yearMax}`;

  const html = await fetchHtml(searchUrl);
  const linkMatches = Array.from(html.matchAll(/href="([^"]+auto_.*?\.html)"/gi)).map(m => m[1]);
  const links = Array.from(new Set(linkMatches.map(link => link.startsWith('http') ? link : `https://auto.ria.com${link}`)))
    .filter(link => link.includes('auto.ria.com'))
    .slice(0, 10);

  const results: any[] = [];
  for (const link of links) {
    try {
      const car = await parseAutoRiaListing(link);
      if (car) results.push(car);
    } catch {
      continue;
    }
  }

  const modelKey = filter.model ? String(filter.model).toLowerCase() : '';
  const finalResults = modelKey
    ? results.filter(r => r.title.toLowerCase().includes(modelKey))
    : results;

  AUTORIA_CACHE.set(cacheKey, { ts: Date.now(), data: finalResults });
  return finalResults;
};

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
  const lang = getLanguage(vars);
  const isDealerFlow = vars.role === 'DEALER' || vars.dealer_invite_id || vars.ref_request_id;

    const scenarios: ScenarioRecord[] = bot.companyId
      ? await prisma.scenario.findMany({
          where: { companyId: bot.companyId },
          orderBy: { createdAt: 'desc' }
        })
      : [];
    const menuConfig = getMenuConfig(bot);
    const hasMenuButtons = Array.isArray(menuConfig.buttons) && menuConfig.buttons.length > 0;
    const actionKeyboard = (variantId: string) => managerActionsKeyboard(variantId);

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
      const entryId = scenario.entryNodeId || (Array.isArray(scenario.nodes) ? (scenario.nodes.find((n: any) => n.type === 'START')?.id || scenario.nodes[0]?.id) : undefined);
      if (entryId) {
        await this.executeNode(bot, session, vars, history, scenario, entryId);
      }
    };

    const checkKeywords = async () => {
      const triggered = scenarios.find(s =>
        s.isActive && Array.isArray(s.keywords) && s.keywords.some(k => input.includes(String(k).toLowerCase()))
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

          const leadInput = mapLeadCreateInput({
            clientName: webData.name || vars.name || 'Client',
            phone: webData.phone || vars.phone,
            source: 'TELEGRAM',
            telegramChatId: chatId,
            status: 'NEW',
            goal: webData.carId ? `MiniApp: ${webData.carId}` : undefined,
            language: vars.language
          });
          if (!leadInput.error) {
            await prisma.lead.create({ data: leadInput.data });
          }

          const preset = webData.requestPreset || webData.request || {};
          let requestTitle = '';
          if (preset.brand) requestTitle = `${preset.brand} ${preset.model || ''}`.trim();

          if (!requestTitle && webData.carId) {
            const car = await prisma.carListing.findUnique({ where: { id: webData.carId } });
            if (car) requestTitle = car.title;
          }

          if (requestTitle) {
            const payload = mapRequestInput({
              title: requestTitle,
              yearMin: preset.year || 2015,
              budgetMax: preset.budget || 0,
              description: `Via MiniApp. Lead: ${webData.name || 'Client'}`,
              status: 'COLLECTING_VARIANTS',
              source: 'TG',
              clientChatId: chatId,
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

          const notifyText = [
            '📥 <b>MiniApp Lead</b>',
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
          resetFlow();
          await saveSession();
          await sendMainMenu();
          return true;
        }
      } catch (e) {
        console.error('[ScenarioEngine] web_app_data parse error', e);
      }
    }

    if (!scenarios.length && !hasMenuButtons) {
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
          }).catch(() => {});

          vars.dealer_state = 'DONE';
          vars.dealer_flow = {};
          await saveSession();
          await sendMessage(bot, chatId, '✅ Надіслали менеджеру! Дякуємо.');

          if (bot.adminChatId) {
            const caption = `📨 Новий варіант по запиту ${requestId}\n${summaryCard({ specs: { vin: flow.vin, note: flow.details } })}`;
            if (Array.isArray(vars.dealer_photos) && vars.dealer_photos.length) {
              await TelegramSender.sendMediaGroup(bot.token, bot.adminChatId, vars.dealer_photos.map((p: string, idx: number) => ({
                type: 'photo',
                media: p,
                caption: idx === 0 ? caption : undefined,
                parse_mode: 'HTML'
              })));
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
            }).catch(() => {});
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
        await this.handleCarSelection(bot, chatId, vars, cbData.split('CAR:SELECT:')[1]);
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
            vars.role = 'DEALER';
            vars.dealerId = payload.id;
            vars.dealer_invite_id = payload.id;
            if (payload.metadata?.requestId) vars.requestId = payload.metadata.requestId;
            vars.dealer_state = 'INIT';
            deepLinkMsg = lang === 'UK'
              ? '👋 Вітаємо! Вас запрошено як партнер. Залиш контакт і надішли варіант.'
              : '👋 Welcome partner! Share contact and send your offer.';
          } else if (payload.type === 'request') {
            vars.role = 'DEALER';
            vars.requestId = payload.id;
            vars.requestPublicId = payload.id;
            vars.ref_request_id = payload.id;
            vars.dealer_state = 'INIT';
            deepLinkMsg = lang === 'UK' ? `📄 Запит #${payload.id}. Надішли варіант.` : `📄 Request #${payload.id}. Send your offer.`;
          } else if (payload.type === 'offer') {
            vars.role = 'DEALER';
            vars.requestId = payload.id;
            if (payload.metadata?.offerId) vars.offerId = payload.metadata.offerId;
            vars.ref_offer_id = payload.id;
            deepLinkMsg = lang === 'UK' ? `💰 Перегляд пропозиції #${payload.id}` : `💰 Viewing Offer #${payload.id}`;
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
          const leadInput = mapLeadCreateInput({
            clientName: vars.name || vars.first_name || 'Client',
            phone: vars.phone,
            source: 'TELEGRAM',
            telegramChatId: session.chatId,
            status: 'NEW',
            language: vars.language
          });
          if (!leadInput.error) await prisma.lead.create({ data: leadInput.data });
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
          const deduped = external.filter(car => {
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
        const postText = text || (fallbackCar ? formatCarCaption(fallbackCar, lang) : '');

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
          delete vars.__activeScenarioId;
          delete vars.__currentNodeId;
          history.length = 0;
          await sendReplyKeyboard(bot, session.chatId, buildWelcomeMessage(bot, lang), buildMainMenuButtons(bot, lang));
        }
        break;
      }
    }
  }

  static async handleCarSelection(bot: BotRuntime, chatId: string, vars: Record<string, any>, carId: string) {
    const inventory = await prisma.carListing.findMany({ where: { id: carId } });
    const car = inventory[0];
    const leadInput = mapLeadCreateInput({
      clientName: vars.name || vars.first_name || `User ${chatId}`,
      phone: vars.phone,
      source: 'TELEGRAM',
      telegramChatId: chatId,
      goal: `Selected: ${car?.title || carId}`,
      status: 'NEW',
      language: vars.language
    });
    if (!leadInput.error) await prisma.lead.create({ data: leadInput.data });
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
        price: fromResults.price?.amount || 0,
        currency: fromResults.price?.currency || 'USD',
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
}
