import { logSystem } from '../../Core/system/systemLog.service.js';
import axios from 'axios';

export class MetaService {
    private static instance: MetaService;
    private pixelId = process.env.META_PIXEL_ID;
    private accessToken = process.env.META_ACCESS_TOKEN;

    static getInstance() {
        if (!this.instance) this.instance = new MetaService();
        return this.instance;
    }

    async sendEvent(eventName: string, userData: any, customData: any) {
        if (!this.pixelId || !this.accessToken) {
            console.warn('Meta Pixel ID or Access Token missing');
            return;
        }

        const payload = {
            data: [
                {
                    event_name: eventName,
                    event_time: Math.floor(Date.now() / 1000),
                    action_source: 'website',
                    user_data: {
                        em: userData.email, // Hashing needed in prod
                        ph: userData.phone,
                        client_ip_address: userData.ip,
                        client_user_agent: userData.userAgent
                    },
                    custom_data: customData
                }
            ]
        };

        try {
            await axios.post(`https://graph.facebook.com/v19.0/${this.pixelId}/events?access_token=${this.accessToken}`, payload);
            await logSystem('META_CAPI', 'EVENT_SENT', 'INFO', `Event ${eventName} sent`, { customData });
        } catch (error: any) {
            await logSystem('META_CAPI', 'EVENT_ERROR', 'ERROR', `Failed to send ${eventName}`, { error: error.message });
        }
    }
}
