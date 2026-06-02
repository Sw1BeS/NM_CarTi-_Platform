const SENSITIVE_EVENT_SOURCE_PARAMS = [
  'tgWebAppData',
  'tgWebAppThemeParams',
  'tgWebAppVersion',
  'tgWebAppPlatform',
  'hash',
  'signature',
  'auth_date',
  'query_id',
  'user',
  'initData',
  'init_data',
  'telegramInitData',
  'telegram_init_data',
  'kbAuth',
  'keyboardAuth'
];

const toText = (value: unknown) => String(value || '').trim();

export const sanitizeMetaEventSourceUrl = (value?: string | null) => {
  const text = toText(value);
  if (!text) return undefined;
  const withoutHash = text.split('#')[0].trim();
  if (!withoutHash) return undefined;
  try {
    const url = new URL(withoutHash);
    SENSITIVE_EVENT_SOURCE_PARAMS.forEach((param) => url.searchParams.delete(param));
    url.hash = '';
    return url.toString().slice(0, 2048);
  } catch {
    return withoutHash.slice(0, 2048);
  }
};
