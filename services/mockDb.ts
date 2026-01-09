
import { 
    User, B2BRequest, RequestStatus, Variant, VariantStatus, 
    Lead, LeadStatus, TelegramContent, ContentStatus, 
    Campaign, TelegramMessage, TelegramDestination, Bot 
} from '../types';
import { Data } from './data';
import { TelegramAPI } from './telegram';
import { CarSearchEngine } from './carService';

// Helper to simulate async delay for "network feel"
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const MockDb = {
    // --- AUTH ---
    login: async (identifier: string) => {
        await delay(300);
        const users = await Data.getUsers();
        return users.find(u => u.username === identifier || u.email === identifier);
    },

    getStats: async () => {
        await delay(200);
        const reqs = await Data.getRequests();
        const leads = await Data.getLeads();
        const camps = await Data.getCampaigns();
        const msgs = await Data.getMessages();
        const inventory = await Data.getInventory();
        const activeInventory = inventory.filter(c => c.status === 'AVAILABLE');

        return {
            requestsNew: reqs.filter(r => r.status === RequestStatus.NEW).length,
            requestsProgress: reqs.filter(r => r.status === RequestStatus.IN_PROGRESS).length,
            inboxNew: msgs.filter(m => m.status === 'NEW').length,
            leadsMonth: leads.length,
            campaignsActive: camps.filter(c => c.status === 'RUNNING').length,
            inventoryCount: activeInventory.length,
            inventoryValue: activeInventory.reduce((acc, c) => acc + c.price.amount, 0)
        };
    },

    getRequests: async () => { await delay(200); return [...await Data.getRequests()]; },
    getRequestById: async (id: string) => { await delay(100); const reqs = await Data.getRequests(); return reqs.find(r => r.id === id); },
    createRequest: async (req: Partial<B2BRequest>) => { await delay(300); return Data.createRequest(req); },
    updateRequestStatus: async (id: string, status: RequestStatus) => { 
        await delay(200); 
        const reqs = await Data.getRequests();
        const r = reqs.find(x => x.id === id);
        if (r) {
            r.status = status;
            await Data.saveRequest(r);
        }
        return r;
    },

    addVariant: async (reqId: string, variantData: Partial<Variant>) => {
        await delay(300);
        const reqs = await Data.getRequests();
        const req = reqs.find(r => r.id === reqId);
        if (req) {
            if (variantData.url && req.variants.some(v => v.url === variantData.url)) {
                return { error: "DUPLICATE", message: "Variant with this URL already exists in this request." };
            }
            
            const newVariant: Variant = { 
                id: `var_${Date.now()}`, 
                requestId: reqId,
                status: VariantStatus.PENDING,
                canonicalId: `vn_${Date.now()}`,
                source: 'MANUAL',
                sourceUrl: '',
                title: 'Unknown',
                price: { amount: 0, currency: 'USD' },
                year: new Date().getFullYear(),
                mileage: 0,
                location: '',
                thumbnail: '',
                specs: {},
                postedAt: new Date().toISOString(),
                ...variantData 
            } as Variant;

            req.variants.push(newVariant);
            await Data.saveRequest(req);
            return newVariant;
        }
        return null;
    },
    updateVariantStatus: async (reqId: string, varId: string, status: VariantStatus) => {
        await delay(200);
        const reqs = await Data.getRequests();
        const req = reqs.find(r => r.id === reqId);
        if (req && req.variants) {
            const v = req.variants.find(v => v.id === varId);
            if (v) {
                v.status = status;
                await Data.saveRequest(req);
                return v;
            }
        }
        return null;
    },

    parseUrl: async (url: string) => { return await CarSearchEngine.parseUrl(url); },
    searchGlobal: async (query: string) => {
        await delay(800); 
        const parts = query.split(' ');
        const brand = parts[0];
        const year = parts.find(p => p.length === 4 && !isNaN(Number(p)));
        return CarSearchEngine.searchAll({
            brand: brand || undefined,
            yearMin: year ? Number(year) : undefined
        });
    },

    getContents: async () => [...await Data.getContent()],
    createContent: async (data: Partial<TelegramContent>) => { await delay(200); return Data.saveContent(data); },
    updateContentStatus: async (id: string, status: ContentStatus) => { 
        const all = await Data.getContent();
        const c = all.find(x => x.id === id);
        if(c) {
            c.status = status;
            await Data.saveContent(c);
        }
        return c;
    },

    getCampaigns: async () => [...await Data.getCampaigns()],
    createCampaign: async (camp: Partial<Campaign>) => { await delay(300); return Data.createCampaign(camp); },

    getInbox: async () => [...await Data.getMessages()],
    sendMessage: async (text: string, to: string) => {
        let chatId = to;
        const dests = await Data.getDestinations();
        const dest = dests.find(d => d.name === to || d.identifier === to || d.identifier === `@${to}`);
        if (dest) chatId = dest.identifier;
        
        const bots = await Data.getBots();
        const bot = bots.find(b => b.active);
        
        if (bot) { try { await TelegramAPI.sendMessage(bot.token, chatId, text); } catch (e) { console.error("Send failed", e); } }
        
        await Data.addMessage({
            id: `m${Date.now()}`, direction: 'OUTGOING', from: 'You', text, date: new Date().toISOString(), status: 'NEW', messageId: 0, chatId: chatId
        });
    },

    createLead: async (lead: Partial<Lead>) => { await delay(200); return Data.createLead(lead); },
    getLeads: async () => [...await Data.getLeads()],

    getDestinations: async () => [...await Data.getDestinations()],
    getBots: async () => [...await Data.getBots()],
    
    addBot: async (name: string, token: string) => {
        const bots = await Data.getBots();
        const existing = bots.find(b => b.token === token);
        if (existing) return existing;

        const id = `b${Date.now()}`;
        const newBot: Bot = {
            id, name, token, 
            active: true, 
            username: name.toLowerCase().replace(/\s/g, '_'), 
            lastUpdateId: 0,
            role: 'BOTH'
        };
        await Data.saveBot(newBot);
        return newBot;
    },
    deleteBot: async (id: string) => {
        await Data.deleteBot(id);
        return true;
    },
    toggleBot: async (id: string) => {
        const bots = await Data.getBots();
        const bot = bots.find(b => b.id === id);
        if (bot) {
            bot.active = !bot.active;
            await Data.saveBot(bot); 
        }
        return bot;
    },
    
    syncBotUpdates: async (botId: string) => {
        const bots = await Data.getBots();
        const bot = bots.find(b => b.id === botId);
        if (!bot) return;
        try {
            const updates = await TelegramAPI.getUpdates(bot.token, (bot.lastUpdateId || 0) + 1);
            if (updates && updates.length > 0) {
                let maxId = bot.lastUpdateId || 0;
                for (const u of updates) {
                    maxId = Math.max(maxId, u.update_id);
                    if (u.message && u.message.text) {
                        await Data.addMessage({
                            id: `msg_${u.message.message_id}`,
                            messageId: u.message.message_id,
                            chatId: String(u.message.chat.id),
                            direction: 'INCOMING',
                            from: u.message.from.username || u.message.from.first_name,
                            fromId: String(u.message.from.id),
                            text: u.message.text,
                            date: new Date(u.message.date * 1000).toISOString(),
                            status: 'NEW'
                        });
                        await Data.addDestination({
                            id: `dest_${u.message.chat.id}`,
                            name: u.message.from.first_name,
                            type: u.message.chat.type === 'private' ? 'USER' : 'GROUP',
                            identifier: String(u.message.chat.id),
                            tags: ['auto-discovered'],
                            verified: true
                        });
                    }
                }
                bot.lastUpdateId = maxId;
                await Data.saveBot(bot);
                return true;
            }
        } catch (e) {
            console.error("Manual sync failed", e);
            throw e;
        }
    }
};
