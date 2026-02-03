import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { getSuperadminCompanyId, setSuperadminCompanyId } from '../utils/superadminCompany';

interface SuperAdminCompanyContextType {
    companyId: string | null;
    setCompanyId: (id: string | null) => void;
}

const SuperAdminCompanyContext = createContext<SuperAdminCompanyContextType | undefined>(undefined);

export const SuperAdminCompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [companyId, setCompanyIdState] = useState<string | null>(null);

    useEffect(() => {
        setCompanyIdState(getSuperadminCompanyId());
    }, []);

    useEffect(() => {
        if (user?.role !== 'SUPER_ADMIN') {
            setCompanyIdState(null);
            setSuperadminCompanyId(null);
        }
    }, [user?.role]);

    const setCompanyId = (id: string | null) => {
        setCompanyIdState(id);
        setSuperadminCompanyId(id);
    };

    return (
        <SuperAdminCompanyContext.Provider value={{ companyId, setCompanyId }}>
            {children}
        </SuperAdminCompanyContext.Provider>
    );
};

export const useSuperAdminCompany = () => {
    const context = useContext(SuperAdminCompanyContext);
    if (!context) {
        throw new Error('useSuperAdminCompany must be used within a SuperAdminCompanyProvider');
    }
    return context;
};
