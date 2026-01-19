
import { Data } from './data';
import { TelegramAPI } from './telegram';
import { ApiClient } from './apiClient';
import { Bot, BotSession, Scenario, CarListing, NodeType, ScenarioNode, BotMenuButtonConfig, LeadStatus, RequestStatus, VariantStatus } from '../types';
import { CarSearchEngine } from './carService';
import { formatCarCaptionForTelegram, createCarCardKeyboard } from './carCaptionFormatter';
import { NormalizationService } from './normalization';
import { WhatsAppAPI } from './whatsapp';
import { InstagramAPI } from './instagram';
import { RequestsService } from './requestsService';
import { ContentGenerator } from './contentGenerator';
import { buildDeepLink, createDeepLinkKeyboard } from './deeplink';
import { DraftsService } from './draftsService';

// Platform Adapter Interface
interface PlatformAdapter {
    sendMessage(chatId: string, text: string, options?: any): Promise<any>;
    sendPhoto(chatId: string, photo: string, caption?: string, options?: any): Promise<any>;
    sendMediaGroup(chatId: string, mediaUrls: string[], caption?: string): Promise<any>;
    sendChoices(chatId: string, text: string, choices: { label: string, label_uk?: string, label_ru?: string, value: string }[], lang: string): Promise<any>;
    sendReplyKeyboard(chatId: string, text: string, buttons: string[][], requestContactRow?: number): Promise<any>;
    removeKeyboard(chatId: string, text: string): Promise<any>;
    sendContactRequest(chatId: string, text: string): Promise<any>;
    sendCarCard(chatId: string, car: CarListing, lang: string): Promise<any>;
    answerCallback(id: string, text?: string, url?: string): Promise<any>;
    sendTyping(chatId: string): Promise<any>;
    getFile(fileId: string): Promise<string | null>;
}

const normalizeMenuConfig = (menuConfig?: Bot['menuConfig']) => {
    const buttonsRaw = Array.isArray(menuConfig?.buttons) ? menuConfig!.buttons : [];
    const buttons = buttonsRaw
        .filter((btn: any) => btn && typeof btn === 'object')
        .map((btn: any, idx: number) => {
            const label = typeof btn.label === 'string' ? btn.label.trim() : '';
            const labelUk = typeof btn.label_uk === 'string' ? btn.label_uk.trim() : '';
            const labelRu = typeof btn.label_ru === 'string' ? btn.label_ru.trim() : '';
            return {
                ...btn,
                id: btn.id || `btn_${idx}`,
                label,
                label_uk: labelUk || undefined,
                label_ru: labelRu || undefined,
                row: Number.isFinite(Number(btn.row)) ? Number(btn.row) : 0,
                col: Number.isFinite(Number(btn.col)) ? Number(btn.col) : idx
            };
        })
        .filter(btn => btn.label || btn.label_uk || btn.label_ru);

    return {
        welcomeMessage: menuConfig?.welcomeMessage || 'Menu:',
        buttons
    };
};

// Telegram Implementation
const TelegramAdapter = (token: string): PlatformAdapter => ({
    sendMessage: async (chatId, text, options) => {
        return TelegramAPI.sendMessage(token, chatId, text, options?.reply_markup);
    },
    sendPhoto: async (chatId, photo, caption, options) => {
        try {
            return await TelegramAPI.sendPhoto(token, chatId, photo, caption, options?.reply_markup);
        } catch (e) {
            console.warn("[Adapter] Photo failed, falling back to text:", e);
            const fallbackText = `${caption}\n\n(🖼️ Image unavailable)`;
            return TelegramAPI.sendMessage(token, chatId, fallbackText, options?.reply_markup);
        }
    },
    sendMediaGroup: async (chatId, mediaUrls, caption) => {
        const media = mediaUrls.slice(0, 10).map((url, i) => ({
            type: 'photo' as const,
            media: url,
            caption: i === 0 ? caption : undefined,
            parse_mode: 'HTML'
        }));
        return TelegramAPI.sendMediaGroup(token, chatId, media);
    },
    sendChoices: async (chatId, text, choices, lang) => {
        const buttons = [];
        for (let i = 0; i < choices.length; i += 2) {
            const row = [];
            const label1 = (lang === 'UK' && choices[i].label_uk) ? choices[i].label_uk :
                (lang === 'RU' && choices[i].label_ru) ? choices[i].label_ru : choices[i].label;
            row.push({ text: label1, callback_data: `SCN:CHOICE:${choices[i].value}` });

            if (i + 1 < choices.length) {
                const label2 = (lang === 'UK' && choices[i + 1].label_uk) ? choices[i + 1].label_uk :
                    (lang === 'RU' && choices[i + 1].label_ru) ? choices[i + 1].label_ru : choices[i + 1].label;
                row.push({ text: label2, callback_data: `SCN:CHOICE:${choices[i + 1].value}` });
            }
            buttons.push(row);
        }

        // Navigation Buttons
        const backTxt = lang === 'UK' ? '⬅️ Назад' : lang === 'RU' ? '⬅️ Назад' : '⬅️ Back';
        const cancelTxt = lang === 'UK' ? '❌ Відміна' : lang === 'RU' ? '❌ Отмена' : '❌ Cancel';
        buttons.push([{ text: backTxt, callback_data: 'CMD:BACK' }, { text: cancelTxt, callback_data: 'CMD:CANCEL' }]);

        return TelegramAPI.sendMessage(token, chatId, text, { inline_keyboard: buttons });
    },
    sendReplyKeyboard: async (chatId, text, buttons, requestContactRow) => {
        const keyboard = buttons.map((row, rIdx) =>
            row.map(btn => {
                if (requestContactRow === rIdx && (btn.includes('Contact') || btn.includes('контакт') || btn.includes('номер'))) {
                    return { text: btn, request_contact: true };
                }
                return { text: btn };
            })
        );
        return TelegramAPI.sendMessage(token, chatId, text, { keyboard, resize_keyboard: true, one_time_keyboard: false });
    },
    removeKeyboard: async (chatId, text) => {
        return TelegramAPI.sendMessage(token, chatId, text, { remove_keyboard: true });
    },
    sendContactRequest: async (chatId, text) => {
        const keyboard = {
            keyboard: [
                [{ text: "📱 Share Contact / Поділитись контактом", request_contact: true }],
                [{ text: "❌ Cancel" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        };
        return TelegramAPI.sendMessage(token, chatId, text, keyboard);
    },
    sendCarCard: async (chatId, car, lang) => {
        const caption = formatCarCaptionForTelegram(car, lang as any);
        const keyboard = createCarCardKeyboard(car, lang as any);

        // Handle Base64 or URL
        if (car.thumbnail && (car.thumbnail.startsWith('http') || car.thumbnail.length < 1024)) {
            try {
                return await TelegramAPI.sendPhoto(token, chatId, car.thumbnail, caption, keyboard);
            } catch (e) {
                return await TelegramAPI.sendMessage(token, chatId, caption, keyboard);
            }
        }
        return TelegramAPI.sendMessage(token, chatId, caption, keyboard);
    },
    answerCallback: async (id, text, url) => TelegramAPI.answerCallbackQuery(token, id, text),
    sendTyping: async (chatId) => TelegramAPI.sendChatAction(token, chatId, 'typing'),
    getFile: async (fileId) => TelegramAPI.getFile(token, fileId)
});

export class BotEngine {

    // In-memory map to track backoff for bots to avoid DB writes for transient errors
    private static botBackoff = new Map<string, { consecutiveErrors: number, nextRetry: number }>();

    private static normalizeTextCommand(text: string): string {
        return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    private static async sendMainMenu(chatId: string, bot: Bot, lang: string, adapter: PlatformAdapter, textOverride?: string) {
        const config = normalizeMenuConfig(bot.menuConfig);
        const buttons: string[][] = [];

        const sorted = [...config.buttons].sort((a, b) => (a.row - b.row) || (a.col - b.col));
        const rows: Record<number, string[]> = {};

        sorted.forEach(btn => {
            if (!rows[btn.row]) rows[btn.row] = [];
            const fallbackLabel = btn.label || btn.label_uk || btn.label_ru || '';
            const label = (lang === 'UK' && btn.label_uk) ? btn.label_uk :
                (lang === 'RU' && btn.label_ru) ? btn.label_ru : fallbackLabel;
            if (label) rows[btn.row].push(label);
        });

        Object.keys(rows)
            .map(key => Number(key))
            .filter(key => Number.isFinite(key))
            .sort((a, b) => a - b)
            .forEach(key => buttons.push(rows[key]));
        const text = textOverride || config.welcomeMessage || "Main Menu:";

        // Translate welcome if possible (simple static check)
        let finalMsg = text;
        if (text === "👋 Welcome to CarTié! Choose an option below:") {
            if (lang === 'UK') finalMsg = "👋 Вітаємо в CarTié! Оберіть опцію нижче:";
            else if (lang === 'RU') finalMsg = "👋 Добро пожаловать в CarTié! Выберите опцию ниже:";
        }

        await adapter.sendReplyKeyboard(chatId, finalMsg, buttons);
    }

    private static resetFlow(session: BotSession) {
        session.activeScenarioId = undefined;
        session.currentNodeId = undefined;
        session.history = [];
        session.tempResults = [];
    }

    private static async goBack(bot: Bot, session: BotSession, adapter: PlatformAdapter) {
        if (!session.activeScenarioId || !session.history || session.history.length === 0) {
            const msg = session.language === 'UK' ? "Нікуди повертатися." :
                session.language === 'RU' ? "Некуда возвращаться." : "Nothing to go back to.";
            await adapter.sendMessage(session.chatId, msg);
            if (!session.activeScenarioId) await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
            return;
        }

        const prevNodeId = session.history.pop();
        const scenarios = await Data.getScenarios();
        const scenario = scenarios.find(s => s.id === session.activeScenarioId);

        if (scenario && prevNodeId) {
            await this.executeNode(bot, session, scenario, prevNodeId, adapter, true);
        } else {
            this.resetFlow(session);
            await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
        }
    }

    // --- CORE LOGIC ---

    static async syncBot(bot: Bot) {
        if (!bot.active) return;

        // 1. Backoff Check
        const backoff = this.botBackoff.get(bot.id);
        if (backoff && Date.now() < backoff.nextRetry) {
            return; // Skip this cycle
        }

        // 2. Load Token State (Not available in Data Service yet; assume stateless polling for server mode)
        // For server mode, polling should ideally be done by backend. 
        // But since we are simulating "Server Mode" where frontend still polls using API:
        // We need a place to store token state. 
        // NOTE: In strict server architecture, the backend polls. Here we are hybrid.
        // We will skip complex token state logic for this step and rely on lastUpdateId in Bot object.

        let processedCount = 0;
        let ignoredCount = 0;

        try {
            // 3. Fetch Updates
            const updates = await TelegramAPI.getUpdates(bot.token, (bot.lastUpdateId || 0) + 1);

            if (this.botBackoff.has(bot.id)) {
                this.botBackoff.delete(bot.id);
            }

            if (updates && updates.length > 0) {
                let maxId = bot.lastUpdateId || 0;

                for (const u of updates) {
                    const uId = u.update_id;
                    maxId = Math.max(maxId, uId);

                    // Deduplication via Bot Object (simplified for Data Service)
                    if (bot.processedUpdateIds && bot.processedUpdateIds.includes(uId)) {
                        ignoredCount++;
                        continue;
                    }

                    await this.processUpdate(bot, u);
                    processedCount++;
                }

                // 5. Update Bot Stats
                bot.lastUpdateId = maxId;
                bot.processedUpdateIds = [...(bot.processedUpdateIds || []), ...updates.map((u: any) => u.update_id)].slice(-500);

                // Only save if changed
                if (processedCount > 0) {
                    await Data.saveBot(bot);
                }

            }
        } catch (e: any) {
            const msg = e.message || '';
            // CRITICAL: Auto-Disable if token invalid
            if (msg.includes('401') || msg.includes('404') || msg.includes('409')) {
                await Data.logActivity(bot.id, 'BOT_DISABLED', `Critical Error: ${msg}`, 'ERROR');
                bot.active = false;
                await Data.saveBot(bot);
                return;
            }

            // TRANSIENT: Exponential Backoff (10s, 20s, 40s...)
            const currentBackoff = this.botBackoff.get(bot.id) || { consecutiveErrors: 0, nextRetry: 0 };
            const nextErrors = currentBackoff.consecutiveErrors + 1;
            const delay = Math.min(60000, 10000 * Math.pow(2, nextErrors - 1));

            this.botBackoff.set(bot.id, {
                consecutiveErrors: nextErrors,
                nextRetry: Date.now() + delay
            });
        }
    }

    static async processUpdate(bot: Bot, update: any) {
        if (update.channel_post) return;

        const msg = update.message || update.callback_query?.message;
        const from = update.message?.from || update.callback_query?.from;

        if (!msg || !from) return;

        const chatId = String(msg.chat.id);
        const text = update.message?.text || update.callback_query?.data || '';
        const isPrivate = msg.chat.type === 'private';

        // 1. Log Message
        await Data.addMessage({
            id: `msg_${update.update_id}`,
            botId: bot.id,
            messageId: msg.message_id,
            chatId,
            platform: 'TG',
            direction: 'INCOMING',
            from: from.first_name,
            text: update.message?.contact ? '[Contact Shared]' : text,
            payload: { from, chat: msg.chat },
            date: new Date().toISOString(),
            status: 'NEW'
        });

        // 2. Ensure Destination
        await Data.addDestination({
            id: `dest_${chatId}`,
            name: from.first_name,
            type: isPrivate ? 'USER' : 'GROUP',
            identifier: chatId,
            tags: ['bot-user'],
            verified: true
        });

        // 3. Handle Logic
        if (isPrivate) {
            await this.handleClientSession(bot, update, chatId, from);
        }
    }

    private static async handleClientSession(bot: Bot, update: any, chatId: string, user: any, forceScenarioId?: string) {
        let session = await Data.getSession(chatId);

        if (!session) {
            session = {
                chatId: chatId,
                platform: 'TG',
                botId: bot.id,
                language: 'EN', // Default
                variables: {},
                history: [],
                lastMessageAt: 0,
                messageCount: 0
            };
        }

        // Ensure defaults
        if (!session.variables) session.variables = {};
        if (!session.history) session.history = [];

        session.variables['first_name'] = user.first_name || '';
        session.variables['username'] = user.username || '';

        const adapter = TelegramAdapter(bot.token);
        const inputRaw = update.message?.text || update.callback_query?.data || '';
        const input = this.normalizeTextCommand(inputRaw);
        const messageTextRaw = update.message?.text || '';

        // --- WEB APP DATA HANDLER ---
        if (update.message?.web_app_data) {
            try {
                const webData = JSON.parse(update.message.web_app_data.data);

                if (webData.type === 'RUN_SCENARIO' && webData.scenarioId) {
                    await this.startScenario(bot, session, webData.scenarioId, adapter);
                    return;
                }

                const normalizedType = String(webData.type || '').toUpperCase();
                if (normalizedType === 'LEAD') {
                    // Create Lead & Request from Mini App
                    if (webData.name) session.variables['name'] = webData.name;
                    if (webData.phone) session.variables['phone'] = webData.phone;
                    if (webData.lang) {
                        session.language = webData.lang;
                        session.variables['language'] = webData.lang;
                    }

                    const lead = await Data.createLead({
                        name: webData.name || session.variables['first_name'] || 'Client',
                        phone: webData.phone,
                        source: 'TELEGRAM',
                        telegramChatId: chatId,
                        status: LeadStatus.NEW,
                        language: session.language,
                        goal: webData.carId ? `MiniApp: ${webData.carId}` : undefined
                    });

                    const preset = webData.requestPreset || webData.request || {};
                    let requestTitle = '';
                    if (preset.brand) requestTitle = `${preset.brand} ${preset.model || ''}`.trim();

                    if (!requestTitle && webData.carId) {
                        const inventory = await Data.getInventory();
                        const car = inventory.find(c => c.canonicalId === webData.carId);
                        if (car) requestTitle = car.title;
                    }

                    if (requestTitle) {
                        const req = await Data.createRequest({
                            title: requestTitle,
                            yearMin: preset.year || 2015,
                            budgetMax: preset.budget || 0,
                            description: `Via MiniApp. Lead: ${lead.id || lead.name}`,
                            status: RequestStatus.DRAFT,
                            source: 'TG',
                            clientChatId: chatId
                        } as any);
                        session.variables['requestId'] = req.publicId || req.id;
                    }

                    const notifyText = [
                        '📥 <b>MiniApp Lead</b>',
                        webData.name ? `👤 ${webData.name}` : undefined,
                        preset.brand || preset.model ? `🚗 ${requestTitle}` : undefined,
                        preset.budget ? `💰 Budget: ${preset.budget}` : undefined,
                        preset.year ? `🗓 Year: ${preset.year}+` : undefined,
                        webData.carId ? `🔎 Car ID: ${webData.carId}` : undefined
                    ].filter(Boolean).join('\n');

                    if (bot.adminChannelId) {
                        await adapter.sendMessage(bot.adminChannelId, notifyText);
                    } else {
                        await Data.addNotification({
                            type: 'INFO',
                            title: 'MiniApp Lead',
                            message: notifyText,
                            read: false,
                            createdAt: new Date().toISOString()
                        } as any);
                    }

                    const confirmMsg = session.language === 'UK' ? "✅ Ваша заявка прийнята!" :
                        session.language === 'RU' ? "✅ Ваша заявка принята!" : "✅ Request received!";
                    await adapter.sendMessage(chatId, confirmMsg);
                    await this.sendMainMenu(chatId, bot, session.language || 'EN', adapter);
                    return;
                }
            } catch (e) {
                console.error("Failed to parse web_app_data", e);
            }
        }

        // --- LANGUAGE ENFORCEMENT CHECK ---
        const hasSetLanguage = !!session.variables['language'] || !!session.variables['lang'];
        if (session.language && !session.variables['language']) {
            session.variables['language'] = session.language;
        }

        const isLangScenario = session.activeScenarioId === 'scn_lang';

        if (!hasSetLanguage && !isLangScenario && input !== '/start' && !forceScenarioId) {
            const scenarios = await Data.getScenarios();
            const langScn = scenarios.find(s => s.triggerCommand === 'lang');
            if (langScn) {
                await this.startScenario(bot, session, langScn.id, adapter);
                return;
            }
        }

        try {
            // Priority 1: Force Start (Internal Jump)
            if (forceScenarioId) {
                await this.startScenario(bot, session, forceScenarioId, adapter);
                return;
            }

            // Priority 2: Global Commands
            if (input === '/start' || input.startsWith('/start ')) {
                // IDEMPOTENCY / ANTI-BURST GUARD
                const now = Date.now();
                if (now - (session.lastMessageAt || 0) < 2000) {
                    console.log(`[Bot] /start ignored due to anti-burst (chat: ${chatId})`);
                    return;
                }

                this.resetFlow(session);

                // --- DEEP LINK PAYLOAD PARSING ---
                const payload = messageTextRaw.startsWith('/start')
                    ? messageTextRaw.split(' ')[1]
                    : inputRaw.split(' ')[1];
                let deepLinkMsg = '';

                if (payload) {
                    const [key, val, extra] = payload.split(':'); // e.g. dealer_invite:123

                    if (key === 'dealer_invite') {
                        session.variables['role'] = 'DEALER';
                        session.variables['dealerId'] = val;
                        session.variables['dealer_invite_id'] = val;
                        if (extra) session.variables['requestId'] = extra;
                        deepLinkMsg = session.language === 'UK' ? "👋 Вітаємо! Вас запрошено приєднатися як Партнера." : "👋 Welcome! You've been invited to join as a Partner.";
                        // Trigger specific scenario if needed
                        // forceScenarioId = 'scn_dealer_onboarding';
                    }
                    else if (key === 'request') {
                        session.variables['role'] = 'DEALER';
                        session.variables['requestId'] = val;
                        session.variables['requestPublicId'] = val;
                        session.variables['ref_request_id'] = val;
                        deepLinkMsg = session.language === 'UK' ? `📄 Ви переглядаєте запит #${val}` : `📄 Viewing Request #${val}`;
                    }
                    else if (key === 'offer') {
                        session.variables['role'] = 'DEALER';
                        session.variables['requestId'] = val;
                        if (extra) session.variables['offerId'] = extra;
                        session.variables['ref_offer_id'] = val;
                        deepLinkMsg = session.language === 'UK' ? `💰 Перегляд пропозиції #${val}` : `💰 Viewing Offer #${val}`;
                    }

                    // Store raw payload just in case
                    session.variables['start_payload'] = payload;
                    await Data.saveSession(session);
                }

                const scenarios = await Data.getScenarios();
                const langScn = scenarios.find(s => s.triggerCommand === 'lang');

                const welcomeName = user.first_name || 'Friend';

                if (hasSetLanguage || session.language) {
                    const msg = deepLinkMsg || (session.language === 'UK' ? `👋 З поверненням, ${welcomeName}!` : `👋 Welcome back, ${welcomeName}!`);
                    await this.sendMainMenu(chatId, bot, session.language, adapter, msg);
                } else if (langScn) {
                    // If deep link present, maybe skip lang? For now, ask lang first.
                    await this.startScenario(bot, session, langScn.id, adapter);
                } else {
                    await this.sendMainMenu(chatId, bot, session.language || 'EN', adapter, deepLinkMsg || `👋 Welcome!`);
                }

                return;
            }

            if (['/menu', 'menu', '🏠 menu', 'cmd:menu', 'main menu'].includes(input)) {
                this.resetFlow(session);
                await this.sendMainMenu(chatId, bot, session.language, adapter);
                return;
            }

            if (['/back', 'back', '⬅️ back', 'cmd:back'].includes(input)) {
                await this.goBack(bot, session, adapter);
                return;
            }

            // Priority 3: Menu Button Match (Global Override)
            const menuBtn = normalizeMenuConfig(bot.menuConfig).buttons.find(b => {
                const normInput = input;
                return this.normalizeTextCommand(b.label) === normInput ||
                    (b.label_uk && this.normalizeTextCommand(b.label_uk) === normInput) ||
                    (b.label_ru && this.normalizeTextCommand(b.label_ru) === normInput);
            });

            if (menuBtn && !update.callback_query) {
                this.resetFlow(session);

                if (menuBtn.type === 'SCENARIO') {
                    await this.startScenario(bot, session, menuBtn.value, adapter);
                } else if (menuBtn.type === 'TEXT') {
                    await adapter.sendMessage(chatId, menuBtn.value || 'Info');
                } else if (menuBtn.type === 'LINK') {
                    await adapter.sendMessage(chatId, `🔗 ${menuBtn.value}`);
                }
                return;
            }

            // Priority 4: Callback Query Handling
            if (update.callback_query) {
                try { await adapter.answerCallback(update.callback_query.id); } catch (e) { }
                const cbData = update.callback_query.data;

                if (cbData.startsWith('SCN:CHOICE:')) {
                    const choiceVal = cbData.split('SCN:CHOICE:')[1];
                    const handled = await this.handleInput(bot, session, choiceVal, adapter, true);
                    if (!handled) {
                        await adapter.sendMessage(chatId, session.language === 'UK' ? "⚠️ Сесія минула. Скидання..." : "⚠️ Session expired. Resetting...");
                        await this.sendMainMenu(chatId, bot, session.language, adapter);
                        this.resetFlow(session);
                    }
                }
                else if (cbData.startsWith('CAR:SELECT:')) {
                    await this.handleCarSelection(bot, session, cbData.split('CAR:SELECT:')[1], adapter);
                }
                else if (cbData.startsWith('CAR:ADD_REQUEST:')) {
                    await this.handleAddToRequest(session, cbData.split('CAR:ADD_REQUEST:')[1], adapter);
                }
                else if (cbData.startsWith('CAR:ADD_CATALOG:')) {
                    await this.handleAddToCatalog(session, cbData.split('CAR:ADD_CATALOG:')[1], adapter);
                }
                else if (cbData === 'CMD:BACK') await this.goBack(bot, session, adapter);
                else if (cbData === 'CMD:CANCEL') {
                    this.resetFlow(session);
                    await adapter.sendMessage(chatId, "🚫 Cancelled.");
                    await this.sendMainMenu(chatId, bot, session.language, adapter);
                }
                return;
            }

            // Priority 5: Contact Sharing
            if (update.message?.contact) {
                session.variables['phone'] = update.message.contact.phone_number;
                const handled = await this.handleInput(bot, session, '[CONTACT]', adapter);
                if (!handled) {
                    await this.sendMainMenu(chatId, bot, session.language, adapter, "Thanks! Contact saved.");
                }
                return;
            }

            // Priority 6: Active Scenario Input (Text)
            if (inputRaw) {
                const handled = await this.handleInput(bot, session, inputRaw, adapter);
                if (!handled) {
                    // Not handled by active scenario step?
                    if (session.activeScenarioId) {
                        const scenarios = await Data.getScenarios();
                        const scn = scenarios.find(s => s.id === session.activeScenarioId);
                        const node = scn?.nodes.find(n => n.id === session.currentNodeId);

                        // If it's a choice node and user typed text, show buttons again
                        if (node?.type === 'QUESTION_CHOICE') {
                            const errMsg = session.language === 'UK' ? "Будь ласка, оберіть опцію з меню." :
                                session.language === 'RU' ? "Пожалуйста, выберите опцию." : "Please use the buttons provided.";
                            await adapter.sendMessage(chatId, errMsg);
                            await this.executeNode(bot, session, scn!, node.id, adapter, true);
                        } else {
                            await this.checkKeywords(bot, session, input, adapter);
                        }
                    } else {
                        await this.checkKeywords(bot, session, input, adapter);
                    }
                }
            }
        } catch (e) {
            console.error("Session Error:", e);
            await Data.logActivity(bot.id, 'BOT_EXCEPTION', String(e), 'ERROR');
        } finally {
            session.lastMessageAt = Date.now();
            session.messageCount++;
            await Data.saveSession(session);
        }
    }

    private static async checkKeywords(bot: Bot, session: BotSession, input: string, adapter: PlatformAdapter) {
        const scenarios = await Data.getScenarios();
        const triggeredScenario = scenarios.find(s =>
            s.isActive && s.keywords && s.keywords.some(k => input.includes(k.toLowerCase()))
        );

        if (triggeredScenario) {
            await this.startScenario(bot, session, triggeredScenario.id, adapter);
        }
    }

    private static async handleInput(bot: Bot, session: BotSession, input: string, adapter: PlatformAdapter, isCallback = false): Promise<boolean> {
        if (!session.activeScenarioId || !session.currentNodeId) return false;

        const scenarios = await Data.getScenarios();
        const scenario = scenarios.find(s => s.id === session.activeScenarioId);
        if (!scenario) return false;

        const node = scenario.nodes.find(n => n.id === session.currentNodeId);
        if (!node) return false;

        // Choice / Menu Reply Validation
        if (node.type === 'QUESTION_CHOICE' || node.type === 'MENU_REPLY') {
            if (!node.content.choices) return false;

            const match = node.content.choices.find(c => {
                if (isCallback) return String(c.value) === String(input);

                const labelMatch = this.normalizeTextCommand(c.label) === this.normalizeTextCommand(input);
                const valMatch = String(c.value) === String(input);
                const lang = session.language || 'EN';
                const locLabel = lang === 'UK' ? c.label_uk : lang === 'RU' ? c.label_ru : c.label;
                const locMatch = locLabel && this.normalizeTextCommand(locLabel) === this.normalizeTextCommand(input);
                return valMatch || labelMatch || locMatch;
            });

            if (match && match.nextNodeId) {
                if (node.content.variableName) session.variables[node.content.variableName] = match.value;
                await this.executeNode(bot, session, scenario, match.nextNodeId, adapter);
                return true;
            }
            return false;
        }

        // Contact Request Validation
        if (node.type === 'REQUEST_CONTACT') {
            if (input === '[CONTACT]') {
                if (node.nextNodeId) {
                    await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    return true;
                }
            }
            if (input.length > 5) {
                session.variables['phone'] = input;
                if (node.nextNodeId) {
                    await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    return true;
                }
            }
            return false;
        }

        // Text Input -> Always valid
        if (node.content.variableName) {
            session.variables[node.content.variableName] = input;
        }

        if (node.nextNodeId) {
            await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
            return true;
        }

        this.resetFlow(session);
        await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
        return true;
    }

    private static async startScenario(bot: Bot, session: BotSession, id: string, adapter: PlatformAdapter) {
        const scenarios = await Data.getScenarios();
        const scenario = scenarios.find(s => s.id === id);
        if (!scenario) {
            await adapter.sendMessage(session.chatId, "⚠️ Scenario not found.");
            this.resetFlow(session);
            await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
            return;
        }

        session.activeScenarioId = scenario.id;
        session.history = [];
        session.tempResults = [];
        await Data.saveSession(session);
        await this.executeNode(bot, session, scenario, scenario.entryNodeId, adapter);
    }

    private static getText(session: BotSession, node: ScenarioNode): string {
        const lang = session.language || 'EN';
        if (lang === 'UK' && node.content.text_uk) return node.content.text_uk;
        if (lang === 'RU' && node.content.text_ru) return node.content.text_ru;
        return node.content.text || '';
    }

    private static replaceVars(text: string, vars: Record<string, any>): string {
        return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '');
    }

    private static async executeNode(bot: Bot, session: BotSession, scenario: Scenario, nodeId: string, adapter: PlatformAdapter, isBack = false) {
        const node = scenario.nodes.find(n => n.id === nodeId);
        if (!node) {
            this.resetFlow(session);
            await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
            await Data.saveSession(session);
            return;
        }

        if (!isBack && session.currentNodeId && session.currentNodeId !== nodeId && ['QUESTION_TEXT', 'QUESTION_CHOICE', 'MENU_REPLY', 'REQUEST_CONTACT'].includes(node.type)) {
            if (!session.history) session.history = [];
            session.history.push(session.currentNodeId);
            if (session.history.length > 30) session.history.shift();
        }

        session.currentNodeId = node.id;
        await Data.saveSession(session);

        const textRaw = this.getText(session, node);
        const text = this.replaceVars(textRaw, session.variables);

        try {
            switch (node.type) {
                case 'START':
                case 'JUMP':
                    if (node.nextNodeId) await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    break;

                case 'MESSAGE':
                    await adapter.sendMessage(session.chatId, text);
                    if (node.nextNodeId) await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    else {
                        this.resetFlow(session);
                        await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
                    }
                    break;

                case 'QUESTION_TEXT':
                    await adapter.sendMessage(session.chatId, text);
                    break;

                case 'QUESTION_CHOICE':
                    await adapter.sendChoices(session.chatId, text, node.content.choices || [], session.language || 'EN');
                    break;

                case 'MENU_REPLY':
                    const buttons = [];
                    const choices = node.content.choices || [];
                    const lang = session.language || 'EN';

                    for (let i = 0; i < choices.length; i += 2) {
                        const l1 = (lang === 'UK' && choices[i].label_uk) ? choices[i].label_uk : (lang === 'RU' && choices[i].label_ru) ? choices[i].label_ru : choices[i].label;
                        const row = [l1 || ''];
                        if (i + 1 < choices.length) {
                            const l2 = (lang === 'UK' && choices[i + 1].label_uk) ? choices[i + 1].label_uk : (lang === 'RU' && choices[i + 1].label_ru) ? choices[i + 1].label_ru : choices[i + 1].label;
                            row.push(l2 || '');
                        }
                        buttons.push(row);
                    }

                    const backTxt = lang === 'UK' ? '⬅️ Назад' : lang === 'RU' ? '⬅️ Назад' : '⬅️ Back';
                    const menuTxt = lang === 'UK' ? '🏠 Меню' : lang === 'RU' ? '🏠 Меню' : '🏠 Menu';
                    buttons.push([backTxt, menuTxt]);

                    await adapter.sendReplyKeyboard(session.chatId, text, buttons);
                    break;

                case 'REQUEST_CONTACT':
                    await adapter.sendContactRequest(session.chatId, text);
                    break;

                case 'CONDITION':
                    let result = false;
                    const val = session.variables[node.content.conditionVariable || ''] || session.tempResults?.length || 0;
                    const target = node.content.conditionValue;

                    if (node.content.conditionOperator === 'GT') result = Number(val) > Number(target);
                    else if (node.content.conditionOperator === 'HAS_VALUE') result = !!val && val !== 0 && val !== '';
                    else result = String(val) === String(target);

                    const nextId = result ? node.content.trueNodeId : node.content.falseNodeId;
                    if (nextId) await this.executeNode(bot, session, scenario, nextId, adapter);
                    else {
                        this.resetFlow(session);
                        await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
                    }
                    break;

                case 'DELAY':
                    const ms = parseInt(node.content.conditionValue as string || '1000');
                    await adapter.sendTyping(session.chatId);
                    await new Promise(r => setTimeout(r, ms));
                    if (node.nextNodeId) await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    break;

                case 'GALLERY':
                    await adapter.sendMessage(session.chatId, text);
                    if (session.tempResults && session.tempResults.length > 0) {
                        for (const car of session.tempResults.slice(0, 5)) {
                            try {
                                await adapter.sendCarCard(session.chatId, car, session.language || 'EN');
                                await new Promise(r => setTimeout(r, 600));
                            } catch (e) {
                                console.error("Gallery send error:", e);
                            }
                        }
                    }
                    if (node.nextNodeId) await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    else {
                        this.resetFlow(session);
                        await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
                    }
                    break;

                case 'ACTION':
                    if (node.content.actionType === 'SET_LANG') {
                        const selectedLang = session.variables['language'] || session.variables['lang'];
                        const cleanLang = selectedLang?.includes('Ukra') || selectedLang === 'UK' ? 'UK' :
                            selectedLang?.includes('Russ') || selectedLang === 'RU' ? 'RU' : 'EN';
                        session.language = cleanLang as any;
                        session.variables['language'] = cleanLang;
                    }
                    if (node.content.actionType === 'NORMALIZE_REQUEST') {
                        const rawBrand = session.variables['brandRaw'];
                        const normBrand = await NormalizationService.normalizeBrand(rawBrand);
                        session.variables['brand'] = normBrand || rawBrand;
                    }
                    if (node.content.actionType === 'CREATE_LEAD') {
                        await Data.createLead({
                            name: session.variables['name'] || session.variables['first_name'],
                            phone: session.variables['phone'],
                            source: 'TELEGRAM',
                            telegramChatId: session.chatId,
                            status: LeadStatus.NEW,
                            language: session.language
                        });
                    }
                    if (node.content.actionType === 'CREATE_REQUEST') {
                        const req = await Data.createRequest({
                            title: `${session.variables['brand']} ${session.variables['model'] || ''}`,
                            yearMin: parseInt(session.variables['year'] || '0'),
                            budgetMax: parseInt(session.variables['budget'] || '0'),
                            description: `Via Bot. User: ${session.variables['name']}`,
                            status: RequestStatus.DRAFT,
                            source: 'TG',
                            clientChatId: session.chatId
                        } as any);
                        session.variables['requestId'] = req.publicId;
                    }

                    if (node.nextNodeId) await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    else {
                        this.resetFlow(session);
                        await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
                    }
                    break;

                case 'SEARCH_CARS':
                    const searchFilter = {
                        brand: session.variables['brand'],
                        model: session.variables['model'],
                        priceMax: parseInt(session.variables['budget'] || '0')
                    };
                    const internalResults = await Data.searchCars(searchFilter);
                    let mergedResults = internalResults;

                    if (internalResults.length < 3) {
                        const externalResults = await CarSearchEngine.searchExternal(searchFilter);
                        const seen = new Set(internalResults.map(c => c.canonicalId || c.sourceUrl));
                        const deduped = externalResults.filter(car => {
                            const key = car.canonicalId || car.sourceUrl;
                            if (!key || seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });
                        mergedResults = [...internalResults, ...deduped];
                    }

                    const limited = mergedResults.slice(0, 5);
                    session.tempResults = limited;
                    session.variables['found_count'] = mergedResults.length;

                    if (node.nextNodeId) await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    else {
                        await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
                        this.resetFlow(session);
                    }
                    break;

                case 'SEARCH_FALLBACK':
                    const fallbackFilter = {
                        brand: session.variables['brand'],
                        model: session.variables['model'],
                        priceMax: parseInt(session.variables['budget'] || '0')
                    };
                    const externalResults = await CarSearchEngine.searchExternal(fallbackFilter);
                    session.tempResults = externalResults.slice(0, 5);
                    session.variables['found_count'] = externalResults.length;

                    if (node.nextNodeId) await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    else {
                        await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
                        this.resetFlow(session);
                    }
                    break;

                case 'CHANNEL_POST': {
                    const destination = node.content.destinationId
                        || (node.content.destinationVar ? session.variables[node.content.destinationVar] : undefined)
                        || bot.channelId
                        || bot.adminChannelId;
                    const imageUrl = node.content.imageUrl
                        || (node.content.imageVar ? session.variables[node.content.imageVar] : undefined);
                    const scheduledAt = node.content.scheduledAt
                        || (node.content.scheduledAtVar ? session.variables[node.content.scheduledAtVar] : undefined);

                    const fallbackCar = session.tempResults?.[0];
                    const postText = text || (fallbackCar ? formatCarCaptionForTelegram(fallbackCar, session.language || 'EN') : '');

                    if (!destination || !postText) {
                        await adapter.sendMessage(session.chatId, "⚠️ Channel post missing destination or text.");
                        break;
                    }

                    if (scheduledAt) {
                        await DraftsService.createDraft({
                            source: 'MANUAL',
                            title: `Scenario Post`,
                            description: postText,
                            url: imageUrl,
                            destination,
                            scheduledAt: scheduledAt,
                            status: 'SCHEDULED',
                            botId: bot.id,
                            metadata: { scenarioId: scenario.id, nodeId: node.id }
                        });
                        await adapter.sendMessage(session.chatId, "✅ Post scheduled.");
                    } else {
                        if (imageUrl) await adapter.sendPhoto(destination, imageUrl, postText);
                        else await adapter.sendMessage(destination, postText);
                        await DraftsService.createDraft({
                            source: 'MANUAL',
                            title: `Scenario Post`,
                            description: postText,
                            url: imageUrl,
                            destination,
                            status: 'POSTED',
                            postedAt: new Date().toISOString(),
                            botId: bot.id,
                            metadata: { scenarioId: scenario.id, nodeId: node.id }
                        });
                    }

                    if (node.nextNodeId) await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    else {
                        this.resetFlow(session);
                        await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
                    }
                    break;
                }

                case 'REQUEST_BROADCAST': {
                    const destination = node.content.destinationId
                        || (node.content.destinationVar ? session.variables[node.content.destinationVar] : undefined)
                        || bot.channelId;
                    const requestVar = node.content.requestIdVar || 'requestId';
                    const requestRef = session.variables[requestVar] || session.variables['requestId'] || session.variables['requestPublicId'];
                    if (!destination || !requestRef || !bot.username) {
                        await adapter.sendMessage(session.chatId, "⚠️ Broadcast missing destination, requestId, or bot username.");
                        break;
                    }

                    const requests = await Data.getRequests();
                    const req = requests.find(r => r.id === requestRef || r.publicId === requestRef);
                    if (!req) {
                        await adapter.sendMessage(session.chatId, "⚠️ Request not found.");
                        break;
                    }

                    const messageText = text || ContentGenerator.fromRequest(req);
                    const buttonText = node.content.buttonText || '💼 Подати пропозицію';
                    const link = buildDeepLink(bot.username, { type: 'request', requestId: req.publicId });
                    const keyboard = createDeepLinkKeyboard([{ text: buttonText, link }]);

                    await adapter.sendMessage(destination, messageText, { reply_markup: keyboard });

                    if (node.nextNodeId) await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    else {
                        this.resetFlow(session);
                        await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
                    }
                    break;
                }

                case 'OFFER_COLLECT': {
                    const destination = node.content.destinationId
                        || (node.content.dealerChatVar ? session.variables[node.content.dealerChatVar] : undefined)
                        || (node.content.destinationVar ? session.variables[node.content.destinationVar] : undefined);
                    const requestVar = node.content.requestIdVar || 'requestId';
                    const requestRef = session.variables[requestVar] || session.variables['requestId'] || session.variables['requestPublicId'];
                    if (!destination || !requestRef || !bot.username) {
                        await adapter.sendMessage(session.chatId, "⚠️ Offer collect missing destination, requestId, or bot username.");
                        break;
                    }

                    const requests = await Data.getRequests();
                    const req = requests.find(r => r.id === requestRef || r.publicId === requestRef);
                    if (!req) {
                        await adapter.sendMessage(session.chatId, "⚠️ Request not found.");
                        break;
                    }

                    const messageText = text || `💰 Запит: ${req.title}\n${req.description || ''}`.trim();
                    const buttonText = node.content.buttonText || '💰 Надіслати пропозицію';
                    const link = buildDeepLink(bot.username, { type: 'offer', requestId: req.publicId });
                    const keyboard = createDeepLinkKeyboard([{ text: buttonText, link }]);

                    await adapter.sendMessage(destination, messageText, { reply_markup: keyboard });

                    if (node.nextNodeId) await this.executeNode(bot, session, scenario, node.nextNodeId, adapter);
                    else {
                        this.resetFlow(session);
                        await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
                    }
                    break;
                }
            }
        } catch (e: any) {
            console.error(`Node Execution Error [${node.id}]:`, e);
            await adapter.sendMessage(session.chatId, "⚠️ System Error. Returning to menu.");
            this.resetFlow(session);
            await this.sendMainMenu(session.chatId, bot, session.language || 'EN', adapter);
        }
    }

    private static async handleCarSelection(bot: Bot, session: BotSession, carId: string, adapter: PlatformAdapter) {
        const inventory = await Data.getInventory();
        const car = inventory.find(c => c.canonicalId === carId);
        await Data.createLead({
            name: session.variables['name'] || `User ${session.chatId}`,
            phone: session.variables['phone'],
            source: 'TELEGRAM',
            telegramChatId: session.chatId,
            goal: `Selected: ${car?.title || carId}`,
            status: LeadStatus.NEW,
            language: session.language
        });
        const msg = session.language === 'UK' ? "✅ Заявку прийнято!" : "✅ Request received!";
        await adapter.sendMessage(session.chatId, msg);
    }

    private static async resolveRequestId(session: BotSession): Promise<string | null> {
        const refId = session.variables['requestId'] || session.variables['requestPublicId'];
        if (!refId) return null;
        const requests = await Data.getRequests();
        const match = requests.find(r => r.id === refId || r.publicId === refId);
        return match?.id || null;
    }

    private static async handleAddToRequest(session: BotSession, carId: string, adapter: PlatformAdapter) {
        const requestId = await this.resolveRequestId(session);
        if (!requestId) {
            const msg = session.language === 'UK' ? "⚠️ Немає активного запиту для додавання авто." : "⚠️ No active request to attach this car.";
            await adapter.sendMessage(session.chatId, msg);
            return;
        }

        const fromResults = session.tempResults?.find(c => c.canonicalId === carId);
        const inventory = fromResults ? [] : await Data.getInventory();
        const car = fromResults || inventory.find(c => c.canonicalId === carId);
        if (!car) {
            await adapter.sendMessage(session.chatId, "⚠️ Car not found.");
            return;
        }

        await RequestsService.addVariant(requestId, {
            title: car.title,
            price: car.price,
            year: car.year,
            mileage: car.mileage,
            location: car.location,
            thumbnail: car.thumbnail,
            url: car.sourceUrl,
            sourceUrl: car.sourceUrl,
            source: car.source,
            specs: car.specs,
            status: VariantStatus.SUBMITTED
        } as any);

        const msg = session.language === 'UK' ? "✅ Додано в запит." : "✅ Added to request.";
        await adapter.sendMessage(session.chatId, msg);
    }

    private static async handleAddToCatalog(session: BotSession, carId: string, adapter: PlatformAdapter) {
        const inventory = await Data.getInventory();
        const existing = inventory.find(c => c.canonicalId === carId);
        if (existing) {
            const msg = session.language === 'UK' ? "ℹ️ Авто вже в каталозі." : "ℹ️ Car is already in catalog.";
            await adapter.sendMessage(session.chatId, msg);
            return;
        }

        const fromResults = session.tempResults?.find(c => c.canonicalId === carId);
        if (!fromResults) {
            await adapter.sendMessage(session.chatId, "⚠️ Car not found.");
            return;
        }

        await Data.saveInventoryItem({
            ...fromResults,
            id: fromResults.canonicalId,
            status: 'AVAILABLE',
            importedAt: new Date().toISOString()
        } as any);

        const msg = session.language === 'UK' ? "✅ Додано в каталог." : "✅ Added to catalog.";
        await adapter.sendMessage(session.chatId, msg);
    }

    static async processPlatformUpdate(platform: 'TG' | 'WA' | 'IG', chatId: string, text: string, payload?: any) {
        const bots = await Data.getBots();
        const bot = bots.find(b => b.active);
        if (!bot) return;

        const update: any = {
            update_id: Date.now(),
            message: {
                message_id: Date.now(),
                chat: { id: chatId, type: 'private' },
                from: { id: 12345, first_name: 'SimUser', username: 'sim_user' },
                text: text,
                date: Date.now()
            }
        };
        await this.processUpdate(bot, update);
    }

    static async sendUnifiedMessage(platform: 'TG' | 'WA' | 'IG', chatId: string, text: string, imageUrl?: string, botId?: string) {
        if (platform === 'TG') {
            const bots = await Data.getBots();
            const active = botId ? bots.find(b => b.id === botId) : bots.find(b => b.active) || bots[0];
            if (!active) throw new Error('No active bot configured');
            const res = await ApiClient.post('messages/send', { chatId, text, imageUrl, botId: active.id });
            if (!res.ok) throw new Error(res.message || 'Failed to send message');
            // Refresh messages to reflect outgoing message
            Data.getMessages().then(() => Data._notify('UPDATE_MESSAGES')).catch(() => {});
        } else if (platform === 'WA') {
            await WhatsAppAPI.sendMessage(chatId, text);
        } else if (platform === 'IG') {
            await InstagramAPI.sendMessage(chatId, text);
        }
    }
}
