
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Permission, ROLE_PERMISSIONS } from '../types';
import { login as apiLogin, me as apiMe } from '../services/authApi';

interface AuthContextType {
    user: User | null;
    login: (e: string, p: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    hasPermission: (p: Permission) => boolean;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as any);

export const AuthProvider = ({ children }: React.PropsWithChildren) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('cartie_token');
            if (token) {
                try {
                    const userData = await apiMe();
                    setUser(userData);
                } catch (e) {
                    console.error("Session restore failed", e);
                    localStorage.removeItem('cartie_token');
                    setUser(null);
                }
            }
            setLoading(false);
        };
        initAuth();
    }, []);

    const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const res = await apiLogin(email, password);
            if (res.token && res.user) {
                localStorage.setItem('cartie_token', res.token);
                // Ensure user object has expected shape even if backend differs slightly
                const cleanUser: User = {
                    id: res.user.id,
                    name: res.user.name || res.user.username || 'User',
                    email: res.user.email,
                    role: res.user.role,
                    username: res.user.username || res.user.name, // backward compat
                    companyId: res.user.companyId
                };
                setUser(cleanUser);
                return { success: true };
            }
            return { success: false, error: 'Invalid response' };
        } catch (e: any) {
            console.error("Login Error", e);
            const msg = e.message.replace('Network error:', '').trim();
            return { success: false, error: msg || 'Login failed' };
        }
    };

    const logout = React.useCallback(() => {
        setUser(null);
        localStorage.removeItem('cartie_token');
        window.location.href = '/login';
    }, []);

    useEffect(() => {
        const onAuthError = () => logout();
        window.addEventListener('auth-error', onAuthError);
        return () => window.removeEventListener('auth-error', onAuthError);
    }, [logout]);

    const hasPermission = (p: Permission): boolean => {
        if (!user) return false;
        const perms = ROLE_PERMISSIONS[user.role];
        return perms ? perms.includes(p) : false;
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, hasPermission, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
