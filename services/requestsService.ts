
import { ApiClient } from './apiClient';
import { B2BRequest, Variant } from '../types';

export interface RequestsFilter {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
}

export interface RequestsResponse {
    items: B2BRequest[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export const RequestsService = {
    async getRequests(filter: RequestsFilter = {}): Promise<RequestsResponse> {
        const query = new URLSearchParams();
        if (filter.page) query.append('page', String(filter.page));
        if (filter.limit) query.append('limit', String(filter.limit));
        if (filter.status && filter.status !== 'ALL') query.append('status', filter.status);
        if (filter.search) query.append('search', filter.search);

        const res = await ApiClient.get<RequestsResponse | B2BRequest[]>(`requests?${query.toString()}`);

        if (!res.ok) {
            console.error(res.message);
            return { items: [], total: 0, page: 1, limit: 50, totalPages: 0 };
        }

        // Compat check
        if (Array.isArray(res.data)) {
            return { items: res.data, total: res.data.length, page: 1, limit: 50, totalPages: 1 };
        }

        return res.data;
    },

    async createRequest(req: Partial<B2BRequest>): Promise<B2BRequest> {
        const res = await ApiClient.post<B2BRequest>('requests', req);
        if (!res.ok) throw new Error(res.message);
        return res.data as B2BRequest;
    },

    async updateRequest(id: string, req: Partial<B2BRequest>): Promise<B2BRequest> {
        const res = await ApiClient.put<B2BRequest>(`requests/${id}`, req);
        if (!res.ok) throw new Error(res.message);
        return res.data as B2BRequest;
    },

    async deleteRequest(id: string): Promise<void> {
        const res = await ApiClient.delete(`requests/${id}`);
        if (!res.ok) throw new Error(res.message);
    },

    async addVariant(requestId: string, variant: Partial<Variant>): Promise<Variant> {
        const res = await ApiClient.post<Variant>(`requests/${requestId}/variants`, variant);
        if (!res.ok) throw new Error(res.message);
        return res.data as Variant;
    }
};
