export type TgUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
};

export type TelegramStartParamSource = 'bridge' | 'tgWebAppStartParam' | 'startapp' | 'start_param';

export type TelegramLaunchContext = {
  tg: any;
  initData?: string;
  startParam?: string;
  startParamSource?: TelegramStartParamSource;
  user: TgUser | null;
  isTelegramContext: boolean;
  hasBridge: boolean;
  platform: string;
  version: string;
};

type LocationLike = {
  search?: string;
  hash?: string;
};

type DocumentLike = {
  referrer?: string;
};

type NavigatorLike = {
  userAgent?: string;
};

type WindowLike = {
  location?: LocationLike;
  navigator?: NavigatorLike;
  Telegram?: {
    WebApp?: any;
  };
  TelegramWebviewProxy?: unknown;
  TelegramGameProxy?: unknown;
};

type LaunchValue = {
  value: string;
  source?: string;
};

type ResolveTelegramLaunchContextOptions = {
  windowRef?: WindowLike;
  documentRef?: DocumentLike;
  navigatorRef?: NavigatorLike;
  locationRef?: LocationLike;
  attempts?: number;
  delayMs?: number;
};

const getDefaultWindow = (): WindowLike | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as WindowLike);

const getDefaultDocument = (): DocumentLike | undefined =>
  typeof document === 'undefined' ? undefined : document;

const getDefaultNavigator = (): NavigatorLike | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator;

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const launchParamSources = (location?: LocationLike): string[] => {
  const sources: string[] = [];
  const search = String(location?.search || '');
  if (search) sources.push(search.startsWith('?') ? search : `?${search}`);

  const rawHash = String(location?.hash || '');
  const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  if (!hash) return unique(sources);

  const hashCandidates = unique([
    hash,
    safeDecode(hash),
    safeDecode(safeDecode(hash))
  ]);

  for (const candidate of hashCandidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('?')) {
      sources.push(trimmed);
      continue;
    }
    const queryIndex = trimmed.indexOf('?');
    if (queryIndex >= 0) {
      sources.push(trimmed.slice(queryIndex));
      continue;
    }
    if (trimmed.includes('=')) {
      sources.push(`?${trimmed.replace(/^\/+/, '')}`);
    }
  }

  return unique(sources);
};

export const readTelegramLaunchValue = (key: string, locationRef?: LocationLike): string => {
  for (const source of launchParamSources(locationRef || getDefaultWindow()?.location)) {
    const params = new URLSearchParams(source);
    const value = params.get(key);
    if (value) return value.trim();
  }
  return '';
};

const readTelegramLaunchParam = (locationRef?: LocationLike): LaunchValue => {
  const location = locationRef || getDefaultWindow()?.location;
  const keys: Array<TelegramStartParamSource> = ['tgWebAppStartParam', 'startapp', 'start_param'];
  for (const key of keys) {
    const value = readTelegramLaunchValue(key, location);
    if (value) return { value, source: key };
  }
  return { value: '' };
};

export const readRuntimeTelegramInitData = (windowRef?: WindowLike): string => {
  const win = windowRef || getDefaultWindow();
  const bridgeInitData = typeof win?.Telegram?.WebApp?.initData === 'string'
    ? String(win.Telegram.WebApp.initData).trim()
    : '';
  return bridgeInitData || readTelegramLaunchValue('tgWebAppData', win?.location);
};

export const parseTelegramUserFromInitData = (rawInitData?: string): TgUser | null => {
  if (!rawInitData) return null;
  try {
    const params = new URLSearchParams(rawInitData);
    const userRaw = params.get('user');
    if (!userRaw) return null;
    try {
      return JSON.parse(userRaw) as TgUser;
    } catch {
      return JSON.parse(safeDecode(userRaw)) as TgUser;
    }
  } catch {
    return null;
  }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const hasTelegramUserAgent = (navigatorRef?: NavigatorLike) => /telegram/i.test(navigatorRef?.userAgent || '');
const hasTelegramReferrer = (documentRef?: DocumentLike) => /t\.me|telegram/i.test(documentRef?.referrer || '');
const hasTelegramBridgeProxy = (windowRef?: WindowLike) => Boolean(windowRef?.TelegramWebviewProxy || windowRef?.TelegramGameProxy);

export const resolveTelegramLaunchContext = async (
  options: ResolveTelegramLaunchContextOptions = {}
): Promise<TelegramLaunchContext> => {
  const win = options.windowRef || getDefaultWindow();
  const doc = options.documentRef || getDefaultDocument();
  const nav = options.navigatorRef || win?.navigator || getDefaultNavigator();
  const location = options.locationRef || win?.location;
  const attempts = Math.max(1, options.attempts ?? 20);
  const delayMs = Math.max(0, options.delayMs ?? 150);
  const launchInitData = readTelegramLaunchValue('tgWebAppData', location);
  const launchStartParam = readTelegramLaunchParam(location);
  const launchPlatform = readTelegramLaunchValue('tgWebAppPlatform', location);
  const launchVersion = readTelegramLaunchValue('tgWebAppVersion', location);
  const launchTheme = readTelegramLaunchValue('tgWebAppThemeParams', location);

  const buildContext = (tg: any, bridgeInitData = '', bridgeStartParam = '', bridgeUser: TgUser | null = null): TelegramLaunchContext => {
    const resolvedInitData = bridgeInitData || launchInitData || '';
    const resolvedUser = bridgeUser || parseTelegramUserFromInitData(resolvedInitData);
    const bridgeContext = Boolean(bridgeInitData || bridgeStartParam || bridgeUser);
    const launchContext = Boolean(launchInitData || launchStartParam.value || launchPlatform || launchVersion || launchTheme);
    const telegramContext = bridgeContext
      || launchContext
      || hasTelegramUserAgent(nav)
      || hasTelegramReferrer(doc)
      || hasTelegramBridgeProxy(win);
    const tgPlatform = String(tg?.platform || '').trim();
    const usableTgPlatform = tgPlatform && tgPlatform !== 'unknown' ? tgPlatform : '';
    const platform = String(usableTgPlatform || launchPlatform || (hasTelegramUserAgent(nav) ? 'telegram-ua' : (launchContext ? 'url-fallback' : 'web')));
    const version = String(tg?.version || launchVersion || 'n/a');

    return {
      tg,
      initData: resolvedInitData || undefined,
      startParam: bridgeStartParam || launchStartParam.value || undefined,
      startParamSource: bridgeStartParam ? 'bridge' : launchStartParam.source as TelegramStartParamSource | undefined,
      user: resolvedUser,
      isTelegramContext: telegramContext,
      hasBridge: Boolean(tg),
      platform,
      version
    };
  };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const tg = win?.Telegram?.WebApp;
    const bridgeInitData = typeof tg?.initData === 'string' ? tg.initData.trim() : '';
    const bridgeStartParam = typeof tg?.initDataUnsafe?.start_param === 'string' ? String(tg.initDataUnsafe.start_param) : '';
    const bridgeUser = (tg?.initDataUnsafe?.user as TgUser | undefined) || null;

    if (tg && attempt === 0) {
      tg.ready?.();
      tg.expand?.();
      tg.enableClosingConfirmation?.();
    }

    const context = buildContext(tg, bridgeInitData, bridgeStartParam, bridgeUser);
    const hasBridgeContext = Boolean(bridgeInitData || bridgeStartParam || bridgeUser);
    const hasLaunchContext = Boolean(launchInitData || launchStartParam.value || launchPlatform || launchVersion || launchTheme);
    if (hasBridgeContext || hasLaunchContext || !context.isTelegramContext) return context;

    if (delayMs) await sleep(delayMs);
  }

  const tg = win?.Telegram?.WebApp;
  const bridgeInitData = typeof tg?.initData === 'string' ? tg.initData.trim() : '';
  const bridgeStartParam = typeof tg?.initDataUnsafe?.start_param === 'string' ? String(tg.initDataUnsafe.start_param) : '';
  const bridgeUser = (tg?.initDataUnsafe?.user as TgUser | undefined) || null;
  return buildContext(tg, bridgeInitData, bridgeStartParam, bridgeUser);
};
