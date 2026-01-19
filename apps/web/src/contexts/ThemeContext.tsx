
import React, { createContext, useContext, useEffect } from 'react';

type Theme = 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'dark',
    toggleTheme: () => {} 
});

export const ThemeProvider = ({ children }: React.PropsWithChildren) => {
    // Always enforce dark mode class on mount
    useEffect(() => {
        document.documentElement.classList.add('dark');
        localStorage.setItem('cartie_theme', 'dark');
    }, []);

    const toggleTheme = () => {
        // No-op: Single theme policy
    };

    return (
        <ThemeContext.Provider value={{ theme: 'dark', toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
