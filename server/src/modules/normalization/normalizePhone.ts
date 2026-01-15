const stripToDigits = (value: string) => value.replace(/[^\d+]/g, '');

export const normalizePhone = (input?: string | null) => {
  if (!input) return undefined;
  const raw = stripToDigits(String(input));
  if (!raw) return undefined;

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;

  if (hasPlus) return `+${digits}`;

  if (digits.startsWith('380') && digits.length >= 12) {
    return `+${digits}`;
  }

  if (digits.length === 10 && digits.startsWith('0')) {
    return `+38${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }

  if (digits.length >= 10) return `+${digits}`;

  return undefined;
};
