import { ulid } from 'ulid';
import { emitPlatformEvent } from '../../../telegram/core/events/eventEmitter.js';
import { renderCarListingCard } from '../../../../../services/cardRenderer.js';
import { buildMiniAppUrl } from '../../../telegram/core/utils/miniappUrl.js';
import type { BotRuntime, ReplyKeyboardButton } from '../types.js';

export const normalizeTextCommand = (cmd: string) => cmd?.trim().toLowerCase() || '';
export const generatePublicId = () => ulid();
export const formatCarCaption = (car: any, lang: string) => renderCarListingCard(car, lang);

export const resolveMenuLink = (bot: BotRuntime, rawValue?: string) => {
  const raw = String(rawValue || '').trim();
  const isPlaceholder = raw === '{{MINI_APP_URL}}' || raw === '{MINI_APP_URL}';
  const isLegacy = raw.includes('t.me/cartie_bot/app');
  if (!raw || isPlaceholder || isLegacy) {
    const url = buildMiniAppUrl(bot as any, {});
    return url || raw;
  }
  return raw;
};

export const isMiniAppLink = (rawValue?: string) => {
  const raw = String(rawValue || '').trim();
  if (!raw) return false;
  if (raw === '{{MINI_APP_URL}}' || raw === '{MINI_APP_URL}') return true;
  return /\/p\/app\/|startapp=|\/app(\?|$)/i.test(raw);
};

export const extractNumber = (value: any) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const cleaned = String(value).replace(/[^\d.]/g, '');
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
};

export const extractYear = (value: any) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const match = String(value).match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : undefined;
};

export const normalizeRequestType = (value: any) => {
  const raw = String(value || '').toUpperCase();
  return raw === 'SELL' ? 'SELL' : 'BUY';
};

export const mapRequestOutput = (req: any) => ({
  ...req,
  budget: req.budgetMax,
  year: req.yearMin
});

export const hasContactInfo = (text: string) => {
  if (!text) return false;
  const phoneRe = /(\+?\d[\d\-\s]{6,}\d)/g;
  const linkRe = /(https?:\/\/|t\.me|wa\.me|@[\w_]+)/i;
  return phoneRe.test(text) || linkRe.test(text);
};

export const getLanguage = (vars: Record<string, any>) => {
  const raw = vars.language || vars.lang || 'UK';
  const up = String(raw).toUpperCase();
  if (up.startsWith('UK') || up.startsWith('UA')) return 'UK';
  if (up.startsWith('RU')) return 'RU';
  return 'UK';
};

export const getBotUsername = (bot: BotRuntime) => {
  const config = (bot.config || {}) as Record<string, any>;
  const raw = String(config.botUsername || config.username || '').trim();
  return raw.replace(/^@/, '');
};

export const normalizeOptionalText = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  if (['skip', 'пропустити', 'пропустить', '-', 'none', 'n/a', 'нема', 'немає'].includes(normalized)) {
    return undefined;
  }
  return raw;
};

export const normalizeMenuConfig = (menuConfig: any) => {
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
    welcomeMessage: menuConfig?.welcomeMessage || 'Меню:',
    buttons
  };
};

export const getMenuConfig = (bot: BotRuntime) => normalizeMenuConfig(bot.config?.menuConfig);

export const buildMainMenuButtons = (bot: BotRuntime, lang: string) => {
  const config = getMenuConfig(bot);
  const buttons: ReplyKeyboardButton[][] = [];
  const sorted = [...config.buttons].sort((a, b) => (a.row - b.row) || (a.col - b.col));
  const rows: Record<number, ReplyKeyboardButton[]> = {};

  sorted.forEach((btn: any) => {
    if (!rows[btn.row]) rows[btn.row] = [];
    const fallbackLabel = btn.label || btn.label_uk || btn.label_ru || '';
    const label = (lang === 'UK' && btn.label_uk) ? btn.label_uk :
      (lang === 'RU' && btn.label_ru) ? btn.label_ru : fallbackLabel;
    if (!label) return;
    const shouldWebApp = btn.type === 'WEB_APP' || (btn.type === 'LINK' && isMiniAppLink(btn.value));
    if (shouldWebApp) {
      const url = resolveMenuLink(bot, btn.value);
      if (url) {
        rows[btn.row].push({ text: label, web_app: { url } });
        return;
      }
    }
    rows[btn.row].push(label);
  });

  Object.keys(rows)
    .map(key => Number(key))
    .filter(key => Number.isFinite(key))
    .sort((a, b) => a - b)
    .forEach(key => buttons.push(rows[key]));
  return buttons;
};

export const buildWelcomeMessage = (bot: BotRuntime, lang: string, textOverride?: string) => {
  const config = getMenuConfig(bot);
  const text = textOverride || config.welcomeMessage || 'Головне меню:';
  if (text === '👋 Welcome to CarTié! Choose an option below:') {
    if (lang === 'UK') return '👋 Вітаємо в CarTié! Оберіть опцію нижче:';
    if (lang === 'RU') return '👋 Добро пожаловать в CarTié! Выберите опцию ниже:';
  }
  return text;
};

export const mapRequestForMessage = (req: any) => {
  const data = mapRequestOutput(req);
  const budgetMin = data.budgetMin > 0 ? data.budgetMin.toLocaleString() : '0';
  const budgetMax = data.budgetMax > 0 ? data.budgetMax.toLocaleString() : '∞';
  const requestId = data.publicId || data.id || '—';
  return [
    `📝 <b>Запит #${requestId}</b>`,
    `🚗 ${data.title}`,
    `💰 Бюджет: ${budgetMin}-${budgetMax} USD`,
    data.city ? `📍 Місто: ${data.city}` : '📍 Місто: —',
    data.yearMin ? `📅 Рік: ${data.yearMin}+` : '📅 Рік: —',
    data.description ? `📝 Коментар: ${data.description}` : null,
    '',
    'Натисніть кнопку нижче, якщо маєте варіант.'
  ].filter(Boolean).join('\n');
};

export const emitScenarioCompleted = async (
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
