
// Define Proxy Interface
interface ProxyProvider {
    name: string;
    supportsMethod: (m: string) => boolean;
    prepareUrl: (targetUrl: string) => string;
    parseResponse: (res: Response) => Promise<any>;
}

const PROXIES: ProxyProvider[] = [
    {
        name: 'CorsProxy', // Primary: Supports POST, fast
        supportsMethod: () => true,
        prepareUrl: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`, // Fixed URL format
        parseResponse: async (res) => res.json()
    },
    {
        name: 'ThingProxy', // Secondary: Supports POST
        supportsMethod: () => true,
        prepareUrl: (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
        parseResponse: async (res) => res.json()
    },
    {
        name: 'AllOrigins', // Fallback: GET only, high latency but reliable
        supportsMethod: (m) => m === 'GET',
        prepareUrl: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}&t=${Date.now()}`, // Cache busting
        parseResponse: async (res) => {
            const json = await res.json();
            if (!json.contents) throw new Error('Empty proxy response');
            return typeof json.contents === 'string' ? JSON.parse(json.contents) : json.contents;
        }
    }
];

export class TelegramService {
    
    public lastUsedProxy: string = 'None';
    public lastError: string | null = null;

    private async request(url: string, options: RequestInit = {}, method: 'GET' | 'POST' = 'GET'): Promise<any> {
        // Filter proxies supporting the method
        const candidates = PROXIES.filter(p => p.supportsMethod(method));
        let lastError: Error | null = null;

        for (const proxy of candidates) {
            // Short timeout for proxies to fail fast and rotate
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); 

            try {
                const proxyUrl = proxy.prepareUrl(url);
                // console.log(`[TG] Request via ${proxy.name}: ${method} ${url.slice(0, 30)}...`); // Debug
                
                const res = await fetch(proxyUrl, {
                    ...options,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (!res.ok) {
                    // Critical API Errors - Stop Rotation
                    if (res.status === 401) throw new Error('Telegram API: 401 Unauthorized');
                    if (res.status === 404) throw new Error('Telegram API: 404 Not Found');
                    if (res.status === 409) throw new Error('Telegram API: 409 Conflict');
                    if (res.status === 429) throw new Error('Telegram API: 429 Too Many Requests');

                    throw new Error(`HTTP ${res.status} ${res.statusText}`);
                }

                const data = await proxy.parseResponse(res);
                
                // Validate Telegram Response Schema
                if (!data || typeof data !== 'object') {
                    throw new Error('Invalid response format');
                }
                if (!data.ok) {
                    throw new Error(data.description || `Telegram API Error ${data.error_code}`);
                }

                this.lastUsedProxy = proxy.name;
                this.lastError = null;
                return data.result;

            } catch (error: any) {
                clearTimeout(timeoutId);
                lastError = error;
                this.lastError = `${proxy.name}: ${error.message}`;
                
                // Critical errors: Stop rotating and throw immediately
                if (error.message.includes('Telegram API: 4')) {
                    throw error;
                }
            }
        }

        throw lastError || new Error('All proxies failed');
    }

    async call(token: string, method: string, params: Record<string, any> = {}, httpMethod: 'GET' | 'POST' = 'GET') {
        if (!token) throw new Error("Bot token missing");
        
        const baseUrl = `https://api.telegram.org/bot${token}/${method}`;
        
        const buildGetUrl = () => {
            const query = new URLSearchParams();
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null) {
                    // Telegram API GET requires JSON encoded objects for complex params like reply_markup
                    if (typeof v === 'object') query.append(k, JSON.stringify(v));
                    else query.append(k, String(v));
                }
            });
            // Critical: Cache busting for proxy
            query.append('_ts', String(Date.now()));
            return `${baseUrl}?${query.toString()}`;
        };

        try {
            if (httpMethod === 'GET') {
                return await this.request(buildGetUrl(), { method: 'GET' }, 'GET');
            } else {
                // Try POST first
                try {
                    return await this.request(baseUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(params)
                    }, 'POST');
                } catch (postError) {
                    // Fallback to GET if POST fails (common with some proxies)
                    // console.warn(`[TG] POST ${method} failed, trying GET fallback...`);
                    return await this.request(buildGetUrl(), { method: 'GET' }, 'GET');
                }
            }
        } catch (e: any) {
            throw e;
        }
    }

    // --- METHODS ---
    async getMe(token: string) { return this.call(token, 'getMe'); }
    
    async getUpdates(token: string, offset: number) { 
        // Force GET for getUpdates to ensure better compatibility with proxies and cache busting
        return this.call(token, 'getUpdates', { 
            offset, 
            limit: 10, 
            timeout: 0, 
            allowed_updates: ['message', 'callback_query']
        }, 'GET'); 
    }

    async sendMessage(token: string, chatId: string, text: string, keyboard?: any) { 
        return this.call(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: keyboard }, 'POST'); 
    }
    
    async sendPhoto(token: string, chatId: string, photo: string, caption?: string, keyboard?: any) { 
        return this.call(token, 'sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', reply_markup: keyboard }, 'POST'); 
    }
    
    async sendMediaGroup(token: string, chatId: string, media: any[]) { 
        return this.call(token, 'sendMediaGroup', { chat_id: chatId, media }, 'POST'); 
    }
    
    async sendChatAction(token: string, chatId: string, action: string) { 
        return this.call(token, 'sendChatAction', { chat_id: chatId, action }, 'POST').catch(() => {}); 
    }
    
    async answerCallbackQuery(token: string, id: string, text?: string) { 
        return this.call(token, 'answerCallbackQuery', { callback_query_id: id, text }, 'POST'); 
    }
    
    async setMyCommands(token: string, commands: any[]) { 
        return this.call(token, 'setMyCommands', { commands }, 'POST'); 
    }
    
    async setChatMenuButton(token: string, text: string, webAppUrl: string) { 
        const menu_button = webAppUrl ? { type: 'web_app', text: text, web_app: { url: webAppUrl } } : { type: 'commands' }; 
        return this.call(token, 'setChatMenuButton', { menu_button }, 'POST'); 
    }
    
    async getFile(token: string, fileId: string) { 
        const res = await this.call(token, 'getFile', { file_id: fileId }); 
        if (res && res.file_path) { 
            return `https://api.telegram.org/file/bot${token}/${res.file_path}`; 
        } 
        return null; 
    }
}

export const TelegramAPI = new TelegramService();
