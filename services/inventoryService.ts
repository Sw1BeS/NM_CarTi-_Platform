
import { ApiClient } from './apiClient';
import { CarListing } from '../types';

export interface InventoryFilter {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    priceMin?: number;
    priceMax?: number;
    yearMin?: number;
    yearMax?: number;
}

export interface InventoryResponse {
    items: CarListing[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export const InventoryService = {
    async getInventory(filter: InventoryFilter = {}): Promise<InventoryResponse> {
        const query = new URLSearchParams();
        if (filter.page) query.append('page', String(filter.page));
        if (filter.limit) query.append('limit', String(filter.limit));
        if (filter.status && filter.status !== 'ALL') query.append('status', filter.status);
        if (filter.search) query.append('search', filter.search);
        if (filter.priceMin) query.append('priceMin', String(filter.priceMin));
        if (filter.priceMax) query.append('priceMax', String(filter.priceMax));
        if (filter.yearMin) query.append('yearMin', String(filter.yearMin));
        if (filter.yearMax) query.append('yearMax', String(filter.yearMax));

        const res = await ApiClient.get<InventoryResponse>(`inventory?${query.toString()}`);

        // Handle empty/fallback
        if (!res.ok) {
            console.error(res.message);
            return { items: [], total: 0, page: 1, limit: 50, totalPages: 0 };
        }

        return res.data as InventoryResponse;
    },

    async saveCar(car: Partial<CarListing>): Promise<CarListing> {
        // NOTE: Front uses canonicalId, backend uses id. Map for API.
        const payload = { ...car, id: car.canonicalId };
        const isUpdate = !!car.canonicalId && !car.canonicalId.startsWith('imp_') && !car.canonicalId.startsWith('temp_');

        const res = isUpdate
            ? await ApiClient.put<CarListing>(`inventory/${car.canonicalId}`, payload)
            : await ApiClient.post<CarListing>('inventory', payload);

        if (!res.ok) {
            throw new Error(res.message || 'Inventory save failed');
        }
        return res.data as CarListing;
    },

    async deleteCar(id: string): Promise<void> {
        const res = await ApiClient.delete(`inventory/${id}`);
        if (!res.ok) throw new Error(res.message);
    }
};
