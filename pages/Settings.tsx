
import React, { useState, useEffect, useRef } from 'react';
import { VersionSnapshots, ConfigSnapshot } from '../services/versionSnapshots';
import { User, UserRole, FeatureKey, SystemSettings } from '../types';
import { useLang } from '../contexts/LanguageContext';
import { User as UserIcon, Layers, Cpu, Terminal, Book, Plus, CheckCircle, X, ToggleLeft, ToggleRight, MessageCircle, Briefcase, Search, GitMerge, Megaphone, HardDrive, Download, Upload, RefreshCw, AlertTriangle, Clock, Trash2, RotateCcw, Globe, Server, Database, History, Info, Lock } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { TelegramAPI } from '../services/telegram';
import { ApiClient } from '../services/apiClient';
import { getApiBase, setApiBase } from '../services/apiConfig';
import { Data } from '../services/data';

export const SettingsPage = () => {
    const [activeTab, setActiveTab] = useState<'USERS' | 'INTEGRATIONS' | 'TG' | 'FEATURES' | 'DICT' | 'BACKUP' | 'API' | 'VERSIONS'>('USERS');
    const { t } = useLang();
    const { user } = useAuth();

    return (
        <div className="space-y-8 max-w-7xl mx-auto h-[calc(100vh-120px)] flex flex-col">
            <div>
                <h1 className="text-2xl font-medium text-[var(--text-primary)] tracking-tight">{t('nav.settings')}</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">System configuration</p>
            </div>
            
            <div className="panel overflow-hidden flex-1 flex flex-col md:flex-row shadow-2xl">
                {/* Sidebar */}
                <div className="w-full md:w-72 bg-[var(--bg-input)] border-r border-[var(--border-color)] p-6 space-y-8 shrink-0">
                    <div>
                        <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3 px-3">Connectivity</div>
                        <div className="space-y-1">
                            <NavButton active={activeTab === 'API'} onClick={() => setActiveTab('API')} icon={Server} label="API & Data Source" />
                            <NavButton active={activeTab === 'TG'} onClick={() => setActiveTab('TG')} icon={Terminal} label="Telegram Logs" />
                            <NavButton active={activeTab === 'INTEGRATIONS'} onClick={() => setActiveTab('INTEGRATIONS')} icon={Layers} label="Integrations" />
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3 px-3">Organization</div>
                        <div className="space-y-1">
                            <NavButton active={activeTab === 'USERS'} onClick={() => setActiveTab('USERS')} icon={UserIcon} label={t('settings.users')} />
                            {user?.role === 'SUPER_ADMIN' && (
                                <NavButton active={activeTab === 'FEATURES'} onClick={() => setActiveTab('FEATURES')} icon={Cpu} label="Features" />
                            )}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3 px-3">System</div>
                        <div className="space-y-1">
                            <NavButton active={activeTab === 'BACKUP'} onClick={() => setActiveTab('BACKUP')} icon={HardDrive} label="Data Backup" />
                            <NavButton active={activeTab === 'VERSIONS'} onClick={() => setActiveTab('VERSIONS')} icon={History} label="Config Versions" />
                            <NavButton active={activeTab === 'DICT'} onClick={() => setActiveTab('DICT')} icon={Book} label="Dictionaries" />
                        </div>
                    </div>
                </div>
                
                {/* Content */}
                <div className="flex-1 p-10 overflow-y-auto bg-[var(--bg-app)]/50">
                    {activeTab === 'USERS' && <UsersTab />}
                    {activeTab === 'INTEGRATIONS' && <IntegrationsTab />}
                    {activeTab === 'TG' && <TelegramDiagnosticsTab />}
                    {activeTab === 'FEATURES' && user?.role === 'SUPER_ADMIN' && <FeaturesTab />}
                    {activeTab === 'DICT' && <DictionariesTab />}
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
        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-3 transition-all ${
            active 
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
    const [formData, setFormData] = useState({ username: '', password: '', role: 'OPERATOR', name: '', telegramUserId: '', companyId: '' });
    const { showToast } = useToast();

    useEffect(() => {
        load();
    }, []);

    const load = () => Data.getUsers().then(setUsers);

    const handleCreate = async () => {
        if (!formData.username || !formData.password) return showToast("Fields required", 'error');
        await Data.saveUser({
            id: `u_${Date.now()}`,
            name: formData.name || formData.username,
            email: `${formData.username}@cartie.local`,
            username: formData.username,
            telegramUserId: formData.telegramUserId || undefined,
            companyId: formData.companyId || undefined,
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
                <h3 className="text-xl font-medium text-[var(--text-primary)]">Team Members</h3>
                <button onClick={() => setIsModalOpen(true)} className="btn-primary">
                    <Plus size={18}/> Add User
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
                            <h3 className="font-bold text-2xl text-[var(--text-primary)]">New User</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={20}/></button>
                        </div>
                        <div className="space-y-4">
                            <input className="input" placeholder="Display Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            <input className="input" placeholder="Username" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                            <input className="input" type="password" placeholder="Password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                            <input className="input" placeholder="Telegram User ID (optional)" value={formData.telegramUserId} onChange={e => setFormData({...formData, telegramUserId: e.target.value})} />
                            <input className="input" placeholder="Company ID (optional)" value={formData.companyId} onChange={e => setFormData({...formData, companyId: e.target.value})} />
                            <select className="input" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                                <option value="OPERATOR">Operator</option>
                                <option value="MANAGER">Manager</option>
                                <option value="ADMIN">Admin</option>
                                <option value="DEALER">Dealer</option>
                            </select>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="btn-ghost">Cancel</button>
                            <button onClick={handleCreate} className="btn-primary">Create</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const FeaturesTab = () => {
    const { showToast } = useToast();
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

    const FEATURES: {key: FeatureKey, label: string, desc: string}[] = [
        { key: 'MODULE_SCENARIOS', label: 'Visual Scenario Builder', desc: 'Drag-and-drop flow editor for bots' },
        { key: 'MODULE_SEARCH', label: 'Global Search', desc: 'External parsing integration' },
        { key: 'MODULE_CAMPAIGNS', label: 'Broadcast Campaigns', desc: 'Bulk messaging tools' },
        { key: 'MODULE_COMPANIES', label: 'Partner Network', desc: 'Company management module' }
    ];

    return (
        <div className="space-y-6 animate-slide-up">
            <div>
                <h3 className="text-xl font-medium text-[var(--text-primary)]">System Modules</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">Enable or disable core functionality.</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
                {FEATURES.map(f => (
                    <div key={f.key} className="panel p-5 flex justify-between items-center">
                        <div>
                            <div className="font-bold text-[var(--text-primary)]">{f.label}</div>
                            <div className="text-xs text-[var(--text-secondary)]">{f.desc}</div>
                        </div>
                        <button onClick={() => toggle(f.key)} className={`text-2xl transition-colors ${settings.features?.[f.key] ? 'text-green-500' : 'text-[var(--text-muted)]'}`}>
                            {settings.features?.[f.key] ? <ToggleRight size={32}/> : <ToggleLeft size={32}/>}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

const DictionariesTab = () => {
    const { showToast } = useToast();
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
                <h3 className="text-xl font-medium text-[var(--text-primary)]">Dictionaries</h3>
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
                            <button onClick={() => deleteEntry(entry.key)} className="text-red-500 hover:bg-red-500/10 p-1.5 rounded"><Trash2 size={14}/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const TelegramDiagnosticsTab = () => {
    const { showToast } = useToast();
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
            <h3 className="text-xl font-medium text-[var(--text-primary)]">Telegram Diagnostics</h3>
            <div className="space-y-4">
                {bots.map(b => (
                    <div key={b.id} className="panel p-5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 className="font-bold text-[var(--text-primary)]">{b.name}</h4>
                                <code className="text-xs text-[var(--text-secondary)] bg-[var(--bg-input)] px-2 py-1 rounded">{b.token.substring(0,10)}...</code>
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
    const [settings, setSettings] = useState<SystemSettings>({});

    useEffect(() => { Data.getSettings().then(setSettings); }, []);

    const save = async () => {
        await Data.saveSettings(settings);
        showToast("Integrations saved");
    };

    const updateInteg = (platform: 'wa'|'ig', field: string, value: any) => {
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
                <h3 className="text-xl font-medium text-[var(--text-primary)]">Meta Integrations</h3>
                <button onClick={save} className="btn-primary">Save Changes</button>
            </div>

            {/* WhatsApp */}
            <div className="panel p-6 border-green-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <MessageCircle className="text-green-500" size={24}/>
                    <h4 className="font-bold text-[var(--text-primary)]">WhatsApp Cloud API</h4>
                </div>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={settings.integrations?.wa?.isEnabled || false} onChange={e => updateInteg('wa', 'isEnabled', e.target.checked)}/>
                        Enable Integration
                    </label>
                    <input className="input font-mono text-xs" placeholder="Access Token" value={settings.integrations?.wa?.credentials?.accessToken || ''} onChange={e => updateInteg('wa', 'credentials', {...settings.integrations?.wa?.credentials, accessToken: e.target.value})}/>
                    <input className="input font-mono text-xs" placeholder="Phone Number ID" value={settings.integrations?.wa?.credentials?.accountId || ''} onChange={e => updateInteg('wa', 'credentials', {...settings.integrations?.wa?.credentials, accountId: e.target.value})}/>
                </div>
            </div>

            {/* Instagram */}
            <div className="panel p-6 border-pink-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <MessageCircle className="text-pink-500" size={24}/>
                    <h4 className="font-bold text-[var(--text-primary)]">Instagram Graph API</h4>
                </div>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={settings.integrations?.ig?.isEnabled || false} onChange={e => updateInteg('ig', 'isEnabled', e.target.checked)}/>
                        Enable Integration
                    </label>
                    <input className="input font-mono text-xs" placeholder="Access Token" value={settings.integrations?.ig?.credentials?.accessToken || ''} onChange={e => updateInteg('ig', 'credentials', {...settings.integrations?.ig?.credentials, accessToken: e.target.value})}/>
                    <input className="input font-mono text-xs" placeholder="Page ID" value={settings.integrations?.ig?.credentials?.accountId || ''} onChange={e => updateInteg('ig', 'credentials', {...settings.integrations?.ig?.credentials, accountId: e.target.value})}/>
                </div>
            </div>
        </div>
    );
};

const VersionsTab = () => {
    const { showToast } = useToast();
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
                    <h3 className="text-xl font-medium text-[var(--text-primary)]">Configuration Versions</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Save and restore UI settings (API URL, Theme, Language preferences). 
                        Useful for switching between environments.
                    </p>
                </div>
                <div className="text-xs bg-[var(--bg-input)] px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] font-mono flex items-center gap-2">
                    <Info size={12}/> Build: {buildVersion}
                </div>
            </div>

            <div className="flex gap-3">
                <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
                    <Plus size={16}/> Create Snapshot
                </button>
                <div className="h-full w-px bg-[var(--border-color)] mx-2"></div>
                <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
                    <Download size={16}/> Export
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary flex items-center gap-2">
                    <Upload size={16}/> Import
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
                                <RotateCcw size={14}/> Restore
                            </button>
                            <button onClick={() => handleDelete(s.id)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 hover:text-red-500 hover:border-red-500/30">
                                <Trash2 size={14}/>
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
                <h3 className="text-xl font-medium text-[var(--text-primary)]">API Connection</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">Configure backend connectivity.</p>
            </div>

            <div className="panel p-6 border-gold-500/20">
                <div className="space-y-4">
                    <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">API Base URL</label>
                    <div className="flex gap-2">
                        <input className="input font-mono text-sm" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://localhost:3000" />
                        <button onClick={handleSave} className="btn-primary">Save & Reload</button>
                    </div>
                    <div className="flex items-center gap-3 mt-4">
                        <button onClick={checkHealth} className="btn-secondary text-xs">Test Connection</button>
                        {status === 'CHECKING' && <RefreshCw size={16} className="animate-spin text-[var(--text-secondary)]"/>}
                        {status === 'OK' && <span className="text-green-500 text-xs font-bold flex items-center gap-1"><CheckCircle size={14}/> Connected</span>}
                        {status === 'ERROR' && <span className="text-red-500 text-xs font-bold flex items-center gap-1"><AlertTriangle size={14}/> Connection Failed</span>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const BackupTab = () => {
    const { showToast } = useToast();
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
                    <Database size={24} className="text-gold-500"/> Full Data Backups
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">Version control for your application data.</p>
            </div>

            <button onClick={handleCreateSnapshot} disabled={loading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                {loading ? <RefreshCw className="animate-spin"/> : <Plus size={18}/>} Create New Data Backup
            </button>

            <div className="space-y-3">
                {snapshots.length === 0 && <div className="text-center text-[var(--text-secondary)] py-8">No backups found.</div>}
                {snapshots.map(s => (
                    <div key={s.id} className="panel p-4 flex justify-between items-center hover:border-gold-500/30 transition-all">
                        <div>
                            <h4 className="font-bold text-[var(--text-primary)]">{s.name || s.data?.name}</h4>
                            <p className="text-xs text-[var(--text-secondary)] font-mono">{new Date(s.createdAt || s.data?.createdAt).toLocaleString()}</p>
                        </div>
                        <button onClick={() => handleRestore(s.id)} disabled={loading} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                            <RotateCcw size={14}/> Restore
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
