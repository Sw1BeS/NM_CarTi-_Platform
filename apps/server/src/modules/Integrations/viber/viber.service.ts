import { Router } from 'express';
import { logSystem } from '../../Core/system/systemLog.service.js';
import { logger } from '../../../utils/logger.js';

export class ViberService {
    private static instance: ViberService;

    static getInstance() {
        if (!this.instance) this.instance = new ViberService();
        return this.instance;
    }

    async handleWebhook(body: any) {
        if (body.event === 'message') {
            const sender = body.sender;
            const message = body.message;
            await logSystem('VIBER_INCOMING', 'MESSAGE_RECEIVED', 'INFO', `Msg from ${sender.name}: ${message.text}`, { body });
        }
    }

    async setWebhook(url: string) {
        // Logic to set webhook via Viber API
    }
}

export const viberRouter = Router();

viberRouter.post('/', async (req, res) => {
    try {
        await ViberService.getInstance().handleWebhook(req.body);
        res.sendStatus(200);
    } catch (e) {
        logger.error(e);
        res.sendStatus(500);
    }
});
