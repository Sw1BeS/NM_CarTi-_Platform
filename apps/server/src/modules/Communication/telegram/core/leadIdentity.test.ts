
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOrMergeLead } from './leadService.js';
import { LeadStatus } from '@prisma/client';

// Mocks
const mockLeadRepo = {
    findDuplicate: vi.fn(),
    createLead: vi.fn(),
    updatePayload: vi.fn()
};
const mockRequestRepo = {
    createRequest: vi.fn()
};
const mockPrisma = {
    botConfig: {
        findUnique: vi.fn()
    },
    leadActivity: {
        create: vi.fn()
    },
    lead: {
        update: vi.fn()
    },
    systemSettings: {
        findFirst: vi.fn().mockResolvedValue(null)
    }
};

// Mock modules
vi.mock('../../../../services/prisma.js', () => ({
    prisma: mockPrisma
}));

vi.mock('../../../../repositories/index.js', () => ({
    LeadRepository: vi.fn(() => mockLeadRepo),
    RequestRepository: vi.fn(() => mockRequestRepo)
}));

vi.mock('./events/eventEmitter.js', () => ({
    emitPlatformEvent: vi.fn()
}));

vi.mock('../../../../services/integrationEventLog.service.js', () => ({
    logIntegrationEvent: vi.fn()
}));

vi.mock('../../../Inventory/normalization/normalizePhone.js', () => ({
    normalizePhone: (p: string) => p
}));

vi.mock('../../../Integrations/meta/meta.service.js', () => ({
    MetaService: {
        getInstance: () => ({
            sendEvent: vi.fn().mockRejectedValue('params are not valid') // Avoid error logs in test
        })
    }
}));

describe('P0-1 Lead Identity Fix', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.botConfig.findUnique.mockResolvedValue({ companyId: 'comp_123' });
    });

    it('should persist telegramName and telegramUsername in payload when creating new lead', async () => {
        mockLeadRepo.findDuplicate.mockResolvedValue(null);
        mockLeadRepo.createLead.mockResolvedValue({ id: 'lead_1', payload: {} });

        const input = {
            botId: 'bot_1',
            name: 'Client',
            telegramName: 'John Doe',
            telegramUsername: 'johndoe',
            chatId: '123456',
            createRequest: false
        };

        await createOrMergeLead(input);

        expect(mockLeadRepo.createLead).toHaveBeenCalledWith(expect.objectContaining({
            clientName: 'John Doe', // Check fallback logic (Client -> John Doe)
            payload: expect.objectContaining({
                telegramName: 'John Doe',
                telegramUsername: 'johndoe',
                telegramChatId: '123456'
            })
        }));
    });

    it('should fallback to telegramUsername if no name provided', async () => {
        mockLeadRepo.findDuplicate.mockResolvedValue(null);
        mockLeadRepo.createLead.mockResolvedValue({ id: 'lead_1', payload: {} });

        const input = {
            botId: 'bot_1',
            name: '',
            telegramUsername: 'johndoe',
            createRequest: false
        };

        await createOrMergeLead(input);

        expect(mockLeadRepo.createLead).toHaveBeenCalledWith(expect.objectContaining({
            clientName: '@johndoe'
        }));
    });

    it('should merge missing tg fields into existing lead', async () => {
        // Setup existing lead without TG fields
        const existingLead = {
            id: 'lead_existing',
            clientName: 'Client',
            payload: { existingData: 1 }
        };
        mockLeadRepo.findDuplicate.mockResolvedValue(existingLead);

        const input = {
            botId: 'bot_1',
            name: 'Client',
            telegramName: 'Jane Doe',
            telegramUsername: 'janedoe',
            chatId: '987654',
            createRequest: false
        };

        await createOrMergeLead(input);

        // Verify update was called with merged payload
        expect(mockPrisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'lead_existing' },
            data: expect.objectContaining({
                clientName: 'Jane Doe', // Should update generic name
                payload: expect.objectContaining({
                    telegramName: 'Jane Doe',
                    telegramUsername: 'janedoe',
                    telegramChatId: '987654',
                    lastInteractionAt: expect.any(String)
                })
            })
        }));
    });
});
