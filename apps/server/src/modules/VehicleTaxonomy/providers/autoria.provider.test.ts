import { describe, expect, it } from 'vitest';
import { mapAutoriaMarks, mapAutoriaModels } from './autoria.provider.js';

describe('AUTO.RIA taxonomy provider mapping', () => {
  it('maps marks and models into canonical source records', () => {
    const marks = mapAutoriaMarks([{ value: 9, name: 'BMW' }]);
    const models = mapAutoriaModels(9, [{ value: 123, name: 'X5' }]);

    expect(marks[0]).toMatchObject({ slug: 'bmw', label: 'BMW', externalIds: { autoria: 9 } });
    expect(models[0]).toMatchObject({ makeExternalId: 9, slug: 'x5', label: 'X5', externalIds: { autoria: 123 } });
  });
});
