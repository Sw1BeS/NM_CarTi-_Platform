import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  connectorFindUniqueMock,
  connectorUpdateMock,
  connectMock,
  disconnectMock,
  invokeMock,
  sessionSaveMock,
  telegramClients
} = vi.hoisted(() => ({
  connectorFindUniqueMock: vi.fn(),
  connectorUpdateMock: vi.fn(),
  connectMock: vi.fn(),
  disconnectMock: vi.fn(),
  invokeMock: vi.fn(),
  sessionSaveMock: vi.fn(),
  telegramClients: [] as any[]
}));

vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    mTProtoConnector: {
      findUnique: connectorFindUniqueMock,
      update: connectorUpdateMock
    }
  }
}));

vi.mock('telegram/sessions/index.js', () => ({
  StringSession: vi.fn().mockImplementation((value = '') => ({
    value,
    save: sessionSaveMock
  }))
}));

vi.mock('telegram/extensions/Logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({ error: vi.fn() }))
}));

vi.mock('telegram', () => {
  class SendCode {
    className = 'auth.SendCode';
    constructor(public params: any) {}
  }

  class ResendCode {
    className = 'auth.ResendCode';
    constructor(public params: any) {}
  }

  class SignIn {
    className = 'auth.SignIn';
    constructor(public params: any) {}
  }

  class CheckPassword {
    className = 'auth.CheckPassword';
    constructor(public params: any) {}
  }

  class CodeSettings {
    className = 'CodeSettings';
    constructor(public params: any) {}
  }

  class TelegramClient {
    connect = connectMock;
    disconnect = disconnectMock;
    invoke = invokeMock;
    getMe = vi.fn();
    session: any;
    apiId: number;
    apiHash: string;

    constructor(session: any, apiId: number, apiHash: string) {
      this.session = session;
      this.apiId = apiId;
      this.apiHash = apiHash;
      telegramClients.push(this);
    }
  }

  return {
    TelegramClient,
    Api: {
      CodeSettings,
      auth: {
        SendCode,
        ResendCode,
        SignIn,
        CheckPassword
      }
    }
  };
});

describe('MTProtoService auth flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    telegramClients.length = 0;
    process.env.TG_API_ID = '29960572';
    process.env.TG_API_HASH = 'env_hash';
    connectorUpdateMock.mockResolvedValue({});
    connectMock.mockResolvedValue(undefined);
    disconnectMock.mockResolvedValue(undefined);
  });

  it('persists auth attempt state and detailed Telegram sent-code metadata', async () => {
    connectorFindUniqueMock.mockResolvedValue({
      id: 'conn_auth',
      workspaceApiId: 29960572,
      workspaceApiHash: 'workspace_hash',
      sessionString: 'old-authorized-session'
    });
    sessionSaveMock.mockReturnValue('pre-auth-session');
    invokeMock.mockResolvedValue({
      className: 'auth.SentCode',
      phoneCodeHash: 'phone-code-hash',
      type: { className: 'auth.SentCodeTypeApp', length: 5 },
      nextType: { className: 'auth.CodeTypeSms' },
      timeout: 120
    });

    const { MTProtoService } = await import('./mtproto.service.js');

    const result = await MTProtoService.sendCode('conn_auth', '+380735687572');

    expect(telegramClients[0].session.value).toBe('');
    expect(result).toMatchObject({
      phoneCodeHash: 'phone-code-hash',
      isCodeViaApp: true,
      sentCodeType: 'auth.SentCodeTypeApp',
      nextCodeType: 'auth.CodeTypeSms',
      codeLength: 5
    });
    expect(result.timeoutAt).toBeInstanceOf(Date);
    expect(connectorUpdateMock).toHaveBeenCalledWith({
      where: { id: 'conn_auth' },
      data: expect.objectContaining({
        phone: '+380735687572',
        status: 'CONNECTING',
        authSessionString: 'pre-auth-session',
        authPhoneCodeHash: 'phone-code-hash',
        authPhone: '+380735687572',
        authApiId: 29960572,
        authSentCodeType: 'auth.SentCodeTypeApp',
        authNextCodeType: 'auth.CodeTypeSms',
        authCodeLength: 5,
        lastError: null
      })
    });
  });

  it('can immediately request SMS fallback and persist the resend code hash', async () => {
    connectorFindUniqueMock.mockResolvedValue({
      id: 'conn_auth',
      workspaceApiId: 29960572,
      workspaceApiHash: 'workspace_hash',
      sessionString: null
    });
    sessionSaveMock.mockReturnValue('pre-auth-session');
    invokeMock
      .mockResolvedValueOnce({
        className: 'auth.SentCode',
        phoneCodeHash: 'app-code-hash',
        type: { className: 'auth.SentCodeTypeApp', length: 5 },
        nextType: { className: 'auth.CodeTypeSms' },
        timeout: 60
      })
      .mockResolvedValueOnce({
        className: 'auth.SentCode',
        phoneCodeHash: 'sms-code-hash',
        type: { className: 'auth.SentCodeTypeSms', length: 5 },
        nextType: null,
        timeout: null
      });

    const { MTProtoService } = await import('./mtproto.service.js');

    const result = await MTProtoService.sendCode('conn_auth', '+380735687572', { forceSms: true });

    expect(invokeMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      className: 'auth.SendCode'
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      className: 'auth.ResendCode',
      params: expect.objectContaining({
        phoneNumber: '+380735687572',
        phoneCodeHash: 'app-code-hash'
      })
    }));
    expect(result).toMatchObject({
      phoneCodeHash: 'sms-code-hash',
      isCodeViaApp: false,
      sentCodeType: 'auth.SentCodeTypeSms',
      forceSmsAttempted: true,
      forceSmsSucceeded: true,
      forceSmsError: null,
      initialSentCodeType: 'auth.SentCodeTypeApp'
    });
    expect(connectorUpdateMock).toHaveBeenCalledWith({
      where: { id: 'conn_auth' },
      data: expect.objectContaining({
        authPhoneCodeHash: 'sms-code-hash',
        authSentCodeType: 'auth.SentCodeTypeSms',
        authNextCodeType: null,
        authCodeLength: 5,
        lastError: null
      })
    });
  });

  it('signs in from persisted pre-auth session after process restart and clears auth metadata', async () => {
    connectorFindUniqueMock.mockResolvedValue({
      id: 'conn_auth',
      workspaceApiId: null,
      workspaceApiHash: null,
      sessionString: null,
      authSessionString: 'pre-auth-session',
      authPhoneCodeHash: 'persisted-code-hash',
      authPhone: '+380735687572',
      authApiId: 29960572,
      authCodeLength: 5
    });
    sessionSaveMock.mockReturnValue('final-authorized-session');
    invokeMock.mockResolvedValue({});

    const { MTProtoService } = await import('./mtproto.service.js');

    await MTProtoService.signIn('conn_auth', '+380735687572', '12345', undefined);

    expect(telegramClients[0].session.value).toBe('pre-auth-session');
    expect(invokeMock).toHaveBeenCalledWith(expect.objectContaining({
      className: 'auth.SignIn',
      params: expect.objectContaining({
        phoneNumber: '+380735687572',
        phoneCodeHash: 'persisted-code-hash',
        phoneCode: '12345'
      })
    }));
    expect(connectorUpdateMock).toHaveBeenCalledWith({
      where: { id: 'conn_auth' },
      data: expect.objectContaining({
        sessionString: 'final-authorized-session',
        status: 'READY',
        authSessionString: null,
        authPhoneCodeHash: null,
        authPhone: null,
        authApiId: null,
        authSentCodeType: null,
        authNextCodeType: null,
        authCodeLength: null,
        authTimeoutAt: null,
        authRequestedAt: null,
        lastError: null
      })
    });
  });

  it('rejects a wrong-length code before calling Telegram sign-in', async () => {
    connectorFindUniqueMock.mockResolvedValue({
      id: 'conn_auth',
      workspaceApiId: null,
      workspaceApiHash: null,
      sessionString: null,
      authSessionString: 'pre-auth-session',
      authPhoneCodeHash: 'persisted-code-hash',
      authPhone: '+380735687572',
      authApiId: 29960572,
      authCodeLength: 5
    });

    const { MTProtoService } = await import('./mtproto.service.js');

    await expect(
      MTProtoService.signIn('conn_auth', '+380735687572', 'DGqtwJpVyA0', undefined)
    ).rejects.toThrow('CODE_LENGTH_MISMATCH');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
