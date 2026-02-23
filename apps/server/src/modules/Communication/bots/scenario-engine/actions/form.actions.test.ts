import { describe, expect, it, vi, beforeEach } from 'vitest';

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn()
}));

vi.mock('../adapters/telegram.adapter.js', () => ({
  sendMessage: sendMessageMock
}));

import {
  FORM_SKIP_TEXT,
  buildEditLabels,
  buildFieldKeyboard,
  buildSummaryText,
  handleFormMessageInput,
  startFormFlow
} from './form.actions.js';

describe('form.actions helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds summary with all fields and values', () => {
    const form = {
      title: 'Пошук авто',
      fields: [
        { key: 'brand', label: 'Марка' },
        { key: 'model', label: 'Модель' },
        { key: 'budget', label: 'Бюджет' }
      ],
      values: {
        brand: 'BMW',
        model: 'X5',
        budget: '50000'
      }
    } as any;

    const summary = buildSummaryText(form);
    expect(summary).toContain('• Марка: BMW');
    expect(summary).toContain('• Модель: X5');
    expect(summary).toContain('• Бюджет: 50000');
  });

  it('builds edit labels for each summary row', () => {
    const form = {
      fields: [
        { key: 'brand', label: 'Марка' },
        { key: 'model', label: 'Модель' },
        { key: 'year', label: 'Рік від' }
      ]
    } as any;

    expect(buildEditLabels(form)).toEqual([
      'Змінити Марка',
      'Змінити Модель',
      'Змінити Рік від'
    ]);
  });

  it('includes "Пропустити" for optional fields and processes skip token', async () => {
    const optionalKeyboard = buildFieldKeyboard({
      key: 'budget',
      label: 'Бюджет',
      prompt: 'Вкажіть бюджет',
      optional: true
    });

    expect(optionalKeyboard).toBeTruthy();
    expect(JSON.stringify(optionalKeyboard)).toContain(FORM_SKIP_TEXT);

    const vars: Record<string, any> = {};
    const bot = {
      id: 'bot_1',
      token: 'token',
      companyId: 'cmp_1'
    } as any;

    await startFormFlow({ bot, chatId: '1001', vars }, {
      formId: 'lead_buy_test',
      namespace: 'LEADBUY',
      title: 'Тестова форма',
      fields: [
        { key: 'budget', label: 'Бюджет', prompt: 'Вкажіть бюджет', optional: true },
        { key: 'contact', label: 'Контакт', prompt: 'Надішліть контакт' }
      ]
    });

    sendMessageMock.mockClear();

    const handled = await handleFormMessageInput({
      bot,
      chatId: '1001',
      vars,
      update: { message: { text: 'Пропустити' } }
    });

    expect(handled.handled).toBe(true);
    expect(vars.__form.values.budget).toBeNull();
    expect(vars.__form.index).toBe(1);
    expect(sendMessageMock).toHaveBeenCalledWith(bot, '1001', 'Надішліть контакт', undefined);
  });
});
