import axios from 'axios';
const API_URL = import.meta.env.VITE_API_URL || '/api';

export const ShowcaseService = {
    getShowcases: async () => {
        const token = localStorage.getItem('cartie_token');
        const res = await axios.get(`${API_URL}/showcase`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    },

    getShowcase: async (id: string) => {
        const token = localStorage.getItem('cartie_token');
        const res = await axios.get(`${API_URL}/showcase/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    },

    createShowcase: async (data: any) => {
        const token = localStorage.getItem('cartie_token');
        const res = await axios.post(`${API_URL}/showcase`, data, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    },

    updateShowcase: async (id: string, data: any) => {
        const token = localStorage.getItem('cartie_token');
        const res = await axios.put(`${API_URL}/showcase/${id}`, data, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    },

    deleteShowcase: async (id: string) => {
        const token = localStorage.getItem('cartie_token');
        await axios.delete(`${API_URL}/showcase/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
    }
};
