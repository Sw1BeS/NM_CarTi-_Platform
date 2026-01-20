import { describe, expect, it, vi } from 'vitest';

const leadMock = { id: 'lead_1', payload: {} };

vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    lead: {
      findFirst: vi.fn(async () => leadMock),
      create: vi.fn(),
      update: vi.fn(async () => leadMock)
    },
    leadActivity: {
      create: vi.fn(async () => ({ id: 'act_1' }))
    },
    b2bRequest: {
      create: vi.fn(async () => ({ id: 'req_1', publicId: 'REQ-1' }))
    }
  }
}));

vi.mock('../events/eventEmitter.js', () => ({
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
