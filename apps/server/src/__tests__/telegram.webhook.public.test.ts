import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('Telegram Webhook Routing', () => {
    it('should be accessible without Bearer token (returns 403 not 401)', async () => {
        const res = await request(app)
            .post('/api/telegram/webhook/test-webhook-id')
            .set('x-telegram-bot-api-secret-token', 'wrong-secret')
            .send({ update_id: 12345 });

        // Key check: It must NOT be 401 (Unauthorized) which implies the generic API auth blocked it
        expect(res.status).not.toBe(401);

        // It should be 403 (Forbidden) because secret is wrong/missing, or 200 if validation is loose (unlikely)
        // We expect 403 based on User's description "validates via Telegram secret header"
        expect(res.status).toBe(403);
    });
});
