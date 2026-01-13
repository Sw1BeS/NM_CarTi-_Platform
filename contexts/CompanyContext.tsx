import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface Company {
    id: string;
    name: string;
    slug: string;
    logo?: string;
    primaryColor: string;
    domain?: string;
    plan: string;
    isActive: boolean;
    _count?: {
        users: number;
        bots: number;
        scenarios: number;
        integrations: number;
    };
}

interface CompanyContextType {
    company: Company | null;
    loading: boolean;
    refreshCompany: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [company, setCompany] = useState<Company | null>(null);
    const [loading, setLoading] = useState(true);

    const loadCompany = async () => {
        if (!user) {
            setCompany(null);
            setLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/companies/current', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setCompany(data);
            }
        } catch (e) {
            console.error('Failed to load company:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCompany();
    }, [user]);

    return (
        <CompanyContext.Provider value={{ company, loading, refreshCompany: loadCompany }}>
            {children}
        </CompanyContext.Provider>
    );
};

export const useCompany = () => {
    const context = useContext(CompanyContext);
    if (context === undefined) {
        throw new Error('useCompany must be used within a CompanyProvider');
    }
    return context;
};
