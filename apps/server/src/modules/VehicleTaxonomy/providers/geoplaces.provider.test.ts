import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchKatottgPlaces, mapGeoNamesTsv, mapKatottgCsv } from './geoplaces.provider.js';

describe('geoplaces taxonomy provider mapping', () => {
  it('maps KATOTTG CSV cities into city records by default', () => {
    const csv = [
      'category,name,code,region',
      'M,Львів,UA46060250010023054,Львівська область',
      'P,Брюховичі,UA46060250030058128,Львівська область',
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

  it('can include KATOTTG settlements for richer Ukraine city search', () => {
    const csv = [
      'category,name,code,region',
      'M,Львів,UA46060250010023054,Львівська область',
      'P,Брюховичі,UA46060250030058128,Львівська область'
    ].join('\n');

    const places = mapKatottgCsv(csv, { includeSettlements: true });

    expect(places).toEqual([
      expect.objectContaining({ type: 'city', label: 'Львів' }),
      expect.objectContaining({
        type: 'settlement',
        slug: 'брюховичі',
        label: 'Брюховичі',
        externalIds: { katottg: 'UA46060250030058128' }
      })
    ]);
  });

  it('can load KATOTTG CSV from a local operator-provided file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'katottg-'));
    const file = join(dir, 'katottg.csv');
    await writeFile(file, 'category,name,code,region\nP,Брюховичі,UA46060250030058128,Львівська область\n');

    try {
      const places = await fetchKatottgPlaces({ url: file, includeSettlements: true });

      expect(places).toEqual([
        expect.objectContaining({
          type: 'settlement',
          label: 'Брюховичі',
          externalIds: { katottg: 'UA46060250030058128' }
        })
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
