import { describe, expect, it } from 'vitest';
import {
  canUseCustomSearchValue,
  excludeSelectedSearchableOptions,
  optionMatchesQuery,
  resolveSearchableOptions,
  searchableOptionDomId
} from '../../../web/src/pages/public/miniapp/components/searchableOptions.ts';

const options = [
  { id: 'land-cruiser', label: 'Land Cruiser' },
  { id: 'e-tron-gt', label: 'e-tron GT', aliases: ['Audi e tron'], externalIds: { autoria: 8821 } },
  { id: 'kyiv', label: 'Київ' },
  { id: 'bmw', label: 'BMW', aliases: ['Bayerische Motoren Werke'] }
];

describe('MiniApp combobox search', () => {
  it('matches case-insensitive labels, aliases, and compact punctuation-free queries', () => {
    expect(optionMatchesQuery(options[0], 'landcruiser')).toBe(true);
    expect(optionMatchesQuery(options[1], 'etron')).toBe(true);
    expect(optionMatchesQuery(options[3], 'motoren')).toBe(true);
  });

  it('matches canonical ids and provider external ids', () => {
    expect(optionMatchesQuery(options[1], 'e-tron-gt')).toBe(true);
    expect(optionMatchesQuery(options[1], '8821')).toBe(true);
  });

  it('matches Ukrainian city labels through Latin and common legacy spellings', () => {
    expect(optionMatchesQuery(options[2], 'kyiv')).toBe(true);
    expect(optionMatchesQuery(options[2], 'kiev')).toBe(true);
    expect(optionMatchesQuery(options[2], 'Киев')).toBe(true);
  });

  it('caps rendered options and reports hidden result count', () => {
    const manyOptions = Array.from({ length: 30 }, (_, index) => ({
      id: `item-${index}`,
      label: `Item ${index}`
    }));

    const result = resolveSearchableOptions(manyOptions, '');

    expect(result.matchingOptions).toHaveLength(30);
    expect(result.visibleOptions).toHaveLength(24);
    expect(result.hiddenOptionsCount).toBe(6);
  });

  it('ranks exact and label-prefix matches before loose alias matches', () => {
    const ranked = resolveSearchableOptions([
      { id: 'bmw-m3', label: 'M3', aliases: ['Model 3 competitor'] },
      { id: 'model-s', label: 'Model S' },
      { id: 'model-3', label: 'Model 3', aliases: ['Tesla three'], externalIds: { autoria: 777 } },
      { id: 'tesla-model-3-performance', label: 'Model 3 Performance' }
    ], 'model 3');

    expect(ranked.matchingOptions.map((option) => option.label)).toEqual([
      'Model 3',
      'Model 3 Performance',
      'M3'
    ]);
    expect(resolveSearchableOptions(ranked.matchingOptions, '777').visibleOptions[0].label).toBe('Model 3');
  });

  it('removes already selected values from multi-select suggestions', () => {
    const available = excludeSelectedSearchableOptions([
      { id: 'tesla', label: 'Tesla', aliases: ['Тесла'] },
      { id: 'model-3', label: 'Model 3' },
      { id: 'bmw', label: 'BMW' }
    ], ['tesla', 'Model 3']);

    expect(available.map((option) => option.label)).toEqual(['BMW']);
    expect(resolveSearchableOptions(available, 'tes').matchingOptions).toEqual([]);
  });

  it('deduplicates equivalent options before rendering suggestions', () => {
    const result = resolveSearchableOptions([
      { id: 'tesla', label: 'Tesla' },
      { id: 'tesla-autoria', label: 'TESLA', aliases: ['Тесла'] },
      { id: 'bmw', label: 'BMW' }
    ], 'tes');

    expect(result.matchingOptions.map((option) => option.label)).toEqual(['Tesla']);
    expect(result.visibleOptions.map((option) => option.label)).toEqual(['Tesla']);
  });

  it('builds safe DOM ids for aria-activedescendant', () => {
    expect(searchableOptionDomId('listbox:1', { id: 'AUTO.RIA 8821 / e-tron GT', label: 'e-tron GT' }))
      .toBe('listbox:1-autoria8821etrongt');
  });

  it('enables custom city fallback only when no dictionary option matches', () => {
    const miss = resolveSearchableOptions(options, 'Луцьк');
    const hit = resolveSearchableOptions(options, 'kyiv');

    expect(canUseCustomSearchValue({
      allowCustom: true,
      query: 'Луцьк',
      options,
      matchingOptions: miss.matchingOptions
    })).toBe(true);
    expect(canUseCustomSearchValue({
      allowCustom: true,
      query: 'kyiv',
      options,
      matchingOptions: hit.matchingOptions
    })).toBe(false);
    expect(canUseCustomSearchValue({
      allowCustom: false,
      query: 'Луцьк',
      options,
      matchingOptions: miss.matchingOptions
    })).toBe(false);
  });
});
