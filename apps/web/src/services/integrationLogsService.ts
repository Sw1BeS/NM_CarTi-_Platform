import { ApiClient } from './apiClient';

export interface IntegrationEventLog {
    id: string;
    companyId?: string | null;
    integration: string;
    entityId?: string | null;
    action: string;
    status: string;
    message?: string | null;
    payloadMeta?: Record<string, any> | null;
    createdAt: string;
}

export const IntegrationLogsService = {
    async list(params?: { integration?: string; entityId?: string; status?: string; action?: string; from?: string; to?: string; limit?: number }): Promise<IntegrationEventLog[]> {
        const query = new URLSearchParams();
        if (params?.integration) query.append('integration', params.integration);
        if (params?.entityId) query.append('entityId', params.entityId);
        if (params?.status) query.append('status', params.status);
        if (params?.action) query.append('action', params.action);
        if (params?.from) query.append('from', params.from);
        if (params?.to) query.append('to', params.to);
        if (params?.limit) query.append('limit', String(params.limit));

        const res = await ApiClient.get<IntegrationEventLog[]>(`integrations/logs?${query.toString()}`);
        if (!res.ok) throw new Error(res.message);
        return res.data || [];
    }
};
