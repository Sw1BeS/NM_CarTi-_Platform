import { describe, expect, it } from 'vitest';
import { mapNhtsaMakes, mapNhtsaModels } from './nhtsa.provider.js';

describe('NHTSA taxonomy provider mapping', () => {
  it('maps vPIC makes and models into fallback source records', () => {
    const makes = mapNhtsaMakes([{ MakeId: 474, MakeName: 'HONDA' }]);
    const models = mapNhtsaModels([{ Make_ID: 474, Make_Name: 'Honda', Model_ID: 1865, Model_Name: 'CR-V' }]);

    expect(makes[0]).toMatchObject({ slug: 'honda', label: 'Honda', externalIds: { nhtsa: 474 } });
    expect(models[0]).toMatchObject({ makeExternalId: 474, slug: 'cr-v', label: 'CR-V', externalIds: { nhtsa: 1865 } });
  });
});
