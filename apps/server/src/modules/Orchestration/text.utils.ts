export const normalizeHumanText = (value?: string | null) => {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const tokenizeHumanText = (value?: string | null) => {
  return normalizeHumanText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
};
