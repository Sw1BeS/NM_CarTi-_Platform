import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Store, Search, Download, Check, Star, Grid, List, Filter, Crown } from 'lucide-react';

interface Template {
    id: string;
    name: string;
    category: string;
    description: string;
    thumbnail?: string;
    isPremium: boolean;
    installs: number;
    rating?: number;
}

const CATEGORIES = ['ALL', 'LEAD_GEN', 'E_COMMERCE', 'B2B', 'SUPPORT'];

export const MarketplacePage = () => {
    const { showToast } = useToast();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [installed, setInstalled] = useState<Set<string>>(new Set());
    const [category, setCategory] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');

    useEffect(() => {
        loadTemplates();
        loadInstalled();
    }, [category, searchQuery]);

    const loadTemplates = async () => {
        try {
            const params = new URLSearchParams();
            if (category !== 'ALL') params.append('category', category);
            if (searchQuery) params.append('search', searchQuery);

            const response = await fetch(`/api/templates/marketplace?${params}`);
            if (response.ok) {
                const data = await response.json();
                setTemplates(data);
            }
        } catch (e) {
            console.error('Failed to load templates:', e);
        }
    };

    const loadInstalled = async () => {
        try {
            const response = await fetch('/api/templates/installed/list', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('cartie_token')}` }
            });

            if (response.ok) {
                const data = await response.json();
                setInstalled(new Set(data.map((i: any) => i.templateId)));
            }
        } catch (e) {
            console.error('Failed to load installed:', e);
        }
    };

    const installTemplate = async (templateId: string) => {
        try {
            const response = await fetch(`/api/templates/${templateId}/install`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('cartie_token')}` }
            });

            if (response.ok) {
                showToast('Template installed!', 'success');
                loadInstalled();
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to install', 'error');
            }
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="panel p-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Template Marketplace</h1>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">Browse and install pre-built bot scenarios</p>
                    </div>
                    <div className="flex gap-2 bg-[var(--bg-input)] rounded-lg p-1 border border-[var(--border-color)]">
                        <button
                            onClick={() => setViewMode('GRID')}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${viewMode === 'GRID' ? 'bg-gold-500 text-black' : 'text-[var(--text-secondary)]'
                                }`}
                        >
                            <Grid size={14} className="inline mr-1" /> Grid
                        </button>
                        <button
                            onClick={() => setViewMode('LIST')}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${viewMode === 'LIST' ? 'bg-gold-500 text-black' : 'text-[var(--text-secondary)]'
                                }`}
                        >
                            <List size={14} className="inline mr-1" /> List
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
                        <input
                            className="input pl-10"
                            placeholder="Search templates..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-2 overflow-x-auto">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={`px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition-colors ${category === cat
                                    ? 'bg-gold-500 text-black'
                                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-panel)]'
                                    }`}
                            >
                                {cat.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Templates Grid/List */}
            <div className={viewMode === 'GRID' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}>
                {templates.map(template => (
                    <div
                        key={template.id}
                        className={`panel p-6 ${viewMode === 'LIST' ? 'flex gap-6' : ''}`}
                    >
                        {template.thumbnail && (
                            <img
                                src={template.thumbnail}
                                className={viewMode === 'LIST' ? 'w-32 h-32 rounded-lg object-cover' : 'w-full h-40 rounded-lg object-cover mb-4'}
                                alt={template.name}
                            />
                        )}

                        <div className="flex-1">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                                        {template.name}
                                        {template.isPremium && <Crown size={14} className="text-gold-500" />}
                                    </h3>
                                    <div className="text-xs text-[var(--text-secondary)] mt-1">{template.category.replace('_', ' ')}</div>
                                </div>
                                {template.rating && (
                                    <div className="flex items-center gap-1 text-xs text-gold-500">
                                        <Star size={12} fill="currentColor" />
                                        {template.rating.toFixed(1)}
                                    </div>
                                )}
                            </div>

                            <p className="text-sm text-[var(--text-secondary)] mb-4 line-clamp-2">
                                {template.description}
                            </p>

                            <div className="flex justify-between items-center">
                                <div className="text-xs text-[var(--text-muted)]">
                                    <Download size={12} className="inline mr-1" />
                                    {template.installs} installs
                                </div>

                                {installed.has(template.id) ? (
                                    <div className="flex items-center gap-1 text-xs text-green-500 font-bold">
                                        <Check size={14} /> Installed
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => installTemplate(template.id)}
                                        className="btn-primary px-4 py-1.5 text-xs"
                                    >
                                        Install
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {templates.length === 0 && (
                    <div className="col-span-full text-center py-12 panel">
                        <Store size={48} className="mx-auto text-[var(--text-secondary)] mb-4" />
                        <p className="text-[var(--text-secondary)]">No templates found</p>
                    </div>
                )}
            </div>
        </div>
    );
};
