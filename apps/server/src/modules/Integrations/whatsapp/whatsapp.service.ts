import { Router } from 'express';
import { prisma } from '../../../services/prisma.js';
import { logSystem } from '../../Core/system/systemLog.service.js';

export class WhatsAppService {
    private static instance: WhatsAppService;
    private apiUrl = 'https://graph.facebook.com/v19.0';

    static getInstance() {
        if (!this.instance) this.instance = new WhatsAppService();
        return this.instance;
    }

    async handleWebhook(body: any) {
        if (body.object) {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
                const msg = body.entry[0].changes[0].value.messages[0];
                const from = msg.from;
                const text = msg.text?.body || '';
                const waBusinessAccountId = body.entry[0].id;

                await logSystem('WHATSAPP_INCOMING', 'MESSAGE_RECEIVED', 'INFO', `Msg from ${from}: ${text}`, { body });

                // Route to Unified Inbox - Store in BotMessage table
                try {
                    await prisma.$executeRaw`
                        INSERT INTO "BotMessage" (id, "botId", "chatId", direction, text, "messageId", payload, "createdAt")
                        VALUES (
                            gen_random_uuid()::text,
                            ${'whatsapp'},
                            ${String(from)},
                            ${'INCOMING'},
                            ${text},
                            ${msg.id || null},
                            ${JSON.stringify({
                        platform: 'WHATSAPP',
                        from: { id: from },
                        message: msg,
                        waBusinessAccountId
                    })}::jsonb,
                            NOW()
                        )
                    `;
                    await logSystem('WHATSAPP_ROUTING', 'INBOX_STORED', 'INFO', `WhatsApp message stored to Inbox from ${from}`);
                } catch (error: any) {
                    await logSystem('WHATSAPP_ROUTING', 'INBOX_ERROR', 'ERROR', `Failed to store WhatsApp message: ${error.message}`);
                }
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
