import React, { useEffect, useState } from 'react';
import { Bot, ActivityLog } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import { Data } from '../../services/data';
import { TelegramAPI } from '../../services/telegram';
import { ApiClient } from '../../services/apiClient';
import { RefreshCw, Shield, Wifi, HardDrive, Terminal } from 'lucide-react';

export const HealthPage = () => {
    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">System Health</h1>
            <SystemHealth />
        </div>
    );
};

const SystemHealth = () => {
    const [bots, setBots] = useState<Bot[]>([]);
    const [botHealth, setBotHealth] = useState<Record<string, { status: 'OK' | 'FAIL' | 'DISABLED', latency: number, msg?: string }>>({});
    const [serverHealth, setServerHealth] = useState<any>(null);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        const load = async () => {
            setBots(await Data.getBots());
            const activity = await Data.getActivity();
            setLogs(activity.filter(l => l.entityType === 'ERROR' || l.entityType === 'SYSTEM' || (l.entityType || '').includes('API')).slice(0, 50));
            await fetchServerHealth();
        };
        load();
    }, []);

    const fetchServerHealth = async () => {
        try {
            const res = await ApiClient.get<any>('health');
            if (res.ok) setServerHealth(res.data);
        } catch { /* ignore */ }
    };

    const checkBots = async () => {
        setLoading(true);
        const health: any = {};
        for (const bot of bots) {
            if (!bot.active) {
                health[bot.id] = { status: 'DISABLED', latency: 0 };
                continue;
            }
            const start = Date.now();
            try {
                await TelegramAPI.getMe(bot.token);
                health[bot.id] = { status: 'OK', latency: Date.now() - start };
            } catch (e: any) {
                health[bot.id] = { status: 'FAIL', latency: 0, msg: e.message };
            }
        }
        setBotHealth(health);
        setLoading(false);
        showToast('Diagnostics complete');
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="panel p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield className="text-green-500" />
                        <div>
                            <div className="font-bold text-[var(--text-primary)]">Bot Connectivity</div>
                            <div className="text-xs text-[var(--text-secondary)]">Check tokens and reachability</div>
                        </div>
                    </div>
                    <button onClick={checkBots} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1" disabled={loading}>
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Run
                    </button>
                </div>
                <div className="panel p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <HardDrive className="text-blue-500" />
                        <div>
                            <div className="font-bold text-[var(--text-primary)]">Server Health</div>
                            <div className="text-xs text-[var(--text-secondary)]">Live status from /health</div>
                        </div>
                    </div>
                    <button onClick={fetchServerHealth} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
                        <RefreshCw size={14}/> Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="panel p-4 space-y-3">
                    {bots.map(bot => {
                        const health = botHealth[bot.id];
                        return (
                            <div key={bot.id} className="border border-[var(--border-color)] rounded-lg p-3">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="font-bold text-[var(--text-primary)]">{bot.name}</div>
                                        <div className="text-[10px] text-[var(--text-secondary)]">@{bot.username}</div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                                        health?.status === 'OK' ? 'bg-green-500/20 text-green-600' :
                                        health?.status === 'FAIL' ? 'bg-red-500/20 text-red-600' :
                                        'bg-gray-500/20 text-gray-600'
                                    }`}>
                                        {health?.status || (bot.active ? 'UNKNOWN' : 'DISABLED')}
                                    </span>
                                </div>
                                {health?.status === 'OK' && (
                                    <div className="text-xs text-green-500 flex items-center gap-2 mt-2">
                                        <Wifi size={14}/> {health.latency} ms
                                    </div>
                                )}
                                {health?.status === 'FAIL' && (
                                    <div className="text-xs text-red-500 mt-2">{health.msg}</div>
                                )}
                            </div>
                        );
                    })}
                    {bots.length === 0 && <div className="text-sm text-[var(--text-secondary)]">No bots configured.</div>}
                </div>

                <div className="panel p-4 space-y-3">
                    {serverHealth ? (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-[var(--bg-input)] p-3 rounded border border-[var(--border-color)]">
                                <div className="text-[10px] uppercase text-[var(--text-secondary)]">Bots Active</div>
                                <div className="text-xl font-bold text-[var(--text-primary)]">{serverHealth.bots?.activeCount || 0}</div>
                                <div className="text-[11px] text-[var(--text-secondary)] truncate">{(serverHealth.bots?.activeBotIds || []).join(', ') || 'none'}</div>
                            </div>
                            <div className="bg-[var(--bg-input)] p-3 rounded border border-[var(--border-color)]">
                                <div className="text-[10px] uppercase text-[var(--text-secondary)]">Content Worker</div>
                                <div className={`text-lg font-bold ${serverHealth.worker?.running ? 'text-green-600' : 'text-red-600'}`}>
                                    {serverHealth.worker?.running ? 'Running' : 'Stopped'}
                                </div>
                                <div className="text-[11px] text-[var(--text-secondary)]">Next: {serverHealth.worker?.nextRun || 'n/a'}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-[var(--text-secondary)]">No health data yet.</div>
                    )}
                </div>
            </div>

            <div className="panel p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold">
                        <Terminal size={16}/> System Logs
                    </div>
                    <button onClick={async () => setLogs((await Data.getActivity()).slice(0, 50))} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Refresh</button>
                </div>
                <div className="max-h-80 overflow-y-auto space-y-1 text-xs font-mono">
                    {logs.length === 0 && <div className="text-[var(--text-secondary)]">No logs.</div>}
                    {logs.map(log => (
                        <div key={log.id} className="flex gap-2">
                            <span className="text-[var(--text-secondary)] w-40 shrink-0">{new Date(log.timestamp).toLocaleString()}</span>
                            <span className={`w-24 shrink-0 font-bold ${log.entityType === 'ERROR' ? 'text-red-500' : 'text-green-500'}`}>{log.entityType}</span>
                            <span className="text-[var(--text-primary)]">{log.action}: {log.details}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default HealthPage;
