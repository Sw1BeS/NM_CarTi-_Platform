import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { SystemSettings } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { useLang } from '../../../contexts/LanguageContext';
import { Save } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';

export const GeneralTab = () => {
    const { showToast } = useToast();
    const { t, language, setLanguage } = useLang();
    const { theme, toggleTheme } = useTheme();
    const [settings, setSettings] = useState<SystemSettings>({});

    useEffect(() => { Data.getSettings().then(setSettings); }, []);

    const save = async () => {
        await Data.saveSettings(settings);
        showToast(t('integrations.toast_saved'));
    };

    return (
        <div className="space-y-6 animate-slide-up max-w-2xl">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('settings.general.title')}</h3>
                <button onClick={save} className="btn-primary flex items-center gap-2"><Save size={16} /> {t('btn.save')}</button>
            </div>

            <div className="panel p-6 space-y-6">
                <div>
                    <h4 className="font-bold text-[var(--text-primary)] mb-4">{t('settings.appearance')}</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Theme</label>
                            <div className="flex gap-2">
                                <button onClick={() => theme === 'light' && toggleTheme()} className={`flex-1 p-3 rounded-xl border ${theme === 'dark' ? 'border-gold-500 bg-[var(--bg-input)]' : 'border-[var(--border-color)]'}`}> Dark </button>
                                <button onClick={() => theme === 'dark' && toggleTheme()} className={`flex-1 p-3 rounded-xl border ${theme === 'light' ? 'border-gold-500 bg-[var(--bg-input)]' : 'border-[var(--border-color)]'}`}> Light </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Language</label>
                            <select className="input" value={language} onChange={e => setLanguage(e.target.value as any)}>
                                <option value="en">English</option>
                                <option value="uk">Ukrainian</option>
                                <option value="ru">Russian</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="border-t border-[var(--border-color)] pt-6">
                    <h4 className="font-bold text-[var(--text-primary)] mb-4">Organization</h4>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1 block">Company Name</label>
                            <input className="input" value={settings.companyName || ''} onChange={e => setSettings({ ...settings, companyName: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-1 block">Support Email</label>
                            <input className="input" value={settings.supportEmail || ''} onChange={e => setSettings({ ...settings, supportEmail: e.target.value })} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
