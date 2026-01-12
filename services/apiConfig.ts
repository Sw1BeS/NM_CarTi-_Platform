
export const DEFAULT_LOCAL_FALLBACK = 'http://localhost:3001';

export function getApiBase(): string {
    // 1. LocalStorage override
    const stored = localStorage.getItem('cartie_api_base');
    if (stored) return stored.replace(/\/$/, '');

    // 2. Environment variable (Vite)
    // Cast import.meta to any to avoid TS errors in some environments
    const meta = import.meta as any;
    if (meta.env?.VITE_API_BASE_URL) {
        return meta.env.VITE_API_BASE_URL.replace(/\/$/, '');
    }

    // 3. Local Development Fallback
    // If we are on localhost and NOT on port 3000 (e.g. 5173), assume API is on 3000
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        if (window.location.port !== '3000') {
            return `${DEFAULT_LOCAL_FALLBACK}/api`;
        }
    }

    // 4. Default to current origin (for production bundles served by backend)
    // APPEND /api because the backend routes are mounted at /api and Caddy proxies /api
    return `${window.location.origin.replace(/\/$/, '')}/api`;
}

export function setApiBase(url: string) {
    localStorage.setItem('cartie_api_base', url);
}
