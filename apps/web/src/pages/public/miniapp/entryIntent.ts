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
  if (status === 'PENDING' || status === 'IN_TRANSIT') {
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
