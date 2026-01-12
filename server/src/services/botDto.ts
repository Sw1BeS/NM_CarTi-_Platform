const TEMPLATE_BY_ROLE: Record<string, string> = {
  CLIENT: 'CLIENT_LEAD',
  CHANNEL: 'CATALOG',
  BOTH: 'CLIENT_LEAD'
};

const normalizeTemplate = (value: any) => {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'CLIENT_LEAD' || normalized === 'CATALOG' || normalized === 'B2B') {
    return normalized;
  }
  return 'CLIENT_LEAD';
};

const setConfigValue = (config: any, key: string, value: any) => {
  if (value === undefined) return;
  config[key] = value === '' ? null : value;
};

export const mapBotInput = (input: any, existingConfig: any = {}) => {
  const config = { ...(existingConfig || {}) };

  if ('username' in input) setConfigValue(config, 'username', input.username);
  if ('publicBaseUrl' in input) setConfigValue(config, 'publicBaseUrl', input.publicBaseUrl);
  if ('role' in input) setConfigValue(config, 'role', input.role);
  if ('menuConfig' in input) setConfigValue(config, 'menuConfig', input.menuConfig);
  if ('miniAppConfig' in input) setConfigValue(config, 'miniAppConfig', input.miniAppConfig);
  if ('stats' in input) setConfigValue(config, 'stats', input.stats);
  if ('processedUpdateIds' in input) setConfigValue(config, 'processedUpdateIds', input.processedUpdateIds);
  if ('lastUpdateId' in input) setConfigValue(config, 'lastUpdateId', input.lastUpdateId);

  const role = input.role || config.role || 'CLIENT';
  const template = normalizeTemplate(input.template || TEMPLATE_BY_ROLE[role] || config.template);

  const data: any = {
    config,
    template
  };

  if ('name' in input) data.name = input.name || null;
  if ('token' in input) data.token = input.token ? String(input.token).trim() : undefined;
  if ('channelId' in input) data.channelId = input.channelId || null;
  if ('adminChatId' in input || 'adminChannelId' in input) {
    data.adminChatId = input.adminChatId ?? input.adminChannelId ?? null;
  }
  if ('active' in input) data.isEnabled = !!input.active;
  if ('isEnabled' in input) data.isEnabled = !!input.isEnabled;

  return { data, config };
};

export const mapBotOutput = (bot: any) => {
  const config = bot?.config || {};
  return {
    id: bot.id,
    name: bot.name,
    username: config.username || bot.name || '',
    token: bot.token,
    role: config.role || 'CLIENT',
    active: bot.isEnabled,
    publicBaseUrl: config.publicBaseUrl,
    menuConfig: config.menuConfig,
    miniAppConfig: config.miniAppConfig,
    stats: config.stats,
    processedUpdateIds: config.processedUpdateIds,
    lastUpdateId: config.lastUpdateId,
    adminChannelId: bot.adminChatId,
    channelId: bot.channelId,
    template: bot.template
  };
};
