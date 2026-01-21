import axios from 'axios';
import { prisma } from '../../services/prisma.js';
import { logSystem } from '../Core/system/systemLog.service.js';

// Helper
import crypto from 'crypto';

// Helper
const hash = (str: string) => {
    return crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
};

export const sendMetaEvent = async (eventName: string, userData: any) => {
    const settings = await prisma.systemSettings.findFirst();
    if (!settings?.metaPixelId || !settings?.metaToken) return;

    const payload = {
        data: [{
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            user_data: {
                ph: userData.phone ? hash(userData.phone) : undefined, // Must hash in real prod
                fn: userData.name ? hash(userData.name) : undefined
            },
            action_source: "chat",
        }],
        test_event_code: settings.metaTestCode || undefined
    };

    try {
        await axios.post(`https://graph.facebook.com/v19.0/${settings.metaPixelId}/events?access_token=${settings.metaToken}`, payload);
        await logSystem('MetaCAPI', eventName, 'OK', 'Event Sent');
    } catch (e: any) {
        await logSystem('MetaCAPI', eventName, 'ERROR', e.message);
    }
};

/**
 * Test Meta Pixel connection
 * Sends a test event to verify credentials are valid
 */
export const testMetaConnection = async (pixelId: string, accessToken: string, testCode?: string) => {
    const payload = {
        data: [{
            event_name: 'Test',
            event_time: Math.floor(Date.now() / 1000),
            user_data: {
                ph: hash('test@cartie.com')
            },
            action_source: "chat",
        }],
        test_event_code: testCode || undefined
    };

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
            payload
        );
        return { success: true, data: response.data };
    } catch (e: any) {
        return {
            success: false,
            error: e.response?.data?.error?.message || e.message
        };
    }
};
