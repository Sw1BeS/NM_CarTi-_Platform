import { ApiClient } from './apiClient';
import { DraftsService } from './draftsService';
import { InventoryService } from './inventoryService';
import { LeadsService } from './leadsService';
import { RequestsService } from './requestsService';
import type { CarListing, CarSearchFilter, Scenario, DictionaryCollection } from '../types';
import { appendSuperadminCompanyParam, attachSuperadminCompany } from '../utils/superadminCompany';

const SLUGS = {
    SESSION: 'bot_session',
    CONTENT: 'tg_content',
    DESTINATION: 'tg_destination',
    COMPANY: 'sys_company',
    DICT: 'sys_dictionary',
    NOTIFICATION: 'sys_notification',
    ACTIVITY: 'sys_activity',
    SNAPSHOT: 'sys_snapshot',
    PROPOSAL: 'b2b_proposal'
};

const DEFAULT_NAVIGATION = [
    { id: 'nav_dash', labelKey: 'nav.dashboard', path: '/', iconName: 'LayoutDashboard', visible: true, order: 0, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
    { id: 'nav_inbox', labelKey: 'nav.inbox', path: '/inbox', iconName: 'MessageCircle', visible: true, order: 1, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
    { id: 'nav_req', labelKey: 'nav.requests', path: '/requests', iconName: 'FileText', visible: true, order: 2, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
    { id: 'nav_leads', labelKey: 'nav.leads', path: '/leads', iconName: 'Users', visible: true, order: 2.5, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'OWNER'] },
    { id: 'nav_inv', labelKey: 'nav.inventory', path: '/inventory', iconName: 'Car', visible: true, order: 3, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
    { id: 'nav_tele', labelKey: 'nav.telegram', path: '/telegram', iconName: 'Send', visible: true, order: 4, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
    { id: 'nav_cal', labelKey: 'nav.calendar', path: '/calendar', iconName: 'Calendar', visible: true, order: 5, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
    { id: 'nav_cont', labelKey: 'nav.content', path: '/content', iconName: 'Library', visible: true, order: 6, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
    { id: 'nav_scen', labelKey: 'nav.scenarios', path: '/scenarios', iconName: 'Database', visible: true, order: 7, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] },
    { id: 'nav_sets', labelKey: 'nav.settings', path: '/settings', iconName: 'Settings', visible: true, order: 99, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'] }
];

const buildDefaultScenarioNode = () => ({
    id: 'node_start',
    type: 'START',
    content: { text: '' },
    nextNodeId: '',
    position: { x: 200, y: 300 }
});

const normalizeScenario = (s: any): Scenario => {
    const source = (s && typeof s === 'object') ? s : {};
    const nodesValue = source?.nodes;
    let rawNodes = Array.isArray(nodesValue) ? nodesValue : [];
    if (!rawNodes.length && nodesValue && typeof nodesValue === 'object') {
        rawNodes = Object.values(nodesValue);
    }
    const nodes = rawNodes.length ? rawNodes : [buildDefaultScenarioNode()];
    const safeNodes = nodes.map((node: any, idx: number) => {
        const base = (node && typeof node === 'object') ? node : {};
        return {
            ...base,
            id: base.id || `node_${idx}`,
            content: (base.content && typeof base.content === 'object') ? base.content : {},
            position: (base.position && typeof base.position === 'object') ? base.position : undefined
        };
    });
    const entryNodeId = source?.entryNodeId && safeNodes.find(n => n.id === source.entryNodeId)
        ? source.entryNodeId
        : (safeNodes[0]?.id || '');

    return {
        ...source,
        keywords: Array.isArray(source?.keywords) ? source.keywords : [],
        nodes: safeNodes,
        entryNodeId
    } as Scenario;
};

class DataService {
    private listeners: Record<string, Function[]> = {};

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

    public _notify(event: string) { this.notify(event); }

    private unwrap(record: any): any {
        if (!record) return null;
        return { ...record.data, id: record.id || record.data?.id, _recordId: record.id };
    }

    private wrap(entity: any): any {
        const { _recordId, ...data } = entity || {};
        return data;
    }

    private buildQuery(params?: URLSearchParams) {
        const finalParams = appendSuperadminCompanyParam(params ?? new URLSearchParams());
        const query = finalParams.toString();
        return query ? `?${query}` : '';
    }

    // Generic entities (compat mode).
    async getEntity<T>(slug: string, id: string): Promise<T | null> {
        const res = await ApiClient.get<any>(`entities/${slug}/records/${id}`);
        if (!res.ok) return null;
        return this.unwrap(res.data);
    }

    async listEntities<T>(slug: string): Promise<T[]> {
        const res = await ApiClient.get<any>(`entities/${slug}/records?limit=1000`);
        if (!res.ok) return [];
        const payload = res.data;
        const items = Array.isArray(payload) ? payload : (payload?.items || []);
        return items.map((item: any) => this.unwrap(item));
    }

    async saveEntity<T extends { id: string }>(slug: string, data: T): Promise<T> {
        const all = await this.listEntities<any>(slug);
        const existing = all.find((record: any) => record.id === data.id);

        if (existing?._recordId) {
            const res = await ApiClient.put(`entities/${slug}/records/${existing._recordId}`, { data: this.wrap(data) });
            if (!res.ok) throw new Error(res.message);
            const unwrapped = this.unwrap(res.data);
            this.notify(`UPDATE_${slug.toUpperCase()}`);
            return unwrapped;
        }

        const createRes = await ApiClient.post(`entities/${slug}/records`, { data: this.wrap(data) });
        if (!createRes.ok) throw new Error(createRes.message);
        const created = this.unwrap(createRes.data);
        this.notify(`UPDATE_${slug.toUpperCase()}`);
        return created;
    }

    async deleteEntity(slug: string, id: string): Promise<void> {
        const all = await this.listEntities<any>(slug);
        const existing = all.find((record: any) => record.id === id);
        if (existing?._recordId) {
            await ApiClient.delete(`entities/${slug}/records/${existing._recordId}`);
        }
        this.notify(`UPDATE_${slug.toUpperCase()}`);
    }

    // Users.
    async getUsers() {
        const res = await ApiClient.get<any[]>('users');
        return res.ok ? (res.data || []) : [];
    }

    async saveUser(user: any) {
        if (user.id && !String(user.id).startsWith('u_')) {
            const updateRes = await ApiClient.put(`users/${user.id}`, user);
            if (updateRes.ok) {
                this.notify('UPDATE_USERS');
                return updateRes.data;
            }
        }

        const { id, ...payload } = user || {};
        const createRes = await ApiClient.post('users', payload);
        if (!createRes.ok) throw new Error(createRes.message);
        this.notify('UPDATE_USERS');
        return createRes.data;
    }

    // Requests.
    async getRequests() {
        const res = await RequestsService.getRequests({ limit: 1000 });
        return Array.isArray(res.items) ? res.items : [];
    }

    async createRequest(request: any) {
        const created = await RequestsService.createRequest(request);
        this.notify('UPDATE_REQUESTS');
        return created;
    }

    async saveRequest(request: any) {
        const payload = attachSuperadminCompany(request as any) as any;
        const persistentId = payload?.id && !String(payload.id).startsWith('req_');
        const saved = persistentId
            ? await RequestsService.updateRequest(String(payload.id), payload)
            : await RequestsService.createRequest(payload);
        this.notify('UPDATE_REQUESTS');
        return saved;
    }

    async deleteRequest(id: string) {
        await RequestsService.deleteRequest(id);
        this.notify('UPDATE_REQUESTS');
    }

    // Leads.
    async getLeads() {
        const res = await LeadsService.getLeads({ limit: 1000 });
        return Array.isArray(res.items) ? res.items : [];
    }

    async createLead(lead: any) {
        const created = await LeadsService.createLead(lead);
        this.notify('UPDATE_LEADS');
        return created;
    }

    // Bots.
    async getBots() {
        const res = await ApiClient.get<any[]>(`bots${this.buildQuery()}`);
        return res.ok ? (res.data || []) : [];
    }

    async saveBot(bot: any) {
        const payload = attachSuperadminCompany(bot as any) as any;
        const hasPersistentId = payload.id && !String(payload.id).startsWith('bot_') && !String(payload.id).startsWith('temp_');

        if (hasPersistentId) {
            const updateRes = await ApiClient.put(`bots/${payload.id}`, payload);
            if (updateRes.ok) {
                this.notify('UPDATE_BOTS');
                return updateRes.data;
            }
        }

        const { id, ...createPayload } = payload || {};
        const createRes = await ApiClient.post('bots', createPayload);
        if (!createRes.ok) throw new Error(createRes.message);
        this.notify('UPDATE_BOTS');
        return createRes.data;
    }

    async deleteBot(id: string) {
        const res = await ApiClient.delete(`bots/${id}`);
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_BOTS');
    }

    // Sessions.
    async getSession(chatId: string) {
        const all = await this.listEntities<any>(SLUGS.SESSION);
        return all.find((session: any) => session.chatId === chatId) || null;
    }

    async saveSession(session: any) {
        const payload = { ...session, id: `sess_${session.chatId}` };
        return this.saveEntity(SLUGS.SESSION, payload);
    }

    async clearSession(chatId: string) {
        await this.deleteEntity(SLUGS.SESSION, `sess_${chatId}`);
    }

    // Scenarios.
    async getScenarios(filter?: { botId?: string }) {
        const params = new URLSearchParams();
        if (filter?.botId) params.append('botId', filter.botId);
        const res = await ApiClient.get<any[]>(`scenarios${this.buildQuery(params)}`);
        const items = res.ok ? (res.data || []) : [];
        return Array.isArray(items) ? items.map(normalizeScenario) : [];
    }

    async saveScenario(scenario: any) {
        const normalized = normalizeScenario(scenario);
        const payload = attachSuperadminCompany({ ...normalized, keywords: normalized.keywords || [] } as any) as Scenario;
        const res = await ApiClient.post('scenarios', payload);
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_SCENARIOS');
        return res.data;
    }

    async deleteScenario(id: string) {
        const res = await ApiClient.delete(`scenarios/${id}`);
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_SCENARIOS');
    }

    async getTemplates() {
        const res = await ApiClient.get<any[]>('scenarios/templates');
        if (!res.ok) throw new Error(res.message || 'Failed to load templates');
        const list = Array.isArray(res.data) ? res.data : [];
        return list.map(normalizeScenario);
    }

    // Content, drafts, campaigns.
    async getContent() { return this.listEntities<any>(SLUGS.CONTENT); }

    async saveContent(content: any) {
        const saved = await this.saveEntity(SLUGS.CONTENT, content);
        this.notify('UPDATE_CONTENT');
        return saved;
    }

    async getDrafts() {
        try {
            return await DraftsService.getDrafts();
        } catch {
            return [];
        }
    }

    async getCampaigns() {
        const res = await ApiClient.get<any[]>(`campaigns${this.buildQuery()}`);
        return res.ok ? (res.data || []) : [];
    }

    async saveCampaign(campaign: any) {
        const res = await ApiClient.post('campaigns', attachSuperadminCompany(campaign as any));
        if (!res.ok) throw new Error(res.message || 'Campaign save failed');
        this.notify('UPDATE_CAMPAIGNS');
        return res.data;
    }

    async createCampaign(campaign: any) { return this.saveCampaign(campaign); }

    // Messages / inbox.
    async getMessages(filter?: { chatId?: string; botId?: string; limit?: number }) {
        const params = new URLSearchParams();
        if (filter?.limit) params.append('limit', String(filter.limit));
        if (filter?.chatId) params.append('chatId', filter.chatId);
        if (filter?.botId) params.append('botId', filter.botId);
        if (!params.has('limit')) params.append('limit', '200');

        const res = await ApiClient.get<any[]>(`messages${this.buildQuery(params)}`);
        return res.ok ? (res.data || []) : [];
    }

    async addMessage(message: any) {
        const res = await ApiClient.post('messages', message);
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_MESSAGES');
        return res.data;
    }

    async getMacros() {
        const res = await ApiClient.get<any[]>(`inbox/macros${this.buildQuery()}`);
        return res.ok ? (res.data || []) : [];
    }

    async createMacro(macro: any) {
        const res = await ApiClient.post('inbox/macros', attachSuperadminCompany(macro));
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_MACROS');
        return res.data;
    }

    async updateMacro(id: string, macro: any) {
        const res = await ApiClient.put(`inbox/macros/${id}`, attachSuperadminCompany(macro));
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_MACROS');
        return res.data;
    }

    async deleteMacro(id: string) {
        const res = await ApiClient.delete(`inbox/macros/${id}`);
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_MACROS');
    }

    async getChatNote(chatId: string) {
        const params = new URLSearchParams();
        params.append('chatId', chatId);
        const res = await ApiClient.get<any>(`inbox/notes${this.buildQuery(params)}`);
        return res.ok ? (res.data || null) : null;
    }

    async saveChatNote(payload: { chatId: string; text?: string }) {
        const res = await ApiClient.post('inbox/notes', attachSuperadminCompany(payload as any));
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_NOTES');
        return res.data;
    }

    // Destinations.
    async getDestinations() {
        const res = await ApiClient.get<any[]>(`destinations${this.buildQuery()}`);
        return res.ok ? (res.data || []) : [];
    }

    async saveDestination(destination: any) {
        const saved = await this.saveEntity(SLUGS.DESTINATION, destination);
        this.notify('UPDATE_DESTINATIONS');
        return saved;
    }

    async addDestination(destination: any) { return this.saveDestination(destination); }

    // Inventory.
    async getInventory() {
        const res = await InventoryService.getInventory({ limit: 1000, status: 'ALL' });
        return Array.isArray(res.items) ? res.items : [];
    }

    async saveInventoryItem(item: any) {
        const saved = await InventoryService.saveCar(item);
        this.notify('UPDATE_INVENTORY');
        return saved;
    }

    async deleteInventoryItem(id: string) {
        await InventoryService.deleteCar(id);
        this.notify('UPDATE_INVENTORY');
    }

    async searchCars(filter: CarSearchFilter): Promise<CarListing[]> {
        const inventory = await this.getInventory();
        return inventory.filter((car: any) => {
            if (car.status !== 'AVAILABLE') return false;

            const title = String(car.title || '').toLowerCase();
            const matchesBrand = !filter.brand || title.includes(filter.brand.toLowerCase());
            let matchesModel = true;
            if (filter.model) {
                const titleWords = title.split(' ');
                const modelWords = filter.model.toLowerCase().split(' ');
                matchesModel = modelWords.some((word) => word.length > 1 && titleWords.includes(word));
            }

            const amount = Number(car.price?.amount || car.price || 0);
            const matchesPrice = (!filter.priceMin || amount >= filter.priceMin) &&
                (!filter.priceMax || amount <= filter.priceMax);
            const matchesYear = (!filter.yearMin || car.year >= filter.yearMin) &&
                (!filter.yearMax || car.year <= filter.yearMax);

            return matchesBrand && matchesModel && matchesPrice && matchesYear;
        });
    }

    // Companies/settings/etc.
    async getCompanies() { return this.listEntities<any>(SLUGS.COMPANY); }

    async saveCompany(company: any) {
        const saved = await this.saveEntity(SLUGS.COMPANY, company);
        this.notify('UPDATE_COMPANIES');
        return saved;
    }

    async deleteCompany(id: string) {
        await this.deleteEntity(SLUGS.COMPANY, id);
        this.notify('UPDATE_COMPANIES');
    }

    async getSettings() {
        const res = await ApiClient.get<any>('system/settings');
        const settings = res.ok ? (res.data || {}) : {};

        if (!settings.features) {
            const featureRes = await ApiClient.get<Record<string, boolean>>('system/features/resolve');
            settings.features = featureRes.ok ? (featureRes.data || {}) : {};
        }

        if (!settings.navigation) {
            settings.navigation = { primary: DEFAULT_NAVIGATION };
            return settings;
        }

        const navigationArray = Array.isArray(settings.navigation)
            ? settings.navigation
            : Array.isArray(settings.navigation?.primary)
                ? settings.navigation.primary
                : Array.isArray(settings.navigation?.items)
                    ? settings.navigation.items
                    : [];

        const mergedNav = [...navigationArray];
        DEFAULT_NAVIGATION.forEach(item => {
            if (!mergedNav.find((entry: any) => entry.id === item.id || entry.path === item.path)) {
                mergedNav.push(item);
            }
        });

        const leadsItem = mergedNav.find((entry: any) => entry.id === 'nav_leads' || entry.path === '/leads');
        if (leadsItem) {
            leadsItem.visible = true;
        }

        settings.navigation = { primary: mergedNav.sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999)) };
        return settings;
    }

    async saveSettings(settings: any) {
        const res = await ApiClient.put('system/settings', settings);
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_SETTINGS');
        return settings;
    }

    async getDictionaries() {
        const list = await this.listEntities<DictionaryCollection>(SLUGS.DICT);
        return list[0] || { brands: [], cities: [], id: 'main_dict' };
    }

    async saveDictionaries(dicts: any) {
        const payload = { ...dicts, id: 'main_dict' };
        const saved = await this.saveEntity(SLUGS.DICT, payload);
        this.notify('UPDATE_DICTIONARIES');
        return saved;
    }

    async getNotifications() { return this.listEntities<any>(SLUGS.NOTIFICATION); }

    async addNotification(notification: any) {
        const saved = await this.saveEntity(SLUGS.NOTIFICATION, notification);
        this.notify('UPDATE_NOTIFICATIONS');
        return saved;
    }

    async saveNotification(notification: any) { return this.addNotification(notification); }

    async getActivity() { return this.listEntities<any>(SLUGS.ACTIVITY); }

    async logActivity(userId: string, action: string, details: string, entityType: string) {
        try {
            await this.saveEntity(SLUGS.ACTIVITY, {
                id: `log_${Date.now()}`,
                userId,
                action,
                details,
                entityType,
                timestamp: new Date().toISOString()
            } as any);
        } catch (error) {
            console.debug('Activity log failed', error);
        }
    }

    async getProposal(id: string) {
        return this.getEntity<any>(SLUGS.PROPOSAL, id);
    }

    async updateProposal(id: string, data: any) {
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
        const slugsToBackup = [
            SLUGS.CONTENT,
            SLUGS.DESTINATION,
            SLUGS.COMPANY,
            SLUGS.DICT,
            SLUGS.NOTIFICATION,
            SLUGS.PROPOSAL
        ];

        for (const slug of slugsToBackup) {
            snapshotData.data[slug] = await this.listEntities(slug);
        }

        return this.saveEntity(SLUGS.SNAPSHOT, { id: `snap_${Date.now()}`, ...snapshotData });
    }

    async listSnapshots() {
        return this.listEntities<any>(SLUGS.SNAPSHOT);
    }

    async restoreSnapshot(snapshotId: string) {
        const all = await this.listSnapshots();
        const target = all.find((snapshot: any) => snapshot.id === snapshotId);
        if (!target?.data) throw new Error('Snapshot not found or empty');

        for (const slug of Object.keys(target.data)) {
            const current = await this.listEntities<any>(slug);
            await Promise.all(current.map((record: any) =>
                record?._recordId ? ApiClient.delete(`entities/${slug}/records/${record._recordId}`) : Promise.resolve()
            ));
            await Promise.all((target.data[slug] || []).map((record: any) =>
                ApiClient.post(`entities/${slug}/records`, { data: this.wrap(record) })
            ));
        }
    }

    async getMessageLogs(filter: { requestId?: string; chatId?: string; limit?: number }) {
        const params = new URLSearchParams();
        if (filter.requestId) params.append('requestId', filter.requestId);
        if (filter.chatId) params.append('chatId', filter.chatId);
        if (filter.limit) params.append('limit', String(filter.limit));
        const query = appendSuperadminCompanyParam(params).toString();
        const res = await ApiClient.get<any[]>(`messages/logs${query ? `?${query}` : ''}`);
        if (!res.ok) return [];
        return Array.isArray(res.data) ? res.data : [];
    }

    // MTProto.
    async getMTProtoConnectors() {
        const res = await ApiClient.get<any[]>(`integrations/mtproto/connectors${this.buildQuery()}`);
        return res.ok ? (res.data || []) : [];
    }

    async createMTProtoConnector(data: any) {
        const res = await ApiClient.post('integrations/mtproto/connectors', attachSuperadminCompany(data));
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_MTPROTO');
        return res.data;
    }

    async deleteMTProtoConnector(id: string) {
        const res = await ApiClient.delete(`integrations/mtproto/connectors/${id}`);
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_MTPROTO');
    }

    async sendMTProtoCode(connectorId: string, phone: string) {
        const res = await ApiClient.post('integrations/mtproto/auth/send-code', attachSuperadminCompany({ connectorId, phone } as any));
        if (!res.ok) throw new Error(res.message);
        return res.data;
    }

    async signInMTProto(data: any) {
        const res = await ApiClient.post('integrations/mtproto/auth/sign-in', attachSuperadminCompany(data));
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_MTPROTO');
    }

    async getMTProtoChannels(connectorId: string) {
        const res = await ApiClient.get<any[]>(`integrations/mtproto/${connectorId}/channels${this.buildQuery()}`);
        return res.ok ? (res.data || []) : [];
    }

    async resolveMTProtoChannel(connectorId: string, query: string) {
        const params = new URLSearchParams();
        params.append('query', query);
        const res = await ApiClient.get<any>(`integrations/mtproto/${connectorId}/resolve${this.buildQuery(params)}`);
        if (!res.ok) throw new Error(res.message);
        return res.data;
    }

    async addMTProtoChannel(connectorId: string, channel: any, importRules: any) {
        const res = await ApiClient.post(`integrations/mtproto/${connectorId}/channels`, attachSuperadminCompany({ channel, importRules } as any));
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_CHANNELS');
        return res.data;
    }

    async deleteMTProtoChannel(id: string) {
        const res = await ApiClient.delete(`integrations/mtproto/channels/${id}`);
        if (!res.ok) throw new Error(res.message);
        this.notify('UPDATE_CHANNELS');
    }

    async syncMTProto(connectorId: string) {
        const res = await ApiClient.post(`integrations/mtproto/${connectorId}/sync`, attachSuperadminCompany({} as any));
        if (!res.ok) throw new Error(res.message);
    }

    // Parser.
    async previewParser(url: string) {
        const res = await ApiClient.post('parser/preview', { url });
        if (!res.ok) throw new Error(res.message || 'Preview failed');
        return res.data;
    }

    async getParserMapping(domain: string) {
        const res = await ApiClient.get(`parser/mapping/${domain}`);
        if (!res.ok) return null;
        return (res.data || {}).mapping || null;
    }

    async saveParserMapping(domain: string, mapping: any, remember = true) {
        const payload = mapping?.mode ? mapping : { mode: 'fieldMap', fields: mapping };
        const res = await ApiClient.post('parser/mapping', { domain, mapping: payload, remember });
        if (!res.ok) throw new Error(res.message || 'Save mapping failed');
        return res.data;
    }
}

export const Data = new DataService();
