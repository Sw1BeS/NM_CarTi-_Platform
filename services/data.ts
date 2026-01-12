
import { DataAdapter } from './dataAdapter';
import { ServerAdapter } from './serverAdapter';
import { Storage as LocalStorageService } from './storage';

// Wrapper to make sync Storage async and conform to DataAdapter
class LocalAdapterWrapper implements DataAdapter {
    async init() { return; }
    // Implemented logic primarily bridges to Storage calls
    async getEntity<T>(slug: string, id: string) {
        const list = LocalStorageService.listCustomEntities(slug);
        return list.find((x: any) => x.id === id) || null;
    }
    async listEntities<T>(slug: string) {
        return LocalStorageService.listCustomEntities(slug);
    }
    async saveEntity<T extends { id: string }>(slug: string, d: T) {
        return LocalStorageService.saveCustomEntity(slug, d);
    }
    async deleteEntity(slug: string, id: string) {
        LocalStorageService.deleteCustomEntity(slug, id);
    }

    async getUsers() { return LocalStorageService.getUsers(); }
    async saveUser(u: any) { LocalStorageService.createUser(u); return u; }

    async getRequests() { return LocalStorageService.getRequests(); }
    async saveRequest(r: any) {
        const exists = LocalStorageService.getRequest(r.id);
        if (exists) LocalStorageService.updateRequest(r.id, r);
        else LocalStorageService.createRequest(r);
        return r;
    }
    async deleteRequest(id: string) { LocalStorageService.deleteRequest(id); }

    async getLeads() { return LocalStorageService.getLeads(); }
    async saveLead(l: any) { LocalStorageService.createLead(l); return l; }

    async getBots() { return LocalStorageService.getBots(); }
    async saveBot(b: any) { LocalStorageService.saveBot(b, true); return b; }
    async deleteBot(id: string) { LocalStorageService.deleteBot(id); }

    async getSession(chatId: string) { return LocalStorageService.getSession(chatId); }
    async saveSession(s: any) { LocalStorageService.saveSession(s); return s; }
    async clearSession(chatId: string) { LocalStorageService.clearSession(chatId); }

    async getScenarios() { return LocalStorageService.getScenarios(); }
    async saveScenario(s: any) { LocalStorageService.saveScenario(s); return s; }
    async deleteScenario(id: string) { LocalStorageService.deleteScenario(id); }

    async getContent() { return LocalStorageService.getContent(); }
    async saveContent(c: any) {
        const all = LocalStorageService.getContent();
        if (all.find(x => x.id === c.id)) LocalStorageService.updateContent(c.id, c);
        else LocalStorageService.createContent(c);
        return c;
    }

    async getCampaigns() { return LocalStorageService.getCampaigns(); }
    async saveCampaign(c: any) { LocalStorageService.updateCampaign(c.id, c); return c; }

    async getMessages() { return LocalStorageService.getMessages(); }
    async saveMessage(m: any) { LocalStorageService.addMessage(m); return m; }

    async getDestinations() { return LocalStorageService.getDestinations(); }
    async saveDestination(d: any) { LocalStorageService.saveDestination(d); return d; }

    async getInventory() { return LocalStorageService.getInventory(); }
    async saveInventoryItem(i: any) { LocalStorageService.saveInventoryItem(i); return i; }
    async deleteInventoryItem(id: string) { LocalStorageService.deleteInventoryItem(id); }

    async getCompanies() { return LocalStorageService.getCompanies(); }
    async saveCompany(c: any) { LocalStorageService.updateCompany(c.id, c); return c; }
    async deleteCompany(id: string) { LocalStorageService.deleteCompany(id); }

    async getSettings() { return LocalStorageService.getSettings(); }
    async saveSettings(s: any) { LocalStorageService.saveSettings(s); return s; }

    async getDictionaries() { return LocalStorageService.getDictionaries(); }
    async saveDictionaries(d: any) { LocalStorageService.saveDictionaries(d); return d; }

    async getNotifications() { return LocalStorageService.getNotifications(); }
    async saveNotification(n: any) { return LocalStorageService.saveNotification(n); }

    async getActivityLogs() { return LocalStorageService.getActivity(); }
    async logActivity(l: any) { LocalStorageService.logActivity(l.userId, l.action, l.details, l.entityType); }

    async getProposal(id: string) { return LocalStorageService.getProposal(id); }
    async updateProposal(id: string, data: any) { LocalStorageService.updateProposal(id, data); }

    async createSnapshot(name: string) { return LocalStorageService.exportState(); }
    async listSnapshots() { return [LocalStorageService.getSnapshot()].filter(Boolean); }
    async restoreSnapshot() { LocalStorageService.restoreSnapshot(); }
}

const localAdapter = new LocalAdapterWrapper();
const serverAdapter = new ServerAdapter();

export type DataMode = 'SERVER' | 'LOCAL';

class DataService {
    private adapter: DataAdapter;
    private mode: DataMode;
    private listeners: Record<string, Function[]> = {};

    constructor() {
        const savedMode = localStorage.getItem('cartie_data_mode') as DataMode;
        this.mode = savedMode || 'SERVER'; // Default to SERVER for production use
        this.adapter = this.mode === 'SERVER' ? serverAdapter : localAdapter;
    }

    getMode() { return this.mode; }

    setMode(mode: DataMode) {
        this.mode = mode;
        this.adapter = mode === 'SERVER' ? serverAdapter : localAdapter;
        localStorage.setItem('cartie_data_mode', mode);
        window.location.reload();
    }

    // --- Subscription Logic ---
    subscribe(event: string, callback: () => void) {
        if (this.mode === 'LOCAL') {
            return LocalStorageService.subscribe(event, callback);
        }
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
        return () => {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        };
    }

    private notify(event: string) {
        if (this.mode === 'LOCAL') return; // Local handles itself
        if (this.listeners[event]) this.listeners[event].forEach(cb => cb());
    }

    // --- GENERIC ENTITY ACCESS ---
    async listEntities<T>(slug: string) { return this.adapter.listEntities<T>(slug); }
    async getEntity<T>(slug: string, id: string) { return this.adapter.getEntity<T>(slug, id); }
    async saveEntity<T extends { id: string }>(slug: string, data: T) { const r = await this.adapter.saveEntity(slug, data); this.notify(`UPDATE_${slug.toUpperCase()}`); return r; }
    async deleteEntity(slug: string, id: string) { await this.adapter.deleteEntity(slug, id); this.notify(`UPDATE_${slug.toUpperCase()}`); }

    // --- PROXY METHODS (Trigger notify on writes) ---
    async getUsers() { return this.adapter.getUsers(); }
    async saveUser(u: any) { const r = await this.adapter.saveUser(u); this.notify('UPDATE_USERS'); return r; }

    async getRequests() { return this.adapter.getRequests(); }
    async createRequest(r: any) { const res = await this.adapter.saveRequest(r); this.notify('UPDATE_REQUESTS'); return res; }
    async saveRequest(r: any) { const res = await this.adapter.saveRequest(r); this.notify('UPDATE_REQUESTS'); return res; }
    async deleteRequest(id: string) { await this.adapter.deleteRequest(id); this.notify('UPDATE_REQUESTS'); }

    async getLeads() { return this.adapter.getLeads(); }
    async createLead(l: any) { const res = await this.adapter.saveLead(l); this.notify('UPDATE_LEADS'); return res; }

    async getBots() { return this.adapter.getBots(); }
    async saveBot(b: any) { const res = await this.adapter.saveBot(b); this.notify('UPDATE_BOTS'); return res; }
    async deleteBot(id: string) { await this.adapter.deleteBot(id); this.notify('UPDATE_BOTS'); }

    async getSession(chatId: string) { return this.adapter.getSession(chatId); }
    async saveSession(s: any) { return this.adapter.saveSession(s); }
    async clearSession(chatId: string) { await this.adapter.clearSession(chatId); }

    async getScenarios() { return this.adapter.getScenarios(); }
    async saveScenario(s: any) { const res = await this.adapter.saveScenario(s); this.notify('UPDATE_SCENARIOS'); return res; }
    async deleteScenario(id: string) { await this.adapter.deleteScenario(id); this.notify('UPDATE_SCENARIOS'); }
    async getTemplates() { return localAdapter.getScenarios(); }

    async getContent() { return this.adapter.getContent(); }
    async saveContent(c: any) { const res = await this.adapter.saveContent(c); this.notify('UPDATE_CONTENT'); return res; }
    async getCampaigns() { return this.adapter.getCampaigns(); }
    async saveCampaign(c: any) { const res = await this.adapter.saveCampaign(c); this.notify('UPDATE_CAMPAIGNS'); return res; }
    async createCampaign(c: any) { return this.saveCampaign(c); }

    async getMessages() { return this.adapter.getMessages(); }
    async addMessage(m: any) { const res = await this.adapter.saveMessage(m); this.notify('UPDATE_MESSAGES'); return res; }

    async getDestinations() { return this.adapter.getDestinations(); }
    async saveDestination(d: any) { const res = await this.adapter.saveDestination(d); this.notify('UPDATE_DESTINATIONS'); return res; }
    async addDestination(d: any) { return this.saveDestination(d); }

    async getInventory() { return this.adapter.getInventory(); }
    async saveInventoryItem(i: any) { const res = await this.adapter.saveInventoryItem(i); this.notify('UPDATE_INVENTORY'); return res; }
    async deleteInventoryItem(id: string) { await this.adapter.deleteInventoryItem(id); this.notify('UPDATE_INVENTORY'); }

    async getCompanies() { return this.adapter.getCompanies(); }
    async saveCompany(c: any) { const res = await this.adapter.saveCompany(c); this.notify('UPDATE_COMPANIES'); return res; }
    async deleteCompany(id: string) { await this.adapter.deleteCompany(id); this.notify('UPDATE_COMPANIES'); }

    async getSettings() { return this.adapter.getSettings(); }
    async saveSettings(s: any) { const res = await this.adapter.saveSettings(s); this.notify('UPDATE_SETTINGS'); return res; }

    async getDictionaries() { return this.adapter.getDictionaries(); }
    async saveDictionaries(d: any) { const res = await this.adapter.saveDictionaries(d); this.notify('UPDATE_DICTIONARIES'); return res; }

    async getNotifications() { return this.adapter.getNotifications(); }
    async addNotification(n: any) { const res = await this.adapter.saveNotification(n); this.notify('UPDATE_NOTIFICATIONS'); return res; }
    async saveNotification(n: any) { const res = await this.adapter.saveNotification(n); this.notify('UPDATE_NOTIFICATIONS'); return res; }

    async getActivity() { return this.adapter.getActivityLogs(); }
    async logActivity(userId: string, action: string, details: string, entityType: string) {
        return this.adapter.logActivity({
            id: `log_${Date.now()}`,
            userId, action, details, entityType,
            timestamp: new Date().toISOString()
        });
    }

    async getProposal(id: string) { return this.adapter.getProposal(id); }
    async updateProposal(id: string, data: any) { await this.adapter.updateProposal(id, data); }

    async createSnapshot(name: string) { return this.adapter.createSnapshot(name); }
    async listSnapshots() { return this.adapter.listSnapshots(); }
    async restoreSnapshot(id: string) { return this.adapter.restoreSnapshot(id); }
}

export const Data = new DataService();
