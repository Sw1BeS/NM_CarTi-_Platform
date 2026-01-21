
import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { Bot, TelegramDestination, Campaign, TelegramMessage } from '../../../types';
import { Users, MessageSquare, Megaphone, AlertTriangle, Check } from 'lucide-react';

export const BotOverview = ({ bot }: { bot: Bot }) => {
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
                                <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${c.status === 'RUNNING' ? 'bg-blue-500/20 text-blue-500' :
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
