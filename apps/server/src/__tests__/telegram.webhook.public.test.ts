import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { runTelegramPipelineMock } = vi.hoisted(() => {
    return {
        runTelegramPipelineMock: vi.fn()
    };
});

const { mockPrisma } = vi.hoisted(() => {
    return {
        mockPrisma: {
            $connect: vi.fn(),
            workspace: {
                findMany: vi.fn(),
                count: vi.fn()
            },
            globalUser: {
                findUnique: vi.fn(),
                findFirst: vi.fn()
            },
            membership: {
                findFirst: vi.fn()
            },
            botConfig: {
                findUnique: vi.fn()
            },
            telegramUpdate: {
                create: vi.fn()
            },
            systemLog: {
                create: vi.fn()
            }
        }
    };
});

vi.mock('../services/prisma.js', () => ({
    prisma: mockPrisma
}));

vi.mock('../modules/Communication/telegram/scenarios/pipeline.js', () => ({
    runTelegramPipeline: runTelegramPipelineMock
}));

// Import app AFTER mocks
import { app } from '../index.js';

describe('Telegram Webhook Routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.botConfig.findUnique.mockResolvedValue({
            id: 'test-bot',
            isEnabled: true,
            config: {
                webhookSecret: 'expected-secret'
            }
        } as any);
    });

    it('is public (no Bearer token) but forbidden on wrong secret', async () => {
        const res = await request(app)
            .post('/api/telegram/webhook/test-bot')
            .set('x-telegram-bot-api-secret-token', 'wrong-secret')
            .send({ update_id: 12345 });

        expect(res.status).not.toBe(401);
        expect(res.status).toBe(403);
    });

    it('is public (no Bearer token) but forbidden when secret header is missing', async () => {
        const res = await request(app)
            .post('/api/telegram/webhook/test-bot')
            .send({ update_id: 12345 });

        expect(res.status).not.toBe(401);
        expect(res.status).toBe(403);
    });

    it('accepts valid secret and invokes the pipeline', async () => {
        const res = await request(app)
            .post('/api/telegram/webhook/test-bot')
            .set('x-telegram-bot-api-secret-token', 'expected-secret')
            .send({ update_id: 999, message: { message_id: 1, chat: { id: 1 }, text: 'hi' } });

        expect(res.status).toBe(200);
        expect(runTelegramPipelineMock).toHaveBeenCalledTimes(1);
        expect(runTelegramPipelineMock.mock.calls[0]?.[0]).toMatchObject({
            botId: 'test-bot',
            secretToken: 'expected-secret',
            source: 'webhook'
        });
    });
});
