import { ApiClient } from './apiClient';

export const ShowcaseService = {
    getShowcases: async () => {
        const res = await ApiClient.get('showcase');
        if (!res.ok) throw new Error(res.message || 'Failed to load showcases');
        return res.data;
    },

    getShowcase: async (id: string) => {
        const res = await ApiClient.get(`showcase/${id}`);
        if (!res.ok) throw new Error(res.message || 'Failed to load showcase');
        return res.data;
    },

    createShowcase: async (data: any) => {
        const res = await ApiClient.post('showcase', data);
        if (!res.ok) throw new Error(res.message || 'Failed to create showcase');
        return res.data;
    },

    updateShowcase: async (id: string, data: any) => {
        const res = await ApiClient.put(`showcase/${id}`, data);
        if (!res.ok) throw new Error(res.message || 'Failed to update showcase');
        return res.data;
    },

    deleteShowcase: async (id: string) => {
        const res = await ApiClient.delete(`showcase/${id}`);
        if (!res.ok) throw new Error(res.message || 'Failed to delete showcase');
    }
};
