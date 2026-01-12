
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
        return res.data?.map(this.unwrap) || [];
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
            const res = await ApiClient.put(`users/${u.id}`, u);
            if (res.ok) return res.data;
        }
        const { id, ...data } = u;
        const res = await ApiClient.post('users', data);
        if (!res.ok) throw new Error(res.message);
        return res.data;
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
            const res = await ApiClient.put(`requests/${r.id}`, r);
            if (res.ok) return res.data;
        }
        const { id, ...payload } = r; // Strip local ID
        const res = await ApiClient.post('requests', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data;
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
            const res = await ApiClient.put(`leads/${l.id}`, l);
            if (res.ok) return res.data;
        }
        const { id, ...payload } = l;
        const res = await ApiClient.post('leads', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data;
    }

    // --- BOTS (Relational) ---
    async getBots() {
        const res = await ApiClient.get<Bot[]>('bots');
        return res.ok ? res.data : [];
    }
    async saveBot(b: Bot) {
        if (b.id) {
            const res = await ApiClient.put(`bots/${b.id}`, b);
            if (res.ok) return res.data;
        }
        const res = await ApiClient.post('bots', b);
        if (!res.ok) throw new Error(res.message);
        return res.data;
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

    async getCampaigns() { return this.listEntities<Campaign>(SLUGS.CAMPAIGN); }
    async saveCampaign(c: Campaign) { return this.saveEntity(SLUGS.CAMPAIGN, c); }

    async getMessages() { return this.listEntities<TelegramMessage>(SLUGS.MESSAGE); }
    async saveMessage(m: TelegramMessage) { return this.saveEntity(SLUGS.MESSAGE, m); }

    async getDestinations() { return this.listEntities<TelegramDestination>(SLUGS.DESTINATION); }
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
        const res = await ApiClient.get<SystemSettings>('settings');
        const settings = res.ok ? res.data : {} as SystemSettings;

        // Polyfill defaults if missing (e.g. empty DB)
        if (!settings.features) {
            settings.features = {
                MODULE_SCENARIOS: true,
                MODULE_SEARCH: true,
                MODULE_CAMPAIGNS: true,
                MODULE_COMPANIES: true
            };
        }
        if (!settings.navigation) {
            settings.navigation = [
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
        }

        return settings;
    }
    async saveSettings(s: SystemSettings) {
        const res = await ApiClient.post('settings', s);
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
}
