
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, FeatureKey, SystemSettings } from '../../types';
import { useLang } from '../../contexts/LanguageContext';
import {
    User as UserIcon, Layers, Cpu, Terminal, Book, HardDrive, History,
    Settings as SettingsIcon, Shield, Server, Trash2, Plus, Download,
    Upload, Info, RotateCcw, RefreshCw, CheckCircle, AlertTriangle, Database
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Data } from '../../services/data';
import { ApiClient } from '../../services/apiClient';
import { TelegramAPI } from '../../services/telegram';
import { getApiBase, setApiBase } from '../../services/apiConfig';
import { UsersTab } from './settings/UsersTab';
import { IntegrationsTab } from './settings/IntegrationsTab';
import { SuperAdminTab, FeaturesTab, TelegramDiagnosticsTab } from './settings/SuperAdminTabs';
import { PageHeader } from '../../components/ui/PageHeader';
// Reuse existing internal components or move them too
import { VersionSnapshots, ConfigSnapshot } from '../../services/versionSnapshots'; // Assuming these exist, kept internal to Settings if not moved yet.
// Actually, VersionsTab was large. Let's keep it here for now or import everything if I extracted it. I missed extracting VersionsTab. I'll stub it or inline simplified version.

export const SettingsPage = () => {
    const [activeTab, setActiveTab] = useState<'USERS' | 'INTEGRATIONS' | 'TG' | 'FEATURES' | 'DICT' | 'BACKUP' | 'API' | 'VERSIONS' | 'SUPERADMIN' | 'GENERAL' | 'PARSER'>('USERS');
    const { t } = useLang();
    const { user } = useAuth();

    return (
        <div className="space-y-8 max-w-7xl mx-auto h-[calc(100vh-120px)] flex flex-col">
            <PageHeader title={t('nav.settings')} subtitle={t('settings.subtitle')} />

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
                            <NavButton active={activeTab === 'PARSER'} onClick={() => setActiveTab('PARSER')} icon={Database} label="Parser" />
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
                    {activeTab === 'GENERAL' && <GeneralTab />}

                    {activeTab === 'DICT' && <DictionariesTab />}
                    {activeTab === 'BACKUP' && <BackupTab />}
                    {activeTab === 'API' && <ApiTab />}
                    {activeTab === 'VERSIONS' && <VersionsTab />}
                    {activeTab === 'PARSER' && <ParserTab />}
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

const ParserTab = () => {
    const { showToast } = useToast();
    const [url, setUrl] = useState('');
    const [preview, setPreview] = useState<any | null>(null);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);

    const fieldOptions = ['title', 'description', 'price', 'currency', 'mileage', 'year', 'vin', 'city', 'photos', 'url', 'custom'];

    const handlePreview = async () => {
        if (!url.trim()) return;
        setLoading(true);
        try {
            const res = await Data.previewParser(url.trim());
            setPreview(res);
            setMapping(res.cachedMapping || {});
            showToast('Preview ready', 'success');
        } catch (e: any) {
            showToast(e.message || 'Preview failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!preview?.domain) return;
        try {
            await Data.saveParserMapping(preview.domain, mapping, true);
            showToast('Mapping saved', 'success');
        } catch (e: any) {
            showToast(e.message || 'Save failed', 'error');
        }
    };

    const detectedVars = Object.entries(preview?.variables || {});

    return (
        <div className="space-y-6 animate-slide-up max-w-5xl">
            <div className="panel p-5 flex flex-col md:flex-row gap-3 items-end md:items-center">
                <div className="flex-1 w-full">
                    <label className="text-xs font-bold text-[var(--text-secondary)]">Car page URL</label>
                    <input className="input mt-1" placeholder="https://example.com/car/123" value={url} onChange={e => setUrl(e.target.value)} />
                </div>
                <button onClick={handlePreview} className="btn-primary w-full md:w-auto" disabled={loading}>{loading ? 'Parsing...' : 'Preview'}</button>
            </div>

            {preview && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="panel p-4 space-y-2">
                        <div className="text-xs uppercase font-bold text-[var(--text-secondary)]">Detected</div>
                        <div className="text-sm text-[var(--text-primary)] break-all">{preview.url}</div>
                        <div className="text-xs text-[var(--text-secondary)]">Domain: {preview.domain}</div>
                        <div className="text-xs text-[var(--text-secondary)]">Images: {preview.images?.length || 0}</div>
                    </div>
                    <div className="panel p-4 lg:col-span-2 space-y-3">
                        <div className="flex justify-between items-center">
                            <div>
                                <div className="text-xs uppercase font-bold text-[var(--text-secondary)]">Mapping</div>
                                <div className="text-sm text-[var(--text-muted)]">Assign detected fields to your schema. Saved per domain.</div>
                            </div>
                            <button onClick={handleSave} className="btn-primary text-sm">Save mapping</button>
                        </div>
                        <div className="space-y-3">
                            {detectedVars.length === 0 && <div className="text-sm text-[var(--text-secondary)]">No variables detected.</div>}
                            {detectedVars.map(([key, value]) => (
                                <div key={key} className="flex flex-col md:flex-row md:items-center gap-3 bg-[var(--bg-input)] border border-[var(--border-color)] p-3 rounded-xl">
                                    <div className="w-full md:w-48">
                                        <div className="text-xs font-bold text-[var(--text-secondary)] uppercase">{key}</div>
                                        <div className="text-sm text-[var(--text-primary)] truncate">{String(value ?? '') || '—'}</div>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] uppercase text-[var(--text-secondary)]">Map to</label>
                                        <div className="flex gap-2">
                                            <select className="input w-40" value={mapping[key] || key} onChange={e => setMapping(prev => ({ ...prev, [key]: e.target.value }))}>
                                                {fieldOptions.map(opt => <option key={opt} value={opt === 'custom' ? '' : opt}>{opt === 'custom' ? 'Custom…' : opt}</option>)}
                                            </select>
                                            <input className="input flex-1" placeholder="Custom field (optional)" value={mapping[key] && !fieldOptions.includes(mapping[key]) ? mapping[key] : ''} onChange={e => setMapping(prev => ({ ...prev, [key]: e.target.value }))} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
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
