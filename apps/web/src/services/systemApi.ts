/// <reference types="vite/client" />

import axios from 'axios';

import { SystemSettings } from '../types/system.types'; // Assuming types exist or I need to create them
import { getApiBase } from './apiConfig';

const API_URL = getApiBase();

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
