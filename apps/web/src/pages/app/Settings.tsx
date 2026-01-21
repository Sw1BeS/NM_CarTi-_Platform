
import React, { useState, useEffect, useRef } from 'react';
import { VersionSnapshots, ConfigSnapshot } from '../../services/versionSnapshots';
import { User, UserRole, FeatureKey, SystemSettings } from '../../types';
import { useLang } from '../../contexts/LanguageContext';
import { User as UserIcon, Layers, Cpu, Terminal, Book, Plus, CheckCircle, X, ToggleLeft, ToggleRight, MessageCircle, Briefcase, Search, GitMerge, Megaphone, HardDrive, Download, Upload, RefreshCw, AlertTriangle, Clock, Trash2, RotateCcw, Globe, Server, Database, History, Info, Lock, Shield, LogIn, Settings as SettingsIcon } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { TelegramAPI } from '../../services/telegram';
import { ApiClient } from '../../services/apiClient';
import { getApiBase, setApiBase } from '../../services/apiConfig';
import { Data } from '../../services/data';
import { SuperadminApi } from '../../services/superadminApi';

export const SettingsPage = () => {
    const [activeTab, setActiveTab] = useState<'USERS' | 'INTEGRATIONS' | 'TG' | 'FEATURES' | 'DICT' | 'BACKUP' | 'API' | 'VERSIONS' | 'SUPERADMIN' | 'GENERAL'>('USERS');
    const { t } = useLang();
    const { user } = useAuth();

    return (
        <div className="space-y-8 max-w-7xl mx-auto h-[calc(100vh-120px)] flex flex-col">
            <div>
                <h1 className="text-2xl font-medium text-[var(--text-primary)] tracking-tight">{t('nav.settings')}</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">{t('settings.subtitle')}</p>
            </div>

            <div className="panel overflow-hidden flex-1 flex flex-col md:flex-row shadow-2xl">
                {/* Sidebar */}
                <div className="w-full md:w-72 bg-[var(--bg-input)] border-r border-[var(--border-color)] p-6 space-y-8 shrink-0">
                    <div>
                        <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3 px-3">{t('settings.connectivity')}</div>
                        <div className="space-y-1">
                            <NavButton active={activeTab === 'API'} onClick={() => setActiveTab('API')} icon={Server} label={t('settings.api')} />
                            <NavButton active={activeTab === 'TG'} onClick={() => setActiveTab('TG')} icon={Terminal} label={t('settings.logs')} />
                            <NavButton active={activeTab === 'INTEGRATIONS'} onClick={() => setActiveTab('INTEGRATIONS')} icon={Layers} label={t('settings.integrations')} />
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3 px-3">{t('settings.organization')}</div>
                        <div className="space-y-1">
                            <NavButton active={activeTab === 'USERS'} onClick={() => setActiveTab('USERS')} icon={UserIcon} label={t('settings.users')} />
                            {user?.role === 'SUPER_ADMIN' && (
                                <NavButton active={activeTab === 'SUPERADMIN'} onClick={() => setActiveTab('SUPERADMIN')} icon={Shield} label={t('settings.superadmin')} />
                            )}
                            {user?.role === 'SUPER_ADMIN' && (
                                <NavButton active={activeTab === 'FEATURES'} onClick={() => setActiveTab('FEATURES')} icon={Cpu} label={t('settings.features')} />
                            )}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3 px-3">{t('settings.system')}</div>
                        <div className="space-y-1">
                            <NavButton active={activeTab === 'GENERAL'} onClick={() => setActiveTab('GENERAL')} icon={SettingsIcon} label={t('settings.general')} />
                            <NavButton active={activeTab === 'BACKUP'} onClick={() => setActiveTab('BACKUP')} icon={HardDrive} label={t('settings.backup')} />
                            <NavButton active={activeTab === 'VERSIONS'} onClick={() => setActiveTab('VERSIONS')} icon={History} label={t('settings.versions')} />
                            <NavButton active={activeTab === 'DICT'} onClick={() => setActiveTab('DICT')} icon={Book} label={t('settings.dict')} />
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-10 overflow-y-auto bg-[var(--bg-app)]/50">
                    {activeTab === 'USERS' && <UsersTab />}
                    {activeTab === 'INTEGRATIONS' && <IntegrationsTab />}
                    {activeTab === 'TG' && <TelegramDiagnosticsTab />}
                    {activeTab === 'SUPERADMIN' && user?.role === 'SUPER_ADMIN' && <SuperAdminTab />}
                    {activeTab === 'FEATURES' && user?.role === 'SUPER_ADMIN' && <FeaturesTab />}
                    {activeTab === 'DICT' && <DictionariesTab />}
                    {activeTab === 'GENERAL' && <GeneralTab />}
                    {activeTab === 'BACKUP' && <BackupTab />}
                    {activeTab === 'API' && <ApiConnectionTab />}
                    {activeTab === 'VERSIONS' && <VersionsTab />}
                </div>
            </div>
        </div>
    );
};

const NavButton = ({ active, onClick, icon: Icon, label }: any) => (
    <button
        onClick={onClick}
        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-3 transition-all ${active
            ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm border border-[var(--border-color)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]'
            }`}
    >
        <Icon size={18} className={active ? 'text-gold-500' : 'opacity-70'} />
        {label}
    </button>
);

const UsersTab = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ username: '', password: '', role: 'MANAGER', name: '', telegramUserId: '', companyId: '' });
    const { showToast } = useToast();
    const { user } = useAuth();
    const { t } = useLang();

    useEffect(() => {
        load();
    }, []);

    const load = () => Data.getUsers().then(setUsers);

    const handleCreate = async () => {
        if (!formData.username || !formData.password) return showToast(t('form.required'), 'error');
        const companyId = formData.companyId || user?.companyId;
        if (!companyId) {
            showToast(t('form.company_required'), 'error');
            return;
        }

        await Data.saveUser({
            id: `u_${Date.now()}`,
            name: formData.name || formData.username,
            email: `${formData.username}@cartie.local`,
            username: formData.username,
            telegramUserId: formData.telegramUserId || undefined,
            companyId,
            password: formData.password,
            role: formData.role as any
        } as any);
        setIsModalOpen(false);
        load();
        showToast("User created");
    };

    return (
        <div className="space-y-8 animate-slide-up">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('settings.team_members')}</h3>
                <button onClick={() => setIsModalOpen(true)} className="btn-primary">
                    <Plus size={18} /> {t('settings.add_user')}
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {users.map(u => (
                    <div key={u.id} className="panel p-4 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-[var(--bg-input)] flex items-center justify-center font-bold text-[var(--text-secondary)] border border-[var(--border-color)]">
                                {u.name?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <div>
                                <div className="font-bold text-[var(--text-primary)]">{u.name}</div>
                                <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">{u.role}</div>
                            </div>
                        </div>
                        <div className="text-xs text-[var(--text-muted)] font-mono">{u.email}</div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel p-10 w-full max-w-md animate-slide-up shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-2xl text-[var(--text-primary)]">{t('settings.new_user')}</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <input className="input" placeholder={t('form.display_name')} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            <input className="input" placeholder={t('form.username')} value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                            <input className="input" type="password" placeholder={t('form.password')} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                            <input className="input" placeholder={t('form.tg_id_opt')} value={formData.telegramUserId} onChange={e => setFormData({ ...formData, telegramUserId: e.target.value })} />
                            <input className="input" placeholder={t('form.company_id_opt')} value={formData.companyId} onChange={e => setFormData({ ...formData, companyId: e.target.value })} />
                            <select className="input" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                                <option value="MANAGER">{t('role.manager')}</option>
                                <option value="ADMIN">{t('role.admin')}</option>
                                <option value="OWNER">{t('role.owner')}</option>
                                <option value="VIEWER">{t('role.viewer')}</option>
                            </select>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="btn-ghost">{t('btn.cancel')}</button>
                            <button onClick={handleCreate} className="btn-primary">{t('btn.create')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const SuperAdminTab = () => {
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

    const handleCreate = async () => {
        if (!form.email || !form.password || !form.companyId) {
            return showToast('email/password/company are required', 'error');
        }
        try {
            await SuperadminApi.createUser({
                email: form.email,
                password: form.password,
                role: form.role,
                companyId: form.companyId,
                name: form.name
            });
            showToast('User created');
            setCreateModal(false);
            setForm({ email: '', password: '', role: 'ADMIN', companyId: '', name: '' });
            refresh();
        } catch (e: any) {
            showToast(e.message || 'Create user failed', 'error');
        }
    };

    const handleImpersonate = async (u: User) => {
        try {
            const res = await SuperadminApi.impersonate({ userId: u.id, companyId: u.companyId });
            if (res.token) {
                localStorage.setItem('cartie_token', res.token);
                showToast(`Impersonating ${u.email}`, 'success');
                window.location.href = '/#/';
            }
        } catch (e: any) {
            showToast(e.message || 'Impersonation failed', 'error');
        }
    };

    return (
        <div className="space-y-6 animate-slide-up">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('superadmin.title')}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">{t('superadmin.desc')}</p>
                </div>
                <div className="flex gap-2">
                    <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="input">
                        <option value="">{t('superadmin.filter_all')}</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button onClick={() => setCreateModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> {t('settings.new_user')}</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {companies.map(c => (
                    <div key={c.id} className="panel p-4 flex justify-between items-center">
                        <div>
                            <div className="font-bold text-[var(--text-primary)]">{c.name}</div>
                            <div className="text-xs text-[var(--text-secondary)]">{c.slug} · Plan {c.plan}</div>
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] space-x-2">
                            <span>{t('superadmin.users_count')}: {c._count?.users ?? '-'}</span>
                            <span>{t('superadmin.bots_count')}: {c._count?.bots ?? '-'}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="panel p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-[var(--text-primary)]">Users</div>
                    {loading && <div className="text-xs text-[var(--text-secondary)]">Loading...</div>}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-[var(--text-secondary)]">
                            <tr>
                                <th className="text-left py-2">{t('login.email')}</th>
                                <th className="text-left py-2">{t('settings.users.role')}</th>
                                <th className="text-left py-2">{t('table.company')}</th>
                                <th className="text-right py-2">{t('table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                            {filteredUsers.map(u => (
                                <tr key={u.id}>
                                    <td className="py-2">{u.email}</td>
                                    <td className="py-2">{u.role}</td>
                                    <td className="py-2 text-[var(--text-secondary)]">{u.companyId}</td>
                                    <td className="py-2 text-right space-x-2">
                                        <button onClick={() => handleImpersonate(u)} className="btn-ghost inline-flex items-center gap-1 text-xs"><LogIn size={14} /> {t('btn.impersonate')}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredUsers.length === 0 && (
                        <div className="text-center text-[var(--text-secondary)] text-sm py-6">No users found</div>
                    )}
                </div>
            </div>

            {createModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="panel p-6 w-full max-w-lg space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-bold text-lg text-[var(--text-primary)]">Create User</div>
                                <div className="text-xs text-[var(--text-secondary)]">SUPER_ADMIN scope</div>
                            </div>
                            <button onClick={() => setCreateModal(false)}><X size={20} /></button>
                        </div>
                        <input className="input" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                        <input className="input" type="password" placeholder="Password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                        <input className="input" placeholder="Name (optional)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        <select className="input" value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })}>
                            <option value="">{t('form.select_company')}</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                            <option value="OWNER">{t('role.owner')}</option>
                            <option value="ADMIN">{t('role.admin')}</option>
                            <option value="MANAGER">{t('role.manager')}</option>
                            <option value="VIEWER">{t('role.viewer')}</option>
                        </select>
                        <div className="flex justify-end gap-2 pt-2">
                            <button className="btn-ghost" onClick={() => setCreateModal(false)}>{t('btn.cancel')}</button>
                            <button className="btn-primary" onClick={handleCreate}>{t('btn.create')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const FeaturesTab = () => {
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
        { key: 'MODULE_SCENARIOS', label: 'Visual Scenario Builder', desc: 'Drag-and-drop flow editor for bots' },
        { key: 'MODULE_SEARCH', label: 'Global Search', desc: 'External parsing integration' },
        { key: 'MODULE_CAMPAIGNS', label: 'Broadcast Campaigns', desc: 'Bulk messaging tools' },
        { key: 'MODULE_COMPANIES', label: 'Partner Network', desc: 'Company management module' }
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

const DictionariesTab = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const [dicts, setDicts] = useState({ brands: [], cities: [] } as any);
    const [activeSection, setActiveSection] = useState<'brands' | 'cities'>('brands');
    const [newKey, setNewKey] = useState('');

    useEffect(() => {
        Data.getDictionaries().then(d => setDicts(d));
    }, []);

    const addEntry = async () => {
        if (!newKey.trim()) return;
        const current = dicts[activeSection] || [];
        const updated = [...current, { key: newKey.trim(), values: [] }];
        const newDicts = { ...dicts, [activeSection]: updated };
        await Data.saveDictionaries(newDicts);
        setDicts(newDicts);
        setNewKey('');
        showToast("Entry Added");
    };

    const deleteEntry = async (key: string) => {
        const current = dicts[activeSection] || [];
        const updated = current.filter((e: any) => e.key !== key);
        const newDicts = { ...dicts, [activeSection]: updated };
        await Data.saveDictionaries(newDicts);
        setDicts(newDicts);
    };

    return (
        <div className="space-y-6 animate-slide-up h-full flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('settings.dict.title')}</h3>
                <div className="flex bg-[var(--bg-input)] p-1 rounded-lg border border-[var(--border-color)]">
                    <button onClick={() => setActiveSection('brands')} className={`px-4 py-1.5 text-xs font-bold rounded-md ${activeSection === 'brands' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-secondary)]'}`}>Brands</button>
                    <button onClick={() => setActiveSection('cities')} className={`px-4 py-1.5 text-xs font-bold rounded-md ${activeSection === 'cities' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-secondary)]'}`}>Cities</button>
                </div>
            </div>

            <div className="flex gap-2 shrink-0">
                <input className="input" placeholder={`New ${activeSection} key...`} value={newKey} onChange={e => setNewKey(e.target.value)} />
                <button onClick={addEntry} className="btn-primary">Add</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
                {(dicts[activeSection] || []).map((entry: any) => (
                    <div key={entry.key} className="panel p-3 flex justify-between items-center hover:bg-[var(--bg-input)]">
                        <span className="font-bold text-sm text-[var(--text-primary)]">{entry.key}</span>
                        <div className="flex items-center gap-4">
                            <span className="text-xs text-[var(--text-secondary)]">{entry.values?.length || 0} aliases</span>
                            <button onClick={() => deleteEntry(entry.key)} className="text-red-500 hover:bg-red-500/10 p-1.5 rounded"><Trash2 size={14} /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const TelegramDiagnosticsTab = () => {
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
                        <div className="grid grid-cols-2 gap-4 text-xs text-[var(--text-secondary)]">
                            <div className="bg-[var(--bg-input)] p-3 rounded-lg">
                                <span className="block mb-1 font-bold text-[var(--text-primary)]">Last Update ID</span>
                                {b.lastUpdateId || 0}
                            </div>
                            <div className="bg-[var(--bg-input)] p-3 rounded-lg">
                                <span className="block mb-1 font-bold text-[var(--text-primary)]">Status</span>
                                {b.active ? 'Active' : 'Stopped'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const IntegrationsTab = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const [settings, setSettings] = useState<SystemSettings>({});

    useEffect(() => { Data.getSettings().then(setSettings); }, []);

    const save = async () => {
        await Data.saveSettings(settings);
        showToast(t('integrations.toast_saved'));
    };

    const updateInteg = (platform: 'wa' | 'ig', field: string, value: any) => {
        setSettings(prev => ({
            ...prev,
            integrations: {
                ...prev.integrations,
                [platform]: { ...prev.integrations?.[platform], [field]: value }
            }
        } as any));
    };

    return (
        <div className="space-y-8 animate-slide-up max-w-2xl">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('integrations.title')}</h3>
                <button onClick={save} className="btn-primary">{t('btn.save')}</button>
            </div>

            {/* WhatsApp */}
            <div className="panel p-6 border-green-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <MessageCircle className="text-green-500" size={24} />
                    <h4 className="font-bold text-[var(--text-primary)]">WhatsApp Cloud API</h4>
                </div>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={settings.integrations?.wa?.isEnabled || false} onChange={e => updateInteg('wa', 'isEnabled', e.target.checked)} />
                        Enable Integration
                    </label>
                    <input className="input font-mono text-xs" placeholder="Access Token" value={settings.integrations?.wa?.credentials?.accessToken || ''} onChange={e => updateInteg('wa', 'credentials', { ...settings.integrations?.wa?.credentials, accessToken: e.target.value })} />
                    <input className="input font-mono text-xs" placeholder="Phone Number ID" value={settings.integrations?.wa?.credentials?.accountId || ''} onChange={e => updateInteg('wa', 'credentials', { ...settings.integrations?.wa?.credentials, accountId: e.target.value })} />
                </div>
            </div>

            {/* Instagram */}
            <div className="panel p-6 border-pink-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <MessageCircle className="text-pink-500" size={24} />
                    <h4 className="font-bold text-[var(--text-primary)]">Instagram Graph API</h4>
                </div>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={settings.integrations?.ig?.isEnabled || false} onChange={e => updateInteg('ig', 'isEnabled', e.target.checked)} />
                        Enable Integration
                    </label>
                    <input className="input font-mono text-xs" placeholder="Access Token" value={settings.integrations?.ig?.credentials?.accessToken || ''} onChange={e => updateInteg('ig', 'credentials', { ...settings.integrations?.ig?.credentials, accessToken: e.target.value })} />
                    <input className="input font-mono text-xs" placeholder="Page ID" value={settings.integrations?.ig?.credentials?.accountId || ''} onChange={e => updateInteg('ig', 'credentials', { ...settings.integrations?.ig?.credentials, accountId: e.target.value })} />
                </div>
            </div>

            {/* SendPulse */}
            <div className="panel p-6 border-blue-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <Megaphone className="text-blue-500" size={24} />
                    <h4 className="font-bold text-[var(--text-primary)]">SendPulse</h4>
                </div>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={settings.integrations?.sendpulse?.isEnabled || false} onChange={e => updateInteg('sendpulse' as any, 'isEnabled', e.target.checked)} />
                        Enable Integration
                    </label>
                    <input className="input font-mono text-xs" placeholder="Client ID" value={settings.integrations?.sendpulse?.config?.clientId || ''} onChange={e => updateInteg('sendpulse' as any, 'config', { ...settings.integrations?.sendpulse?.config, clientId: e.target.value })} />
                    <input className="input font-mono text-xs" placeholder="Client Secret" type="password" value={settings.integrations?.sendpulse?.config?.clientSecret || ''} onChange={e => updateInteg('sendpulse' as any, 'config', { ...settings.integrations?.sendpulse?.config, clientSecret: e.target.value })} />
                    <input className="input font-mono text-xs" placeholder="Address Book ID" value={settings.integrations?.sendpulse?.config?.addressBookId || ''} onChange={e => updateInteg('sendpulse' as any, 'config', { ...settings.integrations?.sendpulse?.config, addressBookId: e.target.value })} />
                </div>
            </div>
        </div>
    );
};

const VersionsTab = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const [snapshots, setSnapshots] = useState<ConfigSnapshot[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const buildVersion = (import.meta as any).env.VITE_BUILD_ID || (import.meta as any).env.MODE || "dev";

    useEffect(() => {
        loadSnapshots();
    }, []);

    const loadSnapshots = () => {
        setSnapshots(VersionSnapshots.list());
    };

    const handleCreate = () => {
        const name = prompt("Snapshot Name (e.g. 'Prod Config V1'):");
        if (!name) return;
        VersionSnapshots.create(name, "User created snapshot");
        showToast("Snapshot Created");
        loadSnapshots();
    };

    const handleRestore = (id: string) => {
        if (!confirm("Restore this configuration? The page will reload.")) return;
        if (VersionSnapshots.restore(id)) {
            showToast("Configuration Restored");
            setTimeout(() => window.location.reload(), 500);
        } else {
            showToast("Failed to restore", 'error');
        }
    };

    const handleDelete = (id: string) => {
        if (!confirm("Delete snapshot?")) return;
        VersionSnapshots.delete(id);
        loadSnapshots();
    };

    const handleExport = () => {
        const dataStr = VersionSnapshots.export();
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cartie_ui_versions_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const success = VersionSnapshots.import(ev.target?.result as string);
            if (success) {
                showToast("Snapshots Imported");
                loadSnapshots();
            } else {
                showToast("Import failed", 'error');
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    return (
        <div className="space-y-8 animate-slide-up max-w-3xl">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('settings.versions.title')}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        {t('settings.versions.desc')}
                    </p>
                </div>
                <div className="text-xs bg-[var(--bg-input)] px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] font-mono flex items-center gap-2">
                    <Info size={12} /> Build: {buildVersion}
                </div>
            </div>

            <div className="flex gap-3">
                <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
                    <Plus size={16} /> {t('settings.versions.create')}
                </button>
                <div className="h-full w-px bg-[var(--border-color)] mx-2"></div>
                <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
                    <Download size={16} /> {t('settings.versions.export')}
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary flex items-center gap-2">
                    <Upload size={16} /> {t('settings.versions.import')}
                </button>
                <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
            </div>

            <div className="space-y-3">
                {snapshots.length === 0 && (
                    <div className="p-8 text-center text-[var(--text-secondary)] border border-dashed border-[var(--border-color)] rounded-xl">
                        No snapshots saved.
                    </div>
                )}
                {snapshots.map(s => (
                    <div key={s.id} className="panel p-4 flex justify-between items-center hover:border-gold-500/30 transition-all">
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[var(--text-primary)]">{s.name}</h4>
                                <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-input)] px-2 py-0.5 rounded border border-[var(--border-color)]">
                                    {new Date(s.createdAt).toLocaleString()}
                                </span>
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] mt-1 font-mono">
                                API: {s.payload.apiBase || '(Default)'}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleRestore(s.id)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 hover:text-green-500 hover:border-green-500/30">
                                <RotateCcw size={14} /> Restore
                            </button>
                            <button onClick={() => handleDelete(s.id)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 hover:text-red-500 hover:border-red-500/30">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ApiConnectionTab = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const [baseUrl, setBaseUrl] = useState(getApiBase());
    const [status, setStatus] = useState<'IDLE' | 'CHECKING' | 'OK' | 'ERROR'>('IDLE');

    const handleSave = () => {
        setApiBase(baseUrl);
        showToast("API Base URL Updated. Reloading...");
        setTimeout(() => window.location.reload(), 500);
    };

    const checkHealth = async () => {
        setStatus('CHECKING');
        try {
            // Temporarily use current input for test
            const original = getApiBase();
            setApiBase(baseUrl);
            const res = await ApiClient.get('/health');
            setApiBase(original); // revert

            if (res.ok) setStatus('OK');
            else setStatus('ERROR');
        } catch {
            setStatus('ERROR');
        }
    };

    return (
        <div className="space-y-8 animate-slide-up max-w-2xl">
            <div>
                <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('settings.api.title')}</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">{t('settings.api.desc')}</p>
            </div>

            <div className="panel p-6 border-gold-500/20">
                <div className="space-y-4">
                    <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">{t('settings.api.base_url')}</label>
                    <div className="flex gap-2">
                        <input className="input font-mono text-sm" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://localhost:3000" />
                        <button onClick={handleSave} className="btn-primary">{t('btn.save_reload')}</button>
                    </div>
                    <div className="flex items-center gap-3 mt-4">
                        <button onClick={checkHealth} className="btn-secondary text-xs">{t('integrations.test_connection')}</button>
                        {status === 'CHECKING' && <RefreshCw size={16} className="animate-spin text-[var(--text-secondary)]" />}
                        {status === 'OK' && <span className="text-green-500 text-xs font-bold flex items-center gap-1"><CheckCircle size={14} /> {t('status.connected')}</span>}
                        {status === 'ERROR' && <span className="text-red-500 text-xs font-bold flex items-center gap-1"><AlertTriangle size={14} /> {t('status.failed')}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const BackupTab = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const [snapshots, setSnapshots] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadSnapshots();
    }, []);

    const loadSnapshots = async () => {
        const list = await Data.listSnapshots();
        setSnapshots(list);
    };

    const handleCreateSnapshot = async () => {
        const name = prompt("Backup Name:");
        if (!name) return;
        setLoading(true);
        try {
            await Data.createSnapshot(name);
            showToast("Backup Created");
            loadSnapshots();
        } catch (e: any) {
            showToast("Error creating backup", 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (id: string) => {
        if (!confirm("Are you sure? This will overwrite current data.")) return;
        setLoading(true);
        try {
            await Data.restoreSnapshot(id);
            showToast("Restored Successfully. Reloading...");
            setTimeout(() => window.location.reload(), 1000);
        } catch (e) {
            showToast("Restore failed", 'error');
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-slide-up max-w-3xl">
            <div>
                <h3 className="text-xl font-medium text-[var(--text-primary)] flex items-center gap-2">
                    <Database size={24} className="text-gold-500" /> {t('settings.backup.title')}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">{t('settings.backup.desc')}</p>
            </div>

            <button onClick={handleCreateSnapshot} disabled={loading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                {loading ? <RefreshCw className="animate-spin" /> : <Plus size={18} />} {t('settings.backup.create')}
            </button>

            <div className="space-y-3">
                {snapshots.length === 0 && <div className="text-center text-[var(--text-secondary)] py-8">{t('settings.backup.empty')}</div>}
                {snapshots.map(s => (
                    <div key={s.id} className="panel p-4 flex justify-between items-center hover:border-gold-500/30 transition-all">
                        <div>
                            <h4 className="font-bold text-[var(--text-primary)]">{s.name || s.data?.name}</h4>
                            <p className="text-xs text-[var(--text-secondary)] font-mono">{new Date(s.createdAt || s.data?.createdAt).toLocaleString()}</p>
                        </div>
                        <button onClick={() => handleRestore(s.id)} disabled={loading} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                            <RotateCcw size={14} /> {t('settings.backup.restore')}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
const GeneralTab = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const [settings, setSettings] = useState<any>({
        timezone: 'UTC',
        currency: 'USD',
        dateFormat: 'YYYY-MM-DD',
        defaultLanguage: 'EN'
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const systemSettings = await Data.getSettings();
            if (systemSettings.branding) {
                setSettings({
                    timezone: systemSettings.branding.timezone || 'UTC',
                    currency: systemSettings.branding.currency || 'USD',
                    dateFormat: systemSettings.branding.dateFormat || 'YYYY-MM-DD',
                    defaultLanguage: systemSettings.branding.defaultLanguage || 'EN'
                });
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const currentSettings = await Data.getSettings();
            await Data.saveSettings({
                ...currentSettings,
                branding: {
                    ...currentSettings.branding,
                    ...settings
                }
            });
            showToast('System settings saved successfully', 'success');
        } catch (e: any) {
            showToast(e.message || 'Failed to save settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-slide-up max-w-2xl">
            <div>
                <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('settings.general.title')}</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">{t('settings.general.desc')}</p>
            </div>

            {/* Timezone */}
            <div className="panel p-6">
                <div className="mb-4">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">{t('settings.general.timezone')}</label>
                    <select
                        className="input"
                        value={settings.timezone}
                        onChange={e => setSettings({ ...settings, timezone: e.target.value })}
                    >
                        <option value="UTC">UTC (Coordinated Universal Time)</option>
                        <option value="Europe/Kyiv">Europe/Kyiv (UTC+2/+3)</option>
                        <option value="Europe/London">Europe/London (UTC+0/+1)</option>
                        <option value="America/New_York">America/New York (UTC-5/-4)</option>
                        <option value="Asia/Dubai">Asia/Dubai (UTC+4)</option>
                    </select>
                    <p className="text-xs text-[var(--text-secondary)] mt-2">Used for displaying timestamps and scheduling content</p>
                </div>
            </div>

            {/* Currency */}
            <div className="panel p-6">
                <div className="mb-4">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">{t('settings.general.currency')}</label>
                    <select
                        className="input"
                        value={settings.currency}
                        onChange={e => setSettings({ ...settings, currency: e.target.value })}
                    >
                        <option value="USD">USD - US Dollar ($)</option>
                        <option value="EUR">EUR - Euro (€)</option>
                        <option value="UAH">UAH - Ukrainian Hryvnia (₴)</option>
                        <option value="GBP">GBP - British Pound (£)</option>
                    </select>
                    <p className="text-xs text-[var(--text-secondary)] mt-2">Used for displaying prices in inventory and requests</p>
                </div>
            </div>

            {/* Date Format */}
            <div className="panel p-6">
                <div className="mb-4">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">{t('settings.general.date_format')}</label>
                    <select
                        className="input"
                        value={settings.dateFormat}
                        onChange={e => setSettings({ ...settings, dateFormat: e.target.value })}
                    >
                        <option value="YYYY-MM-DD">YYYY-MM-DD (2024-01-20)</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY (20/01/2024)</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY (01/20/2024)</option>
                        <option value="DD.MM.YYYY">DD.MM.YYYY (20.01.2024)</option>
                    </select>
                    <p className="text-xs text-[var(--text-secondary)] mt-2">Format for displaying dates throughout the system</p>
                </div>
            </div>

            {/* Default Language */}
            <div className="panel p-6">
                <div className="mb-4">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">{t('settings.general.language')}</label>
                    <select
                        className="input"
                        value={settings.defaultLanguage}
                        onChange={e => setSettings({ ...settings, defaultLanguage: e.target.value })}
                    >
                        <option value="EN">English (EN)</option>
                        <option value="UK">Українська (UK)</option>
                        <option value="RU">Русский (RU)</option>
                    </select>
                    <p className="text-xs text-[var(--text-secondary)] mt-2">Default language for new users and public pages</p>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="btn-primary px-8 py-3"
                >
                    {loading ? 'Saving...' : t('settings.general.save')}
                </button>
            </div>
        </div>
    );
};
