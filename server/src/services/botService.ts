
import axios from 'axios';
// @ts-ignore
import { PrismaClient, BotTemplate, LeadStatus } from '@prisma/client';

const prisma = new PrismaClient();

// --- Types ---
interface BotConfigModel {
    id: number;
    name: string | null;
    template: BotTemplate;
    token: string;
    channelId: string | null;
    adminChatId: string | null;
}

// --- Bot Manager Class ---
export class BotManager {
    private activeBots: Map<number, BotInstance> = new Map();

    constructor() {}

    public async startAll() {
        console.log("🤖 Bot Manager: Loading configuration...");
        try {
            const configs = await prisma.botConfig.findMany({ where: { isEnabled: true } });
            console.log(`🤖 Found ${configs.length} active bots.`);
            for (const config of configs) {
                this.startBot(config);
            }
        } catch (e) {
            console.error("Failed to load bots from DB:", e);
        }
    }

    public async restartBot(id: number) {
        this.stopBot(id);
        const config = await prisma.botConfig.findUnique({ where: { id } });
        if (config && config.isEnabled) {
            this.startBot(config);
        }
    }

    public stopAll() {
        this.activeBots.forEach(bot => bot.stop());
        this.activeBots.clear();
    }

    private startBot(config: BotConfigModel) {
        if (this.activeBots.has(config.id)) return;
        
        console.log(`🚀 Starting Bot [${config.id}]: ${config.name}`);
        const instance = new BotInstance(config);
        instance.start();
        this.activeBots.set(config.id, instance);
    }

    private stopBot(id: number) {
        const bot = this.activeBots.get(id);
        if (bot) {
            console.log(`🛑 Stopping Bot ID: ${id}`);
            bot.stop();
            this.activeBots.delete(id);
        }
    }
}

// --- Individual Bot Instance ---
class BotInstance {
    private config: BotConfigModel;
    private isRunning: boolean = false;
    private offset: number = 0;
    private timeoutHandle: any = null;

    constructor(config: BotConfigModel) {
        this.config = config;
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.registerCommands();
        this.loop();
    }

    public stop() {
        this.isRunning = false;
        if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    }

    private async registerCommands() {
        try {
            let commands: any[] = [];
            if (this.config.template === 'CLIENT_LEAD') {
                commands = [
                    { command: 'start', description: '🚀 Start Menu' },
                    { command: 'buy', description: '🚗 Buy Car' },
                    { command: 'manager', description: '👤 Support' }
                ];
            } else if (this.config.template === 'CATALOG') {
                commands = [
                    { command: 'start', description: '🔍 Catalog' },
                    { command: 'find', description: '🔎 Search' },
                    { command: 'sell', description: '💵 Sell' }
                ];
            } else if (this.config.template === 'B2B') {
                commands = [
                    { command: 'start', description: '🤝 Partner Menu' },
                    { command: 'request', description: '📝 New Request' }
                ];
            }
            await axios.post(`https://api.telegram.org/bot${this.config.token}/setMyCommands`, { commands });
        } catch (e: any) { 
            console.error(`⚠️ Failed to register commands for ${this.config.name}: ${e.message}`);
        }
    }

    private async loop() {
        if (!this.isRunning) return;

        try {
            const url = `https://api.telegram.org/bot${this.config.token}/getUpdates?offset=${this.offset + 1}&timeout=10`;
            const res = await axios.get(url, { timeout: 20000 });
            
            if (res.data.ok) {
                for (const update of res.data.result) {
                    this.offset = update.update_id;
                    await this.processUpdate(update);
                }
            }
        } catch (e: any) {
             // CRITICAL: Stop bot if token is invalid to prevent server hang/spam
             if (e.response && e.response.status === 401) {
                 console.error(`🚨 Fatal Error for Bot ${this.config.name}: Invalid Token. Stopping.`);
                 this.stop();
                 return; 
             }
             
             if (e.code !== 'ECONNABORTED' && e.code !== 'ETIMEDOUT') {
                console.error(`Bot Loop Error (${this.config.name}):`, e.message);
             }
             // Backoff logic
             await new Promise(r => setTimeout(r, 5000));
        }

        if (this.isRunning) {
            this.timeoutHandle = setTimeout(() => this.loop(), 500);
        }
    }

    private async processUpdate(update: any) {
        if (update.callback_query) {
            await this.handleCallback(update.callback_query);
            return;
        }

        if (!update.message) return;
        const msg = update.message;
        const chatId = msg.chat.id.toString();
        const text = msg.text || '';

        switch (this.config.template) {
            case 'CLIENT_LEAD':
                await this.handleClientBot(msg, chatId, text);
                break;
            case 'CATALOG':
                await this.handleCatalogBot(msg, chatId, text);
                break;
            case 'B2B':
                await this.handleB2BBot(msg, chatId, text);
                break;
        }
    }

    // --- TEMPLATE LOGIC: CLIENT LEAD ---
    private async handleClientBot(msg: any, chatId: string, text: string) {
        if (text === '/start') {
            await this.sendMessage(chatId, `👋 <b>${this.config.name}</b>\nWelcome! How can we help?`, {
                keyboard: [[{ text: "🚗 Buy Car" }, { text: "📞 Contact" }]], resize_keyboard: true
            });
        } else if (text === '/buy' || text === '🚗 Buy Car') {
             await this.sendMessage(chatId, "🚗 Describe the car you want (Model, Year, Budget):", { remove_keyboard: true });
        } else if (text.length > 3 && !text.startsWith('/')) {
             const leadCode = `L-${Math.floor(Math.random() * 10000)}`;
             const lead = await prisma.lead.create({
                 data: {
                     leadCode,
                     clientName: msg.from.first_name || 'User',
                     phone: 'Not Provided',
                     request: text,
                     userTgId: chatId,
                     status: LeadStatus.NEW,
                     source: this.config.name
                 }
             });
             await this.sendMessage(chatId, `✅ Request <b>${leadCode}</b> received! We will contact you.`);
             
             // Only send to admin if configured
             if (this.config.adminChatId) {
                 await this.sendMessage(this.config.adminChatId, `🔥 <b>${this.config.name}</b>\nLead: ${leadCode}\n${text}\nFrom: ${msg.from.first_name}`, {
                     inline_keyboard: [[{ text: "Take", callback_data: `lead_CONTACTED_${lead.id}` }]]
                 });
             }
        }
    }

    // --- TEMPLATE LOGIC: CATALOG ---
    private async handleCatalogBot(msg: any, chatId: string, text: string) {
         if (text === '/start') {
            await this.sendMessage(chatId, "🔍 <b>Catalog Search</b>\nUse menu below.", {
                keyboard: [[{ text: "🔎 Find" }, { text: "💵 Sell" }]], resize_keyboard: true
            });
         }
    }

    // --- TEMPLATE LOGIC: B2B ---
    private async handleB2BBot(msg: any, chatId: string, text: string) {
        if (text === '/start') {
             await this.sendMessage(chatId, "🤝 <b>Dealer Network</b>", {
                keyboard: [[{ text: "📝 New Request" }]], resize_keyboard: true
            });
        } else if (text === '📝 New Request') {
             await this.sendMessage(chatId, "Send request: <b>Car - Budget</b>");
        } else if (text.length > 5 && !text.startsWith('/')) {
             const publicId = `B2B-${Math.floor(Math.random()*1000)}`;
             const req = await prisma.b2bRequest.create({
                 data: { publicId, content: text, chatId }
             });
             await this.sendMessage(chatId, `✅ Created ${publicId}`);
             
             // Only post if channel is configured
             if (this.config.channelId) {
                 await this.sendMessage(this.config.channelId, `🔔 <b>REQUEST ${publicId}</b>\n${text}`);
             }
        }
    }

    private async handleCallback(cb: any) {
        const data = cb.data;
        const parts = data.split('_');
        if (parts[0] === 'lead' && parts.length === 3) {
            const status = parts[1] as LeadStatus;
            const id = parts[2];
            await prisma.lead.update({ where: { id }, data: { status } });
            await axios.post(`https://api.telegram.org/bot${this.config.token}/editMessageText`, {
                chat_id: cb.message.chat.id,
                message_id: cb.message.message_id,
                text: `${cb.message.text}\n\n✅ ${status}`,
                parse_mode: 'HTML'
            });
        }
    }

    private async sendMessage(chatId: string, text: string, markup: any = {}) {
        if (!chatId) return; // Guard clause
        try {
            await axios.post(`https://api.telegram.org/bot${this.config.token}/sendMessage`, {
                chat_id: chatId, text, parse_mode: 'HTML', reply_markup: markup
            });
        } catch(e) { /* ignore sending errors */ }
    }
}

export const botManager = new BotManager();
