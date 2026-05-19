import { describe, expect, it } from 'vitest';
import { resolveRequestSuccessContent } from '../../../web/src/pages/public/miniapp/requestSuccessActions';

describe('MiniApp request success actions', () => {
    it('keeps lead users in a useful post-submit flow', () => {
        const content = resolveRequestSuccessContent('LEAD');

        expect(content.message).not.toMatch(/закрити/i);
        expect(content.actions.map(action => action.label)).toEqual([
            'Переглянути мої запити',
            'Повернутись до каталогу',
            'Написати менеджеру',
            'На головну'
        ]);
        expect(content.actions[0]).toMatchObject({ id: 'MY_REQUESTS', primary: true });
    });

    it('uses B2B-specific post-submit actions for partners', () => {
        const content = resolveRequestSuccessContent('B2B');

        expect(content.message).toMatch(/B2B/i);
        expect(content.actions.map(action => action.label)).toEqual([
            'Активність / статуси',
            'Запити на авто',
            'Підтримка',
            'На головну'
        ]);
        expect(content.actions[0]).toMatchObject({ id: 'B2B_ACTIVITY', primary: true });
    });
});
