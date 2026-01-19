
import React, { useState, useEffect, useMemo } from 'react';
import { Data } from '../services/data';
import { TelegramAPI } from '../services/telegram';
import { useToast } from '../contexts/ToastContext';
import { Bot, Scenario, BotMenuButtonConfig, MiniAppConfig, Campaign, TelegramDestination, ContentStatus } from '../types';
import { 
    GitMerge, LayoutGrid, Smartphone, Plus, Trash2, Save, UploadCloud, 
    Settings, Activity, MessageSquare, Bot as BotIcon, X, Check, Eye, 
    Link, Command, Menu, Grid, List as ListIcon, Palette, Image as ImageIcon,
    Download, Upload, Play, Terminal, ArrowRight, Zap, RefreshCw, Search, 
    ExternalLink, Edit3, Wifi, AlertTriangle, Users, Megaphone, Tag, Filter,
    BarChart3, PieChart, Send, Globe, Radio
} from 'lucide-react';
import { ScenarioBuilder } from './ScenarioBuilder';
import { DEFAULT_MENU_CONFIG, DEFAULT_MINI_APP_CONFIG } from '../services/defaults';

const normalizeMenuConfig = (menuConfig?: Bot['menuConfig']) => {
    const buttonsRaw = Array.isArray(menuConfig?.buttons) ? menuConfig!.buttons : [];
    const buttons = buttonsRaw
        .filter((btn: any) => btn && typeof btn === 'object')
        .map((btn: any, idx: number) => ({
            ...btn,
            id: btn.id || `btn_${idx}`,
            label: typeof btn.label === 'string' ? btn.label.trim() : '',
            label_uk: typeof btn.label_uk === 'string' ? btn.label_uk : undefined,
            label_ru: typeof btn.label_ru === 'string' ? btn.label_ru : undefined,
            row: Number.isFinite(Number(btn.row)) ? Number(btn.row) : 0,
            col: Number.isFinite(Number(btn.col)) ? Number(btn.col) : idx
        }));

    return {
        welcomeMessage: menuConfig?.welcomeMessage || '',
        buttons
    };
};

export const TelegramHub = () => {
    const [bots, setBots] = useState<Bot[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
    const [isAddBotOpen, setIsAddBotOpen] = useState(false);
    const { showToast } = useToast();
    
    useEffect(() => {
        const load = async () => {
            const list = await Data.getBots();
            setBots(list);
            if (list.length > 0 && !selectedBotId) {
                const active = list.find(b => b.active);
                setSelectedBotId(active ? active.id : list[0].id);
            }
        };
        load();
        const sub = Data.subscribe('UPDATE_BOTS', load);
        return sub;
    }, []);

    const selectedBot = bots.find(b => b.id === selectedBotId);

    return (
        <div className="flex h-[calc(100vh-100px)] gap-6">
            {/* Sidebar */}
            <div className="w-72 panel p-0 overflow-hidden flex flex-col shrink-0 bg-[var(--bg-panel)]">
                <div className="p-5 border-b border-[var(--border-color)] bg-[var(--bg-input)] flex justify-between items-center">
                    <h3 className="font-bold text-[var(--text-primary)]">My Bots</h3>
                    <button onClick={() => setIsAddBotOpen(true)} className="p-1.5 rounded hover:bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-gold-500 transition-colors">
                        <Plus size={18}/>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {bots.map(bot => (
                        <button 
                            key={bot.id} 
                            onClick={() => setSelectedBotId(bot.id)}
                            className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all group ${selectedBotId === bot.id ? 'bg-gold-500/10 border border-gold-500/30' : 'hover:bg-[var(--bg-input)] border border-transparent'}`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${selectedBotId === bot.id ? 'bg-gold-500 text-black border-gold-500' : 'bg-[var(--bg-app)] text-[var(--text-secondary)] border-[var(--border-color)]'}`}>
                                <BotIcon size={20}/>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`font-bold text-sm truncate ${selectedBotId === bot.id ? 'text-gold-500' : 'text-[var(--text-primary)]'}`}>{bot.name}</div>
                                <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${bot.active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    {bot.active ? 'Active' : 'Stopped'}
                                </div>
                                {!bot.active && <div className="text-[10px] text-red-500 mt-1">Bot is stopped</div>}
                            </div>
                        </button>
                    ))}
                    {bots.length === 0 && (
                        <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                            No bots connected.
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0 flex flex-col h-full">
                {selectedBot ? (
                    <BotDashboard bot={selectedBot} />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)] panel opacity-50">
                        <BotIcon size={64} className="mb-4"/>
                        <p>Select or add a bot to manage</p>
                    </div>
                )}
            </div>

            {isAddBotOpen && <AddBotModal onClose={() => setIsAddBotOpen(false)} />}
        </div>
    );
};

const BotDashboard = ({ bot }: { bot: Bot }) => {
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CAMPAIGNS' | 'AUDIENCE' | 'AUTOMATION' | 'SETTINGS'>('OVERVIEW');
    
    return (
        <div className="flex flex-col h-full gap-4">
            <div className="panel p-2 flex items-center justify-between shrink-0">
                <div className="flex gap-1 overflow-x-auto hide-scrollbar">
                    <TabBtn active={activeTab === 'OVERVIEW'} onClick={() => setActiveTab('OVERVIEW')} icon={Activity} label="Overview" />
                    <TabBtn active={activeTab === 'CAMPAIGNS'} onClick={() => setActiveTab('CAMPAIGNS')} icon={Megaphone} label="Broadcasts" />
                    <TabBtn active={activeTab === 'AUDIENCE'} onClick={() => setActiveTab('AUDIENCE')} icon={Users} label="Audience" />
                    <div className="w-px h-6 bg-[var(--border-color)] mx-2 self-center"></div>
                    <TabBtn active={activeTab === 'AUTOMATION'} onClick={() => setActiveTab('AUTOMATION')} icon={GitMerge} label="Automation" />
                    <TabBtn active={activeTab === 'SETTINGS'} onClick={() => setActiveTab('SETTINGS')} icon={Settings} label="Config" />
                </div>
                <div className="px-4 text-xs font-mono text-[var(--text-secondary)] hidden lg:block">
                    @{bot.username}
                </div>
            </div>

            <div className="flex-1 panel overflow-hidden p-0 relative bg-[var(--bg-app)] border border-[var(--border-color)]">
                {activeTab === 'OVERVIEW' && <BotOverview bot={bot} />}
                {activeTab === 'CAMPAIGNS' && <CampaignManager bot={bot} />}
                {activeTab === 'AUDIENCE' && <AudienceManager bot={bot} />}
                {activeTab === 'AUTOMATION' && <AutomationSuite bot={bot} />}
                {activeTab === 'SETTINGS' && <BotSettings bot={bot} />}
            </div>
        </div>
    );
};

const TabBtn = ({ active, onClick, icon: Icon, label }: any) => (
    <button 
        onClick={onClick}
        className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${active ? 'bg-[var(--bg-input)] text-[var(--text-primary)] shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'}`}
    >
        <Icon size={16} className={active ? 'text-gold-500' : ''}/> {label}
    </button>
);

// --- 1. OVERVIEW (STATS) ---
const BotOverview = ({ bot }: { bot: Bot }) => {
    const stats = bot.stats || { processed: 0, ignored: 0, errors: 0, lastRun: '' };
    const [destinations, setDestinations] = useState<TelegramDestination[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [messages, setMessages] = useState<TelegramMessage[]>([]);

    useEffect(() => {
        Data.getDestinations().then(setDestinations);
        Data.getCampaigns().then(all => setCampaigns(all.filter(c => c.botId === bot.id)));
        Data.getMessages().then(setMessages);
    }, [bot.id]);
    
    return (
        <div className="p-8 overflow-y-auto h-full">
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Performance Overview</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Total Subscribers" value={destinations.length} icon={Users} color="text-blue-500" />
                <StatCard title="Messages Processed" value={messages.length} icon={MessageSquare} color="text-green-500" />
                <StatCard title="Active Campaigns" value={campaigns.filter(c => c.status === 'RUNNING').length} icon={Megaphone} color="text-gold-500" />
                <StatCard title="Errors" value={stats.errors} icon={AlertTriangle} color="text-red-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="panel p-6">
                    <h3 className="font-bold text-[var(--text-primary)] mb-4">Recent Campaigns</h3>
                    <div className="space-y-3">
                        {campaigns.slice(0, 5).map(c => (
                            <div key={c.id} className="flex justify-between items-center p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)]">
                                <div>
                                    <div className="font-bold text-sm text-[var(--text-primary)]">{c.name}</div>
                                    <div className="text-xs text-[var(--text-secondary)] mt-1">
                                        Sent: {c.progress.sent} / {c.progress.total}
                                    </div>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
                                    c.status === 'RUNNING' ? 'bg-blue-500/20 text-blue-500' :
                                    c.status === 'COMPLETED' ? 'bg-green-500/20 text-green-500' : 'bg-gray-500/20 text-gray-500'
                                }`}>{c.status}</span>
                            </div>
                        ))}
                        {campaigns.length === 0 && <div className="text-center text-[var(--text-secondary)] text-sm py-4">No campaigns yet</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="panel p-5 flex items-center gap-4">
        <div className={`p-3 rounded-xl bg-[var(--bg-input)] ${color}`}>
            <Icon size={24} />
        </div>
        <div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">{value}</div>
            <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">{title}</div>
        </div>
    </div>
);

// --- 2. CAMPAIGN MANAGER ---
const CampaignManager = ({ bot }: { bot: Bot }) => {
    const { showToast } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    useEffect(() => {
        const load = async () => {
            const all = await Data.getCampaigns();
            setCampaigns(all.filter(c => c.botId === bot.id).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        };
        load();
        const sub = Data.subscribe('UPDATE_CAMPAIGNS', load);
        return sub;
    }, [bot.id]);

    const handleCreate = async (data: any) => {
        const allDestinations = await Data.getDestinations();
        let targets = allDestinations;
        if (data.tag && data.tag !== 'ALL') {
            targets = allDestinations.filter(d => d.tags.includes(data.tag));
        }

        if (!targets.length) {
            showToast("No destinations found for this audience", "error");
            return;
        }
        if (!data.message?.trim()) {
            showToast("Message is required", "error");
            return;
        }

        const content = await Data.saveContent({
            id: `cnt_${Date.now()}`,
            title: `Content for ${data.name}`,
            body: data.message,
            type: 'POST',
            status: ContentStatus.APPROVED,
            createdAt: new Date().toISOString()
        } as any);

        await Data.createCampaign({
            name: data.name,
            botId: bot.id,
            contentId: content.id,
            destinationIds: targets.map(d => d.id),
            status: 'RUNNING'
        });

        setIsCreateOpen(false);
        showToast(`Campaign started with ${targets.length} recipients`);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-panel)]">
                <div>
                    <h3 className="font-bold text-lg text-[var(--text-primary)]">Broadcast Campaigns</h3>
                    <p className="text-xs text-[var(--text-secondary)]">Manage bulk messaging</p>
                </div>
                <button onClick={() => setIsCreateOpen(true)} className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
                    <Plus size={16}/> New Campaign
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 gap-4">
                {campaigns.map(camp => (
                    <div key={camp.id} className="panel p-5 flex flex-col gap-4 border-l-4 border-l-gold-500">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-[var(--text-primary)] text-lg">{camp.name}</h4>
                                <div className="text-xs text-[var(--text-secondary)] mt-1 flex gap-3">
                                    <span>Created: {new Date(camp.createdAt).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span>Status: <b className={camp.status === 'RUNNING' ? 'text-blue-500' : 'text-green-500'}>{camp.status}</b></span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
                                    {Math.round((camp.progress.sent / (camp.progress.total || 1)) * 100)}%
                                </div>
                                <div className="text-xs text-[var(--text-secondary)]">Completion</div>
                            </div>
                        </div>
                        <div className="h-2 w-full bg-[var(--bg-input)] rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-500 ${camp.status === 'FAILED' ? 'bg-red-500' : 'bg-gold-500'}`} style={{ width: `${(camp.progress.sent / (camp.progress.total || 1)) * 100}%` }}></div>
                        </div>
                        <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
                            <div className="flex items-center gap-1"><Check size={14} className="text-green-500"/> {camp.progress.sent} Sent</div>
                            <div className="flex items-center gap-1"><AlertTriangle size={14} className="text-red-500"/> {camp.progress.failed} Failed</div>
                            <div className="flex items-center gap-1"><Users size={14} className="text-blue-500"/> {camp.progress.total} Total</div>
                        </div>
                    </div>
                ))}
            </div>
            {isCreateOpen && <CreateCampaignModal onClose={() => setIsCreateOpen(false)} onCreate={handleCreate} />}
        </div>
    );
};

const CreateCampaignModal = ({ onClose, onCreate }: any) => {
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [tag, setTag] = useState('ALL');
    const [tags, setTags] = useState<string[]>([]);

    useEffect(() => {
        Data.getDestinations().then(dests => {
            setTags(Array.from(new Set(dests.flatMap(d => d.tags))));
        });
    }, []);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel w-full max-w-lg p-8 animate-slide-up shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-[var(--text-primary)]">New Broadcast</h3>
                    <button onClick={onClose}><X size={20} className="text-[var(--text-secondary)]"/></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Campaign Name</label>
                        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly Promo" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Audience Segment</label>
                        <select className="input" value={tag} onChange={e => setTag(e.target.value)}>
                            <option value="ALL">All Subscribers</option>
                            {tags.map(t => <option key={t} value={t}>Tag: {t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Message</label>
                        <textarea className="textarea h-32" value={message} onChange={e => setMessage(e.target.value)} placeholder="Hello {{name}}, check out our new stock..." />
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1">Available variables: {'{{name}}'}, {'{{manager}}'}</p>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                    <button onClick={onClose} className="btn-ghost">Cancel</button>
                    <button onClick={() => onCreate({name, message, tag})} disabled={!name || !message} className="btn-primary px-6 flex items-center gap-2">
                        <Send size={16}/> Launch
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- 3. AUDIENCE MANAGER ---
const AudienceManager = ({ bot }: { bot: Bot }) => {
    const [users, setUsers] = useState<TelegramDestination[]>([]);
    const [search, setSearch] = useState('');
    const [editingUser, setEditingUser] = useState<TelegramDestination | null>(null);
    const { showToast } = useToast();

    useEffect(() => {
        const load = async () => setUsers(await Data.getDestinations());
        load();
        const sub = Data.subscribe('UPDATE_DESTINATIONS', load);
        return sub;
    }, []);

    const filtered = users.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()) || u.identifier.includes(search));

    const handleAddTag = async (tag: string) => {
        if (!editingUser || !tag.trim()) return;
        if (editingUser.tags.includes(tag)) return;
        const updated = { ...editingUser, tags: [...editingUser.tags, tag] };
        await Data.saveDestination(updated);
        setEditingUser(updated);
        showToast("Tag added");
    };

    const removeTag = async (tag: string) => {
        if (!editingUser) return;
        const updated = { ...editingUser, tags: editingUser.tags.filter(t => t !== tag) };
        await Data.saveDestination(updated);
        setEditingUser(updated);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b border-[var(--border-color)] flex gap-4 bg-[var(--bg-panel)]">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18}/>
                    <input className="input pl-10" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            </div>
            <div className="flex-1 overflow-hidden flex">
                <div className="flex-1 overflow-y-auto p-4">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[var(--text-secondary)] uppercase text-xs font-bold border-b border-[var(--border-color)]">
                            <tr>
                                <th className="p-3">User</th>
                                <th className="p-3">ID</th>
                                <th className="p-3">Tags</th>
                                <th className="p-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                            {filtered.map(u => (
                                <tr key={u.id} className="hover:bg-[var(--bg-input)] group">
                                    <td className="p-3 font-bold text-[var(--text-primary)]">{u.name}</td>
                                    <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">{u.identifier}</td>
                                    <td className="p-3">
                                        <div className="flex gap-1 flex-wrap">
                                            {u.tags.map(t => (<span key={t} className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-500/20">{t}</span>))}
                                        </div>
                                    </td>
                                    <td className="p-3 text-right">
                                        <button onClick={() => setEditingUser(u)} className="btn-secondary px-3 py-1 text-xs">Edit Tags</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {editingUser && (
                    <div className="w-80 border-l border-[var(--border-color)] bg-[var(--bg-panel)] p-6 overflow-y-auto shadow-xl z-10 animate-slide-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-[var(--text-primary)]">User Details</h3>
                            <button onClick={() => setEditingUser(null)}><X size={18} className="text-[var(--text-secondary)]"/></button>
                        </div>
                        <div className="mb-6 text-center">
                            <div className="w-16 h-16 bg-[var(--bg-input)] rounded-full mx-auto flex items-center justify-center text-2xl font-bold text-[var(--text-secondary)] mb-2 border border-[var(--border-color)]">{editingUser.name?.[0]}</div>
                            <h4 className="font-bold text-[var(--text-primary)]">{editingUser.name}</h4>
                            <p className="text-xs text-[var(--text-secondary)] font-mono">{editingUser.identifier}</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Tags</label>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {editingUser.tags.map(t => (
                                        <span key={t} className="bg-gold-500/10 text-gold-500 px-2 py-1 rounded text-xs border border-gold-500/30 flex items-center gap-1">
                                            {t}
                                            <button onClick={() => removeTag(t)}><X size={12}/></button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input className="input text-xs py-1.5" placeholder="Add tag..." onKeyDown={e => { if (e.key === 'Enter') { handleAddTag(e.currentTarget.value); e.currentTarget.value = ''; } }} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- 4. AUTOMATION SUITE (Unified) ---
const AutomationSuite = ({ bot }: { bot: Bot }) => {
    const [subTab, setSubTab] = useState<'MENU' | 'FLOWS' | 'APP'>('MENU');
    const [quickEditFlowId, setQuickEditFlowId] = useState<string | null>(null);

    const handleQuickEdit = (scenarioId: string) => {
        setQuickEditFlowId(scenarioId);
        setSubTab('FLOWS');
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
                <button onClick={() => setSubTab('MENU')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${subTab === 'MENU' ? 'border-gold-500 text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)]'}`}>Menu Commands</button>
                <button onClick={() => setSubTab('FLOWS')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${subTab === 'FLOWS' ? 'border-gold-500 text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)]'}`}>Scenario Builder</button>
                <button onClick={() => setSubTab('APP')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${subTab === 'APP' ? 'border-gold-500 text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)]'}`}>Mini App</button>
            </div>
            
            <div className="flex-1 overflow-hidden relative">
                {subTab === 'MENU' && <UnifiedMenuManager bot={bot} onEditFlow={handleQuickEdit} />}
                {subTab === 'FLOWS' && <ScenarioBuilder />}
                {subTab === 'APP' && <MiniAppManager bot={bot} />}
            </div>
        </div>
    );
};

const UnifiedMenuManager = ({ bot, onEditFlow }: { bot: Bot, onEditFlow: (id: string) => void }) => {
    const { showToast } = useToast();
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [menuConfig, setMenuConfig] = useState(() => normalizeMenuConfig(bot.menuConfig));
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => { setMenuConfig(normalizeMenuConfig(bot.menuConfig)); }, [bot.id, bot.menuConfig]);
    useEffect(() => {
        const load = async () => setScenarios(await Data.getScenarios());
        load();
        const sub = Data.subscribe('UPDATE_SCENARIOS', load);
        return sub;
    }, []);

    const save = async (newConfig: any) => {
        const normalized = normalizeMenuConfig(newConfig);
        setMenuConfig(normalized);
        const updatedBot = { ...bot, menuConfig: normalized };
        await Data.saveBot(updatedBot);
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            // Respect publicBaseUrl if set, otherwise use current origin (for localhost fallback)
            const baseUrl = bot.publicBaseUrl || window.location.origin;
            const appUrl = `${baseUrl}/#/p/app`;
            
            await TelegramAPI.setChatMenuButton(bot.token, "Open App", appUrl);
            
            const commands = scenarios.filter(s => s.isActive && s.triggerCommand).map(s => ({ command: s.triggerCommand, description: s.name }));
            commands.push({ command: 'start', description: 'Restart Bot' });
            commands.push({ command: 'menu', description: 'Open Menu' });
            
            await TelegramAPI.setMyCommands(bot.token, commands);
            showToast("Menu & Commands Synced to Telegram!");
        } catch(e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const addButton = (row: number) => {
        const newBtn: BotMenuButtonConfig = {
            id: `btn_${Date.now()}`,
            label: 'New Button',
            type: 'SCENARIO',
            value: '',
            row, col: 0
        };
        save({ ...menuConfig, buttons: [...menuConfig.buttons, newBtn] });
    };

    const updateButton = (id: string, updates: Partial<BotMenuButtonConfig>) => {
        const newButtons = menuConfig.buttons.map(b => b.id === id ? { ...b, ...updates } : b);
        save({ ...menuConfig, buttons: newButtons });
    };

    const deleteButton = (id: string) => {
        const newButtons = menuConfig.buttons.filter(b => b.id !== id);
        save({ ...menuConfig, buttons: newButtons });
    };

    const rows = [0, 1, 2, 3];
    const buttonsByRow = menuConfig.buttons.reduce((acc, btn) => {
        if (!acc[btn.row]) acc[btn.row] = [];
        acc[btn.row].push(btn);
        return acc;
    }, {} as Record<number, BotMenuButtonConfig[]>);

    return (
        <div className="h-full flex gap-0">
            {/* Visual Editor */}
            <div className="flex-1 p-8 overflow-y-auto bg-[var(--bg-app)] flex flex-col items-center">
                <div className="w-[320px] bg-[#0E1621] rounded-[30px] border-[8px] border-[#18181B] shadow-2xl flex flex-col overflow-hidden shrink-0 relative mb-8">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#18181B] rounded-b-xl z-20"></div>
                    <div className="bg-[url('https://telegram.org/file/464001088/1/bSWkX5Y-Q7Y/7680076a5933615174')] bg-cover flex-1 p-4 flex flex-col justify-end">
                        <div className="bg-[#182533] p-3 rounded-lg shadow-sm text-white text-sm mb-4 opacity-90">
                            {menuConfig.welcomeMessage || "Welcome!"}
                        </div>
                    </div>
                    {/* Keyboard */}
                    <div className="bg-[#17212B] p-2 pb-6 grid gap-2 border-t border-black">
                        {rows.map(rowIdx => (
                            <div key={rowIdx} className="flex gap-2 min-h-[40px]">
                                {(buttonsByRow[rowIdx] || []).map(btn => (
                                    <button key={btn.id} className="flex-1 bg-[#2B5278] rounded text-[10px] font-bold text-white px-1 py-2 truncate shadow-sm border-b border-[#1c3a57] relative group">
                                        {btn.label}
                                        <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center gap-2 backdrop-blur-[1px] rounded">
                                            <Settings size={12} className="cursor-pointer"/>
                                        </div>
                                    </button>
                                ))}
                                {(!buttonsByRow[rowIdx] || buttonsByRow[rowIdx].length < 3) && (
                                    <button onClick={() => addButton(rowIdx)} className="w-8 flex items-center justify-center bg-[#242F3D] rounded text-white/30 hover:text-white border border-dashed border-white/10 hover:border-white/30">
                                        <Plus size={14}/>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="w-full max-w-xl pb-10">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-[var(--text-primary)]">Configuration</h3>
                        <button onClick={handleSync} disabled={isSyncing} className="btn-primary py-2 px-4 text-xs flex items-center gap-2">
                            {isSyncing ? <RefreshCw size={14} className="animate-spin"/> : <UploadCloud size={14}/>} Push to Telegram
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Welcome Message</label>
                            <textarea className="textarea h-20" value={menuConfig.welcomeMessage} onChange={e => save({...menuConfig, welcomeMessage: e.target.value})} />
                        </div>
                        
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block">Button Actions</label>
                            {menuConfig.buttons.map(btn => (
                                <div key={btn.id} className="bg-[var(--bg-input)] p-3 rounded-lg border border-[var(--border-color)] flex gap-3 items-start relative group">
                                    <div className="flex-1 grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[9px] text-[var(--text-muted)] uppercase block mb-1">Label</label>
                                            <input className="input text-xs py-1.5" value={btn.label} onChange={e => updateButton(btn.id, {label: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-[9px] text-[var(--text-muted)] uppercase block mb-1">Type</label>
                                            <select className="input text-xs py-1.5" value={btn.type} onChange={e => updateButton(btn.id, {type: e.target.value as any})}>
                                                <option value="SCENARIO">Run Scenario</option>
                                                <option value="LINK">Open Link</option>
                                                <option value="TEXT">Send Text</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[9px] text-[var(--text-muted)] uppercase block mb-1">Target</label>
                                            {btn.type === 'SCENARIO' ? (
                                                <select className="input text-xs py-1.5" value={btn.value} onChange={e => updateButton(btn.id, {value: e.target.value})}>
                                                    <option value="">Select Flow...</option>
                                                    {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            ) : (
                                                <input className="input text-xs py-1.5" value={btn.value} onChange={e => updateButton(btn.id, {value: e.target.value})} placeholder={btn.type === 'LINK' ? 'https://' : 'Message'} />
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => deleteButton(btn.id)} className="text-red-500 p-2 hover:bg-red-500/10 rounded mt-4"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const MiniAppManager = ({ bot }: { bot: Bot }) => {
    const { showToast } = useToast();
    const [config, setConfig] = useState<MiniAppConfig>(bot.miniAppConfig || {
        isEnabled: true, title: 'CarTié', welcomeText: 'Welcome', primaryColor: '#D4AF37', layout: 'GRID', actions: []
    });
    const [scenarios, setScenarios] = useState<Scenario[]>([]);

    useEffect(() => {
        Data.getScenarios().then(setScenarios);
    }, []);

    const save = async (newConfig: MiniAppConfig) => {
        setConfig(newConfig);
        await Data.saveBot({ ...bot, miniAppConfig: newConfig });
    };

    const addAction = () => {
        save({
            ...config,
            actions: [...config.actions, { id: `act_${Date.now()}`, label: 'Action', icon: 'Zap', actionType: 'SCENARIO', value: '' }]
        });
    };

    const updateAction = (id: string, updates: any) => {
        save({ ...config, actions: config.actions.map(a => a.id === id ? { ...a, ...updates } : a) });
    };

    const removeAction = (id: string) => {
        save({ ...config, actions: config.actions.filter(a => a.id !== id) });
    };

    const ICONS = ['Search', 'Zap', 'DollarSign', 'MessageCircle', 'Grid', 'List', 'Star', 'Phone'];

    return (
        <div className="flex h-full">
            {/* Config Form */}
            <div className="w-[400px] border-r border-[var(--border-color)] overflow-y-auto p-6 bg-[var(--bg-panel)]">
                <h3 className="font-bold text-lg text-[var(--text-primary)] mb-6 flex items-center gap-2">
                    <Smartphone size={20} className="text-gold-500"/> App Configuration
                </h3>
                
                <div className="space-y-6">
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Appearance</label>
                        <div>
                            <span className="text-[10px] text-[var(--text-muted)] block mb-1">App Title</span>
                            <input className="input" value={config.title} onChange={e => save({...config, title: e.target.value})} />
                        </div>
                        <div>
                            <span className="text-[10px] text-[var(--text-muted)] block mb-1">Welcome Text</span>
                            <textarea className="textarea h-16" value={config.welcomeText} onChange={e => save({...config, welcomeText: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <span className="text-[10px] text-[var(--text-muted)] block mb-1">Theme Color</span>
                                <div className="flex gap-2">
                                    <input type="color" className="h-9 w-9 rounded cursor-pointer bg-transparent border-0" value={config.primaryColor} onChange={e => save({...config, primaryColor: e.target.value})} />
                                    <input className="input flex-1 font-mono text-xs" value={config.primaryColor} onChange={e => save({...config, primaryColor: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <span className="text-[10px] text-[var(--text-muted)] block mb-1">Layout</span>
                                <div className="flex bg-[var(--bg-input)] p-1 rounded-lg border border-[var(--border-color)]">
                                    <button onClick={() => save({...config, layout: 'GRID'})} className={`flex-1 py-1 rounded text-xs font-bold flex justify-center ${config.layout === 'GRID' ? 'bg-[var(--bg-panel)] text-gold-500 shadow' : 'text-[var(--text-muted)]'}`}><Grid size={14}/></button>
                                    <button onClick={() => save({...config, layout: 'LIST'})} className={`flex-1 py-1 rounded text-xs font-bold flex justify-center ${config.layout === 'LIST' ? 'bg-[var(--bg-panel)] text-gold-500 shadow' : 'text-[var(--text-muted)]'}`}><ListIcon size={14}/></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Home Actions</label>
                            <button onClick={addAction} className="text-gold-500 hover:bg-gold-500/10 p-1 rounded"><Plus size={16}/></button>
                        </div>
                        
                        {config.actions.map((act, idx) => (
                            <div key={act.id} className="bg-[var(--bg-input)] p-3 rounded-xl border border-[var(--border-color)] space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold bg-[var(--bg-panel)] px-2 py-0.5 rounded text-[var(--text-secondary)]">Action {idx + 1}</span>
                                    <button onClick={() => removeAction(act.id)} className="text-red-500 hover:text-red-400"><Trash2 size={12}/></button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input className="input text-xs" placeholder="Label" value={act.label} onChange={e => updateAction(act.id, {label: e.target.value})} />
                                    <select className="input text-xs" value={act.icon} onChange={e => updateAction(act.id, {icon: e.target.value})}>
                                        {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <select className="input text-xs w-24 shrink-0" value={act.actionType} onChange={e => updateAction(act.id, {actionType: e.target.value})}>
                                        <option value="SCENARIO">Flow</option>
                                        <option value="VIEW">View</option>
                                        <option value="LINK">Link</option>
                                    </select>
                                    {act.actionType === 'SCENARIO' ? (
                                        <select className="input text-xs flex-1" value={act.value} onChange={e => updateAction(act.id, {value: e.target.value})}>
                                            <option value="">Select Flow...</option>
                                            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    ) : act.actionType === 'VIEW' ? (
                                        <select className="input text-xs flex-1" value={act.value} onChange={e => updateAction(act.id, {value: e.target.value})}>
                                            <option value="REQUEST">Request Form</option>
                                            <option value="INVENTORY">Inventory</option>
                                        </select>
                                    ) : (
                                        <input className="input text-xs flex-1" placeholder="URL" value={act.value} onChange={e => updateAction(act.id, {value: e.target.value})} />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Preview */}
            <div className="flex-1 bg-[var(--bg-app)] flex items-center justify-center p-8">
                <div className="w-[320px] h-[640px] bg-[#0E1621] rounded-[40px] border-[8px] border-[#18181B] shadow-2xl overflow-hidden relative flex flex-col">
                    {/* ... (Visual preview same as before, no state/logic needed) */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#18181B] rounded-b-xl z-20"></div>
                    
                    {/* App Header */}
                    <div className="pt-10 px-6 pb-6" style={{ background: `linear-gradient(to bottom, ${config.primaryColor}20, transparent)` }}>
                        <h2 className="text-xl font-bold text-white">{config.title}</h2>
                        <p className="text-white/60 text-xs mt-1">{config.welcomeText}</p>
                    </div>

                    {/* App Body */}
                    <div className="flex-1 overflow-y-auto px-4 pb-20 custom-scrollbar">
                        <div className={`grid gap-3 ${config.layout === 'GRID' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {config.actions.map(act => (
                                <div key={act.id} className="bg-[#182533] p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-2 text-center group cursor-pointer hover:bg-[#202f40] transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/80 group-hover:text-white group-hover:scale-110 transition-all" style={{color: config.primaryColor}}>
                                        <AppIcon name={act.icon} />
                                    </div>
                                    <span className="text-xs font-bold text-white/90">{act.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Bottom Nav */}
                    <div className="h-16 bg-[#17212B] absolute bottom-0 w-full flex items-center justify-around border-t border-black px-4">
                        <div className="flex flex-col items-center gap-1 opacity-100 text-blue-400">
                            <LayoutGrid size={20}/>
                            <span className="text-[9px]">Home</span>
                        </div>
                        <div className="flex flex-col items-center gap-1 text-white/40">
                            <Search size={20}/>
                            <span className="text-[9px]">Search</span>
                        </div>
                        <div className="flex flex-col items-center gap-1 text-white/40">
                            <BotIcon size={20}/>
                            <span className="text-[9px]">Profile</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AppIcon = ({ name }: { name: string }) => {
    switch(name) {
        case 'Search': return <Search size={20}/>;
        case 'Zap': return <Zap size={20}/>;
        case 'DollarSign': return <Command size={20}/>;
        case 'MessageCircle': return <MessageSquare size={20}/>;
        case 'Grid': return <LayoutGrid size={20}/>;
        case 'List': return <ListIcon size={20}/>;
        case 'Phone': return <Command size={20}/>;
        default: return <Zap size={20}/>;
    }
};

const BotSettings = ({ bot }: { bot: Bot }) => {
    const { showToast } = useToast();
    const [form, setForm] = useState(bot);
    
    // Diagnostic stats
    const stats = bot.stats || { processed: 0, ignored: 0, errors: 0, lastRun: '' };
    const lastError = TelegramAPI.lastError;
    const lastProxy = TelegramAPI.lastUsedProxy;

    useEffect(() => { setForm(bot); }, [bot.id]);

    const save = async () => {
        await Data.saveBot(form);
        showToast("Settings Saved");
    };

    const handleSyncMenu = async () => {
        try {
            // Respect publicBaseUrl
            const baseUrl = form.publicBaseUrl || window.location.origin;
            const appUrl = `${baseUrl}/#/p/app`;
            await TelegramAPI.setChatMenuButton(form.token, "Open App", appUrl);
            showToast("Menu Button Synced");
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const handleSyncCommands = async () => {
        try {
            const scenarios = await Data.getScenarios();
            const commands = scenarios.filter(s => s.isActive && s.triggerCommand).map(s => ({ command: s.triggerCommand, description: s.name }));
            commands.push({ command: 'start', description: 'Restart' });
            commands.push({ command: 'menu', description: 'Menu' });
            await TelegramAPI.setMyCommands(form.token, commands);
            showToast("Commands Synced");
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    return (
        <div className="max-w-2xl mx-auto p-8 space-y-8">
            <div className="panel p-6 space-y-6">
                {/* ... (Settings UI same as before, calling save() which uses Data.saveBot) */}
                <h3 className="font-bold text-lg text-[var(--text-primary)] border-b border-[var(--border-color)] pb-4">General Settings</h3>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Bot Name</label>
                        <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Username</label>
                        <input className="input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">API Token</label>
                    <input className="input font-mono text-sm" type="password" value={form.token} onChange={e => setForm({...form, token: e.target.value})} />
                </div>
                <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Public App Base URL</label>
                    <input className="input font-mono text-sm" placeholder="https://your-domain.com" value={form.publicBaseUrl || ''} onChange={e => setForm({...form, publicBaseUrl: e.target.value})} />
                    {!form.publicBaseUrl && (
                        <div className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                            <AlertTriangle size={10}/> Using current origin. Mini App may not open if local/private.
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between bg-[var(--bg-input)] p-4 rounded-xl">
                    <span className="font-bold text-[var(--text-primary)]">Auto-Sync</span>
                    <button onClick={() => setForm({...form, active: !form.active})} className={`w-12 h-6 rounded-full relative transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-600'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.active ? 'left-7' : 'left-1'}`}></div>
                    </button>
                </div>
                <div className="flex justify-end">
                    <button onClick={save} className="btn-primary px-6">Save Changes</button>
                </div>
            </div>

            {/* DIAGNOSTICS PANEL */}
            <div className="panel p-6 border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-2 mb-4">
                    <Activity size={20} className="text-blue-500"/>
                    <h3 className="font-bold text-blue-500">Diagnostics & Network</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    {/* ... (Stats display) ... */}
                    <div className="bg-[var(--bg-input)] p-3 rounded-lg">
                        <div className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Polling Status</div>
                        <div className="font-mono text-sm text-[var(--text-primary)] mt-1 flex items-center gap-2">
                            {form.active ? <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> : <span className="w-2 h-2 bg-red-500 rounded-full"></span>}
                            {form.active ? 'Active' : 'Stopped'}
                        </div>
                    </div>
                    {/* ... other stats ... */}
                </div>
                
                <div className="grid grid-cols-2 gap-2 mb-4">
                    <button onClick={async () => {
                        try {
                            await TelegramAPI.getMe(form.token);
                            showToast("Connection OK");
                        } catch(e: any) { showToast(e.message, 'error'); }
                    }} className="btn-secondary text-xs py-1.5">Test Connection</button>
                    
                    <button onClick={() => {
                        form.lastUpdateId = 0;
                        save();
                        showToast("Offset Reset to 0");
                    }} className="btn-secondary text-xs py-1.5">Reset Offset</button>
                    
                    <button onClick={() => {
                        form.processedUpdateIds = [];
                        save();
                        showToast("Dedupe Buffer Cleared");
                    }} className="btn-secondary text-xs py-1.5">Clear Buffer</button>

                    <button onClick={handleSyncMenu} className="btn-secondary text-xs py-1.5 flex items-center justify-center gap-1">
                        <Globe size={12}/> Sync Menu URL
                    </button>

                    <button onClick={handleSyncCommands} className="btn-secondary text-xs py-1.5 flex items-center justify-center gap-1">
                        <Terminal size={12}/> Sync Commands
                    </button>
                </div>

                {lastError && (
                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-start gap-2">
                        <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5"/>
                        <div>
                            <div className="text-xs font-bold text-red-500">Last Network Error</div>
                            <div className="text-xs text-red-400 font-mono mt-1 break-all">{lastError}</div>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="panel p-6 border-red-500/20 bg-red-500/5">
                <h3 className="font-bold text-red-500 mb-2">Danger Zone</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">Disconnecting the bot will stop all automation.</p>
                <button onClick={async () => { if(confirm("Disconnect bot?")) { await Data.deleteBot(bot.id); window.location.reload(); } }} className="btn-secondary text-red-500 border-red-500/30 hover:bg-red-500/10">Disconnect Bot</button>
            </div>
        </div>
    );
};

const AddBotModal = ({ onClose }: any) => {
    const [name, setName] = useState('');
    const [token, setToken] = useState('');
    const { showToast } = useToast();

    const handleAdd = async () => {
        if (!name || !token) return;
        await Data.saveBot({
            id: `bot_${Date.now()}`,
            name,
            username: name.trim().toLowerCase().replace(/\s+/g, '_'),
            token,
            role: 'CLIENT',
            active: true,
            menuConfig: DEFAULT_MENU_CONFIG,
            miniAppConfig: DEFAULT_MINI_APP_CONFIG,
            processedUpdateIds: [],
            stats: { processed: 0, ignored: 0, errors: 0, lastRun: '' }
        } as any);
        showToast("Bot Added");
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel w-full max-w-md p-8 animate-slide-up shadow-2xl">
                <h3 className="font-bold text-2xl text-[var(--text-primary)] mb-6">Connect Bot</h3>
                <div className="space-y-4">
                    <input className="input" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
                    <input className="input" placeholder="Token" value={token} onChange={e => setToken(e.target.value)} />
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={onClose} className="btn-ghost">Cancel</button>
                        <button onClick={handleAdd} className="btn-primary px-6">Connect</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
