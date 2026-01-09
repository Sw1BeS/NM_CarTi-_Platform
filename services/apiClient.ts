
import { getApiBase } from './apiConfig';

export interface ApiResponse<T = any> {
    ok: boolean;
    status: number;
    data?: T;
    message?: string;
    details?: any;
}

interface RequestOptions extends RequestInit {
    token?: string;
    skipAuth?: boolean;
}

// Standalone function to avoid 'this' context issues
async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const base = getApiBase();
    const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {} as any),
    };

    const token = options.token || localStorage.getItem('cartie_token');
    if (token && !options.skipAuth) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, { ...options, headers });
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            // Handle HTML errors (like Google 404s) gracefully
            if (text.trim().startsWith('<')) {
                data = { message: `Endpoint not found or non-JSON response (${response.status})` };
            } else {
                data = { message: text };
            }
        }

        if (!response.ok) {
            // Auto-logout on 401
            if (response.status === 401 && !endpoint.includes('login')) {
                localStorage.removeItem('cartie_token');
                window.dispatchEvent(new Event('auth-error'));
            }
            return {
                ok: false,
                status: response.status,
                message: data.message || response.statusText,
                details: data
            };
        }

        return {
            ok: true,
            status: response.status,
            data: data as T
        };

    } catch (error: any) {
        console.error('[API Error]', error);
        return {
            ok: false,
            status: 0,
            message: error.message || 'Network connection failed',
            details: error
        };
    }
}

export async function apiFetch<T = any>(endpoint: string, options: any = {}): Promise<T> {
    const res = await request<T>(endpoint, options);
    if (!res.ok) {
        throw new Error(res.message || 'Network error');
    }
    return res.data as T;
}

export const ApiClient = {
    request,

    get<T>(endpoint: string) {
        return request<T>(endpoint, { method: 'GET' });
    },

    post<T>(endpoint: string, body: any) {
        return request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) });
    },

    put<T>(endpoint: string, body: any) {
        return request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) });
    },

    delete<T>(endpoint: string) {
        return request<T>(endpoint, { method: 'DELETE' });
    }
};
