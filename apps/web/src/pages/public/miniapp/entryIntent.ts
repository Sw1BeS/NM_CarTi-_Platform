export type MiniAppSurfaceMode = 'LEAD' | 'B2B';
export type MiniAppView = 'HOME' | 'INVENTORY' | 'LISTING' | 'FAVORITES' | 'REQUEST' | 'STATUS' | 'PROFILE' | 'SUPPORT' | 'CONTACTS';
export type InventoryTab = 'IN_STOCK' | 'IN_TRANSIT';
export type RequestType = 'BUY' | 'SELL';
export type BotFlow = 'SELL' | 'SUPPORT';

export type MiniAppEntryIntent = {
  view?: MiniAppView;
  tab?: InventoryTab;
  requestType?: RequestType;
  botFlow?: BotFlow;
  consumedStartParam?: boolean;
};

export const parseMiniAppEntryIntent = (
  params: URLSearchParams,
  startParam?: string,
  surfaceMode: MiniAppSurfaceMode = 'LEAD'
): MiniAppEntryIntent => {
  const entry = String(params.get('entry') || '').trim().toLowerCase();
  const status = String(params.get('status') || '').trim().toUpperCase();
  const availabilityState = String(params.get('availabilityState') || '').trim().toUpperCase();
  const type = String(params.get('type') || params.get('requestType') || '').trim().toUpperCase();
  const start = String(startParam || '').trim().toLowerCase();
  const intent: MiniAppEntryIntent = {};

  const applyEntry = (value: string) => {
    if (value === 'home') intent.view = 'HOME';
    if (value === 'inventory' || value === 'catalog' || value === 'stock') intent.view = 'INVENTORY';
    if (value === 'favorites' || value === 'favourites' || value === 'favorite') intent.view = 'FAVORITES';
    if (value === 'request' || value === 'buy') intent.view = 'REQUEST';
    if (value === 'support') intent.view = 'SUPPORT';
    if (value === 'contacts' || value === 'contact') intent.view = 'CONTACTS';
    if (value === 'status') intent.view = 'STATUS';
    if (value === 'profile') intent.view = 'PROFILE';
  };

  if (entry) applyEntry(entry);
  if (availabilityState === 'IN_TRANSIT' || availabilityState === 'IMPORT_TO_ORDER') {
    intent.view = 'INVENTORY';
    intent.tab = 'IN_TRANSIT';
  } else if (availabilityState === 'IN_STOCK') {
    intent.view = 'INVENTORY';
    intent.tab = 'IN_STOCK';
  } else if (status === 'PENDING' || status === 'IN_TRANSIT') {
    intent.view = 'INVENTORY';
    intent.tab = 'IN_TRANSIT';
  } else if (status === 'AVAILABLE') {
    intent.view = 'INVENTORY';
    intent.tab = 'IN_STOCK';
  }

  if (type === 'SELL') {
    if (surfaceMode === 'LEAD') {
      intent.botFlow = 'SELL';
      delete intent.view;
      delete intent.requestType;
    } else {
      intent.view = 'REQUEST';
      intent.requestType = 'SELL';
    }
  } else if (type === 'BUY') {
    intent.requestType = 'BUY';
  }

  if (!entry && start) {
    const aliases: Record<string, MiniAppEntryIntent> = {
      app: { view: 'HOME' },
      miniapp: { view: 'HOME' },
      main: { view: 'HOME' },
      home: { view: 'HOME' },
      view_inventory: { view: 'INVENTORY', tab: 'IN_STOCK' },
      inventory: { view: 'INVENTORY' },
      stock: { view: 'INVENTORY', tab: 'IN_STOCK' },
      view_stock: { view: 'INVENTORY', tab: 'IN_STOCK' },
      view_transit: { view: 'INVENTORY', tab: 'IN_TRANSIT' },
      transit: { view: 'INVENTORY', tab: 'IN_TRANSIT' },
      view_request: { view: 'REQUEST', requestType: 'BUY' },
      request: { view: 'REQUEST', requestType: 'BUY' },
      view_favorites: { view: 'FAVORITES' },
      favorites: { view: 'FAVORITES' },
      favourites: { view: 'FAVORITES' },
      view_status: { view: 'STATUS' },
      status: { view: 'STATUS' },
      sell_car: surfaceMode === 'LEAD' ? { botFlow: 'SELL' } : { view: 'REQUEST', requestType: 'SELL' },
      sell: surfaceMode === 'LEAD' ? { botFlow: 'SELL' } : { view: 'REQUEST', requestType: 'SELL' },
      support: { view: 'SUPPORT' },
      about: { view: 'SUPPORT' },
      contacts: { view: 'CONTACTS' },
      contact: { view: 'CONTACTS' }
    };
    const alias = aliases[start];
    if (alias) {
      Object.assign(intent, alias, { consumedStartParam: true });
    } else if (start.startsWith('car_')) {
      Object.assign(intent, { view: 'INVENTORY', consumedStartParam: true });
    }
  }

  return intent;
};

export const isMiniAppReadOnlyLaunch = (
  params: URLSearchParams,
  startParam?: string
) => {
  const entry = String(params.get('entry') || '').trim().toLowerCase();
  const type = String(params.get('type') || params.get('requestType') || '').trim().toUpperCase();
  const start = String(startParam || params.get('startapp') || params.get('start_param') || '').trim().toLowerCase();
  const hasCarId = Boolean(String(params.get('carId') || params.get('carListingId') || '').trim());
  const previewMode = String(params.get('preview') || params.get('mode') || '').trim().toLowerCase();

  if (type === 'SELL') return false;
  if (entry === 'request' || entry === 'buy' || entry === 'favorites' || entry === 'status' || entry === 'profile') return false;
  if (start === 'sell' || start === 'sell_car' || start === 'request' || start === 'view_request') return false;
  if (!entry && !type && !start && !hasCarId && !previewMode) return true;
  if (['1', 'true', 'readonly', 'read_only', 'admin', 'admin_chat', 'crm'].includes(previewMode)) return true;
  if (hasCarId) return true;
  return ['home', 'inventory', 'catalog', 'stock', 'transit', 'contacts', 'contact'].includes(entry)
    || ['home', 'main', 'app', 'miniapp', 'inventory', 'stock', 'view_inventory', 'view_stock', 'transit', 'view_transit', 'pending', 'contacts', 'contact'].includes(start);
};

export const isMiniAppReadOnlyPreviewLaunch = (
  params: URLSearchParams,
  startParam?: string,
  isTelegramContext = false
) => !isTelegramContext && isMiniAppReadOnlyLaunch(params, startParam);

export type MiniAppInternalLinkIntent = {
  slug?: string;
  carId?: string;
  intent: MiniAppEntryIntent;
};

export const resolveMiniAppInternalLinkIntent = (
  value: string | undefined,
  surfaceMode: MiniAppSurfaceMode = 'LEAD',
  currentOrigin = 'https://cartie.local'
): MiniAppInternalLinkIntent | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw, currentOrigin);
  } catch {
    return null;
  }

  const match = url.pathname.match(/\/p\/app\/([^/]+)/);
  if (!match) return null;

  const slug = decodeURIComponent(match[1] || '').trim() || undefined;
  const startParam = url.searchParams.get('tgWebAppStartParam')
    || url.searchParams.get('startapp')
    || url.searchParams.get('start_param')
    || undefined;
  const carId = String(url.searchParams.get('carId') || url.searchParams.get('carListingId') || '').trim() || undefined;
  const intent = parseMiniAppEntryIntent(url.searchParams, startParam, surfaceMode);

  if (carId && !intent.view) {
    intent.view = 'INVENTORY';
  }

  return { slug, carId, intent };
};
