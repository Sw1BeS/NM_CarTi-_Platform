
import axios from 'axios';
// @ts-ignore
import { BotTemplate, LeadStatus } from '@prisma/client';
import { prisma } from '../../services/prisma.js';
import { parseStartPayload, type DeepLinkPayload } from '../../utils/deeplink.utils.js';
import { ScenarioEngine } from './scenario.engine.js';
import { TelegramSender } from '../../services/telegramSender.js';
import { renderLeadCard, renderRequestCard } from '../../services/cardRenderer.js';



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
        const backCmd = ['back', 'назад', '⬅️ back', '⬅️ назад'];
        const cancelCmd = ['cancel', 'stop', 'відміна', 'отмена'];
        const state = session.state;
        const vars = (session.variables as any) || {};

        const resetToMenu = async (notice?: string) => {
            if (notice) await this.sendMessage(chatId, notice);
            await this.sendMessage(chatId, `👋 <b>${this.config.name || 'CarTie'}</b>\nОбери опцію:`, {
                keyboard: [
                    [{ text: "🚗 Залишити заявку" }],
                    [{ text: "📞 Зв'язатися з менеджером" }]
                ],
                resize_keyboard: true
            });
            await this.updateState(session.id, 'LEAD_MENU', { leadFlow: {} });
        };

        if (text === '/start' || text === 'reset') {
            return resetToMenu();
        }

        if (cancelCmd.includes(text.toLowerCase())) {
            return resetToMenu('❌ Скасовано.');
        }

        if (text === '/buy' || text === '🚗 Залишити заявку' || state === 'LEAD_MENU') {
            if (backCmd.includes(text.toLowerCase())) return resetToMenu();
            await this.sendMessage(chatId, "Як тебе звати?", { remove_keyboard: true });
            await this.updateState(session.id, 'LEAD_NAME', { leadFlow: { } });
            return;
        }

        if (state === 'LEAD_NAME') {
            if (!text || text.length < 2) {
                await this.sendMessage(chatId, "Напиши ім'я, щоб знати як звертатись 🙌");
                return;
            }
            vars.leadFlow = { ...(vars.leadFlow || {}), name: text };
            await this.updateState(session.id, 'LEAD_CAR', { ...vars });
            await this.sendMessage(chatId, "Яке авто шукаєш? Напиши марку/модель/рік. Напр: BMW X5 2020.");
            return;
        }

        if (state === 'LEAD_CAR') {
            if (text.length < 3) {
                await this.sendMessage(chatId, "Додай трохи деталей про авто 🙏");
                return;
            }
            vars.leadFlow = { ...(vars.leadFlow || {}), car: text };
            await this.updateState(session.id, 'LEAD_BUDGET', { ...vars });
            await this.sendMessage(chatId, "Який бюджет (USD)?");
            return;
        }

        if (state === 'LEAD_BUDGET') {
            const budget = parseInt(text.replace(/[^\d]/g, ''), 10) || 0;
            vars.leadFlow = { ...(vars.leadFlow || {}), budget };
            await this.updateState(session.id, 'LEAD_CITY', { ...vars });
            await this.sendMessage(chatId, "Вкажи місто або локацію:");
            return;
        }

        if (state === 'LEAD_CITY') {
            vars.leadFlow = { ...(vars.leadFlow || {}), city: text || '' };
            await this.updateState(session.id, 'LEAD_CONTACT', { ...vars });
            await this.sendMessage(chatId, "Надішли номер (кнопка) або впиши вручну:", {
                keyboard: [[{ text: "📱 Поділитися контактом", request_contact: true }], [{ text: "⬅️ Назад" }]],
                resize_keyboard: true
            });
            return;
        }

        if (state === 'LEAD_CONTACT') {
            if (msg.contact?.phone_number) {
                vars.leadFlow = { ...(vars.leadFlow || {}), phone: msg.contact.phone_number };
            } else {
                const phone = text.replace(/[^\d+]/g, '');
                if (phone.length < 6) {
                    await this.sendMessage(chatId, "Телефон виглядає некоректно, спробуй ще раз або натисни кнопку.");
                    return;
                }
                vars.leadFlow = { ...(vars.leadFlow || {}), phone };
            }
            await this.updateState(session.id, 'LEAD_CONFIRM', { ...vars });
            const lf = vars.leadFlow;
            const summary = [
                `🙋‍♂️ Ім'я: ${lf.name}`,
                `🚗 Авто: ${lf.car}`,
                `💰 Бюджет: ${lf.budget ? `$${lf.budget}` : 'не вказано'}`,
                `📍 Місто: ${lf.city || 'не вказано'}`,
                `📞 Контакт: ${lf.phone}`
            ].join('\n');
            await this.sendMessage(chatId, `Перевір, все вірно?\n\n${summary}`, {
                inline_keyboard: [[
                    { text: '✅ Надіслати', callback_data: 'LEAD_CONFIRM_SEND' },
                    { text: '⬅️ Назад', callback_data: 'LEAD_CONFIRM_BACK' }
                ]]
            });
            return;
        }

        if (state === 'LEAD_CONFIRM' && msg?.callback_query) {
            const data = msg.callback_query.data;
            if (data === 'LEAD_CONFIRM_BACK') {
                await this.updateState(session.id, 'LEAD_CONTACT', { ...vars });
                await this.sendMessage(chatId, "Онови контакт і підтверди ще раз.", {
                    keyboard: [[{ text: "📱 Поділитися контактом", request_contact: true }], [{ text: "⬅️ Назад" }]],
                    resize_keyboard: true
                });
                return;
            }
            if (data === 'LEAD_CONFIRM_SEND') {
                const lf = vars.leadFlow || {};
                const leadCode = `L-${Math.floor(Math.random() * 100000)}`;
                const lead = await prisma.lead.create({
                    data: {
                        leadCode,
                        clientName: lf.name || 'Клієнт',
                        phone: lf.phone,
                        request: lf.car,
                        userTgId: chatId,
                        status: LeadStatus.NEW,
                        source: this.config.name || 'Telegram',
                        payload: { type: 'CAR_REQUEST', budget: lf.budget, city: lf.city }
                    }
                });

                // Create Request linked to Lead
                await prisma.b2bRequest.create({
                    data: {
                        title: lf.car || 'Запит',
                        budgetMax: lf.budget || null,
                        city: lf.city || null,
                        chatId,
                        status: 'COLLECTING_VARIANTS',
                        publicId: leadCode,
                        description: `Lead ${leadCode} via bot`,
                        content: lf.car,
                        companyId: this.config.companyId || null
                    }
                });

                await this.sendMessage(chatId, `✅ Заявку прийнято! Код: ${leadCode}\nМенеджер відповість найближчим часом.`, { remove_keyboard: true });
                await this.updateState(session.id, 'LEAD_MENU', { leadFlow: {} });

                if (this.config.adminChatId) {
                    const leadCard = renderLeadCard({ clientName: lf.name, phone: lf.phone, request: lf.car, payload: { city: lf.city, budget: lf.budget } });
                    const reqCard = renderRequestCard({ title: lf.car, budgetMax: lf.budget, city: lf.city, publicId: leadCode });
                    await this.sendMessage(this.config.adminChatId, `🔥 Новий лід ${leadCode}\n\n${leadCard}\n\n${reqCard}`);
                }
                return;
            }
        }

        // Fallback contact intent
        if (text === '📞 Зв\'язатися з менеджером') {
            await this.sendMessage(chatId, "Напиши своє питання, менеджер відповість найближчим часом.");
            await this.updateState(session.id, 'LEAD_SUPPORT');
            return;
        }
        if (state === 'LEAD_SUPPORT') {
            await this.sendMessage(chatId, "✅ Дякую! Передали менеджеру.");
            if (this.config.adminChatId) {
                await this.sendMessage(this.config.adminChatId, `🆘 Запит підтримки від ${msg.from.first_name}: ${text}`);
            }
            await this.updateState(session.id, 'LEAD_MENU', { leadFlow: {} });
            return;
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
            const response = await TelegramSender.sendMessage(this.config.token, chatId, text, markup);
            const messageId = (response as any)?.message_id;

            // Log outgoing message to database
            if (messageId) {
                try {
                    await prisma.$executeRaw`
                        INSERT INTO "BotMessage" (id, "botId", "chatId", direction, text, "messageId", payload, "createdAt")
                        VALUES (
                            gen_random_uuid()::text,
                            ${String(this.config.id)},
                            ${chatId},
                            'OUTGOING',
                            ${text},
                            ${messageId},
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
