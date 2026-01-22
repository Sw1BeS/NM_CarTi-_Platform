
import { ApiClient } from './apiClient';
import { DataAdapter } from './dataAdapter';
import {
    User, B2BRequest, Lead, Bot, Scenario, TelegramContent, Campaign,
    TelegramMessage, TelegramDestination, CarListing, Company,
    SystemSettings, DictionaryCollection, SystemNotification, ActivityLog, BotSession, Proposal
} from '../types';

const SLUGS = {
    USER: 'sys_user',
    REQUEST: 'b2b_request',
    LEAD: 'crm_lead',
    BOT: 'tg_bot',
    SESSION: 'bot_session',
    SCENARIO: 'bot_scenario',
    CONTENT: 'tg_content',
    CAMPAIGN: 'tg_campaign',
    MESSAGE: 'tg_message',
    DESTINATION: 'tg_destination',
    INVENTORY: 'car_listing',
    COMPANY: 'sys_company',
    SETTINGS: 'sys_settings',
    DICT: 'sys_dictionary',
    NOTIFICATION: 'sys_notification',
    ACTIVITY: 'sys_activity',
    SNAPSHOT: 'sys_snapshot',
    PROPOSAL: 'b2b_proposal'
};

export class ServerAdapter implements DataAdapter {
    private definitionsEnsured = false;

    async init() {
        if (this.definitionsEnsured) return;
        try {
            const health = await ApiClient.get('health');
            // Don't throw on health check fail, just warn, allowing app to proceed in degraded mode
            if (!health.ok) console.warn("[ServerAdapter] API health check failed, continuing...", health.message);
            this.definitionsEnsured = true;
        } catch (e) {
            console.warn("[ServerAdapter] Init Warning:", e);
        }
    }

    private unwrap(record: any): any {
        if (!record) return null;
        return { ...record.data, id: record.id || record.data.id, _recordId: record.id };
    }

    private wrap(entity: any): any {
        const { _recordId, ...data } = entity;
        return data;
    }

    async getEntity<T>(slug: string, id: string): Promise<T | null> {
        const res = await ApiClient.get<any>(`entities/${slug}/records/${id}`);
        if (res.ok) return this.unwrap(res.data);
        return null;
    }

    async listEntities<T>(slug: string): Promise<T[]> {
        const res = await ApiClient.get<any[]>(`entities/${slug}/records?limit=1000`);
        if (!res.ok) {
            // Suppress 404s for Activity logs as they are often optional/missing in basic setups
            if (res.status === 404 && slug === SLUGS.ACTIVITY) {
                console.debug(`[ServerAdapter] Activity logging not available on server (404).`);
                return [];
            }
            console.warn(`[ServerAdapter] Failed to list ${slug}:`, res.message);
            return [];
        }
        const payload: any = res.data;
        const items = Array.isArray(payload) ? payload : (payload?.items || []);
        return items.map(this.unwrap);
    }

    async saveEntity<T extends { id: string }>(slug: string, data: T): Promise<T> {
        const all = await this.listEntities<any>(slug);
        const existing = all.find(r => r.id === data.id);

        if (existing && existing._recordId) {
            const res = await ApiClient.put(`entities/${slug}/records/${existing._recordId}`, { data: this.wrap(data) });
            if (!res.ok) throw new Error(res.message);
            return this.unwrap(res.data);
        } else {
            const res = await ApiClient.post(`entities/${slug}/records`, { data: this.wrap(data) });
            if (!res.ok) throw new Error(res.message);
            return this.unwrap(res.data);
        }
    }

    async deleteEntity(slug: string, id: string): Promise<void> {
        const all = await this.listEntities<any>(slug);
        const existing = all.find(r => r.id === id);
        if (existing && existing._recordId) {
            await ApiClient.delete(`entities/${slug}/records/${existing._recordId}`);
        }
    }

    // --- DOMAIN METHODS ---

    async getUsers() {
        const res = await ApiClient.get<User[]>('users');
        return res.ok ? res.data : [];
    }

    async saveUser(u: User) {
        if (u.id && !`${u.id}`.startsWith('u_')) { // Check if server ID (Int)
            const res = await ApiClient.put<User>(`users/${u.id}`, u);
            if (res.ok) return res.data as User;
        }
        const { id, ...data } = u;
        const res = await ApiClient.post<User>('users', data);
        if (!res.ok) throw new Error(res.message);
        return res.data as User;
    }

    // --- REQUESTS (Relational) ---
    async getRequests() {
        const res = await ApiClient.get<any>('requests');
        if (!res.ok) return [];
        if (Array.isArray(res.data)) return res.data;
        return (res.data as any)?.items || [];
    }
    async saveRequest(r: B2BRequest) {
        // Check if ID exists and is not temp ID (usually real IDs are ints or uuids, temp are 'req_'...)
        // But for consistency, let's try to fetch or assume if it looks like a server ID.
        // Simplified: If it has an ID, try PUT, if fail, POST? Or just POST for new.
        // Local adapter generates 'req_...' IDs. We should strip those for creation on server?
        // Or if we trust the ID handling:
        if (r.id && !r.id.startsWith('req_')) {
            const res = await ApiClient.put<B2BRequest>(`requests/${r.id}`, r);
            if (res.ok) return res.data as B2BRequest;
        }
        const { id, ...payload } = r; // Strip local ID
        const res = await ApiClient.post<B2BRequest>('requests', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as B2BRequest;
    }
    async deleteRequest(id: string) {
        await ApiClient.delete(`requests/${id}`);
    }

    // --- LEADS (Relational) ---
    async getLeads() {
        const res = await ApiClient.get<any>('leads');
        if (!res.ok) return [];
        if (Array.isArray(res.data)) return res.data;
        return res.data?.items || [];
    }
    async saveLead(l: Lead) {
        if (l.id && !l.id.startsWith('lead_')) {
            const res = await ApiClient.put<Lead>(`leads/${l.id}`, l);
            if (res.ok) return res.data as Lead;
        }
        const { id, ...payload } = l;
        const res = await ApiClient.post<Lead>('leads', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as Lead;
    }

    // --- BOTS (Relational) ---
    async getBots() {
        const res = await ApiClient.get<Bot[]>('bots');
        return res.ok ? res.data : [];
    }
    async saveBot(b: Bot) {
        const hasPersistentId = b.id && !String(b.id).startsWith('bot_') && !String(b.id).startsWith('temp_');

        if (hasPersistentId) {
            const res = await ApiClient.put<Bot>(`bots/${b.id}`, b);
            if (res.ok) return res.data as Bot;
            console.warn('[ServerAdapter] Bot update failed, falling back to create:', res.message);
        }

        const { id, ...payload } = b as any;
        const res = await ApiClient.post<Bot>('bots', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as Bot;
    }
    async deleteBot(id: string) {
        await ApiClient.delete(`bots/${id}`);
    }

    // Sessions - Keep Dynamic
    async getSession(chatId: string) {
        const all = await this.listEntities<BotSession>(SLUGS.SESSION);
        return all.find(s => s.chatId === chatId) || null;
    }
    async saveSession(s: BotSession) {
        const payload = { ...s, id: `sess_${s.chatId}` };
        return this.saveEntity(SLUGS.SESSION, payload);
    }
    async clearSession(chatId: string) {
        return this.deleteEntity(SLUGS.SESSION, `sess_${chatId}`);
    }

    async getScenarios() {
        const res = await ApiClient.get<Scenario[]>('scenarios');
        return res.ok ? res.data : [];
    }
    async saveScenario(s: Scenario) {
        const payload = { ...s, keywords: s.keywords || [] };
        const res = await ApiClient.post<Scenario>('scenarios', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as Scenario;
    }
    async deleteScenario(id: string) {
        const res = await ApiClient.delete(`scenarios/${id}`);
        if (!res.ok) throw new Error(res.message);
    }

    async getContent() { return this.listEntities<TelegramContent>(SLUGS.CONTENT); }
    async saveContent(c: TelegramContent) { return this.saveEntity(SLUGS.CONTENT, c); }

    async getDrafts() {
        const res = await ApiClient.get<any[]>('drafts');
        return res.ok ? res.data : [];
    }


    async getCampaigns() { return this.listEntities<Campaign>(SLUGS.CAMPAIGN); }
    async saveCampaign(c: Campaign) { return this.saveEntity(SLUGS.CAMPAIGN, c); }

    async getMessages(filter?: { chatId?: string; botId?: string; limit?: number }) {
        const params = new URLSearchParams();
        if (filter?.limit) params.append('limit', String(filter.limit));
        if (filter?.chatId) params.append('chatId', filter.chatId);
        if (filter?.botId) params.append('botId', filter.botId);
        const query = params.toString();
        const res = await ApiClient.get<TelegramMessage[]>(`messages?${query || 'limit=200'}`);
        return res.ok ? (res.data || []) : [];
    }
    async saveMessage(m: TelegramMessage) {
        const res = await ApiClient.post('messages', m);
        if (!res.ok) throw new Error(res.message);
        return m;
    }

    async getDestinations() {
        const res = await ApiClient.get<TelegramDestination[]>('destinations');
        return res.ok ? (res.data || []) : [];
    }
    async saveDestination(d: TelegramDestination) { return this.saveEntity(SLUGS.DESTINATION, d); }

    async getInventory() {
        const res = await ApiClient.get<any>('inventory?limit=1000&status=ALL');
        if (!res.ok) return [];
        if (Array.isArray(res.data)) return res.data;
        return res.data?.items || [];
    }
    async saveInventoryItem(i: CarListing) {
        const id = i.canonicalId || i.id;
        const payload = { ...i, id };
        if (id) {
            const res = await ApiClient.put<CarListing>(`inventory/${id}`, payload);
            if (!res.ok) throw new Error(res.message);
            return res.data as CarListing;
        }
        const res = await ApiClient.post<CarListing>('inventory', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as CarListing;
    }
    async deleteInventoryItem(id: string) {
        await ApiClient.delete(`inventory/${id}`);
    }

    async getCompanies() { return this.listEntities<Company>(SLUGS.COMPANY); }
    async saveCompany(c: Company) { return this.saveEntity(SLUGS.COMPANY, c); }
    async deleteCompany(id: string) { return this.deleteEntity(SLUGS.COMPANY, id); }

    // --- SETTINGS (Relational) ---
    async getSettings() {
        // Use system settings endpoint (protected) and gracefully fall back to defaults/public config
        const res = await ApiClient.get<SystemSettings>('system/settings');
        const settings = res.ok ? res.data : {} as SystemSettings;

        const defaultNavigation = [
            { id: 'nav_dash', labelKey: 'nav.dashboard', path: '/', iconName: 'LayoutDashboard', visible: true, order: 0, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
            { id: 'nav_inbox', labelKey: 'nav.inbox', path: '/inbox', iconName: 'MessageCircle', visible: true, order: 1, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
            { id: 'nav_req', labelKey: 'nav.requests', path: '/requests', iconName: 'FileText', visible: true, order: 2, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
            { id: 'nav_inv', labelKey: 'nav.inventory', path: '/inventory', iconName: 'Car', visible: true, order: 3, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
            { id: 'nav_tele', labelKey: 'nav.telegram', path: '/telegram', iconName: 'Send', visible: true, order: 4, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
            { id: 'nav_cal', labelKey: 'nav.calendar', path: '/calendar', iconName: 'Calendar', visible: true, order: 5, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
            { id: 'nav_cont', labelKey: 'nav.content', path: '/content', iconName: 'Library', visible: true, order: 6, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
            { id: 'nav_scen', labelKey: 'nav.scenarios', path: '/scenarios', iconName: 'Database', visible: true, order: 7, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
            { id: 'nav_integrations', labelKey: 'nav.integrations', path: '/integrations', iconName: 'Plug', visible: true, order: 8, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'] },
            { id: 'nav_company', labelKey: 'nav.company', path: '/company', iconName: 'Briefcase', visible: true, order: 9, roles: ['SUPER_ADMIN', 'ADMIN', 'OWNER'] },
            { id: 'nav_sets', labelKey: 'nav.settings', path: '/settings', iconName: 'Settings', visible: true, order: 99, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] }
        ];

        // Polyfill defaults if missing (e.g. empty DB)
        if (!settings.features) {
            settings.features = {
                MODULE_SCENARIOS: true,
                MODULE_SEARCH: true,
                MODULE_CAMPAIGNS: true,
                MODULE_COMPANIES: true,
                MODULE_CONTENT: true,
                MODULE_INTEGRATIONS: true
            };
        }
        if (!settings.navigation) {
            settings.navigation = defaultNavigation;
        } else {
            // Normalize: accept either array or object with primary[]
            const navigationArray = Array.isArray(settings.navigation)
                ? settings.navigation
                : Array.isArray((settings.navigation as any).primary)
                    ? (settings.navigation as any).primary
                    : [];

            // Merge in any missing required nav items to avoid hiding key modules
            const mergedNav = [...navigationArray];
            defaultNavigation.forEach(item => {
                if (!mergedNav.find((n: any) => n.id === item.id)) {
                    mergedNav.push(item);
                }
            });
            settings.navigation = mergedNav.sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999));
        }

        return settings;
    }
    async saveSettings(s: SystemSettings) {
        const res = await ApiClient.put('system/settings', s);
        if (!res.ok) throw new Error(res.message);
        return s; // API returns success:true
    }

    async getDictionaries() {
        const list = await this.listEntities<DictionaryCollection>(SLUGS.DICT);
        return list[0] || { brands: [], cities: [], id: 'main_dict' };
    }
    async saveDictionaries(d: DictionaryCollection) {
        const payload = { ...d, id: 'main_dict' };
        return this.saveEntity(SLUGS.DICT, payload);
    }

    async getNotifications() { return this.listEntities<SystemNotification>(SLUGS.NOTIFICATION); }
    async saveNotification(n: SystemNotification) { return this.saveEntity(SLUGS.NOTIFICATION, n); }

    async getActivityLogs() { return this.listEntities<ActivityLog>(SLUGS.ACTIVITY); }
    async logActivity(log: ActivityLog) {
        // Best effort log
        try { await this.saveEntity(SLUGS.ACTIVITY, log); } catch (e) { console.debug("Log failed", e); }
    }

    async getProposal(id: string) { return this.getEntity<Proposal>(SLUGS.PROPOSAL, id).then(r => r || undefined); }
    async updateProposal(id: string, data: Partial<Proposal>) {
        const existing = await this.getProposal(id);
        if (existing) {
            await this.saveEntity(SLUGS.PROPOSAL, { ...existing, ...data });
        }
    }

    async createSnapshot(name: string) {
        const snapshotData: any = {
            name,
            createdAt: new Date().toISOString(),
            data: {}
        };
        const slugsToBackup = Object.values(SLUGS).filter(s => s !== SLUGS.SNAPSHOT && s !== SLUGS.ACTIVITY);
        for (const slug of slugsToBackup) {
            const records = await this.listEntities(slug);
            snapshotData.data[slug] = records;
        }
        return this.saveEntity(SLUGS.SNAPSHOT, { id: `snap_${Date.now()}`, ...snapshotData });
    }

    async listSnapshots() {
        return this.listEntities<any>(SLUGS.SNAPSHOT);
    }

    async restoreSnapshot(snapId: string) {
        const allSnaps = await this.listSnapshots();
        const target = allSnaps.find((s: any) => s.id === snapId);

        if (!target || !(target as any).data) throw new Error("Snapshot not found or empty");
        const targetData = (target as any).data;

        const slugs = Object.keys(targetData);
        for (const slug of slugs) {
            const current = await this.listEntities<any>(slug);
            await Promise.all(current.map(r =>
                ApiClient.delete(`entities/${slug}/records/${r._recordId}`)
            ));
            const records = targetData[slug];
            await Promise.all(records.map((r: any) =>
                ApiClient.post(`entities/${slug}/records`, { data: this.wrap(r) })
            ));
        }
    }

    // --- MTPROTO ---
    async getMTProtoConnectors() {
        const res = await ApiClient.get<any[]>('integrations/mtproto/connectors');
        return res.ok ? res.data : [];
    }
    async createMTProtoConnector(data: any) {
        const res = await ApiClient.post('integrations/mtproto/connectors', data);
        if (!res.ok) throw new Error(res.message);
        return res.data;
    }
    async deleteMTProtoConnector(id: string) {
        await ApiClient.delete(`integrations/mtproto/connectors/${id}`);
    }
    async sendMTProtoCode(connectorId: string, phone: string) {
        const res = await ApiClient.post('integrations/mtproto/auth/send-code', { connectorId, phone });
        if (!res.ok) throw new Error(res.message);
        return res.data;
    }
    async signInMTProto(data: any) {
        const res = await ApiClient.post('integrations/mtproto/auth/sign-in', data);
        if (!res.ok) throw new Error(res.message);
    }

    async getMTProtoChannels(connectorId: string) {
        const res = await ApiClient.get<any[]>(`integrations/mtproto/${connectorId}/channels`);
        return res.ok ? res.data : [];
    }

    async resolveMTProtoChannel(connectorId: string, query: string) {
        const res = await ApiClient.get<any>(`integrations/mtproto/${connectorId}/resolve?query=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(res.message);
        return res.data;
    }

    async addMTProtoChannel(connectorId: string, channel: any, importRules: any) {
        const res = await ApiClient.post(`integrations/mtproto/${connectorId}/channels`, { channel, importRules });
        if (!res.ok) throw new Error(res.message);
        return res.data;
    }

    async deleteMTProtoChannel(id: string) {
        const res = await ApiClient.delete(`integrations/mtproto/channels/${id}`);
        if (!res.ok) throw new Error(res.message);
    }

    async syncMTProto(connectorId: string) {
        const res = await ApiClient.post(`integrations/mtproto/${connectorId}/sync`, {});
        if (!res.ok) throw new Error(res.message);
    }
}
