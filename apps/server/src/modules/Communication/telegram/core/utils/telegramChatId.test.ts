import { describe, expect, it } from 'vitest';
import {
  buildTelegramChannelPostUrl,
  isTelegramChannelOrSupergroupDialogId,
  normalizeTelegramChatId,
  toTelegramChannelInternalId
} from './telegramChatId.js';

describe('telegramChatId utils', () => {
  it('keeps already normalized -100 dialog ids', () => {
    const parsed = normalizeTelegramChatId('-1003818257920', { forceDialogForPositive: true });
    expect(parsed.normalized).toBe('-1003818257920');
    expect(parsed.converted).toBe(false);
    expect(parsed.kind).toBe('dialog_channel_or_supergroup');
  });

  it('converts mtproto-like positive ids to bot api dialog ids', () => {
    const parsed = normalizeTelegramChatId('3818257920', { forceDialogForPositive: true });
    expect(parsed.normalized).toBe('-1003818257920');
    expect(parsed.converted).toBe(true);
    expect(parsed.kind).toBe('mtproto_peer_channel_or_supergroup');
  });

  it('keeps small positive ids as private/basic when not forced', () => {
    const parsed = normalizeTelegramChatId('219480233');
    expect(parsed.normalized).toBe('219480233');
    expect(parsed.kind).toBe('dialog_private_or_basic');
  });

  it('returns invalid for malformed values', () => {
    const parsed = normalizeTelegramChatId('abc-123');
    expect(parsed.normalized).toBeNull();
    expect(parsed.kind).toBe('invalid');
  });

  it('builds t.me/c url for channel/supergroup ids', () => {
    const url = buildTelegramChannelPostUrl({
      chatId: '3818257920',
      messageId: 42
    });
    expect(url).toBe('https://t.me/c/3818257920/42');
  });

  it('falls back to username url for non-channel ids', () => {
    const url = buildTelegramChannelPostUrl({
      chatId: '219480233',
      messageId: 7,
      username: '@Cartie_Client_Bot'
    });
    expect(url).toBe('https://t.me/Cartie_Client_Bot/7');
  });

  it('extracts internal channel id only for -100 dialogs', () => {
    expect(toTelegramChannelInternalId('-1003662808163')).toBe('3662808163');
    expect(toTelegramChannelInternalId('219480233')).toBeNull();
  });

  it('detects channel/supergroup dialog ids', () => {
    expect(isTelegramChannelOrSupergroupDialogId('-1003702407477')).toBe(true);
    expect(isTelegramChannelOrSupergroupDialogId('-12345')).toBe(false);
  });
});
