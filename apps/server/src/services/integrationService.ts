
import axios from 'axios';
// @ts-ignore
import { DraftSource } from '@prisma/client';
import { prisma } from './prisma.js';


// --- Logging ---
export const logSystem = async (module: string, action: string, status: string, message: string) => {
    await prisma.systemLog.create({
        data: { module, action, status, message }
    });
};

// --- AutoRia Integration (Official API) ---
export const searchAutoRia = async (params: any) => {
    const settings = await prisma.systemSettings.findFirst();
    if (!settings?.autoriaApiKey) {
        throw new Error("AutoRia API Key not configured");
    }

    try {
        // Mocking the AutoRia structure slightly as their API is complex
        // In real life: GET https://developers.ria.com/auto/search
        const url = `https://developers.ria.com/auto/search?api_key=${settings.autoriaApiKey}&category_id=1&marka_id[0]=${params.make}&model_id[0]=${params.model}&countpage=5`;
        
        // This is a placeholder call. Real implementation requires mapping IDs.
        // For MVP, we will return a mock result if API key is "TEST"
        if (settings.autoriaApiKey === 'TEST') {
            return [
                { title: 'Test AutoRia Result 1', price: '15000 USD', url: 'https://auto.ria.com/test1' },
                { title: 'Test AutoRia Result 2', price: '18000 USD', url: 'https://auto.ria.com/test2' }
            ];
        }
        
        const res = await axios.get(url);
        return res.data; // Process specific IDs to details in a real implementation
    } catch (e: any) {
        await logSystem('AutoRia', 'Search', 'ERROR', e.message);
        throw e;
    }
};

// --- Meta CAPI ---
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

// --- Chrome Extension Import ---
export const importDraft = async (data: any) => {
    try {
        await prisma.draft.create({
            data: {
                source: DraftSource.EXTENSION,
                title: data.title,
                price: data.price,
                url: data.url,
                description: data.description,
                status: 'PENDING'
            }
        });
        await logSystem('Extension', 'Import', 'OK', `Imported ${data.title}`);
        return true;
    } catch (e: any) {
        await logSystem('Extension', 'Import', 'ERROR', e.message);
        return false;
    }
};

// Helper
const hash = (str: string) => {
    // In prod, use SHA256
    return str; 
};
