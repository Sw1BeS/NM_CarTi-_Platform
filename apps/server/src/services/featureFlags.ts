export const isEnvFlagEnabled = (key: string, defaultValue = false) => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const normalized = String(raw).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

export const getEnvInt = (key: string, defaultValue: number) => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : defaultValue;
};
