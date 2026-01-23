import { describe, expect, it, vi } from 'vitest';

const leadMock = { id: 'lead_1', payload: {} };

// Mock Repositories
vi.mock('../../../../repositories/index.js', () => {
  const LeadRepository = vi.fn();
  LeadRepository.prototype.findDuplicate = vi.fn(async () => leadMock);
  LeadRepository.prototype.createLead = vi.fn(async () => leadMock);
  LeadRepository.prototype.updatePayload = vi.fn(async () => leadMock);

  const RequestRepository = vi.fn();
  RequestRepository.prototype.createRequest = vi.fn(async () => ({ id: 'req_1', publicId: 'REQ-1' }));

  return { LeadRepository, RequestRepository };
});

vi.mock('../../../../services/prisma.js', () => ({
  prisma: {
    leadActivity: {
      create: vi.fn(async () => ({ id: 'act_1' }))
    }
  }
}));

vi.mock('./events/eventEmitter.js', () => ({
  emitPlatformEvent: vi.fn(async () => undefined)
}));

import { createOrMergeLead } from './leadService.js';

describe('createOrMergeLead', () => {
  it('merges duplicate by phone', async () => {
    const result = await createOrMergeLead({
      botId: 'bot_1',
      companyId: 'comp_1',
      chatId: '123',
      userId: '123',
      name: 'Alex',
      phone: '+380991112233',
      request: 'BMW X5',
      source: 'TELEGRAM',
      leadType: 'BUY',
      createRequest: false
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.lead.id).toBe('lead_1');
  });
});
