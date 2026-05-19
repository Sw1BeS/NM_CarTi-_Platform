import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminActionTokenMock } = vi.hoisted(() => ({
  createAdminActionTokenMock: vi.fn()
}));

vi.mock('./telegramAdminActionToken.service.js', () => ({
  createAdminActionToken: createAdminActionTokenMock
}));

describe('lead admin notification actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminActionTokenMock.mockResolvedValue('tok_abc123');
  });

  it('builds short opaque callback data for lead contacted admin action', async () => {
    const { buildLeadAdminActionMarkupAsync } = await import('./leadAdminNotification.js');

    const markup = await buildLeadAdminActionMarkupAsync({
      lead: { id: 'lead_1', leadCode: 'L-1' },
      request: { id: 'request_1', publicId: 'REQ-1' },
      telegramUserId: '1001',
      tokenContext: {
        botId: 'bot_1',
        companyId: 'company_1',
        requestId: 'request_1'
      }
    });

    const buttons = markup?.inline_keyboard.flat() || [];
    const contacted = buttons.find((button: any) => String(button.text || '').includes('контакт'));

    expect(contacted?.callback_data).toMatch(/^v1:aa:/);
    expect(Buffer.byteLength(contacted.callback_data, 'utf8')).toBeLessThanOrEqual(64);
    expect(contacted.callback_data).not.toContain('lead_1');
    expect(createAdminActionTokenMock).toHaveBeenCalledWith({
      action: 'lead.CONTACTED',
      targetType: 'lead',
      targetId: 'lead_1',
      botId: 'bot_1',
      companyId: 'company_1',
      requestId: 'request_1'
    });
  });

  it('adds a short opaque SalesDrive sync action for request notifications', async () => {
    createAdminActionTokenMock
      .mockResolvedValueOnce('tok_contacted')
      .mockResolvedValueOnce('tok_salesdrive');
    const { buildLeadAdminActionMarkupAsync } = await import('./leadAdminNotification.js');

    const markup = await buildLeadAdminActionMarkupAsync({
      lead: { id: 'lead_1', leadCode: 'L-1' },
      request: { id: 'request_1', publicId: 'REQ-1' },
      telegramUserId: '1001',
      tokenContext: {
        botId: 'bot_1',
        companyId: 'company_1',
        requestId: 'request_1'
      }
    });

    const buttons = markup?.inline_keyboard.flat() || [];
    const salesDrive = buttons.find((button: any) => String(button.text || '').includes('SalesDrive'));

    expect(salesDrive?.callback_data).toMatch(/^v1:aa:/);
    expect(Buffer.byteLength(salesDrive.callback_data, 'utf8')).toBeLessThanOrEqual(64);
    expect(salesDrive.callback_data).not.toContain('request_1');
    expect(createAdminActionTokenMock).toHaveBeenCalledWith({
      action: 'salesdrive.REQUEST_SYNC',
      targetType: 'request',
      targetId: 'request_1',
      botId: 'bot_1',
      companyId: 'company_1',
      requestId: 'request_1'
    });
  });

  it('omits contacted action when token creation returns empty without dropping CRM or user links', async () => {
    createAdminActionTokenMock.mockResolvedValue('');
    const { buildLeadAdminActionMarkupAsync } = await import('./leadAdminNotification.js');

    const markup = await buildLeadAdminActionMarkupAsync({
      lead: { id: 'lead_raw_123', leadCode: 'L-123' },
      request: { id: 'request_123', publicId: 'REQ-123' },
      telegramUserId: '1001',
      tokenContext: {
        botId: 'bot_1',
        companyId: 'company_1',
        requestId: 'request_123'
      }
    });

    const buttons = markup?.inline_keyboard.flat() || [];
    const callbackData = buttons
      .map((button: any) => button.callback_data)
      .filter(Boolean)
      .map(String);

    expect(callbackData).not.toEqual(expect.arrayContaining([expect.stringContaining('lead_CONTACTED_')]));
    expect(callbackData).not.toEqual(expect.arrayContaining([expect.stringContaining('lead_raw_123')]));
    expect(buttons.some((button: any) => button.url?.includes('/requests?search=REQ-123'))).toBe(true);
    expect(buttons.some((button: any) => button.url === 'tg://user?id=1001')).toBe(true);
    expect(buttons.some((button: any) => String(button.text || '').includes('контакт'))).toBe(false);
  });

  it('omits contacted action when token creation rejects without dropping CRM or user links', async () => {
    createAdminActionTokenMock.mockRejectedValue(new Error('token store unavailable'));
    const { buildLeadAdminActionMarkupAsync } = await import('./leadAdminNotification.js');

    const markup = await buildLeadAdminActionMarkupAsync({
      lead: { id: 'lead_raw_456', leadCode: 'L-456' },
      request: { id: 'request_456', publicId: 'REQ-456' },
      telegramUserId: '1001',
      tokenContext: {
        botId: 'bot_1',
        companyId: 'company_1',
        requestId: 'request_456'
      }
    });

    const buttons = markup?.inline_keyboard.flat() || [];
    const callbackData = buttons
      .map((button: any) => button.callback_data)
      .filter(Boolean)
      .map(String);

    expect(callbackData).not.toEqual(expect.arrayContaining([expect.stringContaining('lead_CONTACTED_')]));
    expect(callbackData).not.toEqual(expect.arrayContaining([expect.stringContaining('lead_raw_456')]));
    expect(buttons.some((button: any) => button.url?.includes('/requests?search=REQ-456'))).toBe(true);
    expect(buttons.some((button: any) => button.url === 'tg://user?id=1001')).toBe(true);
    expect(buttons.some((button: any) => String(button.text || '').includes('контакт'))).toBe(false);
  });
});
