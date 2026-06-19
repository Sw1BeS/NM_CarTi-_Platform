import { describe, expect, it } from 'vitest';
import {
  canUseCustomSearchValue,
  optionMatchesQuery,
  resolveSearchableOptions
} from '../../../web/src/pages/public/miniapp/components/searchableOptions.ts';

const options = [
  { id: 'land-cruiser', label: 'Land Cruiser' },
  { id: 'e-tron-gt', label: 'e-tron GT', aliases: ['Audi e tron'] },
  { id: 'kyiv', label: 'Київ' },
  { id: 'bmw', label: 'BMW', aliases: ['Bayerische Motoren Werke'] }
];

describe('MiniApp combobox search', () => {
  it('matches case-insensitive labels, aliases, and compact punctuation-free queries', () => {
    expect(optionMatchesQuery(options[0], 'landcruiser')).toBe(true);
    expect(optionMatchesQuery(options[1], 'etron')).toBe(true);
    expect(optionMatchesQuery(options[3], 'motoren')).toBe(true);
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
