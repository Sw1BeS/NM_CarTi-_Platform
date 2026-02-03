
import React, { useEffect, useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Users, FileText, Send, Zap, CheckCircle, Clock, MessageCircle, TrendingUp, Filter, Car, Briefcase, ChevronRight } from 'lucide-react';
import { Data } from '../../services/data';
import { MetricsService } from '../../services/metricsService';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../contexts/LanguageContext';
import { ActivityLog, Bot } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

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
    const [bots, setBots] = useState<Bot[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const navigate = useNavigate();
    const { t } = useLang();
    const { showToast } = useToast();
    const { user } = useAuth();

    // Chart Data
    const [funnelData, setFunnelData] = useState<any[]>([]);
    const [sourceData, setSourceData] = useState<any[]>([]);
    const [dealerPerformance, setDealerPerformance] = useState<any[]>([]);

    const [filters, setFilters] = useState({
        range: '30d',
        botId: 'ALL',
        requestStatus: 'ALL'
    });
    const [widgets, setWidgets] = useState({
        kpis: true,
        funnel: true,
        sources: true,
        partners: true,
        activity: true
    });
    const [showCustomize, setShowCustomize] = useState(false);
    const [systemSettings, setSystemSettings] = useState<any>(null);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const saveTimerRef = useRef<number | null>(null);
    const roleKey = user?.role || 'USER';

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const settings = await Data.getSettings();
                setSystemSettings(settings);
                const dashboard = (settings.modules || {}).dashboard || {};
                const preset = dashboard?.presets?.[roleKey] || null;
                const presetFilters = preset?.filters || dashboard.filters;
                const presetWidgets = preset?.widgets || dashboard.widgets;
                if (presetFilters) {
                    setFilters((prev) => ({ ...prev, ...presetFilters }));
                }
                if (presetWidgets) {
                    setWidgets((prev) => ({ ...prev, ...presetWidgets }));
                }
            } catch (e: any) {
                // Non-admins may not have access; ignore.
            } finally {
                setSettingsLoaded(true);
            }
        };
        loadSettings();
    }, []);

    const persistDashboardSettings = async (nextFilters = filters, nextWidgets = widgets) => {
        if (!systemSettings || !systemSettings.id) return;
        const dashboard = (systemSettings.modules || {}).dashboard || {};
        const presets = {
            ...(dashboard.presets || {}),
            [roleKey]: {
                filters: nextFilters,
                widgets: nextWidgets,
                updatedAt: new Date().toISOString()
            }
        };
        const updated = {
            ...systemSettings,
            modules: {
                ...(systemSettings.modules || {}),
                dashboard: {
                    filters: nextFilters,
                    widgets: nextWidgets,
                    presets
                }
            }
        };
        setSystemSettings(updated);
        try {
            await Data.saveSettings(updated);
        } catch (e: any) {
            showToast(e.message || 'Failed to save dashboard settings', 'error');
        }
    };

    const scheduleSave = (nextFilters = filters, nextWidgets = widgets) => {
        if (!settingsLoaded) return;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
            persistDashboardSettings(nextFilters, nextWidgets);
        }, 600);
    };

    useEffect(() => {
        scheduleSave(filters, widgets);
        return () => {
            if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        };
    }, [filters, widgets, settingsLoaded]);

    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 30000);
        return () => clearInterval(interval);
    }, [filters]);

    const refreshData = async () => {
        setLoading(true);
        try {
            const [botList, metrics] = await Promise.all([
                Data.getBots?.() || [],
                MetricsService.getDashboardMetrics({
                    range: filters.range,
                    botId: filters.botId === 'ALL' ? undefined : filters.botId,
                    requestStatus: filters.requestStatus
                })
            ]);

            setBots(botList || []);
            setStats(metrics.stats);
            setFunnelData([
                { name: 'Incoming', value: metrics.funnel?.incoming || 0, fill: '#3F3F46' },
                { name: 'Leads', value: metrics.funnel?.leads || 0, fill: '#D4AF37' },
                { name: 'In Progress', value: metrics.funnel?.inProgress || 0, fill: '#A1A1AA' },
                { name: 'Won', value: metrics.funnel?.won || 0, fill: '#FAFAFA' }
            ]);
            setSourceData(metrics.sources || []);
            setDealerPerformance(metrics.partnerActivity || []);
            const activityItems = (metrics.activity || []).map((entry: any) => ({
                id: entry.id || entry.recordId || entry.timestamp || Math.random().toString(36),
                action: entry.action || entry.title || 'Activity',
                details: entry.details || entry.message || '',
                entityType: entry.entityType || entry.type || '',
                timestamp: entry.timestamp || entry.createdAt || new Date().toISOString(),
                userId: entry.userId || ''
            }));
            setActivities(activityItems.slice(0, 10));
            setLastUpdated(new Date());
        } catch (e: any) {
            showToast(e.message || 'Failed to load dashboard metrics', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!stats) return <div className="p-8 text-center text-gray-500 font-bold text-lg">Loading System...</div>;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">Overview</h1>
                    <p className="text-base font-medium text-[var(--text-secondary)] mt-1">Operational metrics and activity</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap items-center gap-2 bg-[var(--bg-input)] px-3 py-2 rounded-xl border border-[var(--border-color)]">
                        <Filter size={16} className="text-[var(--text-secondary)]" />
                        <select
                            className="input text-xs py-1 px-2"
                            value={filters.range}
                            onChange={e => setFilters(prev => ({ ...prev, range: e.target.value }))}
                        >
                            <option value="7d">Last 7d</option>
                            <option value="30d">Last 30d</option>
                            <option value="90d">Last 90d</option>
                            <option value="all">All time</option>
                        </select>
                        <select
                            className="input text-xs py-1 px-2"
                            value={filters.botId}
                            onChange={e => setFilters(prev => ({ ...prev, botId: e.target.value }))}
                        >
                            <option value="ALL">All bots</option>
                            {bots.map(b => <option key={b.id} value={b.id}>{b.name || b.username || b.id}</option>)}
                        </select>
                        <select
                            className="input text-xs py-1 px-2"
                            value={filters.requestStatus}
                            onChange={e => setFilters(prev => ({ ...prev, requestStatus: e.target.value }))}
                        >
                            <option value="ALL">All Requests</option>
                            <option value="DRAFT">Draft</option>
                            <option value="COLLECTING_VARIANTS">Collecting</option>
                            <option value="SHORTLIST">Shortlist</option>
                            <option value="CONTACT_SHARED">Contact Shared</option>
                            <option value="WON">Won</option>
                            <option value="LOST">Lost</option>
                        </select>
                    </div>
                    <button onClick={() => setShowCustomize(!showCustomize)} className="btn-secondary text-sm">
                        {showCustomize ? 'Hide Widgets' : 'Customize'}
                    </button>
                    <button onClick={refreshData} className="btn-secondary text-sm" disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button onClick={() => navigate('/requests')} className="btn-primary shadow-xl">
                        <FileText size={20} /> New Request
                    </button>
                </div>
            </div>
            <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                <Clock size={12} className="text-[var(--text-secondary)]" />
                {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : 'Not updated yet'}
            </div>

            {showCustomize && (
                <div className="panel p-4 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={widgets.kpis} onChange={() => setWidgets(prev => ({ ...prev, kpis: !prev.kpis }))} />
                        KPI Cards
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={widgets.funnel} onChange={() => setWidgets(prev => ({ ...prev, funnel: !prev.funnel }))} />
                        Funnel
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={widgets.sources} onChange={() => setWidgets(prev => ({ ...prev, sources: !prev.sources }))} />
                        Sources
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={widgets.partners} onChange={() => setWidgets(prev => ({ ...prev, partners: !prev.partners }))} />
                        Partner Activity
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={widgets.activity} onChange={() => setWidgets(prev => ({ ...prev, activity: !prev.activity }))} />
                        Activity Log
                    </label>
                </div>
            )}

            {/* KPI Cards */}
            {widgets.kpis && (
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
            )}

            {(widgets.funnel || widgets.sources) && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Funnel Chart */}
                    {widgets.funnel && (
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
                    )}

                    {/* Lead Source (Pie) */}
                    {widgets.sources && (
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
                    )}
                </div>
            )}

            {(widgets.partners || widgets.activity) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Partners */}
                    {widgets.partners && (
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
                    )}

                    {/* Activity Feed */}
                    {widgets.activity && (
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
                    )}
                </div>
            )}
        </div>
    );
};
