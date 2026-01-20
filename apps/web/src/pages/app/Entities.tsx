
import React, { useState, useEffect } from 'react';
import { getMeta, createDefinition, listRecords, createRecord, updateRecord, deleteRecord, EntityDefinition, EntityField } from '../../services/entitiesApi';
import { Plus, RefreshCw, Trash2, Edit2, Database, MoreVertical, X, Save, Box } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

export const EntitiesPage = () => {
    const [meta, setMeta] = useState<EntityDefinition[]>([]);
    const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Modal states
    const [isDefModalOpen, setIsDefModalOpen] = useState(false);
    const [isRecModalOpen, setIsRecModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<any | null>(null);

    const { showToast } = useToast();

    useEffect(() => { loadMeta(); }, []);

    useEffect(() => {
        if (selectedSlug) loadRecords(selectedSlug);
    }, [selectedSlug]);

    const loadMeta = async () => {
        try {
            const data = await getMeta();
            setMeta(data);
            if (!selectedSlug && data.length > 0) setSelectedSlug(data[0].slug);
        } catch (e: any) {
            showToast("Failed to load entity definitions", 'error');
        }
    };

    const loadRecords = async (slug: string) => {
        setLoading(true);
        try {
            const data = await listRecords(slug);
            setRecords(data.map(r => ({ ...r.data, id: r.id }))); // Flatten for UI
        } catch (e: any) {
            showToast(`Failed to load ${slug}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteRecord = async (id: string) => {
        if (!selectedSlug || !confirm("Delete this record?")) return;
        try {
            await deleteRecord(selectedSlug, id);
            setRecords(prev => prev.filter(r => r.id !== id));
            showToast("Record deleted");
        } catch (e: any) {
            showToast("Delete failed", 'error');
        }
    };

    const selectedDef = meta.find(m => m.slug === selectedSlug);

    return (
        <div className="h-[calc(100vh-100px)] flex gap-6">
            {/* Sidebar */}
            <div className="w-64 panel flex flex-col p-0 overflow-hidden shrink-0">
                <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-input)] flex justify-between items-center">
                    <h3 className="font-bold text-[var(--text-primary)]">Entities</h3>
                    <button onClick={() => setIsDefModalOpen(true)} className="p-1.5 hover:bg-[var(--bg-panel)] rounded text-[var(--text-secondary)]">
                        <Plus size={16}/>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {meta.map(m => (
                        <button 
                            key={m.slug} 
                            onClick={() => setSelectedSlug(m.slug)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${selectedSlug === m.slug ? 'bg-[var(--bg-panel)] text-gold-500 border border-[var(--border-color)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'}`}
                        >
                            <Box size={14}/> {m.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 panel flex flex-col overflow-hidden relative">
                {selectedDef ? (
                    <>
                        <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-panel)]">
                            <div>
                                <h2 className="text-lg font-bold text-[var(--text-primary)]">{selectedDef.name}</h2>
                                <p className="text-xs text-[var(--text-secondary)] font-mono">{selectedDef.slug}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => loadRecords(selectedDef.slug)} className="btn-secondary p-2"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/></button>
                                <button onClick={() => { setEditingRecord(null); setIsRecModalOpen(true); }} className="btn-primary py-2 px-4 text-xs flex items-center gap-2">
                                    <Plus size={16}/> New Record
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-0">
                            <table className="table w-full text-left">
                                <thead className="bg-[var(--bg-input)] text-[var(--text-secondary)] text-xs uppercase sticky top-0">
                                    <tr>
                                        {selectedDef.fields.sort((a,b) => a.order - b.order).map(f => (
                                            <th key={f.key} className="p-3 border-b border-[var(--border-color)] font-bold whitespace-nowrap">{f.label}</th>
                                        ))}
                                        <th className="p-3 border-b border-[var(--border-color)] text-right w-20">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)]">
                                    {records.map(rec => (
                                        <tr key={rec.id} className="hover:bg-[var(--bg-input)] group">
                                            {selectedDef.fields.sort((a,b) => a.order - b.order).map(f => (
                                                <td key={f.key} className="p-3 text-sm text-[var(--text-primary)] truncate max-w-[200px]">
                                                    {typeof rec[f.key] === 'object' ? JSON.stringify(rec[f.key]) : String(rec[f.key] || '')}
                                                </td>
                                            ))}
                                            <td className="p-3 text-right flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditingRecord(rec); setIsRecModalOpen(true); }} className="text-blue-500 hover:bg-blue-500/10 p-1.5 rounded"><Edit2 size={14}/></button>
                                                <button onClick={() => handleDeleteRecord(rec.id)} className="text-red-500 hover:bg-red-500/10 p-1.5 rounded"><Trash2 size={14}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {records.length === 0 && !loading && (
                                        <tr>
                                            <td colSpan={selectedDef.fields.length + 1} className="p-8 text-center text-[var(--text-secondary)] italic">
                                                No records found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
                        <Database size={48} className="mb-4 opacity-20"/>
                        <p>Select an entity type to manage records</p>
                    </div>
                )}
            </div>

            {/* Modals */}
            {isDefModalOpen && <DefinitionModal onClose={() => setIsDefModalOpen(false)} onSave={() => { loadMeta(); setIsDefModalOpen(false); }} />}
            {isRecModalOpen && selectedDef && (
                <RecordModal 
                    def={selectedDef} 
                    initialData={editingRecord} 
                    onClose={() => setIsRecModalOpen(false)} 
                    onSave={() => { loadRecords(selectedDef.slug); setIsRecModalOpen(false); }} 
                />
            )}
        </div>
    );
};

const DefinitionModal = ({ onClose, onSave }: any) => {
    const { showToast } = useToast();
    const [form, setForm] = useState<EntityDefinition>({ slug: '', name: '', fields: [] });
    const [newField, setNewField] = useState<EntityField>({ key: '', label: '', type: 'text', required: false, order: 0 });

    const addField = () => {
        if (!newField.key || !newField.label) return;
        setForm({ ...form, fields: [...form.fields, { ...newField, order: form.fields.length }] });
        setNewField({ key: '', label: '', type: 'text', required: false, order: 0 });
    };

    const submit = async () => {
        try {
            await createDefinition(form);
            showToast("Definition created");
            onSave();
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel w-full max-w-lg p-6 animate-slide-up shadow-2xl overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between mb-6">
                    <h3 className="font-bold text-lg text-[var(--text-primary)]">New Entity Type</h3>
                    <button onClick={onClose}><X size={20} className="text-[var(--text-secondary)]"/></button>
                </div>
                <div className="space-y-4">
                    <input className="input" placeholder="Slug (e.g. products)" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} />
                    <input className="input" placeholder="Name (e.g. Products)" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    
                    <div className="border-t border-[var(--border-color)] pt-4 mt-4">
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Fields</label>
                        <div className="space-y-2 mb-4">
                            {form.fields.map((f, i) => (
                                <div key={i} className="flex justify-between items-center bg-[var(--bg-input)] p-2 rounded text-sm text-[var(--text-primary)]">
                                    <span>{f.label} <span className="text-[var(--text-secondary)] font-mono text-xs">({f.type})</span></span>
                                    <span className="font-mono text-xs text-[var(--text-secondary)]">{f.key}</span>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <input className="input text-xs" placeholder="Key" value={newField.key} onChange={e => setNewField({...newField, key: e.target.value})} />
                            <input className="input text-xs" placeholder="Label" value={newField.label} onChange={e => setNewField({...newField, label: e.target.value})} />
                            <select className="input text-xs" value={newField.type} onChange={e => setNewField({...newField, type: e.target.value as any})}>
                                <option value="text">Text</option>
                                <option value="number">Number</option>
                                <option value="boolean">Boolean</option>
                                <option value="date">Date</option>
                            </select>
                        </div>
                        <button onClick={addField} className="btn-secondary w-full mt-2 text-xs">+ Add Field</button>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={submit} className="btn-primary">Create Entity</button>
                </div>
            </div>
        </div>
    );
};

const RecordModal = ({ def, initialData, onClose, onSave }: any) => {
    const { showToast } = useToast();
    const [data, setData] = useState<any>(initialData || {});

    const submit = async () => {
        try {
            if (initialData?.id) await updateRecord(def.slug, initialData.id, data);
            else await createRecord(def.slug, data);
            showToast("Record saved");
            onSave();
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel w-full max-w-lg p-6 animate-slide-up shadow-2xl">
                <div className="flex justify-between mb-6">
                    <h3 className="font-bold text-lg text-[var(--text-primary)]">{initialData ? 'Edit' : 'New'} {def.name}</h3>
                    <button onClick={onClose}><X size={20} className="text-[var(--text-secondary)]"/></button>
                </div>
                <div className="space-y-4">
                    {def.fields.sort((a: any,b: any) => a.order - b.order).map((f: EntityField) => (
                        <div key={f.key}>
                            <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase mb-1">{f.label}</label>
                            {f.type === 'boolean' ? (
                                <input type="checkbox" checked={!!data[f.key]} onChange={e => setData({...data, [f.key]: e.target.checked})} />
                            ) : (
                                <input 
                                    className="input" 
                                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                                    value={data[f.key] || ''} 
                                    onChange={e => setData({...data, [f.key]: f.type === 'number' ? +e.target.value : e.target.value})} 
                                />
                            )}
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={submit} className="btn-primary">Save</button>
                </div>
            </div>
        </div>
    );
};
