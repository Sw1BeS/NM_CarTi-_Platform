import { ApiClient } from './apiClient';

export interface TelegramDestination {
    id: string;
    type: 'USER' | 'GROUP' | 'CHANNEL';
    title: string;
    username?: string;
    access: 'BOT' | 'MTPROTO';
    role: 'SOURCE' | 'DESTINATION' | 'BOTH';
    status: 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISCOVERED';
    lastSyncAt?: string;
    lastError?: string;
}

export const destinationService = {
    list: async (filters?: { role?: string; status?: string }) => {
        const res = await ApiClient.get<TelegramDestination[]>('/telegram/destinations', { params: filters });
        if (!res.ok) throw new Error(res.message || 'Failed to list destinations');
        return res.data;
    },

    sync: async (id: string) => {
        const res = await ApiClient.post<{ started: boolean; message: string }>(`/telegram/destinations/${id}/sync`, {});
        if (!res.ok) throw new Error(res.message || 'Sync failed');
        return res.data;
    },

    pause: async (id: string) => {
        const res = await ApiClient.patch<TelegramDestination>(`/telegram/destinations/${id}/pause`, {});
        if (!res.ok) throw new Error(res.message || 'Pause failed');
        return res.data;
    },

    resume: async (id: string) => {
        const res = await ApiClient.patch<TelegramDestination>(`/telegram/destinations/${id}/resume`, {});
        if (!res.ok) throw new Error(res.message || 'Resume failed');
        return res.data;
    }
};
