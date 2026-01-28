
import { ApiClient } from './apiClient';

export class TelegramService {
    
    public lastUsedProxy: string = 'Server';
    public lastError: string | null = null;

    async call(token: string, method: string, params: Record<string, any> = {}, httpMethod: 'GET' | 'POST' = 'GET') {
        try {
            if (!token) throw new Error("Bot token missing");
            const res = await ApiClient.post<{ ok: boolean; result: any }>('telegram/call', {
                token,
                method,
                params
            });

            if (!res.ok) {
                this.lastError = res.message || 'Telegram proxy error';
                throw new Error(this.lastError);
            }

            this.lastUsedProxy = 'Server';
            this.lastError = null;
            return res.data?.result ?? res.data;
        } catch (e: any) {
            this.lastError = e.message || 'Telegram request failed';
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

    async sendDocument(token: string, chatId: string, document: string, caption?: string, keyboard?: any) {
        return this.call(token, 'sendDocument', { chat_id: chatId, document, caption, parse_mode: 'HTML', reply_markup: keyboard }, 'POST');
    }

    async sendVideo(token: string, chatId: string, video: string, caption?: string, keyboard?: any) {
        return this.call(token, 'sendVideo', { chat_id: chatId, video, caption, parse_mode: 'HTML', reply_markup: keyboard }, 'POST');
    }

    async sendAudio(token: string, chatId: string, audio: string, caption?: string, keyboard?: any) {
        return this.call(token, 'sendAudio', { chat_id: chatId, audio, caption, parse_mode: 'HTML', reply_markup: keyboard }, 'POST');
    }

    async sendVoice(token: string, chatId: string, voice: string, caption?: string, keyboard?: any) {
        return this.call(token, 'sendVoice', { chat_id: chatId, voice, caption, parse_mode: 'HTML', reply_markup: keyboard }, 'POST');
    }

    async sendAnimation(token: string, chatId: string, animation: string, caption?: string, keyboard?: any) {
        return this.call(token, 'sendAnimation', { chat_id: chatId, animation, caption, parse_mode: 'HTML', reply_markup: keyboard }, 'POST');
    }

    async sendSticker(token: string, chatId: string, sticker: string) {
        return this.call(token, 'sendSticker', { chat_id: chatId, sticker }, 'POST');
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
