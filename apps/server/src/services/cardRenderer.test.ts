import { describe, expect, it } from 'vitest';
import {
  renderB2bChannelPost,
  renderChannelCarPost,
  renderRequestCard,
  renderVariantCard
} from './cardRenderer.js';

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

  it('sanitizes b2b channel card fields to avoid contact leaks', () => {
    const { text } = renderB2bChannelPost({
      id: '1',
      publicId: 'CD-123',
      title: 'BMW X5 +380671111111',
      description: 'Терміново, пишіть @dealer_one або t.me/dealer_one',
      payload: {
        request: {
          companyName: 'Dealer +380501112233',
          fuel: 'diesel @fuel',
          mileageText: 'до 120000 км',
          comment: 'viber +380931234567'
        }
      }
    });

    expect(text).toContain('Запит #CD-123');
    expect(text).not.toContain('+380');
    expect(text).not.toContain('@dealer_one');
    expect(text).not.toContain('t.me/dealer_one');
  });

  it('uses a private bot deep link for the B2B "Є авто" channel action', () => {
    const { replyMarkup } = renderB2bChannelPost({
      id: '1',
      publicId: 'CD-123',
      title: 'BMW X5'
    }, {
      responseUrl: 'https://t.me/CarDealer_Lviv_Bot?start=b2bv_CD-123'
    });

    expect(replyMarkup?.inline_keyboard?.[0]?.[0]).toEqual({
      text: 'Є авто',
      url: 'https://t.me/CarDealer_Lviv_Bot?start=b2bv_CD-123'
    });
    expect(replyMarkup?.inline_keyboard?.[0]?.[1]).toEqual({
      text: 'Відкрити в боті',
      url: 'https://t.me/CarDealer_Lviv_Bot?start=b2bv_CD-123'
    });
  });

  it('sanitizes channel car post damage/description fields', () => {
    const text = renderChannelCarPost({
      title: 'Audi A6',
      year: 2020,
      status: 'AVAILABLE',
      mileage: 100000,
      price: 32000,
      description: 'Контакт +380671111111, telegram @audiseller',
      specs: {
        damage: 't.me/audi_seller',
        fuel: 'дизель',
        transmission: 'автомат',
        drive: 'повний'
      }
    });

    expect(text).toContain('Audi A6 2020');
    expect(text).not.toContain('+380');
    expect(text).not.toContain('@audiseller');
    expect(text).not.toContain('t.me/audi_seller');
  });
});
