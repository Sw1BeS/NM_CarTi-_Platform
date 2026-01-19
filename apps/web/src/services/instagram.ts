
import { Data } from './data';

const GRAPH_API = 'https://graph.facebook.com/v17.0';

export const InstagramAPI = {
    async call(method: string, body: any) {
        const settings = await Data.getSettings();
        const config = settings.integrations?.ig;
        
        if (!config || !config.isEnabled || !config.credentials.accessToken) {
            throw new Error("Instagram not configured");
        }

        // IG uses 'me/messages' usually, relying on page access token to define the sender
        const url = `${GRAPH_API}/${config.credentials.accountId || 'me'}/${method}?access_token=${config.credentials.accessToken}`;
        
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            const data = await res.json();
            if (!res.ok) {
                console.error('[Instagram API Error]', data);
                throw new Error(data.error?.message || 'IG API Error');
            }
            return data;
        } catch (e) {
            await Data.logActivity('SYSTEM', 'IG_API_ERROR', String(e), 'ERROR');
            throw e;
        }
    },

    async sendMessage(recipientId: string, text: string) {
        return this.call('messages', {
            recipient: { id: recipientId },
            message: { text: text }
        });
    },

    async sendGenericTemplate(recipientId: string, elements: {title: string, subtitle: string, image_url: string, buttons: any[]}[]) {
        // Carousel for IG
        return this.call('messages', {
            recipient: { id: recipientId },
            message: {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'generic',
                        elements: elements.slice(0, 10) // Max 10 cards
                    }
                }
            }
        });
    },

    async sendQuickReplies(recipientId: string, text: string, replies: {title: string, payload: string}[]) {
        return this.call('messages', {
            recipient: { id: recipientId },
            message: {
                text: text,
                quick_replies: replies.slice(0, 13).map(r => ({
                    content_type: 'text',
                    title: r.title,
                    payload: r.payload
                }))
            }
        });
    }
};
