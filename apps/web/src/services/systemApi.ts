/// <reference types="vite/client" />

import axios from 'axios';

import { SystemSettings } from '../types/system.types'; // Assuming types exist or I need to create them

const API_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const SystemApi = {
    getPublicSettings: async () => {
        const { data } = await axios.get(`${API_URL}/system/settings/public`);
        return data;
    },

    getSettings: async () => {
        const { data } = await axios.get(`${API_URL}/system/settings`);
        return data;
    },

    updateSettings: async (payload: Partial<SystemSettings>) => {
        const { data } = await axios.put(`${API_URL}/system/settings`, payload);
        return data;
    }
};
