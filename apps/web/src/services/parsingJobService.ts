import { ApiClient } from './apiClient';
import { appendSuperadminCompanyParam, attachSuperadminCompany } from '../utils/superadminCompany';

export interface ParsingJob {
    id: string;
    url: string;
    status: string;
    result?: any;
    error?: string | null;
    attempts?: number;
    createdAt?: string;
    updatedAt?: string;
}

export const ParsingJobService = {
    async enqueue(url: string): Promise<ParsingJob> {
        const res = await ApiClient.post<ParsingJob>('search/parse', attachSuperadminCompany({ url } as any));
        if (!res.ok) throw new Error(res.message || 'Failed to enqueue parsing job');
        return res.data as ParsingJob;
    },

    async list(params?: { status?: string; limit?: number }): Promise<ParsingJob[]> {
        const query = new URLSearchParams();
        if (params?.status) query.append('status', params.status);
        if (params?.limit) query.append('limit', String(params.limit));
        const queryString = appendSuperadminCompanyParam(query).toString();
        const res = await ApiClient.get<ParsingJob[]>(`search/jobs${queryString ? `?${queryString}` : ''}`);
        if (!res.ok) throw new Error(res.message || 'Failed to load parsing jobs');
        return res.data || [];
    }
};
