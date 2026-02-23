
import { getApiBase } from './apiConfig';

export interface ApiResponse<T = any> {
    ok: boolean;
    status: number;
    data?: T;
    message?: string;
    details?: any;
}

type QueryPrimitive = string | number | boolean | null | undefined;
type QueryValue = QueryPrimitive | QueryPrimitive[];
type QueryParams = URLSearchParams | Record<string, QueryValue>;

export interface RequestOptions extends RequestInit {
    token?: string;
    skipAuth?: boolean;
    auth?: boolean;
    query?: QueryParams;
    params?: QueryParams;
    timeoutMs?: number;
}

const appendQueryToEndpoint = (endpoint: string, query?: QueryParams) => {
    if (!query) return endpoint;

    const [path, rawQuery = ''] = endpoint.split('?');
    const search = new URLSearchParams(rawQuery);

    if (query instanceof URLSearchParams) {
        query.forEach((value, key) => {
            search.set(key, value);
        });
    } else {
        Object.entries(query).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                search.delete(key);
                value.forEach((item) => {
                    if (item !== undefined && item !== null) {
                        search.append(key, String(item));
                    }
                });
                return;
            }

            if (value === undefined || value === null) {
                search.delete(key);
                return;
            }
            search.set(key, String(value));
        });
    }

    const queryString = search.toString();
    return queryString ? `${path}?${queryString}` : path;
};

// Standalone function to avoid 'this' context issues.
async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const base = getApiBase();
    const endpointWithQuery = appendQueryToEndpoint(endpoint, options.query || options.params);
    const url = `${base}${endpointWithQuery.startsWith('/') ? '' : '/'}${endpointWithQuery}`;

    const headers: HeadersInit = {
        'Accept': 'application/json',
        ...(options.headers || {} as any),
    };

    const token = options.token || localStorage.getItem('cartie_token');
    const skipAuth = options.skipAuth || options.auth === false;
    if (token && !skipAuth) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (!isFormData && !('Content-Type' in (headers as any))) {
        headers['Content-Type'] = 'application/json';
    }

    const requestInit: RequestInit = { ...options, headers };
    delete (requestInit as any).token;
    delete (requestInit as any).skipAuth;
    delete (requestInit as any).auth;
    delete (requestInit as any).query;
    delete (requestInit as any).params;
    delete (requestInit as any).timeoutMs;

    // Debug logging
    console.debug(`[API] ${requestInit.method || 'GET'} ${url}`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
        const response = await fetch(url, { ...requestInit, signal: controller.signal });
        clearTimeout(timeoutId);

        let data: any;
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

        const isV2Envelope = data && typeof data === 'object' && typeof (data as any).ok === 'boolean' && (data as any).meta?.version === 'v2';
        if (isV2Envelope) {
            if (!(data as any).ok || !response.ok) {
                const errorPayload = (data as any).error || {};
                return {
                    ok: false,
                    status: response.status,
                    message: errorPayload.message || response.statusText,
                    details: errorPayload
                };
            }
            return {
                ok: true,
                status: response.status,
                data: (data as any).data as T
            };
        }

        if (!response.ok) {
            // Auto-logout only for authenticated platform requests.
            // Public/MiniApp calls run with skipAuth=true and must not redirect to /login.
            if (response.status === 401 && !skipAuth && !endpointWithQuery.includes('login')) {
                localStorage.removeItem('cartie_token');
                window.dispatchEvent(new Event('auth-error'));
            }
            console.warn(`[API] ${requestInit.method || 'GET'} ${url} → ${response.status}`, data.message || response.statusText);
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

    get<T>(endpoint: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
        return request<T>(endpoint, { ...options, method: 'GET' });
    },

    post<T>(endpoint: string, body: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
        const payload = (typeof FormData !== 'undefined' && body instanceof FormData)
            ? body
            : JSON.stringify(body ?? {});
        return request<T>(endpoint, { ...options, method: 'POST', body: payload });
    },

    put<T>(endpoint: string, body: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
        const payload = (typeof FormData !== 'undefined' && body instanceof FormData)
            ? body
            : JSON.stringify(body ?? {});
        return request<T>(endpoint, { ...options, method: 'PUT', body: payload });
    },

    patch<T>(endpoint: string, body: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
        const payload = (typeof FormData !== 'undefined' && body instanceof FormData)
            ? body
            : JSON.stringify(body ?? {});
        return request<T>(endpoint, { ...options, method: 'PATCH', body: payload });
    },

    delete<T>(endpoint: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
        return request<T>(endpoint, { ...options, method: 'DELETE' });
    }
};
