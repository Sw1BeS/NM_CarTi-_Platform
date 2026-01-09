
import { Data } from './data';

const GRAPH_API = 'https://graph.facebook.com/v17.0';

export const WhatsAppAPI = {
    async call(method: string, body: any) {
        const settings = await Data.getSettings();
        const config = settings.integrations?.wa;
        
        if (!config || !config.isEnabled || !config.credentials.accessToken || !config.credentials.accountId) {
            console.warn('[WhatsApp] Integration disabled or missing credentials');
            throw new Error("WhatsApp not configured");
        }

        const url = `${GRAPH_API}/${config.credentials.accountId}/${method}`;
        
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.credentials.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            
            const data = await res.json();
            if (!res.ok) {
                console.error('[WhatsApp API Error]', data);
                throw new Error(data.error?.message || 'WA API Error');
            }
            return data;
        } catch (e) {
            await Data.logActivity('SYSTEM', 'WA_API_ERROR', String(e), 'ERROR');
            throw e;
        }
    },

    async sendMessage(to: string, text: string) {
        // Basic text message
        return this.call('messages', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'text',
            text: { body: text }
        });
    },

    async sendInteractiveButtons(to: string, text: string, buttons: {id: string, title: string}[], imageUrl?: string) {
        // Interactive buttons (limit 3)
        const message: any = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text: text },
                action: {
                    buttons: buttons.slice(0, 3).map(b => ({
                        type: 'reply',
                        reply: { id: b.id, title: b.title.substring(0, 20) } // Title max 20 chars
                    }))
                }
            }
        };

        if (imageUrl) {
            message.interactive.header = {
                type: 'image',
                image: { link: imageUrl }
            };
        }

        return this.call('messages', message);
    },

    async sendInteractiveList(to: string, text: string, buttonText: string, sections: any[]) {
        // List message (for >3 options)
        return this.call('messages', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive: {
                type: 'list',
                body: { text: text },
                action: {
                    button: buttonText,
                    sections: sections
                }
            }
        });
    },

    async sendTemplate(to: string, templateName: string, lang: string = 'en_US', components: any[] = []) {
        // Template message (required for 24h window re-entry)
        return this.call('messages', {
            messaging_product: 'whatsapp',
            to: to,
            type: 'template',
            template: {
                name: templateName,
                language: { code: lang },
                components: components
            }
        });
    }
};
