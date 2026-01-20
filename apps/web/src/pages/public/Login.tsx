
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../contexts/LanguageContext';
import { Lock, Mail, Server, Settings, CheckCircle, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { getApiBase, setApiBase } from '../../services/apiConfig';
import { ApiClient } from '../../services/apiClient';

export const Login = () => {
    const { login } = useAuth();
    const { t } = useLang();
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Connection Settings State
    const [showConnection, setShowConnection] = useState(false);
    const [apiBaseUrl, setApiBaseUrl] = useState(getApiBase());
    const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        setApiBaseUrl(getApiBase());
    }, []);

    const handleTestConnection = async () => {
        setChecking(true);
        const current = getApiBase();
        setApiBase(apiBaseUrl); // save temp

        try {
            const res = await ApiClient.get('/health');
            if (res.ok) {
                setTestStatus({ ok: true, msg: `200 OK` });
            } else {
                setTestStatus({ ok: false, msg: `Error: ${res.message}` });
            }
        } catch (e: any) {
            setTestStatus({ ok: false, msg: 'Network Error' });
        } finally {
            if (current !== apiBaseUrl) setApiBase(current);
            setChecking(false);
        }
    };

    const handleSaveConnection = () => {
        setApiBase(apiBaseUrl);
        window.location.reload();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const result = await login(email, password);

        if (result.success) {
            navigate('/');
        } else {
            setError(result.error || 'Login failed');
            // If network error, suggest checking connection
            if (result.error?.includes('Network') || result.error?.includes('Failed to fetch')) {
                setShowConnection(true);
            }
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] p-4">
            <div className="panel w-full max-w-md p-0 overflow-hidden animate-slide-up shadow-2xl border-t border-[rgba(255,255,255,0.1)]">

                {/* Header */}
                <div className="p-10 pb-6 text-center">
                    <h1 className="text-4xl font-medium tracking-tight text-[var(--text-primary)]">CarTié<span className="text-gold-500">.</span></h1>
                    <p className="text-[var(--text-secondary)] mt-3 text-xs uppercase tracking-widest">{t('login.title')}</p>
                </div>

                {/* Connection Accordion */}
                <div className="bg-[var(--bg-input)] border-y border-[var(--border-color)]">
                    <button
                        onClick={() => setShowConnection(!showConnection)}
                        className="w-full flex justify-between items-center px-6 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider hover:bg-[#3F3F46] transition-colors"
                    >
                        <span className="flex items-center gap-2"><Server size={14} /> Connection Settings</span>
                        <Settings size={14} className={showConnection ? 'text-gold-500' : ''} />
                    </button>

                    {showConnection && (
                        <div className="p-6 pt-2 space-y-4 animate-fade-in bg-[var(--bg-app)]/50">
                            <div>
                                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block mb-1">API Base URL</label>
                                <input
                                    className="input text-xs font-mono"
                                    placeholder="http://127.0.0.1:3001/api"
                                    value={apiBaseUrl}
                                    onChange={e => setApiBaseUrl(e.target.value)}
                                />
                                <p className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-60">Empty = Same Origin (/api)</p>
                            </div>

                            {testStatus && (
                                <div className={`text-xs px-3 py-2 rounded flex items-center gap-2 ${testStatus.ok ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                    {testStatus.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                    {testStatus.msg}
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button type="button" onClick={handleTestConnection} disabled={checking} className="btn-secondary flex-1 py-2 text-xs">
                                    {checking ? <RefreshCw className="animate-spin" size={14} /> : 'Test Connection'}
                                </button>
                                <button type="button" onClick={handleSaveConnection} className="btn-primary flex-1 py-2 text-xs">
                                    Save & Reload
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Main Form */}
                <form onSubmit={handleSubmit} className="p-10 pt-6 space-y-6">
                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center font-medium flex items-center justify-center gap-2">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}

                    <div>
                        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
                            <input
                                type="text"
                                className="input pl-10"
                                placeholder="admin@cartie.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
                            <input
                                type="password"
                                className="input pl-10"
                                placeholder="••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button disabled={loading} type="submit" className="w-full btn-primary py-3">
                        {loading ? 'Authenticating...' : t('login.btn')}
                    </button>
                </form>

                <div className="pb-6 border-t border-[var(--border-color)] text-xs text-[var(--text-secondary)] text-center pt-4">
                    <p className="opacity-50">Enterprise Access v5.0</p>
                </div>
            </div>
        </div>
    );
};
