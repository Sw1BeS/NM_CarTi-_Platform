
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Users, FileText, Send, AlertTriangle, Zap, CheckCircle, Clock, MessageCircle, TrendingUp, Filter, Car, Briefcase, ChevronRight } from 'lucide-react';
import { Data } from '../../services/data';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../contexts/LanguageContext';
import { ActivityLog } from '../../types';

// Dark Theme Palette
const COLORS = ['#D4AF37', '#27272A', '#52525B', '#A1A1AA', '#4B5563'];

const StatCard = ({ title, value, subtext, icon: Icon, onClick }: any) => (
    <div onClick={onClick} className="panel p-6 cursor-pointer hover:border-gold-500 hover:shadow-lg transition-all group flex flex-col justify-between h-full bg-[var(--bg-panel)]">
        <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-2xl bg-[var(--bg-input)] text-[var(--text-secondary)] group-hover:bg-gold-500 group-hover:text-black transition-colors">
                <Icon size={24} strokeWidth={2.5} />
            </div>
            <ChevronRight size={20} className="text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
        </div>
        <div>
            <h3 className="text-4xl font-extrabold text-[var(--text-primary)] tabular-nums tracking-tight leading-none mb-2">{value}</h3>
            <p className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wide">{title}</p>
            {subtext && <p className="text-xs font-semibold text-gold-600 mt-2 flex items-center gap-1">{subtext}</p>}
        </div>
    </div>
);

export const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<any>(null);
    const [activities, setActivities] = useState<ActivityLog[]>([]);
    const navigate = useNavigate();
    const { t } = useLang();

    // Chart Data
    const [funnelData, setFunnelData] = useState<any[]>([]);
    const [sourceData, setSourceData] = useState<any[]>([]);
    const [dealerPerformance, setDealerPerformance] = useState<any[]>([]);

    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 5000);
        return () => clearInterval(interval);
    }, []);

    const refreshData = async () => {
        const [
            leads,
            msgs,
            companies,
            users,
            activityLogs,
            requests,
            inventory,
            campaigns
        ] = await Promise.all([
            Data.getLeads(),
            Data.getMessages(),
            Data.getCompanies(),
            Data.getUsers(),
            Data.getActivity(),
            Data.getRequests?.() || [],
            Data.getInventory?.() || [],
            Data.getCampaigns?.() || []
        ]);

        const requestsProgress = requests.filter((r: any) => !['WON', 'LOST', 'DRAFT'].includes(r.status)).length;
        const requestsWithOffers = requests.filter((r: any) => (r.variants?.length || 0) > 0);
        const offersFresh = requestsWithOffers.filter((r: any) => {
            const updatedAt = new Date(r.updatedAt || r.createdAt);
            return Date.now() - updatedAt.getTime() < 1000 * 60 * 60 * 24;
        }).length;
        const dbStats = {
            requestsNew: requests.length,
            requestsProgress,
            offersFresh,
            requestsWithOffers: requestsWithOffers.length,
            inventoryValue: (inventory as any[]).reduce<number>((sum, car: any) => sum + (car.price?.amount || 0), 0),
            inventoryCount: inventory.length,
            inboxNew: msgs.filter(m => m.direction === 'INCOMING').length,
            campaignsActive: campaigns.filter((c: any) => c.status === 'RUNNING').length,
            leadsToday: leads.filter((l: any) => new Date(l.createdAt).toDateString() === new Date().toDateString()).length,
            draftsScheduled: (await Data.getDrafts()).filter((d: any) => d.status === 'SCHEDULED').length,
            draftsPosted: (await Data.getDrafts()).filter((d: any) => d.status === 'POSTED' && new Date(d.postedAt).toDateString() === new Date().toDateString()).length
        };

        setFunnelData([
            { name: 'Incoming', value: msgs.length, fill: '#3F3F46' }, // Dark Grey
            { name: 'Leads', value: leads.length, fill: '#D4AF37' }, // Gold
            { name: 'In Progress', value: leads.filter(l => l.status !== 'NEW').length, fill: '#A1A1AA' }, // Light Grey
            { name: 'Won', value: leads.filter(l => l.status === 'WON').length, fill: '#FAFAFA' } // White
        ]);

        const sources = leads.reduce((acc: any, lead) => {
            acc[lead.source] = (acc[lead.source] || 0) + 1;
            return acc;
        }, {});
        setSourceData(Object.keys(sources).map(key => ({ name: key, value: sources[key] })));

        const dealerStats = companies.map(c => {
            const memberIds = users.filter(u => u.companyId === c.id).map(u => u.id);
            const score = memberIds.length * 10 + Math.floor(Math.random() * 5);
            return { name: c.name, value: score };
        }).sort((a, b) => b.value - a.value).slice(0, 5);
        setDealerPerformance(dealerStats);

        setStats(dbStats);
        setActivities(activityLogs.slice(0, 10));
    };

    if (!stats) return <div className="p-8 text-center text-gray-500 font-bold text-lg">Loading System...</div>;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">Overview</h1>
                    <p className="text-base font-medium text-[var(--text-secondary)] mt-1">Operational metrics and activity</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => navigate('/requests')} className="btn-primary shadow-xl">
                        <FileText size={20} /> New Request
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                <StatCard
                    title="New Requests"
                    value={stats.requestsNew}
                    subtext={`${stats.requestsProgress} active now`}
                    icon={FileText}
                    onClick={() => navigate('/requests')}
                />
                <StatCard
                    title="New Leads Today"
                    value={stats.leadsToday}
                    subtext="Captured in last 24h"
                    icon={Users}
                    onClick={() => navigate('/leads')}
                />
                <StatCard
                    title="New Offers"
                    value={stats.offersFresh}
                    subtext={`${stats.requestsWithOffers} requests with offers`}
                    icon={TrendingUp}
                    onClick={() => navigate('/requests')}
                />
                <StatCard
                    title="Inventory Value"
                    value={`$${(stats.inventoryValue / 1000).toFixed(0)}k`}
                    subtext={`${stats.inventoryCount} units total`}
                    icon={Car}
                    onClick={() => navigate('/inventory')}
                />
                <StatCard
                    title="Inbox Unread"
                    value={stats.inboxNew}
                    subtext="Messages waiting"
                    icon={MessageCircle}
                    onClick={() => navigate('/inbox')}
                />
                <StatCard
                    title="Campaigns"
                    value={stats.campaignsActive}
                    subtext="Running"
                    icon={Send}
                    onClick={() => navigate('/telegram?tab=CAMPAIGNS')}
                />
                <StatCard
                    title="Content"
                    value={stats.draftsScheduled}
                    subtext={`${stats.draftsPosted} posted today`}
                    icon={CheckCircle}
                    onClick={() => navigate('/calendar')}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Funnel Chart */}
                <div className="lg:col-span-2 panel p-8 flex flex-col">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xl font-bold text-[var(--text-primary)]">Conversion Funnel</h3>
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#333" />
                                <XAxis type="number" hide />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    width={100}
                                    tick={{ fontSize: 13, fontWeight: 700, fill: '#A1A1AA' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{
                                        borderRadius: 12,
                                        border: '1px solid #333',
                                        backgroundColor: '#18181B',
                                        color: '#FAFAFA',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                                    }}
                                />
                                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={32}>
                                    {funnelData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Lead Source (Pie) */}
                <div className="panel p-8 flex flex-col">
                    <h3 className="text-xl font-bold text-[var(--text-primary)] mb-4">Sources</h3>
                    <div className="flex-1 min-h-[250px] relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={sourceData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={90}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {sourceData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#18181B', borderRadius: 12, border: '1px solid #333', color: '#FAFAFA' }} />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                                <span className="block text-4xl font-extrabold text-[var(--text-primary)] tabular-nums">
                                    {sourceData.reduce((a, b) => a + b.value, 0)}
                                </span>
                                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Total Leads</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Partners */}
                <div className="panel p-8">
                    <h3 className="text-xl font-bold text-[var(--text-primary)] mb-8 flex items-center gap-2">
                        <Briefcase size={22} className="text-gold-500" /> Partner Activity
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dealerPerformance}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600, fill: '#A1A1AA' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#A1A1AA', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ backgroundColor: '#18181B', borderRadius: 12, border: '1px solid #333', color: '#FAFAFA' }} />
                                <Bar dataKey="value" fill="#D4AF37" radius={[6, 6, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Activity Feed */}
                <div className="panel flex flex-col overflow-hidden h-[400px]">
                    <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center shrink-0 bg-[var(--bg-input)]">
                        <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <Zap size={20} className="text-gold-500" /> Activity Log
                        </h3>
                        <span className="text-xs font-extrabold uppercase text-green-600 bg-green-900/30 px-3 py-1 rounded-full animate-pulse border border-green-800">Live</span>
                    </div>
                    <div className="divide-y divide-[var(--border-color)] overflow-y-auto">
                        {activities.length === 0 && (
                            <div className="p-10 text-center text-[var(--text-secondary)] font-medium">No recent activity.</div>
                        )}
                        {activities.map(act => (
                            <div key={act.id} className="p-5 hover:bg-[var(--bg-input)] transition-colors flex gap-4 items-start">
                                <div className="mt-1 p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)]">
                                    {act.entityType === 'TELEGRAM' ? <Send size={16} /> : <FileText size={16} />}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="text-sm font-bold text-[var(--text-primary)]">{act.action}</p>
                                        <span className="text-xs font-bold text-[var(--text-secondary)] font-mono tabular-nums bg-[var(--bg-input)] px-2 py-0.5 rounded">{new Date(act.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-sm font-medium text-[var(--text-secondary)] leading-relaxed">{act.details}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
