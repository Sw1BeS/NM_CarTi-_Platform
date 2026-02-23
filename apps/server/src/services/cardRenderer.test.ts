import { describe, expect, it } from 'vitest';
import { renderRequestCard, renderVariantCard } from './cardRenderer.js';

describe('cardRenderer redaction', () => {
  it('hides request contact fields when includeContact=false', () => {
    const text = renderRequestCard({
      title: 'BMW X5',
      payload: {
        companyName: 'Dealer One',
        contact: '+380671234567'
      }
    }, { includeContact: false });

    expect(text).toContain('BMW X5');
    expect(text).not.toContain('Dealer One');
    expect(text).not.toContain('+380671234567');
  });

  it('redacts sensitive data from request description when includeContact=false', () => {
    const text = renderRequestCard({
      title: 'Mercedes GLE',
      description: 'Коментар: терміново\nКонтакт: +380671111111\nTelegram: @dealer_one\nt.me/dealer_one',
      payload: {
        companyName: 'Dealer One'
      }
    }, { includeContact: false });

    expect(text).toContain('Mercedes GLE');
    expect(text).toContain('Коментар: терміново');
    expect(text).not.toContain('+380671111111');
    expect(text).not.toContain('@dealer_one');
    expect(text).not.toContain('t.me/dealer_one');
  });

  it('hides variant contact fields when includeContact=false', () => {
    const text = renderVariantCard({
      title: 'Audi Q7',
      companyName: 'Dealer Two',
      contact: '+380501234567'
    }, { includeContact: false });

    expect(text).toContain('AUDI Q7');
    expect(text).not.toContain('Dealer Two');
    expect(text).not.toContain('+380501234567');
  });

  it('redacts sensitive data from variant note when includeContact=false', () => {
    const text = renderVariantCard({
      title: 'Volvo XC90',
      specs: {
        note: 'Без ДТП. Телефон +380931234567, Telegram @volvo_seller'
      }
    }, { includeContact: false });

    expect(text).toContain('VOLVO XC90');
    expect(text).not.toContain('+380931234567');
    expect(text).not.toContain('@volvo_seller');
  });
});
