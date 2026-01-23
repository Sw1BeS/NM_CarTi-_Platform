import { ApiClient } from './apiClient';

export const parseListingFromUrl = async (url: string) => {
  const res = await ApiClient.get<any>(`qa/parse?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(res.message || 'Parse failed');
  return res.data;
};

export const saveParserProfile = async (domain: string, selectors: any) => {
  const res = await ApiClient.post<any>('qa/parse/profile', { domain, selectors });
  if (!res.ok) throw new Error(res.message || 'Save failed');
  return res.data;
};
