export type SearchableSelectOption = {
  id: string;
  label: string;
  aliases?: string[];
  externalIds?: Record<string, string | number>;
  disabled?: boolean;
};

const RESULT_LIMIT = 24;

const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ʼ’`´]/g, "'")
    .trim()
    .toLowerCase();

const compactText = (value: string) => value.replace(/[^\p{L}\p{N}]+/gu, '');

const transliterationMaps: Array<Record<string, string>> = [
  {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
    и: 'y', і: 'i', ї: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
    р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'shch', ю: 'iu', я: 'ia', ь: '', ы: 'y', э: 'e', ё: 'e', ъ: ''
  },
  {
    а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', є: 'e', ж: 'zh', з: 'z',
    и: 'i', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
    р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'sch', ю: 'yu', я: 'ya', ь: '', ы: 'y', э: 'e', ё: 'e', ъ: ''
  }
];

const transliterate = (value: string, map: Record<string, string>) =>
  [...value].map((char) => map[char] ?? char).join('');

const addLegacyPlaceVariants = (key: string) => {
  const variants = [key];
  if (key.includes('kyiv')) variants.push(key.replaceAll('kyiv', 'kiev'));
  if (key.includes('kiev')) variants.push(key.replaceAll('kiev', 'kyiv'));
  if (key.includes('kiiv')) {
    variants.push(key.replaceAll('kiiv', 'kyiv'));
    variants.push(key.replaceAll('kiiv', 'kiev'));
  }
  return variants;
};

export const searchKeysForValue = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  const keys = [
    normalized,
    compactText(normalized),
    ...transliterationMaps.flatMap((map) => {
      const transliterated = normalizeText(transliterate(normalized, map));
      return [transliterated, compactText(transliterated)];
    })
  ];

  return Array.from(new Set(keys.flatMap(addLegacyPlaceVariants).filter(Boolean)));
};

const optionSearchValues = (option: Pick<SearchableSelectOption, 'id' | 'label' | 'aliases' | 'externalIds'>) => [
  option.id,
  option.label,
  ...(option.aliases || []),
  ...Object.values(option.externalIds || {})
];

const directSearchValues = (option: Pick<SearchableSelectOption, 'id' | 'label'>) => [
  option.label,
  option.id
];

const indirectSearchValues = (option: Pick<SearchableSelectOption, 'aliases' | 'externalIds'>) => [
  ...(option.aliases || []),
  ...Object.values(option.externalIds || {})
];

export const searchableOptionDomId = (listboxId: string, option: Pick<SearchableSelectOption, 'id' | 'label'>) => {
  const key = compactText(normalizeText(option.id)) || compactText(normalizeText(option.label)) || 'option';
  return `${listboxId}-${key}`;
};

export const optionMatchesQuery = (option: Pick<SearchableSelectOption, 'id' | 'label' | 'aliases' | 'externalIds'>, query: string) => {
  const queryKeys = searchKeysForValue(query);
  if (!queryKeys.length) return true;

  const optionKeys = optionSearchValues(option).flatMap(searchKeysForValue);
  return queryKeys.some((queryKey) =>
    optionKeys.some((optionKey) => optionKey.includes(queryKey))
  );
};

const matchRankForKeys = (queryKeys: string[], optionKeys: string[], baseRank: number) => {
  let rank = Number.POSITIVE_INFINITY;
  for (const queryKey of queryKeys) {
    for (const optionKey of optionKeys) {
      if (optionKey === queryKey) rank = Math.min(rank, baseRank);
      else if (optionKey.startsWith(queryKey)) rank = Math.min(rank, baseRank + 1);
      else if (optionKey.includes(queryKey)) rank = Math.min(rank, baseRank + 3);
    }
  }
  return rank;
};

const optionMatchRank = (option: Pick<SearchableSelectOption, 'id' | 'label' | 'aliases' | 'externalIds'>, query: string) => {
  const queryKeys = searchKeysForValue(query);
  if (!queryKeys.length) return 0;
  const directRank = matchRankForKeys(queryKeys, directSearchValues(option).flatMap(searchKeysForValue), 0);
  const indirectRank = matchRankForKeys(queryKeys, indirectSearchValues(option).flatMap(searchKeysForValue), 2);
  return Math.min(directRank, indirectRank);
};

const optionDedupeKeys = (option: Pick<SearchableSelectOption, 'id' | 'label'>) => [
  compactText(normalizeText(option.id)),
  compactText(normalizeText(option.label))
].filter(Boolean);

export const resolveSearchableOptions = <T extends Pick<SearchableSelectOption, 'id' | 'label' | 'aliases' | 'externalIds'>>(
  options: readonly T[],
  query: string,
  limit = RESULT_LIMIT
) => {
  const hasQuery = Boolean(query.trim());
  const matchingOptions = options
    .map((option, index) => ({ option, index, rank: optionMatchRank(option, query) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => {
      if (!hasQuery) return a.index - b.index;
      if (a.rank !== b.rank) return a.rank - b.rank;
      const labelOrder = a.option.label.localeCompare(b.option.label);
      return labelOrder || a.index - b.index;
    })
    .map((entry) => entry.option);
  const seen = new Set<string>();
  const uniqueMatchingOptions = matchingOptions.filter((option) => {
    const keys = optionDedupeKeys(option);
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
  const visibleOptions = uniqueMatchingOptions.slice(0, limit);
  return {
    matchingOptions: uniqueMatchingOptions,
    visibleOptions,
    hiddenOptionsCount: Math.max(0, uniqueMatchingOptions.length - visibleOptions.length)
  };
};

export const excludeSelectedSearchableOptions = <T extends Pick<SearchableSelectOption, 'id' | 'label' | 'aliases'>>(
  options: readonly T[],
  values: readonly string[]
) => {
  const selectedKeys = new Set(values.flatMap(searchKeysForValue));
  if (!selectedKeys.size) return [...options];

  return options.filter((option) => {
    const optionKeys = [option.id, option.label, ...(option.aliases || [])].flatMap(searchKeysForValue);
    return !optionKeys.some((key) => selectedKeys.has(key));
  });
};

export const canUseCustomSearchValue = (input: {
  allowCustom?: boolean;
  query: string;
  matchingOptions: readonly unknown[];
  options?: readonly unknown[];
}) => Boolean(input.allowCustom && input.query.trim() && input.matchingOptions.length === 0);
