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
        <div className="flex h-full">
            {/* Config Panel */}
            <div className="w-[400px] border-r border-[var(--border-color)] overflow-y-auto p-6 bg-[var(--bg-panel)]">
                <h3 className="font-bold text-lg text-[var(--text-primary)] mb-6 flex items-center gap-2">
                    <Smartphone size={20} className="text-gold-500" /> Mini App Configuration
                </h3>

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
                        />
                    </div>

                    {/* Color & Layout */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                Theme Color
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="color"
                                    className="h-9 w-9 rounded cursor-pointer border-0"
                                    value={config.primaryColor}
                                    onChange={e => save({ ...config, primaryColor: e.target.value })}
                                />
                                <input
                                    className="input flex-1 font-mono text-xs"
                                    value={config.primaryColor}
                                    onChange={e => save({ ...config, primaryColor: e.target.value })}
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
                                    className={`flex-1 py-2 rounded flex justify-center ${config.layout === 'GRID' ? 'bg-[var(--bg-panel)] text-gold-500' : 'text-[var(--text-muted)]'
                                        }`}
                                >
                                    <Grid size={16} />
                                </button>
                                <button
                                    onClick={() => save({ ...config, layout: 'LIST' })}
                                    className={`flex-1 py-2 rounded flex justify-center ${config.layout === 'LIST' ? 'bg-[var(--bg-panel)] text-gold-500' : 'text-[var(--text-muted)]'
                                        }`}
                                >
                                    <ListIcon size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Actions</label>
                            <button onClick={addAction} className="text-gold-500 hover:bg-gold-500/10 p-1 rounded">
                                <Plus size={16} />
                            </button>
                        </div>
                        <div className="space-y-2">
                            {config.actions.map(act => (
                                <div
                                    key={act.id}
                                    className="bg-[var(--bg-input)] p-3 rounded-lg border border-[var(--border-color)] flex justify-between items-center"
                                >
                                    <span className="text-sm text-[var(--text-primary)] font-semibold">{act.label}</span>
                                    <button onClick={() => removeAction(act.id)} className="text-red-500 hover:text-red-400">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
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
                    <div className="pt-10 px-6 pb-6" style={{ background: `linear-gradient(to bottom, ${config.primaryColor}20, transparent)` }}>
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
                </div>
            </div>
        </div>
    );
};
