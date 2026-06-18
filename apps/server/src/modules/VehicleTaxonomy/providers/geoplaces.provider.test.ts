import { describe, expect, it } from 'vitest';
import { mapGeoNamesTsv, mapKatottgCsv } from './geoplaces.provider.js';

describe('geoplaces taxonomy provider mapping', () => {
  it('maps KATOTTG CSV settlements into city records', () => {
    const csv = [
      'category,name,code,region',
      'M,Львів,UA46060250010023054,Львівська область',
      'O,Львівська область,UA46000000000026241,'
    ].join('\n');

    const places = mapKatottgCsv(csv);

    expect(places).toEqual([
      expect.objectContaining({
        countryCode: 'UA',
        type: 'city',
        slug: 'львів',
        label: 'Львів',
        region: 'Львівська область',
        externalIds: { katottg: 'UA46060250010023054' }
      })
    ]);
  });

  it('maps GeoNames TSV populated places into global fallback records', () => {
    const tsv = '703448\tKyiv\tKyiv\tKyiv\t50.4333\t30.5167\tP\tPPLC\tUA';

    const places = mapGeoNamesTsv(tsv);

    expect(places[0]).toMatchObject({
      countryCode: 'UA',
      type: 'city',
      slug: 'kyiv',
      label: 'Kyiv',
      latitude: 50.4333,
      longitude: 30.5167,
      externalIds: { geonames: 703448 }
    });
  });
});
