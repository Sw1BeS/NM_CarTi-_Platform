
import React, { useState, useEffect } from 'react';
import { Storage } from '../services/storage';
import { TelegramAPI } from '../services/telegram';
import { ActivityLog, Bot, DeliveryLog, Campaign, RequestStatus, VariantStatus } from '../types';
import { RefreshCw, AlertTriangle, Shield, Send, Terminal, Wifi, RotateCcw, Trash2, Play, TestTube, Cpu, HardDrive } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { BotEngine } from '../services/botEngine';
import { MockDb } from '../services/mockDb';
import { MatchingService } from '../services/matchingService';

export const HealthPage = () => {
    const [activeTab, setActiveTab] = useState<'HEALTH' | 'QA'>('HEALTH');

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">System Diagnostics</h1>
                    <p className="text-sm text-gray-500">Monitoring & Automated Testing</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setActiveTab('HEALTH')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'HEALTH' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>Live Health</button>
                    <button onClick={() => setActiveTab('QA')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'QA' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>System QA</button>
                </div>
            </div>

            {activeTab === 'HEALTH' ? <SystemHealth /> : <SystemQA />}
        </div>
    );
};

const SystemQA = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<{name: string, status: 'PASS' | 'FAIL'}[]>([]);

    const log = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const runTests = async () => {
        setRunning(true);
        setLogs([]);
        setResults([]);
        
        try {
            // TEST 1: Request Creation
            log("Test 1: Creating B2B Request...");
            const req = await MockDb.createRequest({
                title: "QA Test Car BMW",
                budgetMax: 50000,
                status: RequestStatus.NEW
            });
            if (!req || !req.id) throw new Error("Request creation failed");
            setResults(prev => [...prev, { name: 'Create Request', status: 'PASS' }]);
            
            // TEST 2: Inventory Add & Match
            log("Test 2: Adding Matching Inventory...");
            const car = {
                canonicalId: `qa_car_${Date.now()}`,
                title: "BMW X5 Test",
                price: { amount: 45000, currency: 'USD' },
                year: 2022,
                status: 'AVAILABLE'
            } as any;
            Storage.saveInventoryItem(car);
            
            // Check Match
            log("Test 3: Checking Match Logic...");
            const matches = await MatchingService.findMatchesForCar(car);
            const isMatch = matches.some(m => m.req.id === req.id);
            
            if (!isMatch) throw new Error("Matching logic failed to pair Request and Car");
            setResults(prev => [...prev, { name: 'Matching Engine', status: 'PASS' }]);

            // TEST 4: Variant Attachment
            log("Test 4: Attaching Variant...");
            await MockDb.addVariant(req.id, {
                title: car.title,
                price: car.price,
                status: VariantStatus.FIT
            });
            const updatedReq = Storage.getRequest(req.id);
            if (updatedReq?.variants.length !== 1) throw new Error("Variant attach failed");
            setResults(prev => [...prev, { name: 'Attach Variant', status: 'PASS' }]);

            // Cleanup
            log("Cleanup: Removing test data...");
            Storage.deleteRequest(req.id);
            Storage.deleteInventoryItem(car.canonicalId);
            
            log("ALL TESTS PASSED ✅");

        } catch (e: any) {
            log(`ERROR: ${e.message}`);
            setResults(prev => [...prev, { name: 'Test Suite', status: 'FAIL' }]);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg">
                        <TestTube size={24} className="text-blue-600"/>
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900">Automated Self-Test</h3>
                        <p className="text-xs text-gray-500">Simulate end-to-end user flow to verify core logic.</p>
                    </div>
                </div>
                <button onClick={runTests} disabled={running} className="w-full bg-black text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50">
                    {running ? <RefreshCw className="animate-spin"/> : <Play size={20}/>}
                    Run Test Suite
                </button>
                
                <div className="space-y-2">
                    {results.map((r, i) => (
                        <div key={i} className={`flex justify-between items-center p-3 rounded border ${r.status === 'PASS' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                            <span className="font-medium text-sm">{r.name}</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${r.status === 'PASS' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>{r.status}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs text-green-400 overflow-y-auto h-[400px] shadow-inner">
                {logs.length === 0 && <span className="opacity-50">// Ready to start...</span>}
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
};

const SystemHealth = () => {
    const [bots, setBots] = useState<Bot[]>([]);
    const [botHealth, setBotHealth] = useState<Record<string, { status: 'OK' | 'FAIL', latency: number, msg?: string }>>({});
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [failedDeliveries, setFailedDeliveries] = useState<{campaign: Campaign, log: DeliveryLog}[]>([]);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();
    const features = Storage.getSettings().features || {};

    useEffect(() => {
        setBots(Storage.getBots());
        refreshLogs();
        refreshFailed();
    }, []);

    const refreshLogs = () => {
        const allLogs = Storage.getActivity();
        setLogs(allLogs.filter(l => l.entityType === 'ERROR' || l.entityType === 'SYSTEM' || l.entityType.includes('API')));
    };

    const refreshFailed = () => {
        const allCampaigns = Storage.getCampaigns();
        const failures: {campaign: Campaign, log: DeliveryLog}[] = [];
        allCampaigns.forEach(c => {
            c.logs.filter(l => l.status === 'FAILED').forEach(l => {
                failures.push({ campaign: c, log: l });
            });
        });
        setFailedDeliveries(failures);
    };

    const checkBots = async () => {
        setLoading(true);
        const newHealth: any = {};
        
        for (const bot of bots) {
            if (!bot.active) {
                newHealth[bot.id] = { status: 'DISABLED', latency: 0 };
                continue;
            }
            const start = Date.now();
            try {
                await TelegramAPI.getMe(bot.token);
                newHealth[bot.id] = { status: 'OK', latency: Date.now() - start };
            } catch (e: any) {
                newHealth[bot.id] = { status: 'FAIL', latency: 0, msg: e.message };
            }
        }
        setBotHealth(newHealth);
        setLoading(false);
        showToast("Diagnostics Complete");
    };

    const sendTestMsg = async (botId: string) => {
        const bot = bots.find(b => b.id === botId);
        const adminDest = Storage.getDestinations().find(d => d.type === 'USER'); 
        
        if (!bot || !adminDest) return showToast("No bot or valid destination found", 'error');
        
        try {
            await TelegramAPI.sendMessage(bot.token, adminDest.identifier, "Test Message from Health Check");
            showToast("Test message sent!");
        } catch (e: any) {
            showToast(`Send failed: ${e.message}`, 'error');
        }
    };

    const handleRetry = async (item: {campaign: Campaign, log: DeliveryLog}) => {
        const { campaign, log } = item;
        const dest = Storage.getDestinations().find(d => d.id === log.destinationId);
        const content = Storage.getContent().find(c => c.id === campaign.contentId);
        const bot = Storage.getBots().find(b => b.id === campaign.botId);

        if (!dest || !content || !bot) {
            return showToast("Cannot retry: missing resources", 'error');
        }

        try {
            await BotEngine.sendUnifiedMessage('TG', dest.identifier, content.body, content.mediaUrls?.[0]);
            
            const newLogs = campaign.logs.map(l => 
                (l.destinationId === log.destinationId && l.sentAt === log.sentAt) 
                ? { ...l, status: 'SUCCESS' as const, error: undefined } 
                : l
            );
            
            const sent = newLogs.filter(l => l.status === 'SUCCESS').length;
            const failed = newLogs.filter(l => l.status === 'FAILED').length;
            
            Storage.updateCampaign(campaign.id, { 
                logs: newLogs,
                progress: { ...campaign.progress, sent, failed }
            });
            
            showToast("Retried Successfully!");
            refreshFailed();
        } catch (e: any) {
            showToast(`Retry Failed: ${e.message}`, 'error');
        }
    };

    const handleClearFailed = (item: {campaign: Campaign, log: DeliveryLog}) => {
        const { campaign, log } = item;
        const newLogs = campaign.logs.filter(l => !(l.destinationId === log.destinationId && l.sentAt === log.sentAt));
        
        const sent = newLogs.filter(l => l.status === 'SUCCESS').length;
        const failed = newLogs.filter(l => l.status === 'FAILED').length;
        
        Storage.updateCampaign(campaign.id, { 
            logs: newLogs,
            progress: { ...campaign.progress, sent, failed, total: campaign.progress.total - 1 }
        });
        refreshFailed();
        showToast("Removed from queue");
    };

    const dataSize = JSON.stringify(localStorage).length;

    return (
        <div className="space-y-6">
            {/* System Status Banner */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Cpu size={24}/></div>
                    <div>
                        <h3 className="font-bold text-gray-900 text-sm">Active Modules (Flags)</h3>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(features).map(([key, val]) => (
                                <span key={key} className={`text-[10px] px-1.5 py-0.5 rounded border ${val ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                                    {key.replace('MODULE_', '')}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><HardDrive size={24}/></div>
                    <div>
                        <h3 className="font-bold text-gray-900 text-sm">Storage Usage</h3>
                        <div className="text-xs text-gray-500 mt-1">
                            <span className="font-mono font-bold text-gray-800">{(dataSize / 1024).toFixed(2)} KB</span> used. 
                            Database V7 Prod.
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center">
                <div className="flex gap-2">
                    <button onClick={refreshFailed} className="bg-white border text-gray-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-50">
                        <RefreshCw size={18} /> Refresh Queues
                    </button>
                    <button onClick={checkBots} disabled={loading} className="bg-brand-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-brand-700 disabled:opacity-50">
                        <Shield size={18} className={loading ? 'animate-spin' : ''}/> Run Diagnostics
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {bots.map(bot => {
                    const health = botHealth[bot.id];
                    return (
                        <div key={bot.id} className="bg-white p-5 rounded-xl border shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                                        <Shield size={20}/>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">{bot.name}</h3>
                                        <p className="text-xs text-gray-500">@{bot.username}</p>
                                    </div>
                                </div>
                                <div className={`px-2 py-1 rounded text-xs font-bold ${
                                    health?.status === 'OK' ? 'bg-green-100 text-green-700' : 
                                    health?.status === 'FAIL' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                                }`}>
                                    {health?.status || 'UNKNOWN'}
                                </div>
                            </div>
                            
                            {health?.status === 'OK' && (
                                <div className="flex items-center gap-2 text-xs text-green-600 mb-4">
                                    <Wifi size={14}/> Latency: {health.latency}ms
                                </div>
                            )}
                            
                            {health?.status === 'FAIL' && (
                                <div className="text-xs text-red-600 bg-red-50 p-2 rounded mb-4">
                                    Error: {health.msg}
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button onClick={() => sendTestMsg(bot.id)} disabled={!health || health.status !== 'OK'} className="flex-1 bg-gray-50 border hover:bg-gray-100 text-gray-700 text-xs py-2 rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50">
                                    <Send size={12}/> Test Send
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
                    <div className="p-4 border-b flex justify-between items-center bg-red-50 rounded-t-xl">
                        <div className="flex items-center gap-2 text-red-700">
                            <AlertTriangle size={18}/>
                            <span className="font-bold text-sm">Failed Delivery Queue</span>
                        </div>
                        <span className="text-xs font-bold bg-white px-2 py-1 rounded border border-red-200">{failedDeliveries.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-0">
                        {failedDeliveries.length === 0 && <div className="p-8 text-center text-gray-400 italic">No failed messages.</div>}
                        <table className="w-full text-xs text-left">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="p-3">Campaign</th>
                                    <th className="p-3">Reason</th>
                                    <th className="p-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {failedDeliveries.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="p-3">
                                            <div className="font-bold text-gray-800">{item.campaign.name}</div>
                                            <div className="text-gray-500">{new Date(item.log.sentAt).toLocaleTimeString()}</div>
                                        </td>
                                        <td className="p-3 text-red-600 max-w-[150px] truncate" title={item.log.error}>
                                            {item.log.error || 'Unknown Error'}
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => handleRetry(item)} className="p-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100" title="Retry"><RotateCcw size={14}/></button>
                                                <button onClick={() => handleClearFailed(item)} className="p-1.5 bg-gray-50 text-gray-500 rounded hover:bg-red-50 hover:text-red-500" title="Dismiss"><Trash2 size={14}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-gray-900 rounded-xl overflow-hidden shadow-sm border border-gray-800 flex flex-col h-[500px]">
                    <div className="bg-gray-800 px-4 py-3 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2 text-gray-300">
                            <Terminal size={18}/>
                            <span className="font-bold text-sm">System Logs</span>
                        </div>
                        <button onClick={refreshLogs} className="text-xs text-gray-400 hover:text-white">Refresh</button>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1">
                        {logs.length === 0 && <div className="text-gray-600 italic">No system logs found.</div>}
                        {logs.map((l, i) => (
                            <div key={l.id} className="flex gap-3 hover:bg-white/5 p-1 rounded">
                                <span className="text-gray-500 shrink-0 w-32">{new Date(l.timestamp).toLocaleString()}</span>
                                <span className={`shrink-0 font-bold w-24 ${l.entityType === 'ERROR' ? 'text-red-500' : 'text-green-500'}`}>[{l.entityType}]</span>
                                <span className="text-gray-300 break-all">{l.action}: {l.details}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
