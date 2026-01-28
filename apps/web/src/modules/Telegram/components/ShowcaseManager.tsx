import React, { useState, useEffect } from 'react';
import { ShowcaseService } from '../../../services/showcaseService';
import { useToast } from '../../../contexts/ToastContext';
import { Showcase } from '../../../types';
import { Plus, Trash2, Edit, ExternalLink, Filter, Save, X } from 'lucide-react';

export const ShowcaseManager = ({ botId }: { botId: string }) => {
    const [items, setItems] = useState<Showcase[]>([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<Showcase | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const { showToast } = useToast();

    const load = async () => {
        setLoading(true);
        try {
            const list = await ShowcaseService.getShowcases();
            setItems(list);
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [botId]);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        try {
            await ShowcaseService.deleteShowcase(id);
            setItems(items.filter(i => i.id !== id));
            showToast('Deleted', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const handleSave = async (data: any) => {
        try {
            if (editing) {
                const updated = await ShowcaseService.updateShowcase(editing.id, data);
                setItems(items.map(i => i.id === editing.id ? updated : i));
                setEditing(null);
            } else {
                const created = await ShowcaseService.createShowcase({ ...data, botId }); // Default to current bot
                setItems([created, ...items]);
                setIsCreating(false);
            }
            showToast('Saved', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    if (editing || isCreating) {
        return (
            <ShowcaseEditor
                initial={editing || { name: '', slug: '', isPublic: true, rules: { mode: 'FILTER', filters: { status: ['AVAILABLE'] } } }}
                botId={botId}
                onSave={handleSave}
                onCancel={() => { setEditing(null); setIsCreating(false); }}
            />
        );
    }

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Showcases</h2>
                <button onClick={() => setIsCreating(true)} className="btn-primary flex items-center gap-2">
                    <Plus size={16} /> New Showcase
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
                {items.filter(i => !i.botId || i.botId === botId).map(item => (
                    <div key={item.id} className="panel p-4 border border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                            <h3 className="font-bold text-[var(--text-primary)]">{item.name}</h3>
                            <div className="flex gap-2">
                                <button onClick={() => setEditing(item)} className="text-[var(--text-secondary)] hover:text-blue-500"><Edit size={16} /></button>
                                <button onClick={() => handleDelete(item.id)} className="text-[var(--text-secondary)] hover:text-red-500"><Trash2 size={16} /></button>
                            </div>
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <span className="font-mono bg-[var(--bg-input)] px-1 rounded">{item.slug}</span>
                                <a href={`/p/app/${item.slug}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                                    Open <ExternalLink size={10} />
                                </a>
                            </div>
                            <div>Mode: {item.rules.mode}</div>
                            {item.botId === botId && <div className="text-green-500 font-bold text-[10px]">LINKED TO THIS BOT</div>}
                        </div>
                    </div>
                ))}
                {items.filter(i => !i.botId || i.botId === botId).length === 0 && (
                    <div className="col-span-full text-center text-[var(--text-secondary)] py-10">
                        No showcases found for this bot.
                    </div>
                )}
            </div>
        </div>
    );
};

const ShowcaseEditor = ({ initial, botId, onSave, onCancel }: any) => {
    const [form, setForm] = useState(initial);

    // Helper to update filters
    const setFilter = (key: string, val: any) => {
        setForm({
            ...form,
            rules: {
                ...form.rules,
                filters: {
                    ...form.rules.filters,
                    [key]: val
                }
            }
        });
    };

    return (
        <div className="p-6 h-full overflow-y-auto">
            <div className="max-w-2xl mx-auto panel p-6 bg-[var(--bg-panel)] border border-[var(--border-color)]">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">{initial.id ? 'Edit Showcase' : 'New Showcase'}</h2>
                    <button onClick={onCancel}><X size={20} /></button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="label">Name</label>
                        <input className="input w-full" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div>
                        <label className="label">Slug (URL)</label>
                        <input className="input w-full" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
                        <div className="text-xs text-[var(--text-secondary)] mt-1">Public URL: /p/app/{form.slug || '...'}</div>
                    </div>

                    <div className="flex items-center gap-2">
                         <input type="checkbox" checked={form.isPublic} onChange={e => setForm({...form, isPublic: e.target.checked})} />
                         <span className="text-sm">Publicly Accessible</span>
                    </div>

                    <div className="border-t border-[var(--border-color)] pt-4">
                        <h3 className="font-bold mb-3 flex items-center gap-2"><Filter size={16} /> Filtering Rules</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="label">Min Price ($)</label>
                                <input type="number" className="input w-full" value={form.rules?.filters?.priceMin || ''} onChange={e => setFilter('priceMin', Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="label">Max Price ($)</label>
                                <input type="number" className="input w-full" value={form.rules?.filters?.priceMax || ''} onChange={e => setFilter('priceMax', Number(e.target.value))} />
                            </div>
                             <div>
                                <label className="label">Min Year</label>
                                <input type="number" className="input w-full" value={form.rules?.filters?.yearMin || ''} onChange={e => setFilter('yearMin', Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="label">Max Year</label>
                                <input type="number" className="input w-full" value={form.rules?.filters?.yearMax || ''} onChange={e => setFilter('yearMax', Number(e.target.value))} />
                            </div>
                        </div>

                        <div className="mt-4">
                            <label className="label">Statuses (comma separated)</label>
                            <input className="input w-full" placeholder="AVAILABLE, RESERVED" value={form.rules?.filters?.status?.join(', ') || ''} onChange={e => setFilter('status', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))} />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                        <button onClick={onCancel} className="btn-ghost">Cancel</button>
                        <button onClick={() => onSave(form)} className="btn-primary flex items-center gap-2"><Save size={16} /> Save Showcase</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
