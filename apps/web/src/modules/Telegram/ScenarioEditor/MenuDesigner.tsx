import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { Bot, BotMenuButtonConfig, Scenario } from '../../../types';
import { TelegramAPI } from '../../../services/telegram';
import { useToast } from '../../../contexts/ToastContext';
import { Settings, Plus, RefreshCw, UploadCloud, Trash2 } from 'lucide-react';

interface MenuDesignerProps {
    bot: Bot;
    onSync?: () => Promise<void>;
}

export const MenuDesigner = ({ bot }: MenuDesignerProps) => {
    const { showToast } = useToast();
    const [menuConfig, setMenuConfig] = useState(bot.menuConfig || { welcomeMessage: '', buttons: [] });
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        Data.getScenarios().then(setScenarios);
    }, []);

    useEffect(() => {
        if (bot.menuConfig) setMenuConfig(bot.menuConfig);
    }, [bot.menuConfig]);

    const save = async (newConfig: any) => {
        setMenuConfig(newConfig);
        await Data.saveBot({ ...bot, menuConfig: newConfig });
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await TelegramAPI.setChatMenuButton(bot.token, "Open App", undefined); // Reset

            const commands = scenarios
                .filter(s => s.isActive && s.triggerCommand)
                .map(s => ({ command: s.triggerCommand, description: s.name }));

            // Add default commands
            if (!commands.find(c => c.command === 'start')) commands.push({ command: 'start', description: 'Start Bot' });
            if (!commands.find(c => c.command === 'menu')) commands.push({ command: 'menu', description: 'Show Menu' });

            await TelegramAPI.setMyCommands(bot.token, commands);
            showToast("Menu & Commands Synced to Telegram!");
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const addButton = (row: number) => {
        const newBtn: BotMenuButtonConfig = {
            id: `btn_${Date.now()}`,
            label: 'New Button',
            type: 'SCENARIO',
            value: '',
            row, col: 0
        };
        save({ ...menuConfig, buttons: [...menuConfig.buttons, newBtn] });
    };

    const updateButton = (id: string, updates: Partial<BotMenuButtonConfig>) => {
        const newButtons = menuConfig.buttons.map(b => b.id === id ? { ...b, ...updates } : b);
        save({ ...menuConfig, buttons: newButtons });
    };

    const deleteButton = (id: string) => {
        const newButtons = menuConfig.buttons.filter(b => b.id !== id);
        save({ ...menuConfig, buttons: newButtons });
    };

    const rows = [0, 1, 2, 3];
    const buttonsByRow = (menuConfig.buttons || []).reduce((acc: any, btn: any) => {
        if (!acc[btn.row]) acc[btn.row] = [];
        acc[btn.row].push(btn);
        return acc;
    }, {} as Record<number, BotMenuButtonConfig[]>);

    return (
        <div className="h-full flex gap-0">
            {/* Visual Editor */}
            <div className="flex-1 p-8 overflow-y-auto bg-[var(--bg-app)] flex flex-col items-center">
                <div className="w-[320px] bg-[#0E1621] rounded-[30px] border-[8px] border-[#18181B] shadow-2xl flex flex-col overflow-hidden shrink-0 relative mb-8">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#18181B] rounded-b-xl z-20"></div>
                    <div className="bg-[url('https://telegram.org/file/464001088/1/bSWkX5Y-Q7Y/7680076a5933615174')] bg-cover flex-1 p-4 flex flex-col justify-end">
                        <div className="bg-[#182533] p-3 rounded-lg shadow-sm text-white text-sm mb-4 opacity-90">
                            {menuConfig.welcomeMessage || "Welcome!"}
                        </div>
                    </div>
                    {/* Keyboard */}
                    <div className="bg-[#17212B] p-2 pb-6 grid gap-2 border-t border-black">
                        {rows.map(rowIdx => (
                            <div key={rowIdx} className="flex gap-2 min-h-[40px]">
                                {(buttonsByRow[rowIdx] || []).map((btn: any) => (
                                    <button key={btn.id} className="flex-1 bg-[#2B5278] rounded text-[10px] font-bold text-white px-1 py-2 truncate shadow-sm border-b border-[#1c3a57] relative group">
                                        {btn.label}
                                        <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center gap-2 backdrop-blur-[1px] rounded">
                                            <Settings size={12} className="cursor-pointer" />
                                        </div>
                                    </button>
                                ))}
                                {(!buttonsByRow[rowIdx] || buttonsByRow[rowIdx].length < 3) && (
                                    <button onClick={() => addButton(rowIdx)} className="w-8 flex items-center justify-center bg-[#242F3D] rounded text-white/30 hover:text-white border border-dashed border-white/10 hover:border-white/30">
                                        <Plus size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="w-full max-w-xl pb-10">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-[var(--text-primary)]">Configuration</h3>
                        <button onClick={handleSync} disabled={isSyncing} className="btn-primary py-2 px-4 text-xs flex items-center gap-2">
                            {isSyncing ? <RefreshCw size={14} className="animate-spin" /> : <UploadCloud size={14} />} Push to Telegram
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Welcome Message</label>
                            <textarea className="textarea h-20" value={menuConfig.welcomeMessage} onChange={e => save({ ...menuConfig, welcomeMessage: e.target.value })} />
                        </div>

                        <div className="space-y-3">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block">Button Actions</label>
                            {menuConfig.buttons.map((btn: any) => (
                                <div key={btn.id} className="bg-[var(--bg-input)] p-3 rounded-lg border border-[var(--border-color)] flex gap-3 items-start relative group">
                                    <div className="flex-1 grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[9px] text-[var(--text-muted)] uppercase block mb-1">Label</label>
                                            <input className="input text-xs py-1.5" value={btn.label} onChange={e => updateButton(btn.id, { label: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[9px] text-[var(--text-muted)] uppercase block mb-1">Type</label>
                                            <select className="input text-xs py-1.5" value={btn.type} onChange={e => updateButton(btn.id, { type: e.target.value as any })}>
                                                <option value="SCENARIO">Run Scenario</option>
                                                <option value="LINK">Open Link</option>
                                                <option value="TEXT">Send Text</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[9px] text-[var(--text-muted)] uppercase block mb-1">Target</label>
                                            {btn.type === 'SCENARIO' ? (
                                                <select className="input text-xs py-1.5" value={btn.value} onChange={e => updateButton(btn.id, { value: e.target.value })}>
                                                    <option value="">Select Flow...</option>
                                                    {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            ) : (
                                                <input className="input text-xs py-1.5" value={btn.value} onChange={e => updateButton(btn.id, { value: e.target.value })} placeholder={btn.type === 'LINK' ? 'https://' : 'Message'} />
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => deleteButton(btn.id)} className="text-red-500 p-2 hover:bg-red-500/10 rounded mt-4"><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
