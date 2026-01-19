import { ApiClient } from './apiClient';

export interface DraftRecord {
    id: number;
    source?: string;
    title: string;
    price?: string | null;
    url?: string | null;
    description?: string | null;
    status: 'DRAFT' | 'SCHEDULED' | 'POSTED' | 'FAILED';
    scheduledAt?: string | null;
    postedAt?: string | null;
    destination?: string | null;
    botId?: string | null;
    metadata?: Record<string, any> | null;
    createdAt?: string;
    updatedAt?: string;
}

export const DraftsService = {
    async getDrafts(): Promise<DraftRecord[]> {
        const res = await ApiClient.get<DraftRecord[]>('drafts');
        if (!res.ok) throw new Error(res.message);
        return res.data || [];
    },

    async createDraft(payload: Partial<DraftRecord>): Promise<DraftRecord> {
        const res = await ApiClient.post<DraftRecord>('drafts', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as DraftRecord;
    },

    async updateDraft(id: number, payload: Partial<DraftRecord>): Promise<DraftRecord> {
        const res = await ApiClient.put<DraftRecord>(`drafts/${id}`, payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as DraftRecord;
    },

    async deleteDraft(id: number): Promise<void> {
        const res = await ApiClient.delete(`drafts/${id}`);
        if (!res.ok) throw new Error(res.message);
    }
};
