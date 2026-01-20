
export const DEFAULT_LOCAL_FALLBACK = 'http://localhost:8082';

function normalizeApiBase(value: string): string {
    const trimmed = value.trim().replace(/\/$/, '');
    if (!trimmed) return '';
    if (trimmed.endsWith('/api')) return trimmed;
    return `${trimmed}/api`;
}

export function getApiBase(): string {
    // 1. LocalStorage override
    const stored = localStorage.getItem('cartie_api_base');
    if (stored) {
        const normalized = normalizeApiBase(stored);
        if (normalized && normalized !== stored) {
            localStorage.setItem('cartie_api_base', normalized);
        }
        return normalized;
    }

    // 2. Environment variable (Vite)
    // Cast import.meta to any to avoid TS errors in some environments
    const meta = import.meta as any;
    if (meta.env?.VITE_API_BASE_URL) {
        return normalizeApiBase(meta.env.VITE_API_BASE_URL);
    }

    // 3. Local Development Fallback
    // If we are on localhost and NOT on port 8082 (API server), assume API is on 8082
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        if (window.location.port !== '8082') {
            return `${DEFAULT_LOCAL_FALLBACK}/api`;
        }
    }

    // 4. Default to current origin (for production bundles served by backend)
    // APPEND /api because the backend routes are mounted at /api and Caddy proxies /api
    return `${window.location.origin.replace(/\/$/, '')}/api`;
}

export function setApiBase(url: string) {
    const normalized = normalizeApiBase(url);
    if (normalized) {
        localStorage.setItem('cartie_api_base', normalized);
    } else {
        localStorage.removeItem('cartie_api_base');
    }
}
