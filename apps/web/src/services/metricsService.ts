import { ApiClient } from './apiClient';
import { appendSuperadminCompanyParam } from '../utils/superadminCompany';

export type DashboardMetricsParams = {
    range?: string;
    from?: string;
    to?: string;
    botId?: string;
    companyId?: string;
    requestStatus?: string;
};

export type DashboardMetricsResponse = {
    range?: { from: string | null; to: string | null };
    stats: {
        requestsNew: number;
        requestsProgress: number;
        offersFresh: number;
        requestsWithOffers: number;
        inventoryValue: number;
        inventoryCount: number;
        inboxNew: number;
        campaignsActive: number;
        leadsToday: number;
        draftsScheduled: number;
        draftsPosted: number;
    };
    funnel: {
        incoming: number;
        leads: number;
        inProgress: number;
        won: number;
    };
    sources: Array<{ name: string; value: number }>;
    partnerActivity: Array<{ name: string; value: number }>;
    activity: Array<any>;
};

export type TelegramMetricsParams = {
    range?: string;
    from?: string;
    to?: string;
    botId?: string;
    companyId?: string;
};

export type TelegramMetricsResponse = {
    range?: { from: string | null; to: string | null };
    counts: {
        sent: number;
        failed: number;
        received: number;
    };
};

const buildQuery = (params: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (!value) return;
        query.append(key, value);
    });
    const withCompany = appendSuperadminCompanyParam(query).toString();
    return withCompany ? `?${withCompany}` : '';
};

export const MetricsService = {
    async getDashboardMetrics(params: DashboardMetricsParams = {}): Promise<DashboardMetricsResponse> {
        const query = buildQuery({
            range: params.range,
            from: params.from,
            to: params.to,
            botId: params.botId,
            companyId: params.companyId,
            requestStatus: params.requestStatus
        });
        const res = await ApiClient.get<DashboardMetricsResponse>(`metrics/dashboard${query}`);
        if (!res.ok) throw new Error(res.message || 'Failed to load dashboard metrics');
        return res.data as DashboardMetricsResponse;
    },

    async getTelegramMetrics(params: TelegramMetricsParams = {}): Promise<TelegramMetricsResponse> {
        const query = buildQuery({
            range: params.range,
            from: params.from,
            to: params.to,
            botId: params.botId,
            companyId: params.companyId
        });
        const res = await ApiClient.get<TelegramMetricsResponse>(`metrics/telegram${query}`);
        if (!res.ok) throw new Error(res.message || 'Failed to load telegram metrics');
        return res.data as TelegramMetricsResponse;
    }
};
