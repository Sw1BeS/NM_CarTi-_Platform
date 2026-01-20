import { Router } from 'express';
import { logSystem } from '../../Core/system/systemLog.service.js';

export class WhatsAppService {
    private static instance: WhatsAppService;
    private apiUrl = 'https://graph.facebook.com/v19.0';

    static getInstance() {
        if (!this.instance) this.instance = new WhatsAppService();
        return this.instance;
    }

    async handleWebhook(body: any) {
        // Implement Meta WhatsApp Cloud API webhook handling
        if (body.object) {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
                const msg = body.entry[0].changes[0].value.messages[0];
                const from = msg.from;
                const text = msg.text?.body;

                await logSystem('WHATSAPP_INCOMING', 'MESSAGE_RECEIVED', 'INFO', `Msg from ${from}: ${text}`, { body });
                // TODO: Route to Unified Inbox
            }
        }
    }

    async sendMessage(to: string, text: string) {
        // Placeholder for sending message via Cloud API
        console.log(`Sending WhatsApp to ${to}: ${text}`);
    }
}

export const whatsAppRouter = Router();

whatsAppRouter.post('/', async (req, res) => {
    try {
        await WhatsAppService.getInstance().handleWebhook(req.body);
        res.sendStatus(200);
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

whatsAppRouter.get('/', (req, res) => {
    // Verification challenge
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});
