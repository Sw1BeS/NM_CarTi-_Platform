import React, { useEffect, useState } from 'react';
import { IntegrationLogsService, IntegrationEventLog } from '../../../services/integrationLogsService';
import { useToast } from '../../../contexts/ToastContext';
import { RefreshCw, Filter } from 'lucide-react';

const DEFAULT_INTEGRATIONS = ['TELEGRAM_BOTAPI', 'TELEGRAM_MTPROTO'];
const DEFAULT_STATUSES = ['OK', 'ERROR', 'WARN'];

export const IntegrationLogsTab = () => {
    const { showToast } = useToast();
    const [logs, setLogs] = useState<IntegrationEventLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        integration: '',
        status: '',
        action: '',
        entityId: '',
        from: '',
        to: ''
    });

    const load = async () => {
        setLoading(true);
        try {
            const items = await IntegrationLogsService.list({
                integration: filters.integration || undefined,
                status: filters.status || undefined,
                action: filters.action || undefined,
                entityId: filters.entityId || undefined,
                from: filters.from || undefined,
                to: filters.to || undefined,
                limit: 200
            });
            setLogs(items);
        } catch (e: any) {
            showToast(e.message || 'Failed to load logs', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(load, 300);
        return () => clearTimeout(timer);
    }, [filters.integration, filters.status, filters.action, filters.entityId, filters.from, filters.to]);

    return (
        <div className="space-y-6 animate-slide-up">
            <div className="panel p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm font-bold text-[var(--text-primary)]">Integration Logs</div>
                        <div className="text-xs text-[var(--text-secondary)]">Filter by integration, entity, status, or date range</div>
                    </div>
                    <button onClick={load} className="btn-secondary text-xs flex items-center gap-2">
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-secondary)]">Integration</label>
                        <select
                            className="input"
                            value={filters.integration}
                            onChange={e => setFilters(prev => ({ ...prev, integration: e.target.value }))}
                        >
                            <option value="">All</option>
                            {DEFAULT_INTEGRATIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-secondary)]">Status</label>
                        <select
                            className="input"
                            value={filters.status}
                            onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                        >
                            <option value="">All</option>
                            {DEFAULT_STATUSES.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-secondary)]">Action</label>
                        <input
                            className="input"
                            placeholder="action"
                            value={filters.action}
                            onChange={e => setFilters(prev => ({ ...prev, action: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-secondary)]">Entity ID</label>
                        <input
                            className="input"
                            placeholder="entityId"
                            value={filters.entityId}
                            onChange={e => setFilters(prev => ({ ...prev, entityId: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-secondary)]">From</label>
                        <input
                            type="datetime-local"
                            className="input"
                            value={filters.from}
                            onChange={e => setFilters(prev => ({ ...prev, from: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-secondary)]">To</label>
                        <input
                            type="datetime-local"
                            className="input"
                            value={filters.to}
                            onChange={e => setFilters(prev => ({ ...prev, to: e.target.value }))}
                        />
                    </div>
                </div>
            </div>

            <div className="panel p-4">
                {loading && <div className="text-xs text-[var(--text-secondary)]">Loading logs...</div>}
                {!loading && logs.length === 0 && (
                    <div className="text-xs text-[var(--text-secondary)]">No logs found.</div>
                )}
                {!loading && logs.length > 0 && (
                    <div className="space-y-2">
                        {logs.map(log => (
                            <div key={log.id} className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg p-3 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="font-bold text-[var(--text-primary)]">{log.integration}</div>
                                    <div className="text-[10px] text-[var(--text-secondary)]">{new Date(log.createdAt).toLocaleString()}</div>
                                </div>
                                <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                                    <div>
                                        <div className="text-[10px] uppercase text-[var(--text-secondary)]">Action</div>
                                        <div className="text-[var(--text-primary)]">{log.action}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase text-[var(--text-secondary)]">Status</div>
                                        <div className={log.status === 'ERROR' ? 'text-red-500' : log.status === 'OK' ? 'text-green-500' : 'text-yellow-500'}>
                                            {log.status}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase text-[var(--text-secondary)]">Entity</div>
                                        <div className="text-[var(--text-primary)] truncate">{log.entityId || '—'}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase text-[var(--text-secondary)]">Message</div>
                                        <div className="text-[var(--text-primary)] truncate">{log.message || '—'}</div>
                                    </div>
                                </div>
                                {log.payloadMeta && (
                                    <div className="mt-2 text-[10px] text-[var(--text-secondary)] whitespace-pre-wrap">
                                        {JSON.stringify(log.payloadMeta)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
