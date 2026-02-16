import { SCENARIO_TEMPLATE_PACK } from '../seeds/scenarioPack.js';
import { prisma } from './prisma.js';

type BotTemplate = 'CLIENT_LEAD' | 'B2B' | 'CATALOG' | string;
export type PresetStatus = 'ready' | 'partial' | 'missing';

export const TEMPLATE_PRESET_VERSION = '2026.02.16-r1';

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
const BUILD_TAG = (process.env.BUILD_SHA || 'dev').slice(0, 12);

const normalizeTemplate = (value: BotTemplate): 'CLIENT_LEAD' | 'B2B' | 'CATALOG' => {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'CLIENT_LEAD' || normalized === 'B2B' || normalized === 'CATALOG') return normalized;
  return 'CLIENT_LEAD';
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

const buildMiniAppUrl = (baseUrl: string, slug: string) => `${baseUrl.replace(/\/+$/, '')}/p/app/${slug}?v=${BUILD_TAG}`;

const cloneMenu = (welcomeMessage: string, buttons: MenuButton[]): { welcomeMessage: string; buttons: MenuButton[] } => ({
  welcomeMessage,
  buttons: buttons.map(btn => ({ ...btn }))
});

const buildClientLeadMiniAppConfig = (url: string, showcaseSlug: string): MiniAppConfig => ({
  isEnabled: true,
  title: 'CarTié Premium',
  welcomeText: 'Your personal automotive concierge.',
  primaryColor: '#D4AF37',
  accentColor: '#111111',
  layout: 'GRID',
  actions: [
    { id: 'act_stock', label: 'Stock', icon: 'Grid', actionType: 'VIEW', value: 'INVENTORY' },
    { id: 'act_req', label: 'Request', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
    { id: 'act_chat', label: 'Chat', icon: 'MessageCircle', actionType: 'LINK', value: 'https://t.me/cartie_manager' },
    { id: 'act_sell', label: 'Trade-In', icon: 'DollarSign', actionType: 'SCENARIO', value: 'scn_sell' }
  ],
  navItems: [
    { id: 'nav_home', label: 'Home', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
    { id: 'nav_stock', label: 'Stock', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
    { id: 'nav_saved', label: 'Saved', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
    { id: 'nav_request', label: 'Request', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
    { id: 'nav_status', label: 'Status', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
  ],
  url,
  showcaseSlug
});

const buildB2BMiniAppConfig = (url: string, showcaseSlug: string): MiniAppConfig => ({
  isEnabled: true,
  title: 'CarDealer Lviv B2B',
  welcomeText: 'Live inventory and partner request tracking.',
  primaryColor: '#D4AF37',
  accentColor: '#111111',
  layout: 'GRID',
  actions: [
    { id: 'act_stock', label: 'Inventory', icon: 'Grid', actionType: 'VIEW', value: 'INVENTORY' },
    { id: 'act_fav', label: 'Favorites', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
    { id: 'act_status', label: 'Status', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
  ],
  navItems: [
    { id: 'nav_home', label: 'Home', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
    { id: 'nav_stock', label: 'Stock', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
    { id: 'nav_saved', label: 'Saved', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
    { id: 'nav_status', label: 'Status', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
  ],
  url,
  showcaseSlug
});

const baseLeadButtons = (scenarioIds: Record<string, string>, miniAppUrl: string): MenuButton[] => [
  { id: 'btn_buy', label: '🚗 Buy a Car', label_uk: '🚗 Купити авто', label_ru: '🚗 Купить авто', type: 'SCENARIO', value: scenarioIds.buy || 'scn_buy', row: 0, col: 0 },
  { id: 'btn_sell', label: '💰 Sell My Car', label_uk: '💰 Продати авто', label_ru: '💰 Продать авто', type: 'SCENARIO', value: scenarioIds.sell || 'scn_sell', row: 0, col: 1 },
  { id: 'btn_app', label: '📱 Open App', label_uk: '📱 Додаток', label_ru: '📱 Приложение', type: 'WEB_APP', value: miniAppUrl, row: 1, col: 0 },
  { id: 'btn_sup', label: '📞 Support', label_uk: '📞 Підтримка', label_ru: '📞 Поддержка', type: 'SCENARIO', value: scenarioIds.support || 'scn_support', row: 2, col: 0 },
  { id: 'btn_lang', label: '🌐 Language', label_uk: '🌐 Мова', label_ru: '🌐 Язык', type: 'SCENARIO', value: scenarioIds.lang || 'scn_lang', row: 2, col: 1 }
];

const baseB2BButtons = (miniAppUrl: string): MenuButton[] => [
  { id: 'btn_b2b_req', label: '📝 Створити запит', label_uk: '📝 Створити запит', label_ru: '📝 Создать запрос', type: 'TEXT', value: '/request', row: 0, col: 0 },
  { id: 'btn_b2b_app', label: '📱 Mini App', label_uk: '📱 Mini App', label_ru: '📱 Mini App', type: 'WEB_APP', value: miniAppUrl, row: 0, col: 1 },
  { id: 'btn_b2b_menu', label: '🏠 Меню', label_uk: '🏠 Меню', label_ru: '🏠 Меню', type: 'TEXT', value: '/menu', row: 1, col: 0 }
];

const maybePatchMenuLinks = (buttons: MenuButton[] | undefined, miniAppUrl: string): MenuButton[] => {
  const list = Array.isArray(buttons) ? buttons : [];
  return list.map(btn => {
    if ((btn.type === 'WEB_APP' || btn.type === 'LINK') && (!btn.value || btn.value === '{{MINI_APP_URL}}' || /\/p\/app\//.test(btn.value))) {
      return { ...btn, value: miniAppUrl };
    }
    return btn;
  });
};

const clientLeadScenarioSpecs = [
  { key: 'buy', templateId: 'tpl_buy_request', triggerCommand: 'buy' },
  { key: 'sell', templateId: 'tpl_sell_tradein', triggerCommand: 'sell' },
  { key: 'support', templateId: 'tpl_status_support', triggerCommand: 'status' },
  { key: 'lang', templateId: 'tpl_lang_select', triggerCommand: 'lang' }
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

const ensureClientLeadScenarios = async (companyId: string, forcePreset: boolean) => {
  const scenarioIds: Record<string, string> = {};

  for (const spec of clientLeadScenarioSpecs) {
    const defaults = resolveTemplateStructure(spec.templateId);
    const existing = await prisma.scenario.findFirst({
      where: {
        companyId,
        triggerCommand: spec.triggerCommand
      },
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
            nodes: defaults.nodes
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
        companyId
      }
    });
    scenarioIds[spec.key] = created.id;
  }

  return scenarioIds;
};

export const getTemplatePresetStatus = async (input: {
  template: BotTemplate;
  companyId: string;
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
        isActive: true,
        status: 'PUBLISHED',
        triggerCommand: { in: Array.from(required) }
      },
      select: { triggerCommand: true }
    });
    const commandSet = new Set(available.map(s => s.triggerCommand || '').filter(Boolean));
    const hasScenarios = Array.from(required).every(cmd => commandSet.has(cmd));
    const scenarioButtons = menuButtons.filter(btn => btn.type === 'SCENARIO');
    const hasMenu = scenarioButtons.length >= 4;
    const score = [hasScenarios, hasMenu, hasMini].filter(Boolean).length;
    if (score === 3) return 'ready';
    if (score === 0) return 'missing';
    return 'partial';
  }

  if (template === 'B2B') {
    const values = new Set(menuButtons.map(btn => String(btn.value || '').trim().toLowerCase()));
    const hasMenu = values.has('/request') && values.has('/menu');
    const hasAdmin = Boolean(String(input.adminChatId || '').trim());
    const hasChannel = Boolean(String(input.channelId || '').trim());
    const score = [hasMenu, hasMini, hasAdmin, hasChannel].filter(Boolean).length;
    if (score === 4) return 'ready';
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

  const fallbackSlug = sanitizeSlug(input.defaultShowcaseSlug) || sanitizeSlug(config.defaultShowcaseSlug) || sanitizeSlug(config.username) || sanitizeSlug(input.fallbackName) || 'system';
  const baseUrl = resolveBaseUrl(config.publicBaseUrl);
  const miniAppUrl = buildMiniAppUrl(baseUrl, fallbackSlug);

  config.defaultShowcaseSlug = fallbackSlug;
  config.publicBaseUrl = baseUrl;

  if (template === 'CLIENT_LEAD' && applyPreset) {
    const scenarioIds = await ensureClientLeadScenarios(input.companyId, forcePreset);

    const fallbackMenu = cloneMenu(
      "👋 Welcome to CarTié Concierge!\n\nWe provide premium car sourcing and selling services.\nHow can we help you today?",
      baseLeadButtons(scenarioIds, miniAppUrl)
    );
    const existingButtons = Array.isArray(config.menuConfig?.buttons) ? config.menuConfig.buttons : [];
    if (forcePreset || existingButtons.length === 0) {
      config.menuConfig = fallbackMenu;
    } else {
      config.menuConfig = {
        welcomeMessage: config.menuConfig?.welcomeMessage || fallbackMenu.welcomeMessage,
        buttons: maybePatchMenuLinks(existingButtons, miniAppUrl)
      };
    }

    if (forcePreset || !config.miniAppConfig) {
      config.miniAppConfig = buildClientLeadMiniAppConfig(miniAppUrl, fallbackSlug);
    } else {
      config.miniAppConfig = {
        ...config.miniAppConfig,
        isEnabled: config.miniAppConfig.isEnabled ?? true,
        url: miniAppUrl,
        showcaseSlug: fallbackSlug
      };
    }
  }

  if (template === 'B2B' && applyPreset) {
    const fallbackMenu = cloneMenu(
      "🤝 CarDealer Lviv B2B\n\nCreate a structured request and get offers from partner dealers.",
      baseB2BButtons(miniAppUrl)
    );
    const existingButtons = Array.isArray(config.menuConfig?.buttons) ? config.menuConfig.buttons : [];
    if (forcePreset || existingButtons.length === 0) {
      config.menuConfig = fallbackMenu;
    } else {
      config.menuConfig = {
        welcomeMessage: config.menuConfig?.welcomeMessage || fallbackMenu.welcomeMessage,
        buttons: maybePatchMenuLinks(existingButtons, miniAppUrl)
      };
    }

    if (forcePreset || !config.miniAppConfig) {
      config.miniAppConfig = buildB2BMiniAppConfig(miniAppUrl, fallbackSlug);
    } else {
      config.miniAppConfig = {
        ...config.miniAppConfig,
        isEnabled: config.miniAppConfig.isEnabled ?? true,
        url: miniAppUrl,
        showcaseSlug: fallbackSlug
      };
    }
  }

  const presetStatus = await getTemplatePresetStatus({
    template,
    companyId: input.companyId,
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
