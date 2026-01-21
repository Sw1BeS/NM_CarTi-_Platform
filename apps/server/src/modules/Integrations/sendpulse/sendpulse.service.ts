
import axios from 'axios';
import { logSystem } from '../../Core/system/systemLog.service.js';

export class SendPulseService {
    private static instance: SendPulseService;
    private apiUrl = 'https://api.sendpulse.com';
    private token: string | null = null;
    private tokenExpires: number = 0;

    static getInstance() {
        if (!this.instance) this.instance = new SendPulseService();
        return this.instance;
    }

    private async getToken(id: string, secret: string): Promise<string | null> {
        if (this.token && Date.now() < this.tokenExpires) return this.token;

        try {
            const res = await axios.post(`${this.apiUrl}/oauth/access_token`, {
                grant_type: 'client_credentials',
                client_id: id,
                client_secret: secret
            });

            if (res.data.access_token) {
                this.token = res.data.access_token;
                this.tokenExpires = Date.now() + (res.data.expires_in * 1000) - 60000;
                return this.token;
            }
        } catch (e: any) {
            console.error('SendPulse Auth Error:', e.message);
        }
        return null;
    }

    async syncContact(config: any, email: string, variables: any = {}) {
        if (!config?.clientId || !config?.clientSecret || !config?.addressBookId) return;

        const token = await this.getToken(config.clientId, config.clientSecret);
        if (!token) return;

        try {
            await axios.post(`${this.apiUrl}/addressbooks/${config.addressBookId}/emails`, {
                emails: [{
                    email,
                    variables
                }]
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await logSystem('SENDPULSE', 'CONTACT_SYNC', 'INFO', `Synced ${email}`);
        } catch (e: any) {
            await logSystem('SENDPULSE', 'SYNC_ERROR', 'ERROR', `Failed to sync ${email}`, { error: e.message });
        }
    }
}

/**
 * Test SendPulse connection
 * Attempts to get an access token to verify credentials
 */
export const testSendPulseConnection = async (clientId: string, clientSecret: string) => {
    try {
        const res = await axios.post('https://api.sendpulse.com/oauth/access_token', {
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        });

        if (res.data.access_token) {
            return {
                success: true,
                message: 'Successfully authenticated with SendPulse',
                expiresIn: res.data.expires_in
            };
        } else {
            return { success: false, error: 'No access token received' };
        }
    } catch (e: any) {
        return {
            success: false,
            error: typeof e.response === 'object' && e.response.data?.error_description ? e.response.data.error_description : e.message
        };
    }
};
