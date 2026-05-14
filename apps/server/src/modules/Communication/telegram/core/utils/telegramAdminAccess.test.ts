import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getChatMemberMock } = vi.hoisted(() => ({
  getChatMemberMock: vi.fn()
}));

vi.mock('../../messaging/telegramSender.js', () => ({
  TelegramSender: {
    getChatMember: getChatMemberMock
  }
}));

import { assertAdminTestAccess, assertConfiguredAdminActionAccess } from './telegramAdminAccess.js';

const buildCtx = (overrides: Record<string, any> = {}) => ({
  receivedAt: new Date(),
  chatId: '-100123',
  chatType: 'supergroup',
  bot: {
    id: 'bot_1',
    token: 'token',
    adminChatId: '-100123'
  },
  update: {
    callback_query: {
      id: 'cb_1',
      from: { id: 100, username: 'admin' },
      message: {
        chat: {
          id: -100123,
          type: 'supergroup'
        }
      }
    }
  },
  ...overrides
}) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertAdminTestAccess', () => {
  it('denies callback outside group chats', async () => {
    const ctx = buildCtx({
      chatType: 'private',
      update: {
        callback_query: {
          id: 'cb_1',
          from: { id: 100 },
          message: { chat: { id: 100, type: 'private' } }
        }
      }
    });
    const result = await assertAdminTestAccess(ctx);
    expect(result.ok).toBe(false);
  });

  it('denies callback from non-admin configured chat', async () => {
    const ctx = buildCtx({ chatId: '-100999' });
    const result = await assertAdminTestAccess(ctx);
    expect(result.ok).toBe(false);
  });

  it('denies non-admin members', async () => {
    getChatMemberMock.mockResolvedValueOnce({ status: 'member' });
    const result = await assertAdminTestAccess(buildCtx());
    expect(result.ok).toBe(false);
  });

  it('allows administrators', async () => {
    getChatMemberMock.mockResolvedValueOnce({ status: 'administrator' });
    const result = await assertAdminTestAccess(buildCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actorId).toBe('100');
      expect(result.adminChatId).toBe('-100123');
    }
  });
});

describe('assertConfiguredAdminActionAccess', () => {
  it('allows configured private admin chat owner for non-test admin actions', async () => {
    const result = await assertConfiguredAdminActionAccess(buildCtx({
      chatId: '100',
      chatType: 'private',
      bot: {
        id: 'bot_1',
        token: 'token',
        adminChatId: '100'
      },
      update: {
        callback_query: {
          id: 'cb_1',
          from: { id: 100, username: 'admin' },
          message: { chat: { id: 100, type: 'private' } }
        }
      }
    }));

    expect(result.ok).toBe(true);
  });

  it('uses action-specific denial text instead of test panel text', async () => {
    getChatMemberMock.mockResolvedValueOnce({ status: 'member' });

    const result = await assertConfiguredAdminActionAccess(buildCtx());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorText).not.toMatch(/тест/i);
      expect(result.errorText).toMatch(/дію|прав/i);
    }
  });
});
