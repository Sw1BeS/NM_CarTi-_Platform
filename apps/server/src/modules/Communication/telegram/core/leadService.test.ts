import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findDuplicateMock,
  createLeadMock,
  updatePayloadMock,
  createRequestMock,
  prismaLeadUpdateMock,
  leadActivityCreateMock,
  integrationEventLogCreateMock,
  leadIdentityFindUniqueMock,
  leadIdentityUpsertMock,
  botConfigFindUniqueMock,
  emitPlatformEventMock,
  metaCompanyTrackMock,
  metaSendEventMock
} = vi.hoisted(() => ({
  findDuplicateMock: vi.fn(),
  createLeadMock: vi.fn(async () => ({ id: 'lead_default', payload: {} })),
  updatePayloadMock: vi.fn(async () => ({ id: 'lead_default', payload: {} })),
  createRequestMock: vi.fn(async () => ({ id: 'req_default', publicId: 'REQ-DEFAULT' })),
  prismaLeadUpdateMock: vi.fn(async () => null),
  leadActivityCreateMock: vi.fn(async () => ({ id: 'act_1' })),
  integrationEventLogCreateMock: vi.fn(async () => ({ id: 'log_1' })),
  leadIdentityFindUniqueMock: vi.fn(async () => null),
  leadIdentityUpsertMock: vi.fn(async () => ({ id: 'identity_1' })),
  botConfigFindUniqueMock: vi.fn(async () => null),
  emitPlatformEventMock: vi.fn(async () => undefined),
  metaCompanyTrackMock: vi.fn(async () => ({ success: true })),
  metaSendEventMock: vi.fn(async () => undefined)
}));

vi.mock('../../../../repositories/index.js', () => {
  class LeadRepository {
    findDuplicate = findDuplicateMock;
    createLead = createLeadMock;
    updatePayload = updatePayloadMock;
  }

  class RequestRepository {
    createRequest = createRequestMock;
  }

  return { LeadRepository, RequestRepository };
});

vi.mock('../../../../services/prisma.js', () => ({
  prisma: {
    leadActivity: { create: leadActivityCreateMock },
    leadIdentity: {
      findUnique: leadIdentityFindUniqueMock,
      upsert: leadIdentityUpsertMock
    },
    integrationEventLog: { create: integrationEventLogCreateMock },
    lead: { update: prismaLeadUpdateMock },
    botConfig: { findUnique: botConfigFindUniqueMock },
    systemSettings: { findFirst: vi.fn(async () => null) }
  }
}));

vi.mock('./events/eventEmitter.js', () => ({
  emitPlatformEvent: emitPlatformEventMock
}));

vi.mock('../../../Integrations/meta/meta.service.js', () => ({
  MetaService: { getInstance: () => ({ sendEvent: metaSendEventMock }) }
}));

vi.mock('../../../Integrations/integration.service.js', () => ({
  IntegrationService: class {
    metaPixelTrackEvent = metaCompanyTrackMock;
  }
}));

vi.mock('../../../Integrations/sendpulse/sendpulse.service.js', () => ({
  SendPulseService: { getInstance: () => ({ syncContact: vi.fn(async () => undefined) }) }
}));

import { createOrMergeLead, recordIncomingLeadMessage } from './leadService.js';

beforeEach(() => {
  vi.clearAllMocks();
  prismaLeadUpdateMock.mockResolvedValue(null as any);
  findDuplicateMock.mockResolvedValue(null);
  createLeadMock.mockResolvedValue({ id: 'lead_default', payload: {} } as any);
  updatePayloadMock.mockResolvedValue({ id: 'lead_default', payload: {} } as any);
  createRequestMock.mockResolvedValue({ id: 'req_default', publicId: 'REQ-DEFAULT' } as any);
  botConfigFindUniqueMock.mockResolvedValue(null as any);
  metaCompanyTrackMock.mockResolvedValue({ success: true });
  leadIdentityFindUniqueMock.mockResolvedValue(null as any);
  leadIdentityUpsertMock.mockResolvedValue({ id: 'identity_1' } as any);
});

describe('createOrMergeLead', () => {
  it('creates lead with telegram identity populated', async () => {
    const createdLead = { id: 'lead_new', payload: {}, clientName: '' };
    findDuplicateMock.mockResolvedValueOnce(null);
    createLeadMock.mockResolvedValueOnce(createdLead);

    const result = await createOrMergeLead({
      botId: 'bot_1',
      companyId: 'comp_1',
      chatId: '123',
      userId: '777',
      name: 'Client',
      telegramUsername: 'jdoe',
      telegramName: 'John Doe',
      request: 'BMW X5',
      source: 'TELEGRAM',
      leadType: 'BUY',
      createRequest: false
    });

    expect(result.isDuplicate).toBe(false);
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      clientName: 'John Doe',
      payload: expect.objectContaining({
        telegramChatId: '123',
        telegramUserId: '777',
        telegramUsername: 'jdoe',
        telegramName: 'John Doe',
        name: 'John Doe'
      })
    }));
    expect(metaCompanyTrackMock).toHaveBeenCalledWith('comp_1', 'Lead', expect.objectContaining({
      entityType: 'lead',
      entityId: 'lead_new',
      stage: 'created',
      externalId: 'telegram:777',
      phone: undefined,
      contentIds: ['lead_new']
    }));
    expect(metaSendEventMock).not.toHaveBeenCalled();
    expect(leadIdentityUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        companyId_provider_externalId: {
          companyId: 'comp_1',
          provider: 'TELEGRAM',
          externalId: '777'
        }
      }
    }));
  });

  it('resolves existing lead through durable LeadIdentity before windowed fallback', async () => {
    const identityLead = { id: 'lead_identity', clientName: 'Identity Client', payload: {} };
    findDuplicateMock.mockResolvedValueOnce(null);
    leadIdentityFindUniqueMock.mockResolvedValueOnce({ id: 'identity_telegram', lead: identityLead });
    prismaLeadUpdateMock.mockResolvedValueOnce({ ...identityLead, payload: { lastInteractionAt: 'now' } });

    const result = await createOrMergeLead({
      botId: 'bot_1',
      companyId: 'comp_1',
      chatId: '123',
      userId: '123',
      name: 'Identity Client',
      source: 'TELEGRAM',
      createRequest: false
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.lead.id).toBe('lead_identity');
    expect(createLeadMock).not.toHaveBeenCalled();
  });

  it('records incoming free-text Telegram messages against lead history', async () => {
    const createdLead = { id: 'lead_msg', payload: {}, clientName: 'Ivan Client' };
    findDuplicateMock.mockResolvedValueOnce(null);
    createLeadMock.mockResolvedValueOnce(createdLead);

    const result = await recordIncomingLeadMessage({
      botId: 'bot_1',
      companyId: 'comp_1',
      chatId: '1001',
      userId: '1001',
      text: 'Хочу уточнити по Mercedes GLE',
      telegramUsername: 'ivan_client',
      telegramName: 'Ivan Client'
    });

    expect(result.lead.id).toBe('lead_msg');
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'comp_1',
      clientName: 'Ivan Client',
      source: 'TELEGRAM_CHAT',
      request: 'Хочу уточнити по Mercedes GLE',
      userTgId: '1001',
      payload: expect.objectContaining({
        leadType: 'MESSAGE',
        telegramChatId: '1001',
        telegramUserId: '1001',
        telegramUsername: 'ivan_client',
        telegramName: 'Ivan Client'
      })
    }));
    expect(leadActivityCreateMock).toHaveBeenCalledWith({
      data: {
        leadId: 'lead_msg',
        type: 'INCOMING_MESSAGE',
        payload: expect.objectContaining({
          botId: 'bot_1',
          chatId: '1001',
          userId: '1001',
          text: 'Хочу уточнити по Mercedes GLE',
          source: 'TELEGRAM_CHAT'
        })
      }
    });
  });

  it('enriches duplicate lead when clientName is generic/empty', async () => {
    const duplicate = { id: 'lead_dup', clientName: 'Client', payload: {} };
    findDuplicateMock.mockResolvedValueOnce(duplicate);
    prismaLeadUpdateMock.mockResolvedValueOnce({ ...duplicate, clientName: 'John Doe', payload: { name: 'John Doe' } });

    const result = await createOrMergeLead({
      botId: 'bot_1',
      companyId: 'comp_1',
      chatId: '555',
      userId: '999',
      name: 'Client',
      telegramUsername: 'newuser',
      telegramName: 'John Doe',
      source: 'TELEGRAM',
      createRequest: false
    });

    expect(result.isDuplicate).toBe(true);
    expect(prismaLeadUpdateMock).toHaveBeenCalledWith({
      where: { id: 'lead_dup' },
      data: expect.objectContaining({
        clientName: 'John Doe',
        payload: expect.objectContaining({
          telegramChatId: '555',
          telegramUserId: '999',
          telegramUsername: 'newuser',
          telegramName: 'John Doe',
          name: 'John Doe'
        })
      })
    });
    expect(updatePayloadMock).not.toHaveBeenCalled();
  });

  it('does not overwrite existing non-generic clientName on merge', async () => {
    const duplicate = { id: 'lead_keep', clientName: 'Alice Smith', payload: {} };
    findDuplicateMock.mockResolvedValueOnce(duplicate);
    prismaLeadUpdateMock.mockResolvedValueOnce({ ...duplicate, payload: { name: 'Alice Smith' } });

    await createOrMergeLead({
      botId: 'bot_1',
      companyId: 'comp_1',
      chatId: '777',
      userId: '888',
      name: 'Client',
      telegramUsername: 'asmith',
      telegramName: 'Alice Smith',
      source: 'TELEGRAM',
      createRequest: false
    });

    const updateCall = prismaLeadUpdateMock.mock.calls[0]?.[0];
    expect(updateCall?.data?.clientName).toBeUndefined();
    expect(updateCall?.data?.payload).toEqual(expect.objectContaining({
      telegramChatId: '777',
      telegramUserId: '888',
      telegramUsername: 'asmith',
      telegramName: 'Alice Smith',
      name: 'Alice Smith'
    }));
  });

  it('updates duplicate lead phone when a verified Telegram contact arrives', async () => {
    const duplicate = { id: 'lead_phone', clientName: 'Ivan Client', phone: null, payload: {} };
    findDuplicateMock.mockResolvedValueOnce(duplicate);
    prismaLeadUpdateMock.mockResolvedValueOnce({ ...duplicate, phone: '+380635055252', payload: { phone: '+380635055252' } });

    await createOrMergeLead({
      botId: 'bot_1',
      companyId: 'comp_1',
      chatId: '1001',
      userId: '1001',
      name: 'Ivan Client',
      telegramName: 'Ivan Client',
      phone: '+38 (063) 505-52-52',
      source: 'TELEGRAM',
      createRequest: false
    });

    expect(prismaLeadUpdateMock).toHaveBeenCalledWith({
      where: { id: 'lead_phone' },
      data: expect.objectContaining({
        phone: '+380635055252',
        payload: expect.objectContaining({
          phone: '+380635055252'
        })
      })
    });
  });
});
