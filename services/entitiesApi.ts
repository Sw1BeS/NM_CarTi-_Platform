
import { apiFetch } from './apiClient';
import { Data } from './data';
import { Storage } from './storage';

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
    if (Data.getMode() === 'LOCAL') {
        return Storage.getEntityDefinitions();
    }
    return await apiFetch("/entities/meta", { auth: true });
}

export async function createDefinition(payload: EntityDefinition): Promise<EntityDefinition> {
    if (Data.getMode() === 'LOCAL') {
        return Storage.saveEntityDefinition(payload);
    }
    return await apiFetch("/entities/definitions", { 
        method: "POST", 
        auth: true, 
        body: JSON.stringify(payload) 
    });
}

export async function listRecords(slug: string): Promise<any[]> {
    if (Data.getMode() === 'LOCAL') {
        const data = Storage.listCustomEntities(slug);
        // Wrap to match backend response structure { id: string, data: object } if needed
        // But backend usually returns array of objects with data and id.
        // ServerAdapter unwraps it. Here we return objects that look like unwrapped entities.
        // Wait, Entities.tsx expects { data: ... } wrapped?
        // Let's check Entities.tsx:
        // const data = await listRecords(slug);
        // setRecords(data.map(r => ({ ...r.data, id: r.id })));
        
        // So `listRecords` must return objects with { id, data: {...} } structure to be compatible with UI logic.
        return data.map((d: any) => ({ id: d.id, data: d }));
    }
    return await apiFetch(`/entities/${slug}/records`, { auth: true });
}

export async function createRecord(slug: string, data: any): Promise<any> {
    if (Data.getMode() === 'LOCAL') {
        const saved = Storage.saveCustomEntity(slug, data);
        return { id: saved.id, data: saved };
    }
    return await apiFetch(`/entities/${slug}/records`, { 
        method: "POST", 
        auth: true, 
        body: JSON.stringify({ data }) 
    });
}

export async function updateRecord(slug: string, id: string, data: any): Promise<any> {
    if (Data.getMode() === 'LOCAL') {
        const saved = Storage.saveCustomEntity(slug, { ...data, id });
        return { id: saved.id, data: saved };
    }
    return await apiFetch(`/entities/${slug}/records/${id}`, { 
        method: "PUT", 
        auth: true, 
        body: JSON.stringify({ data }) 
    });
}

export async function deleteRecord(slug: string, id: string): Promise<void> {
    if (Data.getMode() === 'LOCAL') {
        Storage.deleteCustomEntity(slug, id);
        return;
    }
    await apiFetch(`/entities/${slug}/records/${id}`, { 
        method: "DELETE", 
        auth: true 
    });
}
