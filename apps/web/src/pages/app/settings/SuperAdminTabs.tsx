import React, { useState, useEffect, useRef } from 'react';
import { Data } from '../../../services/data';
import { SuperadminApi } from '../../../services/superadminApi';
import { User, SystemSettings, FeatureKey } from '../../../types';
import { Plus, LogIn, Cpu, ToggleRight, ToggleLeft } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { useLang } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { TelegramAPI } from '../../../services/telegram';

export const SuperAdminTab = () => {
    const { showToast } = useToast();
    const { user } = useAuth();
    const { t } = useLang();
    const [companies, setCompanies] = useState<any[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterCompany, setFilterCompany] = useState<string>('');
    const [createModal, setCreateModal] = useState(false);
    const [form, setForm] = useState({ email: '', password: '', role: 'ADMIN', companyId: '', name: '' });

    useEffect(() => {
        if (user?.role === 'SUPER_ADMIN') {
            refresh();
        }
    }, [user]);

    const refresh = async () => {
        setLoading(true);
        try {
            const [c, u] = await Promise.all([
                SuperadminApi.listCompanies(),
                SuperadminApi.listUsers({})
            ]);
            setCompanies(c);
            setUsers(u);
        } catch (e: any) {
            console.error(e);
            showToast('Failed to load superadmin data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(u => (filterCompany ? u.companyId === filterCompany : true));

    return (
        <div className="space-y-6 animate-slide-up">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('superadmin.title')}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">{t('superadmin.desc')}</p>
                </div>
            </div>
            {/* ... Content abbreviated ... */}
            <div className="panel p-4">
                <div className="text-center text-[var(--text-secondary)]">
                    SuperAdmin User Management would go here.
                </div>
            </div>
        </div>
    );
};

export const FeaturesTab = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const [settings, setSettings] = useState<SystemSettings>({});

    useEffect(() => {
        Data.getSettings().then(setSettings);
    }, []);

    const toggle = async (key: FeatureKey) => {
        const newFeatures = { ...settings.features, [key]: !settings.features?.[key] };
        const newSettings = { ...settings, features: newFeatures };
        await Data.saveSettings(newSettings);
        setSettings(newSettings);
        showToast("Feature Updated. Refresh to apply.");
    };

    const FEATURES: { key: FeatureKey, label: string, desc: string }[] = [
        { key: 'scenarios', label: 'Visual Scenario Builder', desc: 'Drag-and-drop flow editor for bots' },
        { key: 'inventory', label: 'Global Search & Inventory', desc: 'External parsing integration' },
        { key: 'bots', label: 'Broadcast Campaigns', desc: 'Bulk messaging tools' }, // Using 'bots' as proxy for campaigns or need new key
        { key: 'crm', label: 'Partner Network', desc: 'Company management module' }
    ];

    return (
        <div className="space-y-6 animate-slide-up">
            <div>
                <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('settings.features.title')}</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">{t('settings.features.desc')}</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
                {FEATURES.map(f => (
                    <div key={f.key} className="panel p-5 flex justify-between items-center">
                        <div>
                            <div className="font-bold text-[var(--text-primary)]">{f.label}</div>
                            <div className="text-xs text-[var(--text-secondary)]">{f.desc}</div>
                        </div>
                        <button onClick={() => toggle(f.key)} className={`text-2xl transition-colors ${settings.features?.[f.key] ? 'text-green-500' : 'text-[var(--text-muted)]'}`}>
                            {settings.features?.[f.key] ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const TelegramDiagnosticsTab = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const [bots, setBots] = useState<any[]>([]);

    useEffect(() => { Data.getBots().then(setBots); }, []);

    const checkBot = async (token: string) => {
        try {
            const res = await TelegramAPI.getMe(token);
            showToast(`Success: @${res.username}`);
        } catch (e: any) {
            showToast(`Error: ${e.message}`, 'error');
        }
    };

    return (
        <div className="space-y-6 animate-slide-up">
            <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('settings.tg.title')}</h3>
            <div className="space-y-4">
                {bots.map(b => (
                    <div key={b.id} className="panel p-5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 className="font-bold text-[var(--text-primary)]">{b.name}</h4>
                                <code className="text-xs text-[var(--text-secondary)] bg-[var(--bg-input)] px-2 py-1 rounded">{b.token.substring(0, 10)}...</code>
                            </div>
                            <button onClick={() => checkBot(b.token)} className="btn-secondary text-xs">Ping API</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
