
import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { Campaign, Bot, ContentStatus } from '../../../types';
import { Plus, Check, AlertTriangle, Users, Send, X, Megaphone } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';

export const CampaignManager = ({ bot }: { bot: Bot }) => {
    const { showToast } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    useEffect(() => {
        const load = async () => {
            const all = await Data.getCampaigns();
            setCampaigns(
                all
                    .filter(c => c.botId === bot.id)
                    .map(c => ({
                        ...c,
                        progress: c.progress || { sent: 0, failed: 0, total: (c.destinationIds || []).length }
                    }))
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            );
        };
        load();
        const sub = Data.subscribe('UPDATE_CAMPAIGNS', load);
        return sub;
    }, [bot.id]);

    const handleCreate = async (data: any) => {
        const allDestinations = await Data.getDestinations();
        let targets = allDestinations;
        if (data.tag && data.tag !== 'ALL') {
            targets = allDestinations.filter(d => d.tags.includes(data.tag));
        }

        if (!targets.length) {
            showToast("No destinations found for this audience", "error");
            return;
        }
        if (!data.message?.trim()) {
            showToast("Message is required", "error");
            return;
        }

        const content = await Data.saveContent({
            id: `cnt_${Date.now()}`,
            title: `Content for ${data.name}`,
            body: data.message,
            type: 'POST',
            status: ContentStatus.APPROVED,
            createdAt: new Date().toISOString()
        } as any);

        await Data.createCampaign({
            name: data.name,
            botId: bot.id,
            contentId: content.id,
            destinationIds: targets.map(d => d.id),
            status: 'RUNNING'
        });

        setIsCreateOpen(false);
        showToast(`Campaign started with ${targets.length} recipients`);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-panel)]">
                <div>
                    <h3 className="font-bold text-lg text-[var(--text-primary)]">Broadcast Campaigns</h3>
                    <p className="text-xs text-[var(--text-secondary)]">Manage bulk messaging</p>
                </div>
                <button onClick={() => setIsCreateOpen(true)} className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
                    <Plus size={16} /> New Campaign
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 gap-4">
                {campaigns.map(camp => {
                    const progress = camp.progress || { sent: 0, failed: 0, total: (camp.destinationIds || []).length || 1 };
                    const pct = Math.min(100, Math.round((progress.sent / (progress.total || 1)) * 100));
                    return (
                    <div key={camp.id} className="panel p-5 flex flex-col gap-4 border-l-4 border-l-gold-500">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-[var(--text-primary)] text-lg">{camp.name}</h4>
                                <div className="text-xs text-[var(--text-secondary)] mt-1 flex gap-3">
                                    <span>Created: {new Date(camp.createdAt).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span>Status: <b className={camp.status === 'RUNNING' ? 'text-blue-500' : 'text-green-500'}>{camp.status}</b></span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
                                    {pct}%
                                </div>
                                <div className="text-xs text-[var(--text-secondary)]">Completion</div>
                            </div>
                        </div>
                        <div className="h-2 w-full bg-[var(--bg-input)] rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-500 ${camp.status === 'FAILED' ? 'bg-red-500' : 'bg-gold-500'}`} style={{ width: `${pct}%` }}></div>
                        </div>
                        <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
                            <div className="flex items-center gap-1"><Check size={14} className="text-green-500" /> {progress.sent} Sent</div>
                            <div className="flex items-center gap-1"><AlertTriangle size={14} className="text-red-500" /> {progress.failed} Failed</div>
                            <div className="flex items-center gap-1"><Users size={14} className="text-blue-500" /> {progress.total} Total</div>
                        </div>
                    </div>
                )})}
            </div>
            {isCreateOpen && <CreateCampaignModal onClose={() => setIsCreateOpen(false)} onCreate={handleCreate} />}
        </div>
    );
};

const CreateCampaignModal = ({ onClose, onCreate }: any) => {
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [tag, setTag] = useState('ALL');
    const [tags, setTags] = useState<string[]>([]);

    useEffect(() => {
        Data.getDestinations().then(dests => {
            setTags(Array.from(new Set(dests.flatMap(d => d.tags))));
        });
    }, []);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel w-full max-w-lg p-8 animate-slide-up shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-[var(--text-primary)]">New Broadcast</h3>
                    <button onClick={onClose}><X size={20} className="text-[var(--text-secondary)]" /></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Campaign Name</label>
                        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly Promo" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Audience Segment</label>
                        <select className="input" value={tag} onChange={e => setTag(e.target.value)}>
                            <option value="ALL">All Subscribers</option>
                            {tags.map(t => <option key={t} value={t}>Tag: {t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Message</label>
                        <textarea className="textarea h-32" value={message} onChange={e => setMessage(e.target.value)} placeholder="Hello {{name}}, check out our new stock..." />
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1">Available variables: {'{{name}}'}, {'{{manager}}'}</p>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                    <button onClick={onClose} className="btn-ghost">Cancel</button>
                    <button onClick={() => onCreate({ name, message, tag })} disabled={!name || !message} className="btn-primary px-6 flex items-center gap-2">
                        <Send size={16} /> Launch
                    </button>
                </div>
            </div>
        </div>
    );
};
