import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../translations';

interface LangContextType {
    lang: Language;
    setLang: (l: Language) => void;
    t: (key: string) => string;
}

const LangContext = createContext<LangContextType>({} as any);

export const LangProvider = ({ children }: React.PropsWithChildren) => {
    const [lang, setLangState] = useState<Language>('EN');

    useEffect(() => {
        const saved = localStorage.getItem('cartie_lang') as Language;
        if (saved) setLangState(saved);
    }, []);

    const setLang = (l: Language) => {
        setLangState(l);
        localStorage.setItem('cartie_lang', l);
    };

    const t = (key: string) => {
        return TRANSLATIONS[lang][key] || key;
    };

    return (
        <LangContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LangContext.Provider>
    );
};

export const useLang = () => useContext(LangContext);