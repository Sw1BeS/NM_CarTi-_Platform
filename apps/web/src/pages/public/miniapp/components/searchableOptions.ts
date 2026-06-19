export type SearchableSelectOption = {
  id: string;
  label: string;
  aliases?: string[];
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

export const optionMatchesQuery = (option: Pick<SearchableSelectOption, 'label' | 'aliases'>, query: string) => {
  const queryKeys = searchKeysForValue(query);
  if (!queryKeys.length) return true;

  const optionKeys = [option.label, ...(option.aliases || [])].flatMap(searchKeysForValue);
  return queryKeys.some((queryKey) =>
    optionKeys.some((optionKey) => optionKey.includes(queryKey))
  );
};

export const resolveSearchableOptions = <T extends Pick<SearchableSelectOption, 'label' | 'aliases'>>(
  options: readonly T[],
  query: string,
  limit = RESULT_LIMIT
) => {
  const matchingOptions = options.filter((option) => optionMatchesQuery(option, query));
  const visibleOptions = matchingOptions.slice(0, limit);
  return {
    matchingOptions,
    visibleOptions,
    hiddenOptionsCount: Math.max(0, matchingOptions.length - visibleOptions.length)
  };
};

export const canUseCustomSearchValue = (input: {
  allowCustom?: boolean;
  query: string;
  matchingOptions: readonly unknown[];
  options?: readonly unknown[];
}) => Boolean(input.allowCustom && input.query.trim() && input.matchingOptions.length === 0);
