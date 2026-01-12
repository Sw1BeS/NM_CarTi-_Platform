
import { apiFetch } from './apiClient';
import { User } from '../types';

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
    return await apiFetch("/auth/login", { 
        method: "POST", 
        body: JSON.stringify({ email, password }) 
    });
}

export async function me(): Promise<User> {
    return await apiFetch("/auth/me", { 
        method: "GET", 
        auth: true 
    });
}
