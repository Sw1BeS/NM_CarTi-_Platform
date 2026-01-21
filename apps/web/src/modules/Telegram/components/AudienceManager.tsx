
import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { TelegramDestination, Bot } from '../../../types';
import { Search, X, User } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';

export const AudienceManager = ({ bot }: { bot: Bot }) => {
    const [users, setUsers] = useState<TelegramDestination[]>([]);
    const [search, setSearch] = useState('');
    const [editingUser, setEditingUser] = useState<TelegramDestination | null>(null);
    const { showToast } = useToast();

    useEffect(() => {
        const load = async () => setUsers(await Data.getDestinations());
        load();
        const sub = Data.subscribe('UPDATE_DESTINATIONS', load);
        return sub;
    }, []);

    const filtered = users.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()) || u.identifier.includes(search));

    const handleAddTag = async (tag: string) => {
        if (!editingUser || !tag.trim()) return;
        if (editingUser.tags.includes(tag)) return;
        const updated = { ...editingUser, tags: [...editingUser.tags, tag] };
        await Data.saveDestination(updated);
        setEditingUser(updated);
        showToast("Tag added");
    };

    const removeTag = async (tag: string) => {
        if (!editingUser) return;
        const updated = { ...editingUser, tags: editingUser.tags.filter(t => t !== tag) };
        await Data.saveDestination(updated);
        setEditingUser(updated);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b border-[var(--border-color)] flex gap-4 bg-[var(--bg-panel)]">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
                    <input className="input pl-10" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            </div>
            <div className="flex-1 overflow-hidden flex">
                <div className="flex-1 overflow-y-auto p-4">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[var(--text-secondary)] uppercase text-xs font-bold border-b border-[var(--border-color)]">
                            <tr>
                                <th className="p-3">User</th>
                                <th className="p-3">ID</th>
                                <th className="p-3">Tags</th>
                                <th className="p-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                            {filtered.map(u => (
                                <tr key={u.id} className="hover:bg-[var(--bg-input)] group">
                                    <td className="p-3 font-bold text-[var(--text-primary)]">{u.name}</td>
                                    <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">{u.identifier}</td>
                                    <td className="p-3">
                                        <div className="flex gap-1 flex-wrap">
                                            {u.tags.map(t => (<span key={t} className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-500/20">{t}</span>))}
                                        </div>
                                    </td>
                                    <td className="p-3 text-right">
                                        <button onClick={() => setEditingUser(u)} className="btn-secondary px-3 py-1 text-xs">Edit Tags</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {editingUser && (
                    <div className="w-80 border-l border-[var(--border-color)] bg-[var(--bg-panel)] p-6 overflow-y-auto shadow-xl z-10 animate-slide-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-[var(--text-primary)]">User Details</h3>
                            <button onClick={() => setEditingUser(null)}><X size={18} className="text-[var(--text-secondary)]" /></button>
                        </div>
                        <div className="mb-6 text-center">
                            <div className="w-16 h-16 bg-[var(--bg-input)] rounded-full mx-auto flex items-center justify-center text-2xl font-bold text-[var(--text-secondary)] mb-2 border border-[var(--border-color)]">{editingUser.name?.[0]}</div>
                            <h4 className="font-bold text-[var(--text-primary)]">{editingUser.name}</h4>
                            <p className="text-xs text-[var(--text-secondary)] font-mono">{editingUser.identifier}</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Tags</label>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {editingUser.tags.map(t => (
                                        <span key={t} className="bg-gold-500/10 text-gold-500 px-2 py-1 rounded text-xs border border-gold-500/30 flex items-center gap-1">
                                            {t}
                                            <button onClick={() => removeTag(t)}><X size={12} /></button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input className="input text-xs py-1.5" placeholder="Add tag..." onKeyDown={e => { if (e.key === 'Enter') { handleAddTag(e.currentTarget.value); e.currentTarget.value = ''; } }} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
