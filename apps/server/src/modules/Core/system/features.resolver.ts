export const DEFAULT_FEATURES: Record<string, boolean> = {
  MODULE_SCENARIOS: true,
  MODULE_SEARCH: true,
  MODULE_CAMPAIGNS: true,
  MODULE_COMPANIES: false,
  MODULE_CONTENT: true,
  MODULE_INTEGRATIONS: false
};

const toBool = (value: any, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
};

export const resolveFeatures = (rawFeatures: any): Record<string, boolean> => {
  const input = rawFeatures && typeof rawFeatures === 'object' ? rawFeatures : {};
  const resolved: Record<string, boolean> = {};

  for (const [key, fallbackValue] of Object.entries(DEFAULT_FEATURES)) {
    resolved[key] = toBool((input as any)[key], fallbackValue);
  }

  // Preserve forward-compatible custom flags.
  for (const [key, value] of Object.entries(input)) {
    if (key in resolved) continue;
    resolved[key] = toBool(value, false);
  }

  return resolved;
};
