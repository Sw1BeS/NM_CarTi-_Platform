
import { apiFetch } from './apiClient';

export interface EntityField {
    key: string;
    label: string;
    type: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'json';
    required: boolean;
    order: number;
    options?: string[]; // for select
}

export interface EntityDefinition {
    slug: string;
    name: string;
    description?: string;
    fields: EntityField[];
}


export async function getMeta(): Promise<EntityDefinition[]> {
    const res = await apiFetch<any>("/entities/meta", { auth: true });
    return res.definitions || [];
}

export async function createDefinition(payload: EntityDefinition): Promise<EntityDefinition> {
    const res = await apiFetch<any>("/entities/definitions", {
        method: "POST",
        auth: true,
        body: JSON.stringify(payload)
    });
    return res.definition;
}

export async function listRecords(slug: string): Promise<any[]> {
    const res = await apiFetch<any>(`/entities/${slug}/records`, { auth: true });
    return res.items || [];
}

export async function createRecord(slug: string, data: any): Promise<any> {
    const res = await apiFetch<any>(`/entities/${slug}/records`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ data })
    });
    return res.record;
}

export async function updateRecord(slug: string, id: string, data: any): Promise<any> {
    const res = await apiFetch<any>(`/entities/${slug}/records/${id}`, {
        method: "PUT",
        auth: true,
        body: JSON.stringify({ data })
    });
    return res.record;
}

export async function deleteRecord(slug: string, id: string): Promise<void> {
    await apiFetch(`/entities/${slug}/records/${id}`, {
        method: "DELETE",
        auth: true
    });
}
