import React, { useState, useEffect } from 'react';
import { Data } from '../../services/data';
import { useToast } from '../../contexts/ToastContext';
import { Bot } from '../../types';
import { Plus, Bot as BotIcon, Settings, Activity, Smartphone, GitMerge, Wifi, Megaphone, Users } from 'lucide-react';

// New modular components
import { MiniAppManager } from '../../modules/Telegram/MiniAppManager';
import { MTProtoSources } from '../../modules/Telegram/MTProtoSources';
import { AutomationEditor } from '../../modules/Telegram/ScenarioEditor';
import { AddBotModal, BotSettings } from './TelegramHub.components';
import { CampaignManager } from '../../modules/Telegram/components/CampaignManager';
import { AudienceManager } from '../../modules/Telegram/components/AudienceManager';
import { AutomationSuite } from '../../modules/Telegram/components/AutomationSuite'; // Optional, but good to have
import { MTProtoManager } from '../../modules/Telegram/components/MTProtoManager'; // Legacy backup if needed

/**
 * TelegramHub - Refactored Controller
 * 
 * Tabs:
 * - OVERVIEW: Bot stats
 * - CAMPAIGNS: Campaign Manager (Restored)
 * - AUDIENCE: Audience Manager (Restored)
 * - SCENARIOS: Automation Editor (New Module)
 * - MINIAPP: Mini App Config (New Module)
 * - MTPROTO: Channel Sources (New Module)
 * - SETTINGS: Bot configuration
 */

export const TelegramHub = () => {
    const [bots, setBots] = useState<Bot[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CAMPAIGNS' | 'AUDIENCE' | 'SCENARIOS' | 'MINIAPP' | 'MTPROTO' | 'SETTINGS'>('OVERVIEW');
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
                    <button
                        onClick={() => setIsAddBotOpen(true)}
                        className="p-1.5 rounded hover:bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-gold-500 transition-colors"
                    >
                        <Plus size={18} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {bots.map(bot => (
                        <button
                            key={bot.id}
                            onClick={() => setSelectedBotId(bot.id)}
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
                    {bots.length === 0 && (
                        <div className="text-center py-8 text-[var(--text-secondary)] text-sm">No bots connected.</div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 panel p-0 overflow-hidden flex flex-col">
                {selectedBot ? (
                    <>
                        {/* Tab Navigation */}
                        <div className="flex border-b border-[var(--border-color)] px-5 bg-[var(--bg-panel)]">
                            <TabBtn
                                active={activeTab === 'OVERVIEW'}
                                onClick={() => setActiveTab('OVERVIEW')}
                                icon={Activity}
                                label="Overview"
                            />
                            <TabBtn
                                active={activeTab === 'CAMPAIGNS'}
                                onClick={() => setActiveTab('CAMPAIGNS')}
                                icon={Megaphone}
                                label="Campaigns"
                            />
                            <TabBtn
                                active={activeTab === 'AUDIENCE'}
                                onClick={() => setActiveTab('AUDIENCE')}
                                icon={Users}
                                label="Audience"
                            />
                            <TabBtn
                                active={activeTab === 'SCENARIOS'}
                                onClick={() => setActiveTab('SCENARIOS')}
                                icon={GitMerge}
                                label="Automation"
                            />
                            <TabBtn
                                active={activeTab === 'MINIAPP'}
                                onClick={() => setActiveTab('MINIAPP')}
                                icon={Smartphone}
                                label="Mini App"
                            />
                            <TabBtn
                                active={activeTab === 'MTPROTO'}
                                onClick={() => setActiveTab('MTPROTO')}
                                icon={Wifi}
                                label="Channels"
                            />
                            <TabBtn
                                active={activeTab === 'SETTINGS'}
                                onClick={() => setActiveTab('SETTINGS')}
                                icon={Settings}
                                label="Settings"
                            />
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-hidden h-full flex flex-col">
                            {activeTab === 'OVERVIEW' && <BotOverview bot={selectedBot} />}
                            {activeTab === 'CAMPAIGNS' && <CampaignManager bot={selectedBot} />}
                            {activeTab === 'AUDIENCE' && <AudienceManager bot={selectedBot} />}
                            {activeTab === 'SCENARIOS' && <AutomationEditor botId={selectedBot.id} />}
                            {activeTab === 'MINIAPP' && <MiniAppManager botId={selectedBot.id} />}
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

            {isAddBotOpen && <AddBotModal onClose={() => setIsAddBotOpen(false)} />}
        </div>
    );
};

// Tab Button Component
const TabBtn = ({ active, onClick, icon: Icon, label }: any) => (
    <button
        onClick={onClick}
        className={`px-6 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors ${active ? 'border-gold-500 text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)]'
            }`}
    >
        <Icon size={16} />
        {label}
    </button>
);

// Simplified Overview (basic stats)
const BotOverview = ({ bot }: { bot: Bot }) => {
    return (
        <div className="p-6 overflow-y-auto">
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Bot Overview</h2>
            <div className="grid grid-cols-3 gap-4 mb-6">
                <StatCard title="Total Leads" value="0" color="blue" />
                <StatCard title="Active Scenarios" value="0" color="green" />
                <StatCard title="Messages Sent" value="0" color="purple" />
            </div>
            <div className="panel p-4 bg-blue-500/10 border border-blue-500/30">
                <p className="text-sm text-[var(--text-secondary)]">
                    Bot <span className="font-bold text-[var(--text-primary)]">{bot.name}</span> is{' '}
                    {bot.active ? (
                        <span className="text-green-500">active and ready</span>
                    ) : (
                        <span className="text-red-500">stopped</span>
                    )}
                </p>
            </div>
        </div>
    );
};

const StatCard = ({ title, value, color }: any) => (
    <div className="panel p-4">
        <div className="text-xs text-[var(--text-secondary)] uppercase mb-1">{title}</div>
        <div className={`text-3xl font-bold text-${color}-500`}>{value}</div>
    </div>
);
