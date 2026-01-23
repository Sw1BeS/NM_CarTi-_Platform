import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { Bot, MiniAppConfig } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { Smartphone, Plus, Trash2, Grid, List as ListIcon, Palette } from 'lucide-react';

export const MiniAppManager = ({ botId }: { botId: string }) => {
    const { showToast } = useToast();
    const [bot, setBot] = useState<Bot | null>(null);
    const [config, setConfig] = useState<MiniAppConfig>({
        isEnabled: true,
        title: 'CarTié',
        welcomeText: 'Welcome',
        primaryColor: '#D4AF37',
        layout: 'GRID',
        actions: []
    });

    useEffect(() => {
        const loadBot = async () => {
            const bots = await Data.getBots();
            const found = bots.find(b => b.id === botId);
            if (found) {
                setBot(found);
                setConfig(found.miniAppConfig || config);
            }
        };
        loadBot();
    }, [botId]);

    const save = async (newConfig: MiniAppConfig) => {
        if (!bot) return;
        setConfig(newConfig);
        await Data.saveBot({ ...bot, miniAppConfig: newConfig });
        showToast('Mini App config saved');
    };

    const addAction = () => {
        save({
            ...config,
            actions: [
                ...config.actions,
                { id: `act_${Date.now()}`, label: 'Action', icon: 'Zap', actionType: 'VIEW', value: 'REQUEST' }
            ]
        });
    };

    const removeAction = (id: string) => {
        save({ ...config, actions: config.actions.filter(a => a.id !== id) });
    };

    return (
        <div className="flex h-full flex-col md:flex-row">
            {/* Config Panel */}
            <div className="w-full md:w-[400px] border-r border-[var(--border-color)] overflow-y-auto p-6 bg-[var(--bg-panel)]">
                <div className="mb-6">
                    <h3 className="font-bold text-lg text-[var(--text-primary)] flex items-center gap-2">
                        <Smartphone size={20} className="text-gold-500" /> Mini App Configuration
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Customize your Telegram Mini App appearance and actions</p>
                </div>

                <div className="space-y-6">
                    {/* Title */}
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                            App Title
                        </label>
                        <input
                            className="input"
                            value={config.title}
                            onChange={e => save({ ...config, title: e.target.value })}
                            placeholder="e.g. CarTié"
                        />
                    </div>

                    {/* Welcome Text */}
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                            Welcome Message
                        </label>
                        <textarea
                            className="textarea h-20"
                            value={config.welcomeText}
                            onChange={e => save({ ...config, welcomeText: e.target.value })}
                            placeholder="Welcome to our service!"
                        />
                    </div>

                    {/* Color & Layout */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                <Palette size={12} className="inline mr-1" /> Theme Color
                            </label>
                            <div className="flex gap-2">
                                <div className="relative">
                                    <input
                                        type="color"
                                        className="h-10 w-10 rounded-lg cursor-pointer border-2 border-[var(--border-color)] hover:border-gold-500 transition-colors"
                                        value={config.primaryColor}
                                        onChange={e => save({ ...config, primaryColor: e.target.value })}
                                    />
                                </div>
                                <input
                                    className="input flex-1 font-mono text-xs"
                                    value={config.primaryColor}
                                    onChange={e => save({ ...config, primaryColor: e.target.value })}
                                    placeholder="#D4AF37"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                Layout
                            </label>
                            <div className="flex bg-[var(--bg-input)] p-1 rounded-lg border border-[var(--border-color)]">
                                <button
                                    onClick={() => save({ ...config, layout: 'GRID' })}
                                    className={`flex-1 py-2 rounded flex justify-center items-center gap-1 transition-all ${config.layout === 'GRID' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    <Grid size={16} />
                                    <span className="text-xs font-bold hidden sm:inline">Grid</span>
                                </button>
                                <button
                                    onClick={() => save({ ...config, layout: 'LIST' })}
                                    className={`flex-1 py-2 rounded flex justify-center items-center gap-1 transition-all ${config.layout === 'LIST' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    <ListIcon size={16} />
                                    <span className="text-xs font-bold hidden sm:inline">List</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Action Buttons</label>
                            <button
                                onClick={addAction}
                                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
                            >
                                <Plus size={14} /> Add Action
                            </button>
                        </div>
                        <div className="space-y-3">
                            {config.actions.map(act => (
                                <div
                                    key={act.id}
                                    className="bg-[var(--bg-input)] p-4 rounded-lg border border-[var(--border-color)] hover:border-gold-500/30 transition-colors group"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-500">
                                                ⚡
                                            </div>
                                            <span className="text-sm text-[var(--text-primary)] font-semibold">{act.label}</span>
                                        </div>
                                        <button
                                            onClick={() => removeAction(act.id)}
                                            className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <div className="text-[10px] text-[var(--text-secondary)] font-mono bg-[var(--bg-app)] px-2 py-1 rounded">
                                        {act.actionType}: {act.value || 'Not configured'}
                                    </div>
                                </div>
                            ))}
                            {config.actions.length === 0 && (
                                <div className="text-center py-8 text-[var(--text-secondary)] text-sm border-2 border-dashed border-[var(--border-color)] rounded-lg">
                                    No actions configured. Click "Add Action" to get started.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Live Preview */}
            <div className="flex-1 bg-[var(--bg-app)] flex items-center justify-center p-8">
                <div className="w-[320px] h-[640px] bg-[#0E1621] rounded-[40px] border-[8px] border-[#18181B] shadow-2xl overflow-hidden relative flex flex-col">
                    {/* Notch */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#18181B] rounded-b-xl z-20" />

                    {/* Header */}
                    <div className="pt-10 px-6 pb-6 shadow-sm" style={{ background: `linear-gradient(to bottom, ${config.primaryColor}20, transparent)` }}>
                        <div className="flex justify-between items-center mb-4 text-white">
                            <span className="text-blue-400 font-medium text-sm flex items-center gap-1 cursor-pointer">← Back</span>
                            <span className="font-bold text-sm">Mini App</span>
                            <span className="w-8"></span>
                        </div>
                        <h2 className="text-xl font-bold text-white">{config.title}</h2>
                        <p className="text-white/60 text-xs mt-1">{config.welcomeText}</p>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-4 pb-20">
                        <div className={`grid gap-3 ${config.layout === 'GRID' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {config.actions.map(act => (
                                <div
                                    key={act.id}
                                    className="bg-[#182533] p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-2 text-center"
                                >
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/80">
                                        ⚡
                                    </div>
                                    <span className="text-xs font-bold text-white/90">{act.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Bottom Navigation Bar */}
                    <div className="absolute bottom-0 left-0 w-full h-16 bg-[#18181B] border-t border-white/5 flex justify-around items-center px-2">
                         <div className="flex flex-col items-center gap-1 opacity-50 hover:opacity-100 transition-opacity cursor-pointer">
                             <div className="w-6 h-6 rounded bg-white/10"></div>
                             <span className="text-[9px] text-white">Home</span>
                         </div>
                         <div className="flex flex-col items-center gap-1 opacity-100 cursor-pointer">
                             <div className="w-6 h-6 rounded bg-blue-500"></div>
                             <span className="text-[9px] text-blue-400">App</span>
                         </div>
                         <div className="flex flex-col items-center gap-1 opacity-50 hover:opacity-100 transition-opacity cursor-pointer">
                             <div className="w-6 h-6 rounded bg-white/10"></div>
                             <span className="text-[9px] text-white">Settings</span>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
