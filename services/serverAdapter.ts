
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

    async getUsers() { return this.listEntities<User>(SLUGS.USER); }
    async saveUser(u: User) { return this.saveEntity(SLUGS.USER, u); }

    async getRequests() { return this.listEntities<B2BRequest>(SLUGS.REQUEST); }
    async saveRequest(r: B2BRequest) { return this.saveEntity(SLUGS.REQUEST, r); }
    async deleteRequest(id: string) { return this.deleteEntity(SLUGS.REQUEST, id); }

    async getLeads() { return this.listEntities<Lead>(SLUGS.LEAD); }
    async saveLead(l: Lead) { return this.saveEntity(SLUGS.LEAD, l); }

    async getBots() { return this.listEntities<Bot>(SLUGS.BOT); }
    async saveBot(b: Bot) { return this.saveEntity(SLUGS.BOT, b); }
    async deleteBot(id: string) { return this.deleteEntity(SLUGS.BOT, id); }

    // Sessions
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

    async getScenarios() { return this.listEntities<Scenario>(SLUGS.SCENARIO); }
    async saveScenario(s: Scenario) { return this.saveEntity(SLUGS.SCENARIO, s); }
    async deleteScenario(id: string) { return this.deleteEntity(SLUGS.SCENARIO, id); }

    async getContent() { return this.listEntities<TelegramContent>(SLUGS.CONTENT); }
    async saveContent(c: TelegramContent) { return this.saveEntity(SLUGS.CONTENT, c); }

    async getCampaigns() { return this.listEntities<Campaign>(SLUGS.CAMPAIGN); }
    async saveCampaign(c: Campaign) { return this.saveEntity(SLUGS.CAMPAIGN, c); }

    async getMessages() { return this.listEntities<TelegramMessage>(SLUGS.MESSAGE); }
    async saveMessage(m: TelegramMessage) { return this.saveEntity(SLUGS.MESSAGE, m); }

    async getDestinations() { return this.listEntities<TelegramDestination>(SLUGS.DESTINATION); }
    async saveDestination(d: TelegramDestination) { return this.saveEntity(SLUGS.DESTINATION, d); }

    async getInventory() { return this.listEntities<CarListing>(SLUGS.INVENTORY); }
    async saveInventoryItem(i: CarListing) { 
        const mapped = { ...i, id: i.canonicalId }; 
        return this.saveEntity(SLUGS.INVENTORY, mapped); 
    }
    async deleteInventoryItem(id: string) { return this.deleteEntity(SLUGS.INVENTORY, id); }

    async getCompanies() { return this.listEntities<Company>(SLUGS.COMPANY); }
    async saveCompany(c: Company) { return this.saveEntity(SLUGS.COMPANY, c); }
    async deleteCompany(id: string) { return this.deleteEntity(SLUGS.COMPANY, id); }

    async getSettings() {
        const list = await this.listEntities<SystemSettings>(SLUGS.SETTINGS);
        return (list[0] || { id: 'sys_settings' }) as unknown as SystemSettings;
    }
    async saveSettings(s: SystemSettings) {
        const payload = { ...s, id: 'sys_settings' };
        return this.saveEntity(SLUGS.SETTINGS, payload);
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
