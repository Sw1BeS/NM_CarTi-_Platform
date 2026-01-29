import React, { useState, useEffect } from 'react';
import { Data } from '../../services/data';
import { useToast } from '../../contexts/ToastContext';
import { Bot, Scenario } from '../../types';
import { Plus, Bot as BotIcon, Settings, Activity, Smartphone, Wifi, Megaphone, Users, X, LayoutTemplate, GitMerge, Menu, ArrowLeft } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

// Modules
import { MiniAppManager } from '../../modules/Telegram/MiniAppManager/index';
import { MTProtoSources } from '../../modules/Telegram/MTProtoSources/index';
import { AddBotModal, BotSettings } from './TelegramHub.components';
import { CampaignManager } from '../../modules/Telegram/components/CampaignManager';
import { AudienceManager } from '../../modules/Telegram/components/AudienceManager';
import { BotMenuEditor } from '../../modules/Telegram/components/BotMenuEditor';
import { ShowcaseManager } from '../../modules/Telegram/components/ShowcaseManager';
import { ScenarioBuilder } from './ScenarioBuilder'; // We will use a filtered version

/**
 * TelegramHub - Unified Bot Studio Controller
 */

export const TelegramHub = () => {
    const [bots, setBots] = useState<Bot[]>([]);
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'STUDIO' | 'CLASSIC'>('STUDIO');

    // Studio Tabs
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'FLOWS' | 'MENU' | 'CAMPAIGNS' | 'AUDIENCE' | 'MINIAPP' | 'SHOWCASES' | 'MTPROTO' | 'SETTINGS'>('OVERVIEW');
    const [searchParams] = useSearchParams();

    const [isAddBotOpen, setIsAddBotOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        const load = async () => {
            try {
                const list = await Data.getBots();
                setBots(list || []);
                const scn = await Data.getScenarios();
                setScenarios(scn || []);

                if (list && list.length > 0 && !selectedBotId) {
                    const active = list.find(b => b.active);
                    setSelectedBotId(active ? active.id : list[0].id);
                }
            } catch (e) {
                console.error("Failed to load bots", e);
                setBots([]);
            }
        };
        load();
        const sub1 = Data.subscribe('UPDATE_BOTS', load);
        const sub2 = Data.subscribe('UPDATE_SCENARIOS', load);
        return () => { sub1(); sub2(); };
    }, [selectedBotId]);

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (!tabParam) return;
        const normalized = tabParam.toUpperCase();
        const allowed = ['OVERVIEW', 'FLOWS', 'MENU', 'CAMPAIGNS', 'AUDIENCE', 'MINIAPP', 'SHOWCASES', 'MTPROTO', 'SETTINGS'];
        if (!allowed.includes(normalized)) return;
        setActiveTab(normalized as any);
        if ((normalized === 'FLOWS' || normalized === 'MENU') && viewMode !== 'STUDIO') {
            setViewMode('STUDIO');
        }
    }, [searchParams, viewMode]);

    const selectedBot = bots.find(b => b.id === selectedBotId);

    // CLASSIC MODE: Just lists bots and basic settings. Flows/Menu handled externally.
    // STUDIO MODE: Everything in one place.

    return (
        <div className="flex flex-col h-[calc(100vh-100px)]">
            {/* Top Bar / Mode Switcher */}
            <div className="bg-[var(--bg-panel)] border-b border-[var(--border-color)] px-4 py-2 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <BotIcon className="text-gold-500" size={20} />
                    <span className="font-bold text-[var(--text-primary)] hidden md:inline">Telegram Hub</span>
                </div>

                <div className="flex bg-[var(--bg-input)] p-1 rounded-lg border border-[var(--border-color)]">
                    <button
                        onClick={() => setViewMode('STUDIO')}
                        className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'STUDIO' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                        <LayoutTemplate size={14} /> Bot Studio
                    </button>
                    <button
                        onClick={() => setViewMode('CLASSIC')}
                        className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'CLASSIC' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                        <Settings size={14} /> Classic
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                {/* Mobile Overlay */}
                {isSidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                )}

                {/* Mobile Toggle Button */}
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="md:hidden fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-gold-500 text-black shadow-lg flex items-center justify-center hover:bg-gold-600 transition-colors"
                >
                    <BotIcon size={24} />
                </button>

                {/* Bot List Sidebar */}
                <div className={`
                    fixed md:static inset-y-0 left-0 z-50 w-72 panel p-0 overflow-hidden flex flex-col shrink-0 bg-[var(--bg-panel)] border-r border-[var(--border-color)]
                    transition-transform duration-300 md:translate-x-0
                    ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                `}>
                    <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-input)] flex justify-between items-center">
                        <h3 className="font-bold text-[var(--text-primary)] text-sm uppercase tracking-wide">My Bots</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsAddBotOpen(true)}
                                className="p-1.5 rounded hover:bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-gold-500 transition-colors"
                            >
                                <Plus size={18} />
                            </button>
                            <button
                                onClick={() => setIsSidebarOpen(false)}
                                className="md:hidden p-1.5 rounded hover:bg-[var(--bg-app)] text-[var(--text-secondary)]"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {bots.map(bot => (
                            <button
                                key={bot.id}
                                onClick={() => {
                                    setSelectedBotId(bot.id);
                                    setIsSidebarOpen(false);
                                }}
                                className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all ${selectedBotId === bot.id
                                    ? 'bg-gold-500/10 border border-gold-500/30'
                                    : 'hover:bg-[var(--bg-input)] border border-transparent'
                                    }`}
                            >
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center border ${selectedBotId === bot.id
                                        ? 'bg-gold-500 text-black border-gold-500'
                                        : 'bg-[var(--bg-app)] text-[var(--text-secondary)] border-[var(--border-color)]'
                                        }`}
                                >
                                    <BotIcon size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div
                                        className={`font-bold text-sm truncate ${selectedBotId === bot.id ? 'text-gold-500' : 'text-[var(--text-primary)]'
                                            }`}
                                    >
                                        {bot.name}
                                    </div>
                                    <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                                        <span className={`w-1.5 h-1.5 rounded-full ${bot.active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                        {bot.active ? 'Active' : 'Stopped'}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-app)]">
                    {selectedBot ? (
                        <>
                            {/* Tabs */}
                            <div className="flex border-b border-[var(--border-color)] px-2 bg-[var(--bg-panel)] overflow-x-auto scrollbar-hide shrink-0">
                                <TabBtn active={activeTab === 'OVERVIEW'} onClick={() => setActiveTab('OVERVIEW')} icon={Activity} label="Overview" />

                                {viewMode === 'STUDIO' && (
                                    <>
                                        <TabBtn active={activeTab === 'FLOWS'} onClick={() => setActiveTab('FLOWS')} icon={GitMerge} label="Flows" />
                                        <TabBtn active={activeTab === 'MENU'} onClick={() => setActiveTab('MENU')} icon={Menu} label="Menu" />
                                    </>
                                )}

                                <TabBtn active={activeTab === 'CAMPAIGNS'} onClick={() => setActiveTab('CAMPAIGNS')} icon={Megaphone} label="Broadcasts" />
                                <TabBtn active={activeTab === 'AUDIENCE'} onClick={() => setActiveTab('AUDIENCE')} icon={Users} label="Audience" />
                                <TabBtn active={activeTab === 'MINIAPP'} onClick={() => setActiveTab('MINIAPP')} icon={Smartphone} label="Mini App" />
                                <TabBtn active={activeTab === 'SHOWCASES'} onClick={() => setActiveTab('SHOWCASES')} icon={LayoutTemplate} label="Showcases" />
                                <TabBtn active={activeTab === 'MTPROTO'} onClick={() => setActiveTab('MTPROTO')} icon={Wifi} label="Channels" />
                                <TabBtn active={activeTab === 'SETTINGS'} onClick={() => setActiveTab('SETTINGS')} icon={Settings} label="Settings" />
                            </div>

                            {/* View Content */}
                            <div className="flex-1 overflow-hidden relative">
                                {activeTab === 'OVERVIEW' && <BotOverview bot={selectedBot} />}

                                {viewMode === 'STUDIO' && activeTab === 'FLOWS' && (
                                    // In Studio Mode, we render ScenarioBuilder filtered by context (if implemented)
                                    // For now, ScenarioBuilder is global, but we can wrap it
                                    <div className="h-full w-full">
                                        <ScenarioBuilder studioMode={true} botId={selectedBot.id} />
                                    </div>
                                )}

                                {viewMode === 'STUDIO' && activeTab === 'MENU' && (
                                    <BotMenuEditor scenarios={scenarios} botId={selectedBot.id} />
                                )}

                                {activeTab === 'CAMPAIGNS' && <CampaignManager bot={selectedBot} />}
                                {activeTab === 'AUDIENCE' && <AudienceManager bot={selectedBot} />}
                                {activeTab === 'MINIAPP' && <MiniAppManager botId={selectedBot.id} />}
                                {activeTab === 'SHOWCASES' && <ShowcaseManager botId={selectedBot.id} />}
                                {activeTab === 'MTPROTO' && <MTProtoSources botId={selectedBot.id} />}
                                {activeTab === 'SETTINGS' && <BotSettings bot={selectedBot} />}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center text-[var(--text-secondary)]">
                                <BotIcon size={48} className="mx-auto mb-4 opacity-20" />
                                <p>Select or add a bot to get started</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isAddBotOpen && <AddBotModal onClose={() => setIsAddBotOpen(false)} />}
        </div>
    );
};

// Tab Button Component
const TabBtn = ({ active, onClick, icon: Icon, label }: any) => (
    <button
        onClick={onClick}
        className={`px-4 md:px-5 py-3 text-xs md:text-sm font-bold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${active ? 'border-gold-500 text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
    >
        <Icon size={16} />
        <span className="hidden sm:inline">{label}</span>
    </button>
);

// Simplified Overview (basic stats)
const BotOverview = ({ bot }: { bot: Bot }) => {
    const [tgStats, setTgStats] = useState<any>(null);

    useEffect(() => {
        ApiClient.get('integrations/mtproto/stats').then(res => {
            if (res.ok) setTgStats(res.data);
        }).catch(console.error);
    }, []);

    return (
        <div className="p-6 overflow-y-auto h-full">
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Bot Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <StatCard title="Total Leads" value="0" color="blue" />
                <StatCard title="Active Scenarios" value="0" color="green" />
                <StatCard title="Messages Sent" value="0" color="purple" />
            </div>

            {tgStats && (
                <div className="mb-6">
                    <h3 className="font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2 text-sm uppercase">
                        <Wifi size={16} className="text-blue-500" /> Telegram Pulse
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Imported Cars" value={tgStats.totalCars} color="gold" />
                        <StatCard title="New (24h)" value={tgStats.newCars} color="green" />
                        <StatCard title="TG Leads" value={tgStats.totalLeads} color="blue" />
                        <StatCard title="Active Sources" value={tgStats.activeSources} color="gray" />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="panel p-6 bg-[var(--bg-panel)] border border-[var(--border-color)]">
                    <h3 className="font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                        <Activity size={18} className="text-gold-500" /> Activity
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                        Bot <span className="font-bold text-[var(--text-primary)]">{bot.name}</span> is{' '}
                        {bot.active ? (
                            <span className="text-green-500 bg-green-500/10 px-2 py-0.5 rounded text-xs font-bold uppercase">Active</span>
                        ) : (
                            <span className="text-red-500 bg-red-500/10 px-2 py-0.5 rounded text-xs font-bold uppercase">Stopped</span>
                        )}
                    </p>
                    <div className="mt-4 h-32 bg-[var(--bg-input)] rounded-lg flex items-center justify-center text-xs text-[var(--text-muted)]">
                        Chart Placeholder
                    </div>
                </div>

                <div className="panel p-6 bg-[var(--bg-panel)] border border-[var(--border-color)]">
                    <h3 className="font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                        <Smartphone size={18} className="text-blue-500" /> Mini App Health
                    </h3>
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-[var(--text-secondary)]">Status</span>
                            <span className="text-green-500 font-bold">Operational</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-[var(--text-secondary)]">Visits (24h)</span>
                            <span className="text-[var(--text-primary)] font-mono">0</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ title, value, color }: any) => (
    <div className="panel p-4 bg-[var(--bg-panel)] border border-[var(--border-color)]">
        <div className="text-xs text-[var(--text-secondary)] uppercase mb-1 font-bold tracking-wider">{title}</div>
        <div className={`text-3xl font-bold text-${color}-500`}>{value}</div>
    </div>
);
