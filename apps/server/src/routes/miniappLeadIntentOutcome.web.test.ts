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

  it('closes the MiniApp after a normal contact handoff', () => {
    expect(resolveLeadIntentOutcome({
      ok: true,
      closeMiniApp: true,
      contactRequested: true
    })).toMatchObject({
      shouldCloseMiniApp: true
    });
  });
});
