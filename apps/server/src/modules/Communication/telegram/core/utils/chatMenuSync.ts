export const extractChatMenuButtonUrl = (response: any): string => {
  const menuButton = response?.result?.menu_button || response?.result || {};
  const url = menuButton?.web_app?.url;
  return typeof url === 'string' ? url.trim() : '';
};

export const assertTelegramApiOk = (method: string, response: any) => {
  if (response?.ok) return response.result;
  const description = response?.description || 'unknown Telegram API error';
  throw new Error(`${method} failed: ${description}`);
};
