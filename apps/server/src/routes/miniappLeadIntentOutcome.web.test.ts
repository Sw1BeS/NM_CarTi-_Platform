import { describe, expect, it } from 'vitest';
import { resolveLeadIntentOutcome } from '../../../web/src/pages/public/miniapp/leadIntentOutcome.ts';

describe('MiniApp lead intent client outcome', () => {
  it('keeps the MiniApp open when backend saved the intent but could not send contact keyboard', () => {
    const outcome = resolveLeadIntentOutcome({
      ok: true,
      closeMiniApp: false,
      contactRequested: false,
      contactRequestFailed: true,
      openBotUrl: 'https://t.me/Cartie_Client_Bot'
    });

    expect(outcome).toEqual({
      shouldCloseMiniApp: false,
      message: 'Запит збережено. Відкрийте чат з ботом, щоб передати контакт через Telegram.',
      openBotUrl: 'https://t.me/Cartie_Client_Bot'
    });
  });

  it('shows a bot-chat handoff after a normal contact request', () => {
    const outcome = resolveLeadIntentOutcome({
      ok: true,
      closeMiniApp: true,
      contactRequested: true,
      contactActionRequired: true,
      openBotUrl: 'https://t.me/Cartie_Client_Bot'
    });

    expect(outcome).toMatchObject({
      shouldCloseMiniApp: true,
      contactActionRequired: true,
      openBotUrl: 'https://t.me/Cartie_Client_Bot'
    });
    expect(outcome.message).toContain('чат з ботом');
  });
});
