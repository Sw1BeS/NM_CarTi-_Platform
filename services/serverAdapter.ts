
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
        // Users are special - likely managed via Auth, but for listing we can try generic or specific if added.
        // Assuming generic 'sys_user' for now as no /users endpoint was visible in apiRoutes (except implicit auth)
        return this.listEntities<User>(SLUGS.USER);
    }
    async saveUser(u: User) { return this.saveEntity(SLUGS.USER, u); }

    // --- REQUESTS (Relational) ---
    async getRequests() {
        const res = await ApiClient.get<B2BRequest[]>('requests');
        return res.ok ? res.data : [];
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
        const res = await ApiClient.get<Lead[]>('leads');
        return res.ok ? res.data : [];
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
        // Bots use numeric IDs usually in postgres, but string in Types?
        // Prisma schema says Int id.
        const numericId = parseInt(b.id);
        if (!isNaN(numericId)) {
            const res = await ApiClient.put(`bots/${numericId}`, b);
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

    // --- SETTINGS (Relational) ---
    async getSettings() {
        const res = await ApiClient.get<SystemSettings>('settings');
        return res.ok ? res.data : {} as SystemSettings;
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
