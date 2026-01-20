
import {
    User, B2BRequest, Lead, Bot, Scenario, TelegramContent, Campaign,
    TelegramMessage, TelegramDestination, CarListing, Company,
    SystemSettings, DictionaryCollection, SystemNotification, ActivityLog, Proposal, BotSession
} from '../types';

export interface DataAdapter {
    // Initialization
    init(): Promise<void>;

    // Generic
    getEntity<T>(slug: string, id: string): Promise<T | null>;
    listEntities<T>(slug: string): Promise<T[]>;
    saveEntity<T extends { id: string }>(slug: string, data: T): Promise<T>;
    deleteEntity(slug: string, id: string): Promise<void>;

    // Domain Specific
    getUsers(): Promise<User[]>;
    saveUser(user: User): Promise<User>;

    getRequests(): Promise<B2BRequest[]>;
    saveRequest(req: B2BRequest): Promise<B2BRequest>;
    deleteRequest(id: string): Promise<void>;

    getLeads(): Promise<Lead[]>;
    saveLead(lead: Lead): Promise<Lead>;

    getBots(): Promise<Bot[]>;
    saveBot(bot: Bot): Promise<Bot>;
    deleteBot(id: string): Promise<void>;

    // Sessions (Critical for BotEngine)
    getSession(chatId: string): Promise<BotSession | null>;
    saveSession(session: BotSession): Promise<BotSession>;
    clearSession(chatId: string): Promise<void>;

    getScenarios(): Promise<Scenario[]>;
    saveScenario(scn: Scenario): Promise<Scenario>;
    deleteScenario(id: string): Promise<void>;

    getContent(): Promise<TelegramContent[]>;
    saveContent(content: TelegramContent): Promise<TelegramContent>;

    getCampaigns(): Promise<Campaign[]>;
    saveCampaign(camp: Campaign): Promise<Campaign>;

    getMessages(filter?: { chatId?: string; botId?: string; limit?: number }): Promise<TelegramMessage[]>;
    saveMessage(msg: TelegramMessage): Promise<TelegramMessage>;

    getDestinations(): Promise<TelegramDestination[]>;
    saveDestination(dest: TelegramDestination): Promise<TelegramDestination>;

    getInventory(): Promise<CarListing[]>;
    saveInventoryItem(item: CarListing): Promise<CarListing>;
    deleteInventoryItem(id: string): Promise<void>;

    getCompanies(): Promise<Company[]>;
    saveCompany(comp: Company): Promise<Company>;
    deleteCompany(id: string): Promise<void>;

    getSettings(): Promise<SystemSettings>;
    saveSettings(settings: SystemSettings): Promise<SystemSettings>;

    getDictionaries(): Promise<DictionaryCollection>;
    saveDictionaries(dicts: DictionaryCollection): Promise<DictionaryCollection>;

    getNotifications(): Promise<SystemNotification[]>;
    saveNotification(notif: SystemNotification): Promise<SystemNotification>;

    getActivityLogs(): Promise<ActivityLog[]>;
    logActivity(log: ActivityLog): Promise<void>;

    // PROPOSALS
    getProposal(id: string): Promise<Proposal | undefined>;
    updateProposal(id: string, data: Partial<Proposal>): Promise<void>;

    // Snapshots
    createSnapshot(name: string): Promise<any>;
    listSnapshots(): Promise<any[]>;
    restoreSnapshot(id: string): Promise<void>;

    // MTProto
    getMTProtoConnectors(): Promise<any[]>;
    createMTProtoConnector(data: any): Promise<any>;
    deleteMTProtoConnector(id: string): Promise<void>;
    sendMTProtoCode(connectorId: string, phone: string): Promise<any>;
    signInMTProto(data: any): Promise<void>;

    getMTProtoChannels(connectorId: string): Promise<any[]>;
    resolveMTProtoChannel(connectorId: string, query: string): Promise<any>;
    addMTProtoChannel(connectorId: string, channel: any, importRules: any): Promise<any>;
    deleteMTProtoChannel(id: string): Promise<void>;
    syncMTProto(connectorId: string): Promise<void>;
}
