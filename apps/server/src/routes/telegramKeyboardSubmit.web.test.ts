import { describe, expect, it, vi } from 'vitest';
import {
  buildTelegramKeyboardLeadSubmitPayload,
  canUseTelegramKeyboardSubmit,
  sendTelegramKeyboardPayload
} from '../../../web/src/pages/public/miniapp/telegramKeyboardSubmit.ts';

describe('Telegram keyboard MiniApp submit helper', () => {
  it('builds compact interest payloads for selected cars', () => {
    const payload = buildTelegramKeyboardLeadSubmitPayload({
      kind: 'PRICE_TERMS',
      carListingIds: [' car_1 ', '', 'car_2'],
      criteria: {
        title: ' Mercedes-Benz S 500 ',
        brand: '',
        selectedCars: ['Mercedes-Benz S 500', '']
      },
      tracking: {
        submitId: 'submit_1',
        requestType: 'BUY',
        startParam: 'view_stock'
      }
    });

    expect(payload).toMatchObject({
      v: 1,
      type: 'interest_click',
      carId: 'car_1',
      carIds: ['car_1', 'car_2'],
      fields: {
        title: 'Mercedes-Benz S 500',
        selectedCars: ['Mercedes-Benz S 500']
      },
      meta: {
        submitId: 'submit_1',
        requestType: 'BUY',
        startParam: 'view_stock',
        source: 'miniapp_keyboard_bridge'
      }
    });
    expect((payload.fields as Record<string, unknown>).brand).toBeUndefined();
  });

  it('builds lead_submit payloads for free-form pick requests', () => {
    const payload = buildTelegramKeyboardLeadSubmitPayload({
      kind: 'PICK',
      criteria: {
        brand: 'BMW',
        model: 'X5',
        budgetMax: 55000
      },
      comment: 'Без дизеля'
    });

    expect(payload).toMatchObject({
      v: 1,
      type: 'lead_submit',
      fields: {
        brand: 'BMW',
        model: 'X5',
        budgetMax: 55000,
        comment: 'Без дизеля'
      }
    });
  });

  it('sends payloads through Telegram sendData within the Bot API limit', () => {
    const sendData = vi.fn();
    const result = sendTelegramKeyboardPayload({ sendData }, { v: 1, type: 'lead_submit' });

    expect(canUseTelegramKeyboardSubmit({ sendData })).toBe(true);
    expect(result).toEqual({ status: 'sent', ok: true, bytes: expect.any(Number) });
    expect(sendData).toHaveBeenCalledWith(JSON.stringify({ v: 1, type: 'lead_submit' }));
  });

  it('rejects oversized payloads before sendData closes the MiniApp', () => {
    const sendData = vi.fn();
    const result = sendTelegramKeyboardPayload({ sendData }, {
      v: 1,
      type: 'lead_submit',
      fields: { comment: 'x'.repeat(5000) }
    });

    expect(result).toMatchObject({ status: 'error', ok: false, reason: 'payload_too_large' });
    expect(sendData).not.toHaveBeenCalled();
  });
});
