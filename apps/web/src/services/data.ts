
import { DataAdapter } from './dataAdapter';
import { ServerAdapter } from './serverAdapter';
import { ApiClient } from './apiClient';
import type { CarListing, CarSearchFilter, Scenario } from '../types';

const serverAdapter = new ServerAdapter();

const buildDefaultScenarioNode = () => ({
    id: 'node_start',
    type: 'START',
    content: { text: '' },
    nextNodeId: '',
    position: { x: 200, y: 300 }
});

const normalizeScenario = (s: any): Scenario => {
    const source = (s && typeof s === 'object') ? s : {};
    const nodesValue = (source as any)?.nodes;
    let rawNodes = Array.isArray(nodesValue) ? nodesValue : [];
    if (!rawNodes.length && nodesValue && typeof nodesValue === 'object') {
        rawNodes = Object.values(nodesValue);
    }
    const nodes = rawNodes.length ? rawNodes : [buildDefaultScenarioNode()];
    const safeNodes = nodes.map((n: any, idx: number) => {
        const base = (n && typeof n === 'object') ? n : {};
        return {
            ...base,
            id: (base as any).id || `node_${idx}`,
            content: ((base as any).content && typeof (base as any).content === 'object') ? (base as any).content : {},
            position: ((base as any).position && typeof (base as any).position === 'object') ? (base as any).position : undefined
        };
    });
    const entryNodeId = (source as any)?.entryNodeId && safeNodes.find(n => n.id === (source as any).entryNodeId)
        ? (source as any).entryNodeId
        : (safeNodes[0]?.id || '');

    return {
        ...source,
        keywords: Array.isArray((source as any)?.keywords) ? (source as any).keywords : [],
        nodes: safeNodes,
        entryNodeId
    } as Scenario;
};

class DataService {
    private adapter: DataAdapter;
    private listeners: Record<string, Function[]> = {};

    constructor() {
        this.adapter = serverAdapter;
    }

    // --- Subscription Logic ---
    subscribe(event: string, callback: () => void) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
        return () => {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        };
    }

    private notify(event: string) {
        if (this.listeners[event]) this.listeners[event].forEach(cb => cb());
    }
    // Expose notify for internal refresh triggers
    public _notify(event: string) { this.notify(event); }

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

    async getScenarios() {
        const scenarios = await this.adapter.getScenarios();
        return Array.isArray(scenarios) ? scenarios.map(normalizeScenario) : [];
    }
    async saveScenario(s: any) {
        const normalized = normalizeScenario(s);
        const res = await this.adapter.saveScenario(normalized);
        this.notify('UPDATE_SCENARIOS');
        return res;
    }
    async deleteScenario(id: string) { await this.adapter.deleteScenario(id); this.notify('UPDATE_SCENARIOS'); }
    async getTemplates() {
        const templates = await this.adapter.getScenarios();
        return Array.isArray(templates) ? templates.map(normalizeScenario) : [];
    }

    async getContent() { return this.adapter.getContent(); }
    async saveContent(c: any) { const res = await this.adapter.saveContent(c); this.notify('UPDATE_CONTENT'); return res; }
    async getCampaigns() { return this.adapter.getCampaigns(); }
    async saveCampaign(c: any) { const res = await this.adapter.saveCampaign(c); this.notify('UPDATE_CAMPAIGNS'); return res; }
    async createCampaign(c: any) { return this.saveCampaign(c); }

    async getMessages(filter?: { chatId?: string; botId?: string; limit?: number }) { return this.adapter.getMessages(filter); }
    async addMessage(m: any) { const res = await this.adapter.saveMessage(m); this.notify('UPDATE_MESSAGES'); return res; }

    async getDestinations() { return this.adapter.getDestinations(); }
    async saveDestination(d: any) { const res = await this.adapter.saveDestination(d); this.notify('UPDATE_DESTINATIONS'); return res; }
    async addDestination(d: any) { return this.saveDestination(d); }

    async getInventory() { return this.adapter.getInventory(); }
    async saveInventoryItem(i: any) { const res = await this.adapter.saveInventoryItem(i); this.notify('UPDATE_INVENTORY'); return res; }
    async deleteInventoryItem(id: string) { await this.adapter.deleteInventoryItem(id); this.notify('UPDATE_INVENTORY'); }

    async searchCars(filter: CarSearchFilter): Promise<CarListing[]> {
        const inventory = await this.getInventory();
        return inventory.filter(car => {
            if (car.status !== 'AVAILABLE') return false;

            const matchesBrand = !filter.brand || car.title.toLowerCase().includes(filter.brand.toLowerCase());
            let matchesModel = true;
            if (filter.model) {
                const titleWords = car.title.toLowerCase().split(' ');
                const modelWords = filter.model.toLowerCase().split(' ');
                matchesModel = modelWords.some(w => w.length > 1 && titleWords.includes(w));
            }
            const matchesPrice = (!filter.priceMin || car.price.amount >= filter.priceMin) &&
                (!filter.priceMax || car.price.amount <= filter.priceMax);
            const matchesYear = (!filter.yearMin || car.year >= filter.yearMin) &&
                (!filter.yearMax || car.year <= filter.yearMax);

            return matchesBrand && matchesModel && matchesPrice && matchesYear;
        });
    }

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

    async getMessageLogs(filter: { requestId?: string; chatId?: string; limit?: number }) {
        const params = new URLSearchParams();
        if (filter.requestId) params.append('requestId', filter.requestId);
        if (filter.chatId) params.append('chatId', filter.chatId);
        if (filter.limit) params.append('limit', String(filter.limit));
        const res = await ApiClient.get<any[]>(`messages/logs?${params.toString()}`);
        if (!res.ok) return [];
        return Array.isArray(res.data) ? res.data : [];
    }

    // --- MTPROTO ---
    async getMTProtoConnectors() { return this.adapter.getMTProtoConnectors(); }
    async createMTProtoConnector(data: any) { const r = await this.adapter.createMTProtoConnector(data); this.notify('UPDATE_MTPROTO'); return r; }
    async deleteMTProtoConnector(id: string) { await this.adapter.deleteMTProtoConnector(id); this.notify('UPDATE_MTPROTO'); }
    async sendMTProtoCode(cid: string, phone: string) { return this.adapter.sendMTProtoCode(cid, phone); }
    async signInMTProto(data: any) { await this.adapter.signInMTProto(data); this.notify('UPDATE_MTPROTO'); }

    async getMTProtoChannels(connectorId: string) { return this.adapter.getMTProtoChannels(connectorId); }
    async resolveMTProtoChannel(connectorId: string, query: string) { return this.adapter.resolveMTProtoChannel(connectorId, query); }
    async addMTProtoChannel(connectorId: string, channel: any, importRules: any) {
        const res = await this.adapter.addMTProtoChannel(connectorId, channel, importRules);
        this.notify('UPDATE_CHANNELS');
        return res;
    }
    async deleteMTProtoChannel(id: string) {
        await this.adapter.deleteMTProtoChannel(id);
        this.notify('UPDATE_CHANNELS');
    }

    async syncMTProto(connectorId: string) { return this.adapter.syncMTProto(connectorId); }
}

export const Data = new DataService();
