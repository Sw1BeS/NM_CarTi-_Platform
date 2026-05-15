import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  botConfig: {
    update: vi.fn()
  }
}));
const sendMessageMock = vi.hoisted(() => vi.fn());
const telegramSenderMock = vi.hoisted(() => ({
  getChatMember: vi.fn()
}));

vi.mock('../../../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../adapters/telegram.adapter.js', () => ({
  sendMessage: sendMessageMock
}));

vi.mock('../../../telegram/messaging/telegramSender.js', () => ({
  TelegramSender: telegramSenderMock
}));

const buildContext = (overrides: Record<string, any> = {}) => ({
  bot: {
    id: 'bot_1',
    token: 'token',
    adminChatId: undefined
  },
  input: '/setup_admin',
  chatId: '-100123',
  vars: {},
  update: {
    message: {
      chat: { id: -100123, type: 'supergroup' },
      from: { id: 1001 }
    }
  },
  saveSession: vi.fn(),
  ...overrides
});

describe('handleSetupCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.botConfig.update.mockResolvedValue({});
    sendMessageMock.mockResolvedValue({});
    telegramSenderMock.getChatMember.mockResolvedValue({ status: 'administrator' });
  });

  it('denies /setup_admin in private chats', async () => {
    const { handleSetupCommands } = await import('./setup.actions.js');
    const ctx = buildContext({
      chatId: '1001',
      update: {
        message: {
          chat: { id: 1001, type: 'private' },
          from: { id: 1001 }
        }
      }
    });

    const handled = await handleSetupCommands(ctx as any);

    expect(handled).toBe(true);
    expect(prismaMock.botConfig.update).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith(ctx.bot, '1001', expect.stringMatching(/групі|супергрупі/i));
  });

  it('denies /setup_admin outside already configured admin chat', async () => {
    const { handleSetupCommands } = await import('./setup.actions.js');
    const ctx = buildContext({
      bot: {
        id: 'bot_1',
        token: 'token',
        adminChatId: '-100999'
      }
    });

    const handled = await handleSetupCommands(ctx as any);

    expect(handled).toBe(true);
    expect(prismaMock.botConfig.update).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith(ctx.bot, '-100123', expect.stringMatching(/налаштованій admin-групі/i));
  });

  it('allows /setup_admin for group administrators', async () => {
    const { handleSetupCommands } = await import('./setup.actions.js');
    const ctx = buildContext();

    const handled = await handleSetupCommands(ctx as any);

    expect(handled).toBe(true);
    expect(telegramSenderMock.getChatMember).toHaveBeenCalledWith('token', '-100123', '1001');
    expect(prismaMock.botConfig.update).toHaveBeenCalledWith({
      where: { id: 'bot_1' },
      data: { adminChatId: '-100123' }
    });
    expect(ctx.bot.adminChatId).toBe('-100123');
  });
});
