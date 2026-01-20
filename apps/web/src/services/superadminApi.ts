import { ApiClient } from './apiClient';
import { User } from '../types';

export interface CompanySummary {
    id: string;
    name: string;
    slug: string;
    plan: string;
    isActive: boolean;
    _count?: {
        users: number;
        bots: number;
        scenarios: number;
        integrations: number;
    };
}

export const SuperadminApi = {
    async listCompanies(): Promise<CompanySummary[]> {
        const res = await ApiClient.get<CompanySummary[]>('/superadmin/companies');
        return res.ok ? (res.data || []) : [];
    },

    async listUsers(params: { companyId?: string; role?: string; isActive?: boolean } = {}): Promise<User[]> {
        const query = new URLSearchParams();
        if (params.companyId) query.set('companyId', params.companyId);
        if (params.role) query.set('role', params.role);
        if (params.isActive !== undefined) query.set('isActive', String(params.isActive));
        const res = await ApiClient.get<User[]>(`/superadmin/users${query.toString() ? `?${query.toString()}` : ''}`);
        return res.ok ? (res.data || []) : [];
    },

    async createUser(payload: { email: string; password: string; role: string; companyId: string; name?: string; isActive?: boolean }) {
        const res = await ApiClient.post<User>('/superadmin/users', payload);
        if (!res.ok) throw new Error(res.message || 'Create user failed');
        return res.data as any;
    },

    async updateUser(id: string, payload: Partial<{ email: string; password: string; role: string; companyId: string; name: string; isActive: boolean }>) {
        const res = await ApiClient.put<User>(`/superadmin/users/${id}`, payload);
        if (!res.ok) throw new Error(res.message || 'Update user failed');
        return res.data as any;
    },

    async impersonate(payload: { userId?: string; email?: string; companyId?: string; expiresIn?: string }) {
        const res = await ApiClient.post<{ token: string; user: User }>('/superadmin/impersonate', payload);
        if (!res.ok) throw new Error(res.message || 'Impersonation failed');
        return res.data!;
    },

    async createCompany(payload: { name: string; slug: string; plan: string; ownerEmail: string; ownerName?: string }) {
        const res = await ApiClient.post<CompanySummary>('/superadmin/companies', payload);
        if (!res.ok) throw new Error(res.message || 'Create company failed');
        return res.data;
    },

    async toggleCompanyStatus(id: string, isActive: boolean) {
        const res = await ApiClient.put<CompanySummary>(`/superadmin/companies/${id}/status`, { isActive });
        if (!res.ok) throw new Error(res.message || 'Update status failed');
        return res.data;
    },

    async updateCompanyPlan(id: string, plan: string) {
        const res = await ApiClient.put<CompanySummary>(`/superadmin/companies/${id}/plan`, { plan });
        if (!res.ok) throw new Error(res.message || 'Update plan failed');
        return res.data;
    }
};
