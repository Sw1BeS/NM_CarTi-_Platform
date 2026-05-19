import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminActionTokenMock } = vi.hoisted(() => ({
  createAdminActionTokenMock: vi.fn()
}));

vi.mock('./telegramAdminActionToken.service.js', () => ({
  createAdminActionToken: createAdminActionTokenMock
}));

describe('B2B admin notification actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminActionTokenMock.mockResolvedValue('tok_b2b');
  });

  it('adds a short opaque explicit contact reveal action for B2B offers', async () => {
    createAdminActionTokenMock
      .mockResolvedValueOnce('tok_approve')
      .mockResolvedValueOnce('tok_reject')
      .mockResolvedValueOnce('tok_send')
      .mockResolvedValueOnce('tok_details')
      .mockResolvedValueOnce('tok_reveal');
    const { buildB2BVariantAdminActionMarkupAsync } = await import('./b2bAdminNotification.js');

    const markup = await buildB2BVariantAdminActionMarkupAsync({
      variant: { id: 'variant_1' },
      request: { id: 'request_1', publicId: 'CD-2026-000123' },
      botId: 'bot_b2b',
      companyId: 'company_1'
    });

    const buttons = markup?.inline_keyboard.flat() || [];
    const reveal = buttons.find((button: any) => String(button.text || '').includes('Контакти'));

    expect(reveal?.callback_data).toMatch(/^v1:aa:/);
    expect(Buffer.byteLength(reveal.callback_data, 'utf8')).toBeLessThanOrEqual(64);
    expect(reveal.callback_data).not.toContain('variant_1');
    expect(createAdminActionTokenMock).toHaveBeenCalledWith({
      action: 'b2bVariant.REVEAL_CONTACT',
      targetType: 'request_variant',
      targetId: 'variant_1',
      botId: 'bot_b2b',
      companyId: 'company_1',
      requestId: 'request_1'
    });
  });
});
