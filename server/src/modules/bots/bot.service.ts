
import axios from 'axios';
// @ts-ignore
import { BotTemplate, LeadStatus } from '@prisma/client';
import { prisma } from '../../services/prisma.js';
import { parseStartPayload, type DeepLinkPayload } from '../../utils/deeplink.utils.js';
import { ScenarioEngine } from './scenario.engine.js';



// --- Types ---
interface BotConfigModel {
    id: string;
    name: string | null;
    template: BotTemplate;
    token: string;
    channelId: string | null;
    adminChatId: string | null;
    companyId?: string | null;
    config?: any;
}

// --- Bot Manager Class ---
export class BotManager {
    private activeBots: Map<string, BotInstance> = new Map();

    constructor() { }

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

    public async restartBot(id: string) {
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

    private stopBot(id: string) {
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
            const session = await this.ensureSession(update);
            const handled = session
                ? await ScenarioEngine.handleUpdate(this.config, session, update)
                : false;
            if (!handled) {
                await this.handleCallback(update.callback_query);
            }
            return;
        }

        if (!update.message) return;
        const msg = update.message;
        const chatId = msg.chat.id.toString();
        const text = msg.text || '';

        // 1. Log incoming message to database
        try {
            await prisma.$executeRaw`
                INSERT INTO "BotMessage" (id, "botId", "chatId", direction, text, "messageId", payload, "createdAt")
                VALUES (
                    gen_random_uuid()::text,
                    ${String(this.config.id)},
                    ${chatId},
                    'INCOMING',
                    ${text},
                    ${msg.message_id},
                    ${JSON.stringify({ from: msg.from, chat: msg.chat })}::jsonb,
                    NOW()
                )
            `;
        } catch (e) {
            console.error('[BotMessage] Failed to log incoming message:', e);
        }

        // 2. Load Session
        let session = await prisma.botSession.findUnique({
            where: { botId_chatId: { botId: String(this.config.id), chatId } }
        });

        if (!session) {
            session = await prisma.botSession.create({
                data: {
                    botId: String(this.config.id),
                    chatId,
                    state: 'START',
                    history: [],
                    variables: {}
                }
            });
        }

        // 3. Parse /start payload (deep-links)
        let deepLinkPayload: DeepLinkPayload | null = null;
        if (text.startsWith('/start')) {
            const parts = text.split(' ');
            if (parts.length > 1) {
                deepLinkPayload = parseStartPayload(parts[1]);
                if (deepLinkPayload) {
                    console.log(`[DeepLink] Parsed: ${deepLinkPayload.type} -> ${deepLinkPayload.id}`);
                    // Store in session variables for later use
                    await prisma.botSession.update({
                        where: { id: session.id },
                        data: {
                            variables: {
                                ...(session.variables as any || {}),
                                deepLink: deepLinkPayload
                            }
                        }
                    });
                }
            }
        }

        // 4. Update Access Time
        await prisma.botSession.update({
            where: { id: session.id },
            data: { lastActive: new Date() }
        });

        // 5. Scenario Engine (primary)
        const scenarioHandled = await ScenarioEngine.handleUpdate(this.config, session, update);
        if (scenarioHandled) {
            return;
        }

        // 6. Handle deep-link payload (legacy fallback)
        if (deepLinkPayload) {
            await this.handleDeepLink(msg, chatId, deepLinkPayload, session);
            return;
        }

        // 7. Route based on Template (fallback)
        switch (this.config.template) {
            case 'CLIENT_LEAD':
                await this.handleClientBot(msg, chatId, text, session);
                break;
            case 'CATALOG':
                await this.handleCatalogBot(msg, chatId, text, session);
                break;
            case 'B2B':
                await this.handleB2BBot(msg, chatId, text, session);
                break;
        }
    }

    private async ensureSession(update: any) {
        const msg = update.message || update.callback_query?.message;
        const chatId = msg?.chat?.id?.toString?.();
        if (!chatId) return null;
        const existing = await prisma.botSession.findUnique({
            where: { botId_chatId: { botId: String(this.config.id), chatId } }
        });
        if (existing) return existing;
        return prisma.botSession.create({
            data: {
                botId: String(this.config.id),
                chatId,
                state: 'START',
                history: [],
                variables: {}
            }
        });
    }

    // --- DEEP-LINK HANDLER ---
    private async handleDeepLink(msg: any, chatId: string, payload: DeepLinkPayload, session: any) {
        switch (payload.type) {
            case 'dealer_invite':
                // Dealer joining from channel post
                await this.sendMessage(chatId, `🤝 <b>Welcome, Dealer!</b>\n\nYou've been invited to join our partner network.\n\nPlease share your contact to proceed.`, {
                    keyboard: [[{ text: "📱 Share Contact", request_contact: true }]], resize_keyboard: true
                });
                await this.updateState(session.id, 'DEALER_ONBOARDING', {
                    role: 'DEALER',
                    dealerId: payload.id,
                    requestId: payload.metadata?.requestId
                });
                break;

            case 'request':
                // Public request link shared to client/dealer
                try {
                    const request = await prisma.b2bRequest.findUnique({
                        where: { publicId: payload.id },
                        include: { variants: true }
                    });
                    if (request) {
                        await this.sendMessage(chatId, `📋 <b>Request: ${request.title}</b>\n\n${request.description || ''}\n\n💰 Budget: $${request.budgetMin}-${request.budgetMax}\n📅 Year: ${request.yearMin}-${request.yearMax}\n📍 ${request.city || 'Any'}`);
                        if (request.variants.length > 0) {
                            await this.sendMessage(chatId, `Found ${request.variants.length} options. Contact us to view.`);
                        }
                    } else {
                        await this.sendMessage(chatId, `❌ Request not found or expired.`);
                    }
                } catch (e) {
                    console.error('[DeepLink] Failed to load request:', e);
                    await this.sendMessage(chatId, `⚠️ Error loading request.`);
                }
                break;

            case 'offer':
                // Offer notification from dealer to client
                await this.sendMessage(chatId, `📦 <b>New Offer Available</b>\n\nA dealer has submitted an offer for your request #${payload.id}.\n\nUse /requests to view details.`);
                break;

            default:
                // Unknown payload, proceed to regular flow
                await this.sendMessage(chatId, `👋 Welcome! Use /start to begin.`);
        }
    }

    // --- TEMPLATE LOGIC: CLIENT LEAD ---
    private async handleClientBot(msg: any, chatId: string, text: string, session: any) {
        if (text === '/start' || text === 'reset') {
            await this.sendMessage(chatId, `👋 <b>${this.config.name}</b>\nWelcome! How can we help?`, {
                keyboard: [[{ text: "🚗 Buy Car" }, { text: "📞 Contact" }]], resize_keyboard: true
            });
            await this.updateState(session.id, 'START');
        } else if (text === '/buy' || text === '🚗 Buy Car') {
            await this.sendMessage(chatId, "🚗 What car are you looking for? (e.g. BMW X5 2020)", { remove_keyboard: true });
            await this.updateState(session.id, 'ASK_CAR_PREFS');
        } else if (session.state === 'ASK_CAR_PREFS') {
            // Save preference
            const leadCode = `L-${Math.floor(Math.random() * 10000)}`;
            await prisma.lead.create({
                data: {
                    leadCode,
                    clientName: msg.from.first_name || 'User',
                    phone: session.variables?.phone || 'Not Provided',
                    request: text,
                    userTgId: chatId,
                    status: LeadStatus.NEW,
                    source: this.config.name,
                    payload: { type: 'CAR_REQUEST', sessionHistory: session.history }
                }
            });
            await this.sendMessage(chatId, `✅ Request <b>${leadCode}</b> received! We will contact you.`);
            await this.sendMessage(chatId, `Anything else?`, {
                keyboard: [[{ text: "🚗 Buy Car" }, { text: "📞 Contact" }]], resize_keyboard: true
            });
            await this.updateState(session.id, 'START'); // Reset

            // Notify Admin
            if (this.config.adminChatId) {
                await this.sendMessage(this.config.adminChatId, `🔥 <b>${this.config.name}</b>\nLead: ${leadCode}\n${text}\nFrom: ${msg.from.first_name}`, {
                    inline_keyboard: [[{ text: "Take", callback_data: `lead_CONTACTED_${leadCode}` }]] // note: callback needs real ID usually
                });
            }
        }
    }

    private async updateState(sessionId: string, newState: string, variables: any = undefined) {
        await prisma.botSession.update({
            where: { id: sessionId },
            data: {
                state: newState,
                ...(variables ? { variables } : {})
            }
        });
    }

    // --- TEMPLATE LOGIC: CATALOG ---
    private async handleCatalogBot(msg: any, chatId: string, text: string, session: any) {
        if (text === '/start') {
            await this.sendMessage(chatId, "🔍 <b>Catalog Search</b>\nUse menu below.", {
                keyboard: [[{ text: "🔎 Find" }, { text: "💵 Sell" }]], resize_keyboard: true
            });
        }
    }

    // --- TEMPLATE LOGIC: B2B ---
    private async handleB2BBot(msg: any, chatId: string, text: string, session: any) {
        if (text === '/start') {
            await this.sendMessage(chatId, "🤝 <b>Dealer Network</b>", {
                keyboard: [[{ text: "📝 New Request" }]], resize_keyboard: true
            });
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
            const response = await axios.post(`https://api.telegram.org/bot${this.config.token}/sendMessage`, {
                chat_id: chatId, text, parse_mode: 'HTML', reply_markup: markup
            });

            // Log outgoing message to database
            if (response.data?.result) {
                try {
                    await prisma.$executeRaw`
                        INSERT INTO "BotMessage" (id, "botId", "chatId", direction, text, "messageId", payload, "createdAt")
                        VALUES (
                            gen_random_uuid()::text,
                            ${String(this.config.id)},
                            ${chatId},
                            'OUTGOING',
                            ${text},
                            ${response.data.result.message_id},
                            ${JSON.stringify({ markup })}::jsonb,
                            NOW()
                        )
                    `;
                } catch (e) {
                    console.error('[BotMessage] Failed to log outgoing message:', e);
                }
            }
        } catch (e) {
            console.error('[SendMessage] Error:', e);
        }
    }
}

export const botManager = new BotManager();
