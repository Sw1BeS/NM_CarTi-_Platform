
import {
    User, B2BRequest, Lead, TelegramContent, Campaign, TelegramMessage,
    TelegramDestination, Bot, ActivityLog, BotSession, Scenario,
    SystemSettings, DictionaryCollection, CarListing, Company, Proposal,
    SystemNotification, UserRole, RequestStatus, BotMenuButtonConfig, MiniAppConfig,
    Variant, VariantStatus, NavItemConfig
} from '../types';

// --- CONSTANTS & DEFAULTS ---

export const DEFAULT_MENU_CONFIG: { buttons: BotMenuButtonConfig[]; welcomeMessage: string } = {
    welcomeMessage: "👋 Welcome to CarTié Concierge!\n\nWe provide premium car sourcing and selling services.\nHow can we help you today?",
    buttons: [
        { id: 'btn_buy', label: '🚗 Buy a Car', label_uk: '🚗 Купити авто', label_ru: '🚗 Купить авто', type: 'SCENARIO', value: 'scn_buy', row: 0, col: 0 },
        { id: 'btn_sell', label: '💰 Sell My Car', label_uk: '💰 Продати авто', label_ru: '💰 Продать авто', type: 'SCENARIO', value: 'scn_sell', row: 0, col: 1 },
        { id: 'btn_app', label: '📱 Open App', label_uk: '📱 Додаток', label_ru: '📱 Приложение', type: 'LINK', value: 'https://t.me/cartie_bot/app', row: 1, col: 0 },
        { id: 'btn_sup', label: '📞 Support', label_uk: '📞 Підтримка', label_ru: '📞 Поддержка', type: 'SCENARIO', value: 'scn_support', row: 2, col: 0 },
        { id: 'btn_lang', label: '🌐 Language', label_uk: '🌐 Мова', label_ru: '🌐 Язык', type: 'SCENARIO', value: 'scn_lang', row: 2, col: 1 }
    ]
};

export const DEFAULT_MINI_APP_CONFIG: MiniAppConfig = {
    isEnabled: true,
    title: 'CarTié Premium',
    welcomeText: 'Your personal automotive concierge.',
    primaryColor: '#D4AF37', // Gold
    layout: 'GRID',
    actions: [
        { id: 'act_stock', label: 'Stock', icon: 'Grid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'act_req', label: 'Request', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
        { id: 'act_chat', label: 'Chat', icon: 'MessageCircle', actionType: 'LINK', value: 'https://t.me/cartie_manager' },
        { id: 'act_sell', label: 'Trade-In', icon: 'DollarSign', actionType: 'SCENARIO', value: 'scn_sell' }
    ]
};

export const DEFAULT_NAV_ITEMS: NavItemConfig[] = [
    { id: 'nav_dash', labelKey: 'nav.dashboard', path: '/', iconName: 'LayoutDashboard', visible: true, order: 1, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
    { id: 'nav_inbox', labelKey: 'nav.inbox', path: '/inbox', iconName: 'MessageCircle', visible: true, order: 2, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR'] },
    { id: 'nav_leads', labelKey: 'nav.leads', path: '/leads', iconName: 'Users', visible: true, order: 3, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR'] },
    { id: 'nav_req', labelKey: 'nav.requests', path: '/requests', iconName: 'FileText', visible: true, order: 4, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
    { id: 'nav_inv', labelKey: 'nav.inventory', path: '/inventory', iconName: 'Car', visible: true, order: 5, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
    { id: 'nav_search', labelKey: 'nav.search', path: '/search', iconName: 'Search', visible: true, order: 6, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'], featureKey: 'MODULE_SEARCH' },
    { id: 'nav_tg', labelKey: 'nav.telegram', path: '/telegram', iconName: 'Send', visible: true, order: 7, roles: ['SUPER_ADMIN', 'ADMIN'], featureKey: 'MODULE_CAMPAIGNS' },
    { id: 'nav_comp', labelKey: 'nav.companies', path: '/companies', iconName: 'Briefcase', visible: true, order: 8, roles: ['SUPER_ADMIN'], featureKey: 'MODULE_COMPANIES' },
    { id: 'nav_ent', labelKey: 'nav.entities', path: '/entities', iconName: 'Database', visible: true, order: 9, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { id: 'nav_set', labelKey: 'nav.settings', path: '/settings', iconName: 'Settings', visible: true, order: 10, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { id: 'nav_health', labelKey: 'System Health', path: '/health', iconName: 'Activity', visible: true, order: 11, roles: ['SUPER_ADMIN'] }
];

class StorageService {
    private listeners: Record<string, Function[]> = {};
    private STORAGE_KEY = 'cartie_db_v7';
    private data: any;

    constructor() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            this.data = JSON.parse(saved);
        } else {
            this.data = {
                users: [], requests: [], leads: [], content: [], campaigns: [], messages: [], 
                destinations: [], bots: [], tokenStates: {}, activity: [], sessions: {}, 
                scenarios: [], inventory: [], companies: [], proposals: [], 
                settings: { features: { MODULE_SCENARIOS: true, MODULE_SEARCH: true, MODULE_CAMPAIGNS: true, MODULE_COMPANIES: true }, navigation: DEFAULT_NAV_ITEMS }, 
                notifications: [], dictionaries: { brands: [], cities: [] }, snapshot: null,
                // Dynamic Entities Support
                entityDefinitions: [],
                customEntities: {}
            };
            this.seedDefaults();
            this.save();
        }
        
        // Ensure new fields exist if migrating from old DB version
        if (!this.data.entityDefinitions) this.data.entityDefinitions = [];
        if (!this.data.customEntities) this.data.customEntities = {};
    }
    
    private seedDefaults() {
        if (!this.data.scenarios) this.data.scenarios = []; 
        if (!this.data.settings.navigation) this.data.settings.navigation = DEFAULT_NAV_ITEMS;
    }
    
    private save() { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data)); }
    
    subscribe(event: string, callback: () => void) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
        return () => { this.listeners[event] = this.listeners[event].filter(cb => cb !== callback); };
    }

    // --- Standard Entities ---
    getUsers() { return this.data.users || []; }
    createUser(u: any) { this.data.users.push({...u, id: 'u'+Date.now()}); this.save(); }
    getRequests() { return this.data.requests || []; }
    createRequest(r: any) { const n={...r, id:'req_'+Date.now()}; this.data.requests.push(n); this.save(); return n; }
    updateRequest(id: string, d: any) { this.data.requests = this.data.requests.map((r:any)=>r.id===id?{...r,...d}:r); this.save(); }
    getRequest(id: string) { return this.data.requests.find((r:any)=>r.id===id); }
    deleteRequest(id: string) { this.data.requests = this.data.requests.filter((r:any)=>r.id!==id); this.save(); }
    getLeads() { return this.data.leads || []; }
    createLead(l: any) { const n={...l, id:'lead_'+Date.now()}; this.data.leads.push(n); this.save(); return n; }
    getBots() { return this.data.bots || []; }
    saveBot(b: any, create=false) { 
        const idx = this.data.bots.findIndex((x:any)=>x.id===b.id);
        if(idx>=0) this.data.bots[idx]=b; else if(create) this.data.bots.push(b);
        this.save();
    }
    deleteBot(id: string) { this.data.bots = this.data.bots.filter((b:any)=>b.id!==id); this.save(); }
    getSession(id: string) { return this.data.sessions[id]; }
    saveSession(s: any) { this.data.sessions[s.chatId]=s; this.save(); }
    clearSession(id: string) { delete this.data.sessions[id]; this.save(); }
    getScenarios() { return this.data.scenarios || []; }
    saveScenario(s: any) { 
        const idx = this.data.scenarios.findIndex((x:any)=>x.id===s.id);
        if(idx>=0) this.data.scenarios[idx]=s; else this.data.scenarios.push(s);
        this.save();
    }
    deleteScenario(id: string) { this.data.scenarios = this.data.scenarios.filter((s:any)=>s.id!==id); this.save(); }
    getTemplates() { return []; } 
    getContent() { return this.data.content || []; }
    createContent(c: any) { const n={...c, id:'cnt_'+Date.now()}; this.data.content.push(n); this.save(); return n; }
    updateContent(id: string, d: any) { this.data.content = this.data.content.map((c:any)=>c.id===id?{...c,...d}:c); this.save(); }
    getCampaigns() { return this.data.campaigns || []; }
    createCampaign(c: any) { const n={...c, id:'camp_'+Date.now(), progress:{sent:0,total:0,failed:0}, logs:[]}; this.data.campaigns.push(n); this.save(); return n; }
    updateCampaign(id: string, d: any) { this.data.campaigns = this.data.campaigns.map((c:any)=>c.id===id?{...c,...d}:c); this.save(); }
    addCampaignLog(id: string, l: any) { 
        const c = this.data.campaigns.find((x:any)=>x.id===id);
        if(c) { c.logs.push(l); c.progress.sent = c.logs.filter((x:any)=>x.status==='SUCCESS').length; this.save(); }
    }
    getMessages() { return this.data.messages || []; }
    addMessage(m: any) { this.data.messages.push(m); this.save(); }
    
    getDestinations() { return this.data.destinations || []; }
    saveDestination(d: any) { 
        const idx = this.data.destinations.findIndex((x:any)=>x.id===d.id);
        if(idx>=0) this.data.destinations[idx]=d; else this.data.destinations.push(d);
        this.save(); 
    }
    addDestination(d: any) { this.saveDestination(d); }

    getInventory() { return this.data.inventory || []; }
    saveInventoryItem(i: any) { 
        const idx = this.data.inventory.findIndex((x:any)=>x.canonicalId===i.canonicalId);
        if(idx>=0) this.data.inventory[idx]=i; else this.data.inventory.push(i);
        this.save();
    }
    deleteInventoryItem(id: string) { this.data.inventory = this.data.inventory.filter((i:any)=>i.canonicalId!==id); this.save(); }
    getCompanies() { return this.data.companies || []; }
    createCompany(c: any) { const n={...c, id:'comp_'+Date.now()}; this.data.companies.push(n); this.save(); return n; }
    updateCompany(id: string, d: any) { this.data.companies = this.data.companies.map((c:any)=>c.id===id?{...c,...d}:c); this.save(); }
    deleteCompany(id: string) { this.data.companies = this.data.companies.filter((c:any)=>c.id!==id); this.save(); }
    generateInviteCode(id: string) { return 'INV-123'; }
    getSettings() { return this.data.settings; }
    saveSettings(s: any) { this.data.settings = {...this.data.settings, ...s}; this.save(); }
    getDictionaries() { return this.data.dictionaries; }
    saveDictionaries(d: any) { this.data.dictionaries = d; this.save(); }
    getNotifications() { return this.data.notifications || []; }
    saveNotification(n: any) { this.data.notifications.push({...n, id:n.id||'n_'+Date.now()}); this.save(); return n; }
    addNotification(n: any) { this.saveNotification(n); }
    getActivity() { return this.data.activity || []; }
    logActivity(u: string, a: string, d: string, t: string) { this.data.activity.unshift({id:'l_'+Date.now(), userId:u, action:a, details:d, entityType:t, timestamp:new Date().toISOString()}); this.save(); }
    getProposal(id: string) { return this.data.proposals.find((p:any)=>p.id===id); }
    updateProposal(id: string, d: any) { this.data.proposals = this.data.proposals.map((p:any)=>p.id===id?{...p,...d}:p); this.save(); }
    
    // --- Dynamic Entities Support ---
    getEntityDefinitions() { return this.data.entityDefinitions || []; }
    saveEntityDefinition(def: any) { 
        const exists = this.data.entityDefinitions.findIndex((d:any) => d.slug === def.slug);
        if(exists >= 0) this.data.entityDefinitions[exists] = def;
        else this.data.entityDefinitions.push(def);
        this.save();
        return def;
    }
    
    listCustomEntities(slug: string) { 
        return this.data.customEntities[slug] || []; 
    }
    
    saveCustomEntity(slug: string, item: any) {
        if (!this.data.customEntities[slug]) this.data.customEntities[slug] = [];
        const collection = this.data.customEntities[slug];
        const idx = collection.findIndex((x:any) => x.id === item.id);
        
        const finalItem = { ...item, id: item.id || `rec_${Date.now()}_${Math.random().toString(36).substr(2,5)}` };
        
        if (idx >= 0) collection[idx] = finalItem;
        else collection.push(finalItem);
        
        this.save();
        return finalItem;
    }
    
    deleteCustomEntity(slug: string, id: string) {
        if (!this.data.customEntities[slug]) return;
        this.data.customEntities[slug] = this.data.customEntities[slug].filter((x:any) => x.id !== id);
        this.save();
    }

    // --- System ---
    exportState() { return { metadata: { app: 'Cartie' }, data: this.data }; }
    getSnapshot() { return this.data.snapshot; }
    restoreSnapshot() { if(this.data.snapshot) { this.data = this.data.snapshot.data; this.save(); } }
    addVariant(reqId: string, v: any) {
        const r = this.getRequest(reqId);
        if(r) { r.variants.push({...v, id:'v_'+Date.now()}); this.updateRequest(reqId, {variants:r.variants}); }
    }
}

export const Storage = new StorageService();
