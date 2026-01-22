
import React, { useState, useEffect } from 'react';
import { Data } from '../../services/data';
import { Bot } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import {
    Users, MessageSquare, Megaphone, Settings as SettingsIcon,
    Smartphone, Power, Plus, Trash2, Bot as BotIcon, Activity
} from 'lucide-react';

// Components
import { BotOverview } from './components/BotOverview';
import { AudienceManager } from './components/AudienceManager';
import { CampaignManager } from './components/CampaignManager';
import { AutomationSuite } from './components/AutomationSuite';
import { MTProtoManager } from './components/MTProtoManager';
import { AddBotModal } from './components/AddBotModal';

type Tab = 'DASHBOARD' | 'CAMPAIGNS' | 'AUDIENCE' | 'AUTOMATION' | 'CHANNELS' | 'SETTINGS';

export const TelegramDashboard = () => {
    const [bots, setBots] = useState<Bot[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('DASHBOARD');
    const [isAddBotOpen, setIsAddBotOpen] = useState(false);
    const { showToast } = useToast();

    // Stats for sidebar
    const [stats, setStats] = useState({ totalUsers: 0, totalMessages: 0 });

    const load = async () => {
        const botList = await Data.getBots();
        setBots(botList);
        if (botList.length > 0 && !selectedBotId) {
            setSelectedBotId(botList[0].id);
        }

        // Load aggregate stats
        const dests = await Data.getDestinations();
        const msgs = await Data.getMessages({ limit: 1 }); // Just to check count if API supported it, but we'll mock or use length if tiny
        setStats({ totalUsers: dests.length, totalMessages: 0 });
    };

    useEffect(() => {
        load();
        const sub1 = Data.subscribe('UPDATE_BOTS', load);
        const sub2 = Data.subscribe('UPDATE_DESTINATIONS', () => {
            Data.getDestinations().then(d => setStats(prev => ({ ...prev, totalUsers: d.length })));
        });
        return () => { sub1(); sub2(); };
    }, []);

    const selectedBot = bots.find(b => b.id === selectedBotId);

    const handleDeleteBot = async (id: string) => {
        if (confirm('Delete this bot? This cannot be undone.')) {
            await Data.deleteBot(id);
            if (selectedBotId === id) setSelectedBotId(null);
            showToast('Bot deleted');
        }
    };

    const toggleBotActive = async (bot: Bot) => {
        await Data.saveBot({ ...bot, active: !bot.active } as any);
        showToast(`Bot ${!bot.active ? 'enabled' : 'disabled'}`);
    };

    // Sidebar Items
    const NavItem = ({ id, label, icon: Icon }: any) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 border-l-2
            ${activeTab === id
                    ? 'bg-[var(--bg-input)] border-gold-500 text-[var(--text-primary)] shadow-[inset_4px_0_0_0_rgba(234,179,8,1)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
        >
            <Icon size={18} className={activeTab === id ? 'text-gold-500' : 'text-current'} />
            {label}
        </button>
    );

    return (
        <div className="h-full flex bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0 z-20 shadow-xl">
                <div className="p-6 border-b border-[var(--border-color)]">
                    <h1 className="font-bold text-xl flex items-center gap-2 tracking-tight">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                            <BotIcon size={20} />
                        </div>
                        Telegram Hub
                    </h1>
                    <div className="flex gap-4 mt-6 text-xs text-[var(--text-secondary)]">
                        <div>
                            <div className="font-bold text-[var(--text-primary)] text-lg">{stats.totalUsers}</div>
                            <div>Subscribers</div>
                        </div>
                        <div>
                            <div className="font-bold text-[var(--text-primary)] text-lg">{bots.length}</div>
                            <div>Active Bots</div>
                        </div>
                    </div>
                </div>

                {/* Bot Selector */}
                <div className="px-4 py-4">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block px-1">Select Bot</label>
                    <div className="relative">
                        <select
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-gold-500 outline-none appearance-none"
                            value={selectedBotId || ''}
                            onChange={(e) => setSelectedBotId(e.target.value)}
                        >
                            <option value="" disabled>Select a bot...</option>
                            {bots.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-secondary)]">▼</div>
                    </div>
                    <button onClick={() => setIsAddBotOpen(true)} className="mt-2 text-xs text-gold-500 font-bold hover:underline flex items-center gap-1">
                        <Plus size={12} /> Connect New Bot
                    </button>
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-2">
                    {selectedBot ? (
                        <>
                            <div className="px-4 mb-2 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Menu</div>
                            <NavItem id="DASHBOARD" label="Overview" icon={Activity} />
                            <NavItem id="CAMPAIGNS" label="Campaigns" icon={Megaphone} />
                            <NavItem id="AUDIENCE" label="Audience" icon={Users} />
                            <NavItem id="AUTOMATION" label="Flows & Menu" icon={Smartphone} />
                            <NavItem id="CHANNELS" label="Channels (MTProto)" icon={MessageSquare} />

                            <div className="mt-6 px-4 mb-2 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">System</div>
                            <NavItem id="SETTINGS" label="Settings" icon={SettingsIcon} />
                        </>
                    ) : (
                        <div className="px-6 py-8 text-center text-[var(--text-secondary)] text-sm opacity-60">
                            Select a bot to view menu
                        </div>
                    )}
                </div>

                {/* Bot Actions Footer */}
                {selectedBot && (
                    <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-input)]/50">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${selectedBot.active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
                                <span className="text-xs font-bold text-[var(--text-secondary)]">{selectedBot.active ? 'ONLINE' : 'OFFLINE'}</span>
                            </div>
                            <button onClick={() => handleDeleteBot(selectedBot.id)} className="text-red-500 hover:bg-red-500/10 p-1.5 rounded transition-colors"><Trash2 size={14} /></button>
                        </div>
                        <button
                            onClick={() => toggleBotActive(selectedBot)}
                            className={`w-full py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-2
                            ${selectedBot.active
                                    ? 'border-red-500/30 text-red-500 hover:bg-red-500/10'
                                    : 'border-green-500/30 text-green-500 hover:bg-green-500/10'
                                }`}
                        >
                            <Power size={12} /> {selectedBot.active ? 'Stop Bot' : 'Start Bot'}
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative bg-[#050505] flex flex-col">
                {selectedBot ? (
                    <>
                        {activeTab === 'DASHBOARD' && <BotOverview bot={selectedBot} />}
                        {activeTab === 'CAMPAIGNS' && <CampaignManager bot={selectedBot} />}
                        {activeTab === 'AUDIENCE' && <AudienceManager bot={selectedBot} />}
                        {activeTab === 'AUTOMATION' && <AutomationSuite />}
                        {activeTab === 'CHANNELS' && <MTProtoManager bot={selectedBot} />}
                        {activeTab === 'SETTINGS' && (
                            <div className="p-8">
                                <h2 className="text-2xl font-bold mb-6">Settings</h2>
                                <div className="panel p-6 max-w-2xl">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm font-bold text-[var(--text-secondary)] block mb-1">Bot Token</label>
                                            <div className="flex gap-2">
                                                <input className="input flex-1 font-mono text-xs" value={selectedBot.token} disabled />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-sm font-bold text-[var(--text-secondary)] block mb-1">Webhook URL</label>
                                            <input className="input font-mono text-xs" value={`${selectedBot.config?.publicBaseUrl || window.location.origin}/api/hooks/telegram/${selectedBot.token}`} disabled />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)]">
                        <div className="w-24 h-24 rounded-full bg-[var(--bg-input)] flex items-center justify-center mb-6 animate-pulse">
                            <BotIcon size={48} className="opacity-20" />
                        </div>
                        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Welcome to Telegram Hub</h2>
                        <p className="max-w-md text-center">Select a bot from the sidebar or connect a new one to get started with automation, campaigns, and audience management.</p>
                        <button onClick={() => setIsAddBotOpen(true)} className="btn-primary mt-8 px-6 py-3 shadow-xl shadow-gold-500/20">Connect Your First Bot</button>
                    </div>
                )}
            </div>

            {isAddBotOpen && <AddBotModal onClose={() => setIsAddBotOpen(false)} />}
        </div>
    );
};
