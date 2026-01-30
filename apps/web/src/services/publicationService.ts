import { ApiClient } from './apiClient';

export interface ContentTemplate {
    id: string;
    name: string;
    body: string;
    language?: string | null;
    status?: string;
    variables?: Record<string, any> | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface PublicationResult {
    id: string;
    status: string;
    messageId?: number | null;
    error?: string | null;
    createdAt?: string;
}

export interface PublicationJob {
    id: string;
    companyId?: string | null;
    templateId?: string | null;
    draftId?: number | null;
    botId?: string | null;
    title?: string | null;
    text: string;
    mediaUrl?: string | null;
    destination: string;
    status: string;
    scheduledAt?: string | null;
    postedAt?: string | null;
    attempts?: number;
    lastError?: string | null;
    metadata?: Record<string, any> | null;
    template?: ContentTemplate | null;
    results?: PublicationResult[];
}

export const PublicationService = {
    async listTemplates(): Promise<ContentTemplate[]> {
        const res = await ApiClient.get<ContentTemplate[]>('content/templates');
        if (!res.ok) throw new Error(res.message);
        return res.data || [];
    },

    async createTemplate(payload: Partial<ContentTemplate>): Promise<ContentTemplate> {
        const res = await ApiClient.post<ContentTemplate>('content/templates', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as ContentTemplate;
    },

    async updateTemplate(id: string, payload: Partial<ContentTemplate>): Promise<ContentTemplate> {
        const res = await ApiClient.put<ContentTemplate>(`content/templates/${id}`, payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as ContentTemplate;
    },

    async deleteTemplate(id: string): Promise<void> {
        const res = await ApiClient.delete(`content/templates/${id}`);
        if (!res.ok) throw new Error(res.message);
    },

    async previewTemplate(payload: { templateId?: string; template?: string; carId?: string; variables?: Record<string, any>; lang?: string }) {
        const res = await ApiClient.post<{ text: string; variables: Record<string, any> }>('content/templates/preview', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as { text: string; variables: Record<string, any> };
    },

    async listJobs(params?: { status?: string; limit?: number }): Promise<PublicationJob[]> {
        const query = new URLSearchParams();
        if (params?.status) query.append('status', params.status);
        if (params?.limit) query.append('limit', String(params.limit));
        const res = await ApiClient.get<PublicationJob[]>(`content/publication-jobs?${query.toString()}`);
        if (!res.ok) throw new Error(res.message);
        return res.data || [];
    },

    async createJob(payload: any): Promise<PublicationJob> {
        const res = await ApiClient.post<PublicationJob>('content/publication-jobs', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data as PublicationJob;
    },

    async retryJob(id: string): Promise<PublicationJob> {
        const res = await ApiClient.post<PublicationJob>(`content/publication-jobs/${id}/retry`, {});
        if (!res.ok) throw new Error(res.message);
        return res.data as PublicationJob;
    },

    async deleteJob(id: string): Promise<void> {
        const res = await ApiClient.delete(`content/publication-jobs/${id}`);
        if (!res.ok) throw new Error(res.message);
    },

    async listJobResults(id: string): Promise<PublicationResult[]> {
        const res = await ApiClient.get<PublicationResult[]>(`content/publication-jobs/${id}/results`);
        if (!res.ok) throw new Error(res.message);
        return res.data || [];
    }
};
