import { ApiClient } from './apiClient';

export const parseListingFromUrl = async (url: string) => {
  const res = await ApiClient.get<any>(`qa/parse?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(res.message || 'Parse failed');
  return res.data;
};
