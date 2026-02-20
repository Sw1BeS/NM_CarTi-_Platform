/// <reference types="vite/client" />

import { SystemSettings } from '../types/system.types'; // Assuming types exist or I need to create them
import { ApiClient } from './apiClient';

export const SystemApi = {
    getPublicSettings: async () => {
        const res = await ApiClient.get('/system/settings/public', { skipAuth: true });
        if (!res.ok) throw new Error(res.message || 'Failed to load public settings');
        return res.data;
    },

    getSettings: async () => {
        const res = await ApiClient.get('/system/settings');
        if (!res.ok) throw new Error(res.message || 'Failed to load settings');
        return res.data;
    },

    updateSettings: async (payload: Partial<SystemSettings>) => {
        const res = await ApiClient.put('/system/settings', payload);
        if (!res.ok) throw new Error(res.message || 'Failed to update settings');
        return res.data;
    }
};
