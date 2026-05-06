import { SCENARIO_TEMPLATE_PACK } from '../seeds/scenarioPack.js';
import { prisma } from './prisma.js';
import fs from 'node:fs';

type BotTemplate = 'CLIENT_LEAD' | 'B2B' | 'CATALOG' | string;
export type PresetStatus = 'ready' | 'partial' | 'missing';

export const TEMPLATE_PRESET_VERSION = '2026.02.18-r9';

const LEGACY_LEAD_WELCOME_EN = '👋 Welcome to CarTié! Choose an option below:';
const LEGACY_B2B_WELCOME_EN = '🤝 CarDealer Lviv B2B\n\nCreate a structured request and get offers from partner dealers.';

type MenuButton = {
  id: string;
  label: string;
  label_uk?: string;
  label_ru?: string;
  type: 'SCENARIO' | 'LINK' | 'TEXT' | 'WEB_APP';
  value: string;
  row: number;
  col: number;
};

type MiniAppConfig = {
  isEnabled: boolean;
  surfaceMode?: 'LEAD' | 'B2B';
  title: string;
  welcomeText: string;
  primaryColor: string;
  accentColor?: string;
  layout: 'GRID' | 'LIST';
  actions: Array<{ id: string; label: string; icon: string; actionType: 'SCENARIO' | 'LINK' | 'VIEW'; value: string }>;
  navItems?: Array<{ id: string; label: string; icon?: string; actionType: 'SCENARIO' | 'LINK' | 'VIEW'; value: string }>;
  url?: string;
  showcaseSlug?: string;
  homeBlocks?: unknown[];
  contacts?: {
    telegramChannel?: string;
    telegramBot?: string;
    instagram?: string;
    website?: string;
    phone?: string;
    links?: Array<{ label: string; url: string }>;
  };
};

const coalesceText = (value: unknown, fallback: string) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
};

const mergeMiniAppConfig = (fallback: MiniAppConfig, existing: Partial<MiniAppConfig> | undefined): MiniAppConfig => {
  const source = (existing && typeof existing === 'object') ? existing : {};
  const layout = source.layout === 'LIST' || source.layout === 'GRID' ? source.layout : fallback.layout;
  const surfaceMode = source.surfaceMode === 'B2B' || source.surfaceMode === 'LEAD'
    ? source.surfaceMode
    : fallback.surfaceMode;

  return {
    ...fallback,
    ...source,
    surfaceMode,
    layout,
    title: coalesceText(source.title, fallback.title),
    welcomeText: coalesceText(source.welcomeText, fallback.welcomeText),
    primaryColor: coalesceText(source.primaryColor, fallback.primaryColor),
    accentColor: coalesceText(source.accentColor, fallback.accentColor || '#111111'),
    actions: fallback.actions,
    navItems: fallback.navItems || []
  };
};

type BotConfigShape = Record<string, any> & {
  menuConfig?: {
    welcomeMessage?: string;
    buttons?: MenuButton[];
  };
  miniAppConfig?: MiniAppConfig;
  publicBaseUrl?: string;
  defaultShowcaseSlug?: string;
  username?: string;
};

const DEFAULT_PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://cartie2.umanoff-analytics.space';
const readBuildMeta = (filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
};
const BUILD_SHA_RAW = String(process.env.BUILD_SHA || readBuildMeta('/app/server/BUILD_SHA') || '').trim();
const BUILD_TIME_RAW = String(process.env.BUILD_TIME || readBuildMeta('/app/server/BUILD_TIME') || '').trim();
const BUILD_TAG_SOURCE = (BUILD_SHA_RAW.includes('-dirty') && BUILD_TIME_RAW)
  ? `${BUILD_SHA_RAW}-${BUILD_TIME_RAW}`
  : (BUILD_SHA_RAW || BUILD_TIME_RAW || '');
const BUILD_TAG = BUILD_TAG_SOURCE.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);

const normalizeTemplate = (value: BotTemplate): 'CLIENT_LEAD' | 'B2B' | 'CATALOG' => {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'CLIENT_LEAD' || normalized === 'B2B' || normalized === 'CATALOG') return normalized;
  return 'CLIENT_LEAD';
};

const toKnownTemplate = (value: unknown): 'CLIENT_LEAD' | 'B2B' | 'CATALOG' | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'CLIENT_LEAD' || normalized === 'B2B' || normalized === 'CATALOG') return normalized;
  return null;
};

const sanitizeSlug = (value?: string | null) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/[^a-z0-9_-]/g, '').slice(0, 50);
};

const resolveBaseUrl = (raw?: string | null) => {
  const candidate = String(raw || '').trim();
  if (!candidate) return DEFAULT_PUBLIC_BASE_URL;
  try {
    const parsed = new URL(candidate);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return candidate.replace(/\/+$/, '');
  }
};

const buildMiniAppUrl = (baseUrl: string, slug: string) => {
  const raw = `${baseUrl.replace(/\/+$/, '')}/p/app/${slug}`;
  try {
    const url = new URL(raw);
    if (BUILD_TAG) {
      url.searchParams.set('v', BUILD_TAG);
    }
    return url.toString();
  } catch {
    return BUILD_TAG ? `${raw}?v=${BUILD_TAG}` : raw;
  }
};

const appendMiniAppQuery = (rawUrl: string, params: Record<string, string>) => {
  try {
    const url = new URL(rawUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (!value) return;
      url.searchParams.set(key, value);
    });
    return url.toString();
  } catch {
    return rawUrl;
  }
};

const LEAD_BUTTON_IDS = new Set([
  'btn_buy',
  'btn_pick',
  'btn_sell',
  'btn_stock',
  'btn_transit',
  'btn_favorites',
  'btn_support',
  'btn_info',
  'btn_app'
]);
const B2B_BUTTON_IDS = new Set([
  'btn_b2b_req',
  'btn_b2b_offer',
  'btn_b2b_app',
  'btn_b2b_help',
  'btn_b2b_menu',
  'btn_b2b_inv_my',
  'btn_b2b_inv_add',
  'btn_b2b_inv_price',
  'btn_b2b_inv_sold'
]);

const inferPresetTemplate = (config: BotConfigShape): 'CLIENT_LEAD' | 'B2B' | 'CATALOG' | null => {
  const explicit = toKnownTemplate((config as Record<string, any>)?.presetTemplate);
  if (explicit) return explicit;

  const buttons = Array.isArray(config.menuConfig?.buttons) ? config.menuConfig?.buttons : [];
  const ids = new Set(buttons.map(btn => String(btn?.id || '').trim()));
  const values = new Set(buttons.map(btn => String(btn?.value || '').trim().toLowerCase()));
  const miniTitle = String(config.miniAppConfig?.title || '').toLowerCase();
  const menuWelcome = String(config.menuConfig?.welcomeMessage || '').toLowerCase();

  let leadScore = 0;
  let b2bScore = 0;

  if (Array.from(LEAD_BUTTON_IDS).some(id => ids.has(id))) leadScore += 2;
  if (Array.from(B2B_BUTTON_IDS).some(id => ids.has(id))) b2bScore += 2;

  if (values.has('/request') || values.has('/offer') || values.has('/menu')) b2bScore += 1;
  if (values.has('/buy') || values.has('/sell') || values.has('/support') || values.has('/info')) leadScore += 1;

  if (miniTitle.includes('cardealer lviv') || menuWelcome.includes('cardealer lviv')) b2bScore += 1;
  if (miniTitle.includes('cartié premium') || menuWelcome.includes('concierge')) leadScore += 1;

  if (b2bScore > leadScore && b2bScore >= 2) return 'B2B';
  if (leadScore >= b2bScore && leadScore >= 2) return 'CLIENT_LEAD';
  return null;
};

const cloneMenu = (welcomeMessage: string, buttons: MenuButton[]): { welcomeMessage: string; buttons: MenuButton[] } => ({
  welcomeMessage,
  buttons: buttons.map(btn => ({ ...btn }))
});

const normalizeToken = (value?: string | null) => String(value || '').trim().toLowerCase();
const normalizeWelcome = (value?: string | null) => normalizeToken(value).replace(/\s+/g, ' ').trim();

const shouldReplaceLeadWelcome = (value?: string | null) => {
  const token = normalizeWelcome(value);
  if (!token) return true;
  if (token === normalizeWelcome(LEGACY_LEAD_WELCOME_EN)) return true;
  return token.includes('welcome to cartie') || token.includes('choose an option');
};

const shouldReplaceB2BWelcome = (value?: string | null) => {
  const token = normalizeWelcome(value);
  if (!token) return true;
  if (token === normalizeWelcome(LEGACY_B2B_WELCOME_EN)) return true;
  return token.includes('cardealer lviv b2b') || token.includes('create a structured request');
};

const mergePresetButtons = (existingButtons: MenuButton[] | undefined, requiredButtons: MenuButton[]) => {
  const allowedTypes = new Set(['SCENARIO', 'LINK', 'TEXT', 'WEB_APP']);
  const existing = Array.isArray(existingButtons)
    ? existingButtons
      .filter((btn): btn is MenuButton => Boolean(btn && typeof btn === 'object'))
      .filter((btn) => allowedTypes.has(String(btn.type || '').toUpperCase()))
      .map((btn, idx) => ({ ...btn, id: btn.id || `custom_${idx}` }))
    : [];

  const used = new Set<number>();

  const mergedRequired = requiredButtons.map(req => {
    const reqValue = normalizeToken(req.value);
    const reqLabel = normalizeToken(req.label_uk || req.label);

    const idx = existing.findIndex((btn, i) => {
      if (used.has(i)) return false;
      const idMatch = normalizeToken(btn.id) === normalizeToken(req.id);
      const valueMatch = reqValue && normalizeToken(btn.value) === reqValue;
      const labelMatch = reqLabel && [btn.label, btn.label_uk, btn.label_ru].some(label => normalizeToken(label) === reqLabel);
      return idMatch || valueMatch || labelMatch;
    });

    if (idx === -1) return { ...req };

    used.add(idx);
    const src = existing[idx];
    return {
      ...src,
      id: req.id,
      type: req.type,
      value: req.value,
      row: req.row,
      col: req.col,
      label: src.label || req.label,
      label_uk: src.label_uk || req.label_uk,
      label_ru: src.label_ru || req.label_ru
    } as MenuButton;
  });

  const extras = existing.filter((_, idx) => !used.has(idx));
  return [...mergedRequired, ...extras].sort((a, b) => (a.row - b.row) || (a.col - b.col));
};

const buildClientLeadMiniAppConfig = (url: string, showcaseSlug: string): MiniAppConfig => ({
  isEnabled: true,
  surfaceMode: 'LEAD',
  title: 'CarTié Premium',
  welcomeText: 'Ваш персональний помічник з підбору авто.',
  primaryColor: '#D4AF37',
  accentColor: '#111111',
  layout: 'GRID',
  actions: [
    { id: 'act_stock', label: 'Каталог авто', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY_STOCK' },
    { id: 'act_pick', label: 'Підбір за параметрами', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
    { id: 'act_transit', label: 'Авто в дорозі', icon: 'Zap', actionType: 'VIEW', value: 'INVENTORY_TRANSIT' },
    { id: 'act_contacts', label: 'Звʼязатися', icon: 'MessageCircle', actionType: 'VIEW', value: 'CONTACTS' }
  ],
  navItems: [
    { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
    { id: 'nav_stock', label: 'Каталог', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
    { id: 'nav_request', label: 'Заявки', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
    { id: 'nav_contacts', label: 'Контакти', icon: 'MessageCircle', actionType: 'VIEW', value: 'CONTACTS' },
    { id: 'nav_profile', label: 'Профіль', icon: 'User', actionType: 'VIEW', value: 'PROFILE' }
  ],
  url,
  showcaseSlug
});

const buildB2BMiniAppConfig = (url: string, showcaseSlug: string): MiniAppConfig => ({
  isEnabled: true,
  surfaceMode: 'B2B',
  title: 'CarDealer Lviv B2B',
  welcomeText: 'Інвентар партнерів та статуси B2B-запитів у реальному часі.',
  primaryColor: '#C9CDD3',
  accentColor: '#15181C',
  layout: 'GRID',
  actions: [
    { id: 'act_deals', label: 'Мої угоди (B2B)', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' },
    { id: 'act_stock', label: 'Склад (B2B)', icon: 'Grid', actionType: 'VIEW', value: 'INVENTORY' },
    { id: 'act_leads', label: 'Нові ліди', icon: 'Zap', actionType: 'VIEW', value: 'STATUS' },
    { id: 'act_support', label: 'Підтримка', icon: 'MessageCircle', actionType: 'VIEW', value: 'SUPPORT' }
  ],
  navItems: [
    { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
    { id: 'nav_deals', label: 'Угоди', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' },
    { id: 'nav_stock', label: 'Склад', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
    { id: 'nav_support', label: 'Підтримка', icon: 'MessageCircle', actionType: 'VIEW', value: 'SUPPORT' },
    { id: 'nav_profile', label: 'Профіль', icon: 'User', actionType: 'VIEW', value: 'PROFILE' }
  ],
  url,
  showcaseSlug
});

const baseLeadButtons = (scenarioIds: Record<string, string>, miniAppUrl: string): MenuButton[] => [
  { id: 'btn_pick', label: '⏱ Підібрати авто за 1 хвилину', label_uk: '⏱ Підібрати авто за 1 хвилину', label_ru: '⏱ Підібрати авто за 1 хвилину', type: 'WEB_APP', value: appendMiniAppQuery(miniAppUrl, { entry: 'request', type: 'BUY' }), row: 0, col: 0 },
  { id: 'btn_sell', label: '💰 Продати своє авто', label_uk: '💰 Продати своє авто', label_ru: '💰 Продати своє авто', type: 'SCENARIO', value: scenarioIds.sell || 'sell', row: 0, col: 1 },
  { id: 'btn_stock', label: '🚘 Авто в наявності', label_uk: '🚘 Авто в наявності', label_ru: '🚘 Авто в наявності', type: 'WEB_APP', value: appendMiniAppQuery(miniAppUrl, { entry: 'inventory', status: 'AVAILABLE' }), row: 1, col: 0 },
  { id: 'btn_transit', label: '🚚 Авто в дорозі', label_uk: '🚚 Авто в дорозі', label_ru: '🚚 Авто в дорозі', type: 'WEB_APP', value: appendMiniAppQuery(miniAppUrl, { entry: 'inventory', status: 'PENDING' }), row: 1, col: 1 },
  { id: 'btn_favorites', label: '⭐ Обране', label_uk: '⭐ Обране', label_ru: '⭐ Избранное', type: 'WEB_APP', value: appendMiniAppQuery(miniAppUrl, { entry: 'favorites' }), row: 2, col: 0 },
  { id: 'btn_support', label: '🆘 Підтримка', label_uk: '🆘 Підтримка', label_ru: '🆘 Підтримка', type: 'WEB_APP', value: appendMiniAppQuery(miniAppUrl, { entry: 'support' }), row: 2, col: 1 }
];

const baseB2BButtons = (scenarioIds: Record<string, string>, _miniAppUrl: string): MenuButton[] => [
  { id: 'btn_b2b_inv_my', label: '🚘 Мій інвентар', label_uk: '🚘 Мій інвентар', label_ru: '🚘 Мій інвентар', type: 'SCENARIO', value: scenarioIds.inv_my || 'scn_b2b_inv_my', row: 0, col: 0 },
  { id: 'btn_b2b_inv_add', label: '➕ Додати авто', label_uk: '➕ Додати авто', label_ru: '➕ Додати авто', type: 'SCENARIO', value: scenarioIds.inv_add || 'scn_b2b_inv_add', row: 0, col: 1 },
  { id: 'btn_b2b_inv_price', label: '💲 Змінити ціну', label_uk: '💲 Змінити ціну', label_ru: '💲 Змінити ціну', type: 'SCENARIO', value: scenarioIds.inv_price || 'scn_b2b_inv_price', row: 1, col: 0 },
  { id: 'btn_b2b_inv_sold', label: '✅ Позначити продано', label_uk: '✅ Позначити продано', label_ru: '✅ Позначити продано', type: 'SCENARIO', value: scenarioIds.inv_sold || 'scn_b2b_inv_sold', row: 1, col: 1 },
  { id: 'btn_b2b_help', label: 'ℹ️ Інформація / Правила', label_uk: 'ℹ️ Інформація / Правила', label_ru: 'ℹ️ Інформація / Правила', type: 'SCENARIO', value: scenarioIds.help || 'scn_b2b_help', row: 2, col: 0 }
];

const maybePatchMenuLinks = (buttons: MenuButton[] | undefined, miniAppUrl: string): MenuButton[] => {
  const list = Array.isArray(buttons) ? buttons : [];
  return list.map(btn => {
    if (btn.type !== 'WEB_APP' && btn.type !== 'LINK') {
      return btn;
    }

    const rawValue = String(btn.value || '').trim();
    if (!rawValue || rawValue === '{{MINI_APP_URL}}') {
      return { ...btn, value: miniAppUrl };
    }

    if (/\/p\/app\//.test(rawValue)) {
      try {
        const source = new URL(rawValue);
        const next = new URL(miniAppUrl);
        source.searchParams.forEach((value, key) => {
          if (key === 'v' && next.searchParams.has('v')) return;
          next.searchParams.set(key, value);
        });
        return { ...btn, value: next.toString() };
      } catch {
        return { ...btn, value: miniAppUrl };
      }
    }

    return btn;
  });
};

const clientLeadScenarioSpecs = [
  { key: 'buy', templateId: 'tpl_buy_request', triggerCommand: 'buy' },
  { key: 'sell', templateId: 'tpl_sell_tradein', triggerCommand: 'sell' },
  { key: 'support', templateId: 'tpl_status_support', triggerCommand: 'support' },
  { key: 'info', templateId: 'tpl_info_rules', triggerCommand: 'info' }
] as const;

const b2bScenarioBlueprints = [
  {
    key: 'request',
    triggerCommand: 'request',
    name: 'B2B Запит',
    keywords: ['request', 'запит', 'заявка', 'car request'],
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'intro' },
      {
        id: 'intro',
        type: 'MESSAGE',
        content: {
          text: 'Створіть структурований запит на авто для партнерської мережі.',
          text_uk: 'Створіть структурований запит на авто для партнерської мережі.',
          text_ru: 'Створіть структурований запит на авто для партнерської мережі.'
        },
        nextNodeId: 'ask_title'
      },
      {
        id: 'ask_title',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Марка / модель?',
          text_uk: 'Марка / модель?',
          text_ru: 'Марка / модель?',
          variableName: 'requestTitle'
        },
        nextNodeId: 'ask_year'
      },
      {
        id: 'ask_year',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Бажаний рік (наприклад 2018+ або 2018-2021, напишіть "пропустити" для пропуску)',
          text_uk: 'Бажаний рік (наприклад 2018+ або 2018-2021, напишіть "пропустити" для пропуску)',
          text_ru: 'Бажаний рік (наприклад 2018+ або 2018-2021, напишіть "пропустити" для пропуску)',
          variableName: 'year'
        },
        nextNodeId: 'ask_budget'
      },
      {
        id: 'ask_budget',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Бюджет USD (наприклад 15000-25000, напишіть "пропустити" для пропуску)',
          text_uk: 'Бюджет USD (наприклад 15000-25000, напишіть "пропустити" для пропуску)',
          text_ru: 'Бюджет USD (наприклад 15000-25000, напишіть "пропустити" для пропуску)',
          variableName: 'budget'
        },
        nextNodeId: 'ask_mileage'
      },
      {
        id: 'ask_mileage',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Бажаний пробіг (напишіть "пропустити" для пропуску)',
          text_uk: 'Бажаний пробіг (напишіть "пропустити" для пропуску)',
          text_ru: 'Бажаний пробіг (напишіть "пропустити" для пропуску)',
          variableName: 'mileageText'
        },
        nextNodeId: 'ask_fuel'
      },
      {
        id: 'ask_fuel',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Тип пального (напишіть "пропустити" для пропуску)',
          text_uk: 'Тип пального (напишіть "пропустити" для пропуску)',
          text_ru: 'Тип пального (напишіть "пропустити" для пропуску)',
          variableName: 'fuel'
        },
        nextNodeId: 'ask_comment'
      },
      {
        id: 'ask_comment',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Коментар / примітка (напишіть "пропустити" для пропуску)',
          text_uk: 'Коментар / примітка (напишіть "пропустити" для пропуску)',
          text_ru: 'Коментар / примітка (напишіть "пропустити" для пропуску)',
          variableName: 'requestComment'
        },
        nextNodeId: 'ask_contact'
      },
      {
        id: 'ask_contact',
        type: 'REQUEST_CONTACT',
        content: {
          text: 'Поділіться контактом або введіть номер телефону',
          text_uk: 'Поділіться контактом або введіть номер телефону',
          text_ru: 'Поділіться контактом або введіть номер телефону'
        },
        nextNodeId: 'ask_company'
      },
      {
        id: 'ask_company',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Назва компанії (напишіть "пропустити" для пропуску)',
          text_uk: 'Назва компанії (напишіть "пропустити" для пропуску)',
          text_ru: 'Назва компанії (напишіть "пропустити" для пропуску)',
          variableName: 'companyName'
        },
        nextNodeId: 'normalize'
      },
      { id: 'normalize', type: 'ACTION', content: { actionType: 'NORMALIZE_REQUEST' }, nextNodeId: 'create_request' },
      {
        id: 'create_request',
        type: 'ACTION',
        content: { actionType: 'CREATE_REQUEST', requestType: 'BUY', requestStatus: 'COLLECTING_VARIANTS' },
        nextNodeId: 'publish_channel'
      },
      { id: 'publish_channel', type: 'ACTION', content: { actionType: 'B2B_PUBLISH_REQUEST' }, nextNodeId: 'done' },
      {
        id: 'done',
        type: 'MESSAGE',
        content: {
          text: '✅ Запит створено та опубліковано в каналі.',
          text_uk: '✅ Запит створено та опубліковано в каналі.',
          text_ru: '✅ Запит створено та опубліковано в каналі.'
        }
      }
    ]
  },
  {
    key: 'offer',
    triggerCommand: 'offer',
    name: 'B2B Подання варіанту',
    keywords: ['offer', 'є авто', 'варіант', 'подати варіант', 'имею авто'],
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'intro' },
      {
        id: 'intro',
        type: 'MESSAGE',
        content: {
          text: 'Подайте свій варіант для запиту. Якщо відкрили з deep-link каналу, запит уже підставлено.',
          text_uk: 'Подайте свій варіант для запиту. Якщо відкрили з deep-link каналу, запит уже підставлено.',
          text_ru: 'Подайте свій варіант для запиту. Якщо відкрили з deep-link каналу, запит уже підставлено.'
        },
        nextNodeId: 'ask_title'
      },
      {
        id: 'ask_title',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Марка / модель',
          text_uk: 'Марка / модель',
          text_ru: 'Марка / модель',
          variableName: 'offerTitle'
        },
        nextNodeId: 'ask_year'
      },
      {
        id: 'ask_year',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Рік (або "пропустити")',
          text_uk: 'Рік (або "пропустити")',
          text_ru: 'Рік (або "пропустити")',
          variableName: 'offerYear'
        },
        nextNodeId: 'ask_price'
      },
      {
        id: 'ask_price',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Ціна і валюта (наприклад 18500 USD)',
          text_uk: 'Ціна і валюта (наприклад 18500 USD)',
          text_ru: 'Ціна і валюта (наприклад 18500 USD)',
          variableName: 'offerPrice'
        },
        nextNodeId: 'ask_mileage'
      },
      {
        id: 'ask_mileage',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Пробіг (або "пропустити")',
          text_uk: 'Пробіг (або "пропустити")',
          text_ru: 'Пробіг (або "пропустити")',
          variableName: 'offerMileage'
        },
        nextNodeId: 'ask_fuel'
      },
      {
        id: 'ask_fuel',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Тип пального (або "пропустити")',
          text_uk: 'Тип пального (або "пропустити")',
          text_ru: 'Тип пального (або "пропустити")',
          variableName: 'offerFuel'
        },
        nextNodeId: 'ask_condition'
      },
      {
        id: 'ask_condition',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Технічний стан (або "пропустити")',
          text_uk: 'Технічний стан (або "пропустити")',
          text_ru: 'Технічний стан (або "пропустити")',
          variableName: 'offerCondition'
        },
        nextNodeId: 'ask_vin'
      },
      {
        id: 'ask_vin',
        type: 'QUESTION_TEXT',
        content: {
          text: 'VIN (або "пропустити")',
          text_uk: 'VIN (або "пропустити")',
          text_ru: 'VIN (або "пропустити")',
          variableName: 'offerVin'
        },
        nextNodeId: 'ask_comment'
      },
      {
        id: 'ask_comment',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Коментар / примітка без контактів',
          text_uk: 'Коментар / примітка без контактів',
          text_ru: 'Коментар / примітка без контактів',
          variableName: 'offerComment'
        },
        nextNodeId: 'ask_contact'
      },
      {
        id: 'ask_contact',
        type: 'REQUEST_CONTACT',
        content: {
          text: 'Поділіться контактом або введіть номер телефону',
          text_uk: 'Поділіться контактом або введіть номер телефону',
          text_ru: 'Поділіться контактом або введіть номер телефону'
        },
        nextNodeId: 'ask_company'
      },
      {
        id: 'ask_company',
        type: 'QUESTION_TEXT',
        content: {
          text: 'Назва компанії (або "пропустити")',
          text_uk: 'Назва компанії (або "пропустити")',
          text_ru: 'Назва компанії (або "пропустити")',
          variableName: 'offerCompanyName'
        },
        nextNodeId: 'ask_photos'
      },
      {
        id: 'ask_photos',
        type: 'QUESTION_PHOTO',
        content: {
          text: 'Надішліть фото (до 8). Коли завершите — напишіть "готово".',
          text_uk: 'Надішліть фото (до 8). Коли завершите — напишіть "готово".',
          text_ru: 'Надішліть фото (до 8). Коли завершите — напишіть "готово".',
          variableName: 'offerPhotos',
          allowMultiple: true,
          allowEmpty: false,
          maxCount: 8
        },
        nextNodeId: 'create_offer'
      },
      {
        id: 'create_offer',
        type: 'ACTION',
        content: { actionType: 'CREATE_VARIANT' },
        nextNodeId: 'done'
      },
      {
        id: 'done',
        type: 'MESSAGE',
        content: {
          text: '✅ Варіант надіслано. Автор запиту перегляне, а адмін отримає "Підходить".',
          text_uk: '✅ Варіант надіслано. Автор запиту перегляне, а адмін отримає "Підходить".',
          text_ru: '✅ Варіант надіслано. Автор запиту перегляне, а адмін отримає "Підходить".'
        }
      }
    ]
  },
  {
    key: 'help',
    triggerCommand: 'help',
    name: 'B2B Правила',
    keywords: ['help', 'правила', 'rules', 'menu'],
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'rules' },
      {
        id: 'rules',
        type: 'MESSAGE',
        content: {
          text: 'Правила B2B:\n1) Запити тільки через бота\n2) Відповіді тільки через кнопку "Є авто"\n3) Контакти в каналі приховані та передаються лише адміну',
          text_uk: 'Правила B2B:\n1) Запити тільки через бота\n2) Відповіді тільки через кнопку "Є авто"\n3) Контакти в каналі приховані та передаються лише адміну',
          text_ru: 'Правила B2B:\n1) Запити тільки через бота\n2) Відповіді тільки через кнопку "Є авто"\n3) Контакти в каналі приховані та передаються лише адміну'
        }
      }
    ]
  },
  {
    key: 'inv_my',
    triggerCommand: 'inventory_my',
    name: 'B2B Мій інвентар',
    keywords: ['інвентар', 'мій інвентар', 'inventory'],
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'run' },
      { id: 'run', type: 'ACTION', content: { actionType: 'START_B2B_INVENTORY_MY' } }
    ]
  },
  {
    key: 'inv_add',
    triggerCommand: 'inventory_add',
    name: 'B2B Додати авто',
    keywords: ['додати авто', 'add inventory'],
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'run' },
      { id: 'run', type: 'ACTION', content: { actionType: 'START_B2B_INVENTORY_ADD' } }
    ]
  },
  {
    key: 'inv_price',
    triggerCommand: 'inventory_price',
    name: 'B2B Змінити ціну',
    keywords: ['змінити ціну', 'price update'],
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'run' },
      { id: 'run', type: 'ACTION', content: { actionType: 'START_B2B_INVENTORY_PRICE' } }
    ]
  },
  {
    key: 'inv_sold',
    triggerCommand: 'inventory_sold',
    name: 'B2B Позначити продано',
    keywords: ['продано', 'mark sold'],
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'run' },
      { id: 'run', type: 'ACTION', content: { actionType: 'START_B2B_INVENTORY_SOLD' } }
    ]
  }
] as const;

const resolveTemplateStructure = (templateId: string) => {
  const tpl = SCENARIO_TEMPLATE_PACK.find(item => item.id === templateId);
  const structure = (tpl?.structure || {}) as any;
  const nodes = Array.isArray(structure.nodes) ? structure.nodes : [];
  const entryNodeId = structure.entryNodeId || nodes[0]?.id || 'start';
  const keywords = Array.isArray(structure.keywords) ? structure.keywords : [];
  const triggerCommand = structure.triggerCommand || '';
  return {
    name: tpl?.name || templateId,
    triggerCommand,
    keywords,
    entryNodeId,
    nodes
  };
};

const ensureClientLeadScenarios = async (companyId: string, forcePreset: boolean, botId?: string | null) => {
  const scenarioIds: Record<string, string> = {};

  for (const spec of clientLeadScenarioSpecs) {
    const defaults = resolveTemplateStructure(spec.templateId);
    const where: any = {
      companyId,
      triggerCommand: spec.triggerCommand
    };
    if (botId) where.botId = botId;

    const existing = await prisma.scenario.findFirst({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    if (existing) {
      scenarioIds[spec.key] = existing.id;
      if (forcePreset) {
        await prisma.scenario.update({
          where: { id: existing.id },
          data: {
            name: defaults.name,
            triggerCommand: defaults.triggerCommand || spec.triggerCommand,
            keywords: defaults.keywords,
            isActive: true,
            status: 'PUBLISHED',
            entryNodeId: defaults.entryNodeId,
            nodes: defaults.nodes,
            ...(botId ? { botId } : {})
          }
        });
      } else if (!existing.isActive || existing.status !== 'PUBLISHED') {
        await prisma.scenario.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            status: 'PUBLISHED'
          }
        });
      }
      continue;
    }

    const created = await prisma.scenario.create({
      data: {
        name: defaults.name,
        triggerCommand: defaults.triggerCommand || spec.triggerCommand,
        keywords: defaults.keywords,
        isActive: true,
        status: 'PUBLISHED',
        entryNodeId: defaults.entryNodeId,
        nodes: defaults.nodes,
        companyId,
        ...(botId ? { botId } : {})
      }
    });
    scenarioIds[spec.key] = created.id;
  }

  return scenarioIds;
};

const ensureB2BScenarios = async (companyId: string, forcePreset: boolean, botId?: string | null) => {
  const scenarioIds: Record<string, string> = {};

  for (const spec of b2bScenarioBlueprints) {
    const where: any = {
      companyId,
      triggerCommand: spec.triggerCommand
    };
    if (botId) where.botId = botId;

    const existing = await prisma.scenario.findFirst({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    if (existing) {
      scenarioIds[spec.key] = existing.id;
      if (forcePreset) {
        await prisma.scenario.update({
          where: { id: existing.id },
          data: {
            name: spec.name,
            triggerCommand: spec.triggerCommand,
            keywords: [...spec.keywords],
            isActive: true,
            status: 'PUBLISHED',
            entryNodeId: spec.entryNodeId,
            nodes: spec.nodes as any,
            ...(botId ? { botId } : {})
          }
        });
      } else if (!existing.isActive || existing.status !== 'PUBLISHED') {
        await prisma.scenario.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            status: 'PUBLISHED'
          }
        });
      }
      continue;
    }

    const created = await prisma.scenario.create({
      data: {
        name: spec.name,
        triggerCommand: spec.triggerCommand,
        keywords: [...spec.keywords],
        isActive: true,
        status: 'PUBLISHED',
        entryNodeId: spec.entryNodeId,
        nodes: spec.nodes as any,
        companyId,
        ...(botId ? { botId } : {})
      }
    });
    scenarioIds[spec.key] = created.id;
  }

  return scenarioIds;
};

const disableConflictingTemplateCommands = async (
  companyId: string,
  botId: string | null | undefined,
  disallowedCommands: string[]
) => {
  if (!botId || disallowedCommands.length === 0) return;
  await prisma.scenario.updateMany({
    where: {
      companyId,
      botId,
      isActive: true,
      triggerCommand: { in: disallowedCommands }
    },
    data: { isActive: false }
  });
};

export const getTemplatePresetStatus = async (input: {
  template: BotTemplate;
  companyId: string;
  botId?: string | null;
  config?: BotConfigShape | null;
  channelId?: string | null;
  adminChatId?: string | null;
}): Promise<PresetStatus> => {
  const template = normalizeTemplate(input.template);
  const config = (input.config || {}) as BotConfigShape;
  const menuButtons = Array.isArray(config.menuConfig?.buttons) ? config.menuConfig?.buttons : [];
  const mini = config.miniAppConfig;
  const hasMini = Boolean(mini?.isEnabled && mini?.url && (mini?.navItems?.length || mini?.actions?.length));

  if (template === 'CLIENT_LEAD') {
    const required = new Set(clientLeadScenarioSpecs.map(spec => spec.triggerCommand));
    const available = await prisma.scenario.findMany({
      where: {
        companyId: input.companyId,
        ...(input.botId ? { botId: input.botId } : {}),
        isActive: true,
        status: 'PUBLISHED',
        triggerCommand: { in: Array.from(required) }
      },
      select: { triggerCommand: true }
    });
    const commandSet = new Set(available.map(s => s.triggerCommand || '').filter(Boolean));
    const hasScenarios = Array.from(required).every(cmd => commandSet.has(cmd));
    const requiredButtonIds = ['btn_pick', 'btn_sell', 'btn_stock', 'btn_transit', 'btn_favorites', 'btn_support'];
    const buttonIds = new Set(menuButtons.map(btn => String(btn.id || '').trim()));
    const hasMenu = requiredButtonIds.every(id => buttonIds.has(id));
    const score = [hasScenarios, hasMenu, hasMini].filter(Boolean).length;
    if (score === 3) return 'ready';
    if (score === 0) return 'missing';
    return 'partial';
  }

  if (template === 'B2B') {
    const values = new Set(menuButtons.map(btn => String(btn.value || '').trim().toLowerCase()));
    const scenarioButtons = menuButtons.filter(btn => btn.type === 'SCENARIO');
    const hasInventoryMy = scenarioButtons.some(btn => btn.id === 'btn_b2b_inv_my');
    const hasInventoryAdd = scenarioButtons.some(btn => btn.id === 'btn_b2b_inv_add');
    const hasInventoryPrice = scenarioButtons.some(btn => btn.id === 'btn_b2b_inv_price');
    const hasInventorySold = scenarioButtons.some(btn => btn.id === 'btn_b2b_inv_sold');
    const hasHelpEntry = scenarioButtons.some(btn => btn.id === 'btn_b2b_help');
    const hasMenu = hasInventoryMy && hasInventoryAdd && hasInventoryPrice && hasInventorySold && hasHelpEntry;
    const required = ['request', 'offer', 'help', 'inventory_my', 'inventory_add', 'inventory_price', 'inventory_sold'];
    const available = await prisma.scenario.findMany({
      where: {
        companyId: input.companyId,
        ...(input.botId ? { botId: input.botId } : {}),
        isActive: true,
        status: 'PUBLISHED',
        triggerCommand: { in: required }
      },
      select: { triggerCommand: true }
    });
    const commandSet = new Set(available.map(item => String(item.triggerCommand || '').toLowerCase()));
    const hasCommands = commandSet.has('request') && commandSet.has('offer');
    const hasScenarios = required.every(cmd => commandSet.has(cmd));
    const hasAdmin = Boolean(String(input.adminChatId || '').trim());
    const hasChannel = Boolean(String(input.channelId || '').trim());
    if (hasMenu && hasCommands && hasMini && hasAdmin && hasChannel && hasScenarios) return 'ready';
    const score = [hasMenu, hasCommands, hasMini, hasAdmin, hasChannel, hasScenarios].filter(Boolean).length;
    if (score === 0) return 'missing';
    return 'partial';
  }

  const hasMenu = menuButtons.length > 0;
  if (hasMenu && hasMini) return 'ready';
  if (!hasMenu && !hasMini) return 'missing';
  return 'partial';
};

export const applyTemplatePreset = async (input: {
  template: BotTemplate;
  companyId: string;
  botId?: string | null;
  config?: BotConfigShape | null;
  defaultShowcaseSlug?: string | null;
  fallbackName?: string | null;
  applyPreset?: boolean;
  forcePreset?: boolean;
  channelId?: string | null;
  adminChatId?: string | null;
}): Promise<{
  config: BotConfigShape;
  presetStatus: PresetStatus;
  presetVersion: string;
  showcaseSlug: string;
  miniAppUrl: string;
}> => {
  const template = normalizeTemplate(input.template);
  const applyPreset = input.applyPreset !== false;
  const forcePreset = input.forcePreset === true;
  const config: BotConfigShape = { ...(input.config || {}) };
  const previousPresetTemplate = inferPresetTemplate(config);
  const shouldHardReplacePreset = forcePreset || Boolean(previousPresetTemplate && previousPresetTemplate !== template);

  const fallbackSlug = sanitizeSlug(input.defaultShowcaseSlug) || sanitizeSlug(config.defaultShowcaseSlug) || sanitizeSlug(config.botUsername) || sanitizeSlug(config.username) || sanitizeSlug(input.fallbackName) || 'system';
  const baseUrl = resolveBaseUrl(config.publicBaseUrl);
  const miniAppUrl = buildMiniAppUrl(baseUrl, fallbackSlug);

  config.defaultShowcaseSlug = fallbackSlug;
  config.publicBaseUrl = baseUrl;

  if (template === 'CLIENT_LEAD' && applyPreset) {
    await disableConflictingTemplateCommands(input.companyId, input.botId, ['request', 'offer', 'help']);
    const scenarioIds = await ensureClientLeadScenarios(input.companyId, forcePreset, input.botId);

    const fallbackMenu = cloneMenu(
      "👋 Вітаємо в CarTié Concierge!\n\nМи допоможемо з підбором та продажем авто.\nОберіть дію нижче.",
      baseLeadButtons(scenarioIds, miniAppUrl)
    );
    const existingButtons = Array.isArray(config.menuConfig?.buttons) ? config.menuConfig.buttons : [];
    if (shouldHardReplacePreset || existingButtons.length === 0) {
      config.menuConfig = fallbackMenu;
    } else {
      const existingWelcome = String(config.menuConfig?.welcomeMessage || '').trim();
      const shouldResetWelcome = shouldReplaceLeadWelcome(existingWelcome);
      config.menuConfig = {
        welcomeMessage: shouldResetWelcome ? fallbackMenu.welcomeMessage : existingWelcome,
        buttons: maybePatchMenuLinks(mergePresetButtons(existingButtons, fallbackMenu.buttons), miniAppUrl)
      };
    }

    const fallbackMini = buildClientLeadMiniAppConfig(miniAppUrl, fallbackSlug);
    if (shouldHardReplacePreset || !config.miniAppConfig) {
      config.miniAppConfig = fallbackMini;
    } else {
      config.miniAppConfig = {
        ...mergeMiniAppConfig(fallbackMini, config.miniAppConfig || {}),
        url: miniAppUrl,
        showcaseSlug: fallbackSlug
      };
    }
  }

  if (template === 'B2B' && applyPreset) {
    await disableConflictingTemplateCommands(input.companyId, input.botId, ['buy', 'sell', 'status', 'lang', 'lead', 'support']);
    const scenarioIds = await ensureB2BScenarios(input.companyId, forcePreset, input.botId);
    const fallbackMenu = cloneMenu(
      "🤝 CarDealer Lviv B2B\n\nКеруйте партнерським інвентарем, оновлюйте ціни та позначайте продані авто.",
      baseB2BButtons(scenarioIds, miniAppUrl)
    );
    const existingButtons = Array.isArray(config.menuConfig?.buttons) ? config.menuConfig.buttons : [];
    if (shouldHardReplacePreset || existingButtons.length === 0) {
      config.menuConfig = fallbackMenu;
    } else {
      const existingWelcome = String(config.menuConfig?.welcomeMessage || '').trim();
      const shouldResetWelcome = shouldReplaceB2BWelcome(existingWelcome);
      config.menuConfig = {
        welcomeMessage: shouldResetWelcome ? fallbackMenu.welcomeMessage : existingWelcome,
        buttons: maybePatchMenuLinks(mergePresetButtons(existingButtons, fallbackMenu.buttons), miniAppUrl)
      };
    }

    const fallbackMini = buildB2BMiniAppConfig(miniAppUrl, fallbackSlug);
    if (shouldHardReplacePreset || !config.miniAppConfig) {
      config.miniAppConfig = fallbackMini;
    } else {
      config.miniAppConfig = {
        ...mergeMiniAppConfig(fallbackMini, config.miniAppConfig || {}),
        url: miniAppUrl,
        showcaseSlug: fallbackSlug
      };
    }
  }

  const canonicalUsername = sanitizeSlug(config.botUsername || config.username);
  if (canonicalUsername) {
    config.botUsername = canonicalUsername;
    config.username = canonicalUsername;
  }

  if (applyPreset) {
    config.presetTemplate = template;
  }

  const presetStatus = await getTemplatePresetStatus({
    template,
    companyId: input.companyId,
    botId: input.botId,
    config,
    channelId: input.channelId,
    adminChatId: input.adminChatId
  });

  config.presetStatus = presetStatus;
  config.presetVersion = TEMPLATE_PRESET_VERSION;

  return {
    config,
    presetStatus,
    presetVersion: TEMPLATE_PRESET_VERSION,
    showcaseSlug: fallbackSlug,
    miniAppUrl
  };
};
