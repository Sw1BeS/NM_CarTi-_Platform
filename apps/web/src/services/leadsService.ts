
import { ApiClient } from './apiClient';
import { Lead } from '../types';

export interface LeadsFilter {
    page?: number;
    limit?: number;
    status?: string | 'ALL';
    source?: string;
    search?: string;
}

export interface LeadsResponse {
    items: Lead[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export const LeadsService = {
    async getLeads(filter: LeadsFilter = {}): Promise<LeadsResponse> {
        const query = new URLSearchParams();
        if (filter.page) query.append('page', String(filter.page));
        if (filter.limit) query.append('limit', String(filter.limit));
        if (filter.status && filter.status !== 'ALL') query.append('status', filter.status);
        if (filter.source) query.append('source', filter.source);
        if (filter.search) query.append('search', filter.search);

        const res = await ApiClient.get<LeadsResponse | Lead[]>(`leads?${query.toString()}`);

        // Backward compatibility: If API returns array (legacy or unit test mock), wrap it
        if (Array.isArray(res.data)) {
            return {
                items: res.data,
                total: res.data.length,
                page: 1,
                limit: res.data.length,
                totalPages: 1
            };
        }

        return res.data || { items: [], total: 0, page: 1, limit: 50, totalPages: 0 };
    },

    async createLead(lead: Partial<Lead>): Promise<Lead> {
        const res = await ApiClient.post<Lead>('leads', lead);
        if (!res.ok) throw new Error(res.message);
        return res.data as Lead;
    },

    async updateLead(id: string | number, lead: Partial<Lead>): Promise<Lead> {
        const res = await ApiClient.put<Lead>(`leads/${id}`, lead);
        if (!res.ok) throw new Error(res.message);
        return res.data as Lead;
    },

    async deleteLead(id: string | number): Promise<void> {
        const res = await ApiClient.delete(`leads/${id}`);
        if (!res.ok) throw new Error(res.message);
    }
};
