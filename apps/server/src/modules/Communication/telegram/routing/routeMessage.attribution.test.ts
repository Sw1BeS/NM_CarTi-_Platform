import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  telegramOutboxMock,
  scenarioEngineMock,
  b2bWhitelistServiceMock,
  quotaServiceMock,
  attributionSessionServiceMock,
  startLeadSellWizardMock
} = vi.hoisted(() => ({
  prismaMock: {
    botSession: {
      update: vi.fn()
    },
    integrationEventLog: {
      create: vi.fn()
    },
    partnerUser: {
      findFirst: vi.fn()
    }
  },
  telegramOutboxMock: {
    sendMessage: vi.fn()
  },
  scenarioEngineMock: {
    handleUpdate: vi.fn(),
    startScenario: vi.fn()
  },
  b2bWhitelistServiceMock: {
    isEnforced: vi.fn(),
    resolveParticipant: vi.fn()
  },
  quotaServiceMock: {
    consume: vi.fn()
  },
  attributionSessionServiceMock: {
    lookupToken: vi.fn()
  },
  startLeadSellWizardMock: vi.fn()
}));

vi.mock('../../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: telegramOutboxMock
}));

vi.mock('../../bots/scenario.engine.js', () => ({
  ScenarioEngine: scenarioEngineMock
}));

vi.mock('../../../../services/b2bWhitelist.service.js', () => ({
  b2bWhitelistService: b2bWhitelistServiceMock
}));

vi.mock('../../../../services/quota.service.js', () => ({
  quotaService: quotaServiceMock
}));

vi.mock('../../../Attribution/attributionSession.service.js', () => ({
  attributionSessionService: attributionSessionServiceMock
}));

vi.mock('./wizards/leadSellWizard.js', () => ({
  startLeadSellWizard: startLeadSellWizardMock,
  handleLeadSellText: vi.fn()
}));

const baseCtx = (text: string): any => ({
  bot: {
    id: 'bot_lead',
    token: 'token',
    name: 'Cartie Client Bot',
    template: 'CLIENT_LEAD',
    companyId: 'company_1',
    config: {
      publicBaseUrl: 'https://cartie.test',
      defaultShowcaseSlug: 'cartie',
      miniAppConfig: {
        url: 'https://cartie.test/p/app/cartie',
        showcaseSlug: 'cartie'
      }
    }
  },
  companyId: 'company_1',
  chatId: '1001',
  userId: '1001',
  chatType: 'private',
  update: {
    message: {
      text,
      chat: { id: 1001, type: 'private' },
      from: { id: 1001, first_name: 'Client' }
    }
  },
  session: {
    id: 'session_1',
    state: 'CL_MENU',
    variables: {}
  }
});

describe('CLIENT_LEAD /start attribution binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    b2bWhitelistServiceMock.isEnforced.mockReturnValue(false);
    quotaServiceMock.consume.mockResolvedValue({ allowed: true });
    prismaMock.botSession.update.mockImplementation(async ({ data }: any) => ({
      id: 'session_1',
      state: data.state,
      variables: data.variables,
      lastActive: data.lastActive
    }));
    telegramOutboxMock.sendMessage.mockResolvedValue({ message_id: 10 });
  });

  it('keeps reserved /start sell alias ahead of attribution lookup', async () => {
    const { routeMessage } = await import('./routeMessage.js');

    const handled = await routeMessage(baseCtx('/start sell'));

    expect(handled).toBe(true);
    expect(startLeadSellWizardMock).toHaveBeenCalledTimes(1);
    expect(attributionSessionServiceMock.lookupToken).not.toHaveBeenCalled();
  });

  it('stores a valid attribution token in BotSession variables', async () => {
    const attribution = {
      token: 'AbC_token_123456',
      destination: 'b2c_bot_sandbox',
      query: { utm_source: 'meta' },
      identifiers: { fbc: 'fb.1.1779865200000.Click' },
      created_at: '2026-05-27T07:00:00.000Z',
      expires_at: '2026-06-26T07:00:00.000Z'
    };
    attributionSessionServiceMock.lookupToken.mockResolvedValue(attribution);
    const { routeMessage } = await import('./routeMessage.js');

    const handled = await routeMessage(baseCtx('/start AbC_token_123456'));

    expect(handled).toBe(true);
    expect(attributionSessionServiceMock.lookupToken).toHaveBeenCalledWith('AbC_token_123456', { consume: false });
    expect(prismaMock.botSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'session_1' },
      data: expect.objectContaining({
        state: 'CL_MENU',
        variables: expect.objectContaining({
          attributionToken: 'AbC_token_123456',
          attribution
        })
      })
    }));
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not store invalid /start payloads as attribution', async () => {
    attributionSessionServiceMock.lookupToken.mockResolvedValue(null);
    const { routeMessage } = await import('./routeMessage.js');

    const handled = await routeMessage(baseCtx('/start invalidToken'));

    expect(handled).toBe(true);
    expect(JSON.stringify(prismaMock.botSession.update.mock.calls)).not.toContain('attributionToken');
    expect(telegramOutboxMock.sendMessage).toHaveBeenCalledTimes(1);
  });
});
