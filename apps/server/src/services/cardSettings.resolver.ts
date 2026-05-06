import { prisma } from './prisma.js';

export type CardStatusSettings = {
  statusTag: string;
  statusText: string;
  startStatus: string;
  flag?: string;
};

export type CarCardSettings = {
  defaultFlag: string;
  city: string;
  priceNote: string;
  safetyLine: string;
  driveLineFallback: string;
  damageLineFallback: string;
  address: string;
  mapLinkLine: string;
  manager1Phone: string;
  manager1Name: string;
  manager2Phone: string;
  manager2Name: string;
  socialLinksLine: string;
  statusMap: Record<string, CardStatusSettings>;
};

const DEFAULT_CARD_SETTINGS: CarCardSettings = {
  defaultFlag: '🇺🇦 ',
  city: 'Львові',
  priceNote: 'Актуальну ціну уточнюйте у менеджера.',
  safetyLine: 'Airbag, ABS, ESP',
  driveLineFallback: 'Привід уточнюйте у менеджера',
  damageLineFallback: 'стан уточнюйте у менеджера',
  address: 'м. Львів, Україна',
  mapLinkLine: 'https://cartie.sendpulse.online/',
  manager1Phone: '@Car_Tie',
  manager1Name: 'CarTié',
  manager2Phone: '@CarTie_Showroom',
  manager2Name: 'Showroom',
  socialLinksLine: 'Telegram: https://t.me/CarTie_Showroom | Контакт: https://t.me/Car_Tie',
  statusMap: {
    AVAILABLE: {
      statusTag: 'внаявності',
      statusText: 'авто в наявності',
      startStatus: 'В наявності'
    },
    IN_TRANSIT: {
      statusTag: 'вдорозі',
      statusText: 'авто в дорозі',
      startStatus: 'В дорозі'
    },
    PENDING: {
      statusTag: 'вдорозі',
      statusText: 'авто в дорозі',
      startStatus: 'В дорозі'
    },
    SOLD: {
      statusTag: 'продано',
      statusText: 'авто продано',
      startStatus: 'Продано'
    }
  }
};

const normalizeObject = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const mergeStatusMap = (
  base: Record<string, CardStatusSettings>,
  override: Record<string, any>
): Record<string, CardStatusSettings> => {
  const result: Record<string, CardStatusSettings> = { ...base };
  Object.entries(override || {}).forEach(([status, val]) => {
    const source = normalizeObject(val);
    const prev = result[status] || {
      statusTag: String(status || '').toLowerCase(),
      statusText: String(status || '').toLowerCase(),
      startStatus: String(status || '')
    };
    result[status] = {
      statusTag: String(source.statusTag || prev.statusTag),
      statusText: String(source.statusText || prev.statusText),
      startStatus: String(source.startStatus || prev.startStatus),
      ...(source.flag ? { flag: String(source.flag) } : (prev.flag ? { flag: prev.flag } : {}))
    };
  });
  return result;
};

const mergeCardSettings = (base: CarCardSettings, override: Record<string, any>): CarCardSettings => {
  if (!override || typeof override !== 'object') return base;

  return {
    ...base,
    defaultFlag: String(override.defaultFlag || base.defaultFlag),
    city: String(override.city || base.city),
    priceNote: String(override.priceNote || base.priceNote),
    safetyLine: String(override.safetyLine || base.safetyLine),
    driveLineFallback: String(override.driveLineFallback || base.driveLineFallback),
    damageLineFallback: String(override.damageLineFallback || base.damageLineFallback),
    address: String(override.address || base.address),
    mapLinkLine: String(override.mapLinkLine || base.mapLinkLine),
    manager1Phone: String(override.manager1Phone || base.manager1Phone),
    manager1Name: String(override.manager1Name || base.manager1Name),
    manager2Phone: String(override.manager2Phone || base.manager2Phone),
    manager2Name: String(override.manager2Name || base.manager2Name),
    socialLinksLine: String(override.socialLinksLine || base.socialLinksLine),
    statusMap: mergeStatusMap(base.statusMap, normalizeObject(override.statusMap))
  };
};

export type ResolveCardSettingsInput = {
  companyId?: string | null;
  botId?: string | null;
  showcaseId?: string | null;
  showcaseSlug?: string | null;
};

export const resolveCardSettings = async (input: ResolveCardSettingsInput): Promise<CarCardSettings> => {
  let result: CarCardSettings = { ...DEFAULT_CARD_SETTINGS, statusMap: { ...DEFAULT_CARD_SETTINGS.statusMap } };

  let botConfig: any = null;
  if (input.botId) {
    botConfig = await prisma.botConfig.findUnique({ where: { id: input.botId } });
  } else if (input.companyId) {
    botConfig = await prisma.botConfig.findFirst({
      where: { companyId: input.companyId, isEnabled: true },
      orderBy: { createdAt: 'asc' }
    });
  }

  const botCardSettings = normalizeObject(normalizeObject(botConfig?.config).cardSettings);
  result = mergeCardSettings(result, botCardSettings);

  let showcase: any = null;
  if (input.showcaseId) {
    showcase = await prisma.showcase.findUnique({ where: { id: input.showcaseId } });
  } else if (input.showcaseSlug) {
    showcase = await prisma.showcase.findUnique({ where: { slug: input.showcaseSlug } });
  }

  const showcaseRules = normalizeObject(showcase?.rules);
  const showcaseCardSettings = normalizeObject(showcaseRules.cardSettings);
  result = mergeCardSettings(result, showcaseCardSettings);

  return result;
};

export const DEFAULT_V2_CARD_SETTINGS = DEFAULT_CARD_SETTINGS;
