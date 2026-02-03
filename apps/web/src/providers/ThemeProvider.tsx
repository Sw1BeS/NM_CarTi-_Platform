
import React, { createContext, useContext, useEffect, useState } from 'react';
import { SystemApi } from '../services/systemApi';
import { ApiClient } from '../services/apiClient';
import { getSuperadminCompanyId } from '../utils/superadminCompany';
import { SystemBranding } from '../types/system.types';

interface ThemeContextType {
    branding: SystemBranding | null;
    refreshTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
    branding: null,
    refreshTheme: async () => { },
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [branding, setBranding] = useState<SystemBranding | null>(null);

    const refreshTheme = async () => {
        try {
            const settings = await SystemApi.getPublicSettings();
            let nextBranding: SystemBranding = settings?.branding || {};

            const token = typeof window !== 'undefined' ? localStorage.getItem('cartie_token') : null;
            if (token) {
                const selectedCompanyId = getSuperadminCompanyId();
                const query = selectedCompanyId ? `?companyId=${encodeURIComponent(selectedCompanyId)}` : '';
                const res = await ApiClient.get<any>(`companies/current${query}`);
                if (res.ok && res.data) {
                    nextBranding = {
                        ...nextBranding,
                        primaryColor: res.data.primaryColor || nextBranding.primaryColor,
                        logoUrl: res.data.logo || nextBranding.logoUrl,
                        faviconUrl: res.data.logo || nextBranding.faviconUrl
                    };
                }
            }

            setBranding(nextBranding);
            applyTheme(nextBranding);
        } catch (error) {
            console.error('Failed to load theme:', error);
        }
    };

    const applyTheme = (branding: SystemBranding) => {
        const root = document.documentElement;
        if (branding.primaryColor) {
            root.style.setProperty('--primary', branding.primaryColor);
            root.style.setProperty('--primary-foreground', '#ffffff'); // automated contrast logic could go here
        }

        if (branding.faviconUrl) {
            const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = branding.faviconUrl;
            document.getElementsByTagName('head')[0].appendChild(link);
        }
    };

    useEffect(() => {
        refreshTheme();
    }, []);

    return (
        <ThemeContext.Provider value={{ branding, refreshTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
