import { describe, expect, it } from 'vitest';
import { renderCarCardV2 } from './carCardRenderer.v2.js';
import { DEFAULT_V2_CARD_SETTINGS } from './cardSettings.resolver.js';

describe('carCardRenderer.v2', () => {
  it('renders strict public template without contacts by default', () => {
    const text = renderCarCardV2({
      title: 'BMW X5',
      year: 2022,
      mileage: 78000,
      price: 47500,
      status: 'IN_TRANSIT',
      specs: {
        engine: '2.0',
        fuel: 'бензин',
        drive: 'Повний привід',
        safety: 'ABS, ESP',
        damage: 'без значних пошкоджень'
      }
    }, {
      ...DEFAULT_V2_CARD_SETTINGS,
      city: 'Львові',
      manager1Phone: '+380111111111',
      manager1Name: 'Іван',
      manager2Phone: '+380222222222',
      manager2Name: 'Олег'
    });

    expect(text).toContain('⏳#вдорозі');
    expect(text).toContain('💵 Ціна за розмитнене авто у Львові: 47500$');
    expect(text).not.toContain('+380111111111 - Іван');
    expect(text).toContain('🚗Авто в наявності');
  });

  it('includes contacts only when includeContacts is enabled', () => {
    const text = renderCarCardV2({
      title: 'BMW X5',
      year: 2022,
      mileage: 78000,
      price: 47500,
      status: 'AVAILABLE',
      specs: {}
    }, {
      ...DEFAULT_V2_CARD_SETTINGS,
      includeContacts: true as any,
      manager1Phone: '+380111111111',
      manager1Name: 'Іван',
      manager2Phone: '+380222222222',
      manager2Name: 'Олег'
    } as any);

    expect(text).toContain('☎️ Зв’язатись з нами:');
    expect(text).toContain('+380111111111 - Іван');
  });
});
