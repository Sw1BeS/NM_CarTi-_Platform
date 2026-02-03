import React, { useState, useEffect, useRef } from 'react';
import { Data } from '../../../services/data';
import { Bot, BotMenuButtonConfig, Scenario } from '../../../types';
import { Plus, Trash2, Upload, Download, UploadCloud, Grid } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { TelegramAPI } from '../../../services/telegram';

const normalizeMenuConfig = (menuConfig?: Bot['menuConfig']) => {
    const buttonsRaw = Array.isArray(menuConfig?.buttons) ? menuConfig!.buttons : [];
    const buttons = buttonsRaw
        .filter((btn: any) => btn && typeof btn === 'object')
        .map((btn: any, idx: number) => ({
            ...btn,
            id: btn.id || `btn_${idx}`,
            label: typeof btn.label === 'string' ? btn.label.trim() : '',
            label_uk: typeof btn.label_uk === 'string' ? btn.label_uk : undefined,
            label_ru: typeof btn.label_ru === 'string' ? btn.label_ru : undefined,
            row: Number.isFinite(Number(btn.row)) ? Number(btn.row) : 0,
            col: Number.isFinite(Number(btn.col)) ? Number(btn.col) : idx
        }));

    return {
        welcomeMessage: menuConfig?.welcomeMessage || '',
        buttons
    };
};

export const BotMenuEditor = ({ scenarios, botId, standalone = false }: { scenarios: Scenario[], botId?: string, standalone?: boolean }) => {
    const [bots, setBots] = useState<Bot[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string>(botId || '');
    const [templateId, setTemplateId] = useState('standard');
    const { showToast } = useToast();
    const configInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const load = async () => {
            const list = await Data.getBots();
            setBots(list);
            if (!botId && list.length > 0) setSelectedBotId(list[0].id);
        };
        load();
    }, [botId]);

    // If botId prop changes (Studio Mode), update selection
    useEffect(() => { if (botId) setSelectedBotId(botId); }, [botId]);

    const bot = bots.find(b => b.id === selectedBotId);

    if (!bot) return <div className="p-10 text-center text-gray-400">No active bots found.</div>;
    const menuConfig = normalizeMenuConfig(bot.menuConfig);

    const normalizeTrigger = (value?: string) => (value || '').trim().toLowerCase().replace(/^\//, '');

    const resolveScenarioId = (query: string, list: Scenario[] = scenarios) => {
        const norm = normalizeTrigger(query);
        const exact = list.find(s => normalizeTrigger(s.triggerCommand || '') === norm);
        if (exact) return exact.id;
        const fuzzy = list.find(s => (s.name || '').toLowerCase().includes(norm));
        return fuzzy?.id;
    };

    const scenarioIdMap: Record<string, string> = {
        tpl_buy_request: 'scn_buy',
        tpl_sell_tradein: 'scn_sell',
        tpl_status_support: 'scn_support',
        tpl_lang_select: 'scn_lang'
    };

    const getScenarioIds = (list: Scenario[]) => ({
        buy: resolveScenarioId('buy', list) || scenarioIdMap.tpl_buy_request,
        sell: resolveScenarioId('sell', list) || scenarioIdMap.tpl_sell_tradein,
        support: resolveScenarioId('status', list) || resolveScenarioId('support', list) || scenarioIdMap.tpl_status_support,
        lang: resolveScenarioId('lang', list) || scenarioIdMap.tpl_lang_select
    });

    const scenarioIds = getScenarioIds(scenarios);

    const miniAppUrl = bot.miniAppConfig?.url || '{{MINI_APP_URL}}';

    const buildMenuTemplates = (ids: ReturnType<typeof getScenarioIds>) => ([
        {
            id: 'standard',
            name: 'CarTié Standard',
            description: 'Buy/Sell/Support + Mini App + Language',
            welcomeMessage: '👋 Welcome to CarTié! Choose an option below:',
            buttons: [
                { id: 'btn_buy', label: '🚗 Buy a Car', label_uk: '🚗 Купити авто', label_ru: '🚗 Купить авто', type: 'SCENARIO', value: ids.buy, row: 0, col: 0 },
                { id: 'btn_sell', label: '💰 Sell My Car', label_uk: '💰 Продати авто', label_ru: '💰 Продать авто', type: 'SCENARIO', value: ids.sell, row: 0, col: 1 },
                { id: 'btn_app', label: '📱 Open App', label_uk: '📱 Додаток', label_ru: '📱 Приложение', type: 'LINK', value: miniAppUrl, row: 1, col: 0 },
                { id: 'btn_support', label: '📞 Status / Support', label_uk: '📞 Статус / Підтримка', label_ru: '📞 Статус / Поддержка', type: 'SCENARIO', value: ids.support, row: 1, col: 1 },
                { id: 'btn_lang', label: '🌐 Language', label_uk: '🌐 Мова', label_ru: '🌐 Язык', type: 'SCENARIO', value: ids.lang, row: 2, col: 0 }
            ]
        },
        {
            id: 'sales',
            name: 'Sales Focus',
            description: 'Buy/Sell + App + Support',
            welcomeMessage: '🚗 CarTié Sales Desk — pick an action:',
            buttons: [
                { id: 'btn_buy', label: '🚗 Buy', label_uk: '🚗 Купити', label_ru: '🚗 Купить', type: 'SCENARIO', value: ids.buy, row: 0, col: 0 },
                { id: 'btn_sell', label: '💰 Sell', label_uk: '💰 Продати', label_ru: '💰 Продать', type: 'SCENARIO', value: ids.sell, row: 0, col: 1 },
                { id: 'btn_app', label: '📱 Mini App', label_uk: '📱 Додаток', label_ru: '📱 Приложение', type: 'LINK', value: miniAppUrl, row: 1, col: 0 },
                { id: 'btn_support', label: '☎️ Status / Support', label_uk: '☎️ Статус / Підтримка', label_ru: '☎️ Статус / Поддержка', type: 'SCENARIO', value: ids.support, row: 1, col: 1 }
            ]
        },
        {
            id: 'minimal',
            name: 'Minimal',
            description: 'App + Support only',
            welcomeMessage: 'Welcome! Use the menu below:',
            buttons: [
                { id: 'btn_app', label: '📱 Open App', label_uk: '📱 Додаток', label_ru: '📱 Приложение', type: 'LINK', value: miniAppUrl, row: 0, col: 0 },
                { id: 'btn_support', label: '📞 Status / Support', label_uk: '📞 Статус / Підтримка', label_ru: '📞 Статус / Поддержка', type: 'SCENARIO', value: ids.support, row: 0, col: 1 }
            ]
        }
    ]);

    const menuTemplates = buildMenuTemplates(scenarioIds);
    const selectedTemplate = menuTemplates.find(t => t.id === templateId) || menuTemplates[0];

    const ensureRequiredScenarios = async () => {
        const required = [
            { templateId: 'tpl_buy_request', scenarioId: scenarioIdMap.tpl_buy_request, trigger: 'buy' },
            { templateId: 'tpl_sell_tradein', scenarioId: scenarioIdMap.tpl_sell_tradein, trigger: 'sell' },
            { templateId: 'tpl_status_support', scenarioId: scenarioIdMap.tpl_status_support, trigger: 'status' },
            { templateId: 'tpl_lang_select', scenarioId: scenarioIdMap.tpl_lang_select, trigger: 'lang' }
        ];

        const current = await Data.getScenarios(botId ? { botId } : undefined);
        const hasScenario = (scenarioId: string, trigger: string) => current.some(s =>
            s.id === scenarioId || normalizeTrigger(s.triggerCommand || '') === normalizeTrigger(trigger)
        );
        const missing = required.filter(r => !hasScenario(r.scenarioId, r.trigger));
        if (!missing.length) return current;

        const templates = await Data.getTemplates().catch(() => []);
        for (const req of missing) {
            const tpl = templates.find(t => t.id === req.templateId);
            if (!tpl) {
                showToast(`Template ${req.templateId} not found. Run seed to install defaults.`, 'error');
                continue;
            }
            const now = new Date().toISOString();
            const scenario: Scenario = {
                id: req.scenarioId,
                name: tpl.name || 'New Flow',
                triggerCommand: tpl.triggerCommand || req.trigger,
                keywords: Array.isArray(tpl.keywords) ? tpl.keywords : [],
                isActive: true,
                botId: botId || undefined,
                entryNodeId: tpl.entryNodeId || tpl.nodes?.[0]?.id || 'node_start',
                createdAt: now,
                updatedAt: now,
                nodes: Array.isArray(tpl.nodes) ? tpl.nodes : []
            };
            await Data.saveScenario(scenario);
        }

        return await Data.getScenarios(botId ? { botId } : undefined);
    };

    const applyTemplate = async () => {
        const updatedScenarios = await ensureRequiredScenarios();
        const refreshedIds = getScenarioIds(updatedScenarios);
        const tpl = buildMenuTemplates(refreshedIds).find(t => t.id === templateId);
        if (!tpl) return;
        if (!confirm(`Apply "${tpl.name}" template? This will replace current menu buttons.`)) return;
        await saveConfig(tpl.buttons as BotMenuButtonConfig[], tpl.welcomeMessage);
        showToast(`Template applied: ${tpl.name}`);
    };

    const handlePublish = async () => {
        try {
            const commands = scenarios.filter(s => s.isActive).map(s => ({ command: s.triggerCommand, description: s.name }));
            if (commands.length) await TelegramAPI.setMyCommands(bot.token, commands);
            showToast("Commands Published! Go to Telegram Hub to sync Menu URL.");
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const handleExportConfig = () => {
        const dataStr = JSON.stringify(menuConfig, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `menu_config_${bot.username || 'bot'}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (json.buttons && Array.isArray(json.buttons)) {
                    if (confirm("Replace current menu configuration? This cannot be undone.")) {
                        saveConfig(json.buttons, json.welcomeMessage);
                        showToast("Menu Configuration Imported");
                    }
                } else {
                    showToast("Invalid config format", "error");
                }
            } catch (err) {
                showToast("Error parsing file", "error");
            }
            if (configInputRef.current) configInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    const addButton = (row: number) => {
        const newBtn: BotMenuButtonConfig = {
            id: `btn_${Date.now()}`,
            label: 'New Button',
            type: 'SCENARIO',
            value: '',
            row: row,
            col: 0
        };
        const updatedButtons = [...menuConfig.buttons, newBtn];
        saveConfig(updatedButtons);
    };

    const updateButton = (id: string, updates: Partial<BotMenuButtonConfig>) => {
        const updatedButtons = menuConfig.buttons.map(b => b.id === id ? { ...b, ...updates } : b);
        saveConfig(updatedButtons);
    };

    const deleteButton = (id: string) => {
        const updatedButtons = menuConfig.buttons.filter(b => b.id !== id);
        saveConfig(updatedButtons);
    };

    const saveConfig = async (buttons: BotMenuButtonConfig[], msg?: string) => {
        const nextConfig = normalizeMenuConfig({ ...menuConfig, buttons, welcomeMessage: msg || menuConfig.welcomeMessage });
        const updatedBot = { ...bot, menuConfig: nextConfig };
        await Data.saveBot(updatedBot);
        setBots(await Data.getBots());
    };

    const rows = [0, 1, 2, 3];
    const buttonsByRow = menuConfig.buttons.reduce((acc, btn) => {
        if (!acc[btn.row]) acc[btn.row] = [];
        acc[btn.row].push(btn);
        return acc;
    }, {} as Record<number, BotMenuButtonConfig[]>);

    return (
        <div className={`flex flex-col lg:flex-row gap-8 bg-[var(--bg-app)] p-4 md:p-8 h-full overflow-y-auto lg:overflow-hidden ${standalone ? '' : 'rounded-xl'}`}>
            <input type="file" ref={configInputRef} onChange={handleImportConfig} accept=".json" className="hidden" />

            {/* Visual Preview */}
            <div className="w-[350px] bg-[#0E1621] rounded-[40px] border-[8px] border-[#18181B] shadow-2xl flex flex-col overflow-hidden shrink-0 h-[700px] relative mx-auto lg:mx-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#18181B] rounded-b-xl z-20"></div>
                <div className="bg-[url('https://telegram.org/file/464001088/1/bSWkX5Y-Q7Y/7680076a5933615174')] bg-cover flex-1 p-4 flex flex-col items-center justify-center text-white text-sm">
                    <div className="bg-[#182533] p-3 rounded-lg shadow-sm mt-4 text-xs w-full max-w-[80%] ml-auto text-left opacity-90">
                        {menuConfig.welcomeMessage || "Welcome!"}
                        <div className="text-[9px] text-gray-400 text-right mt-1">10:00 AM</div>
                    </div>
                </div>
                <div className="bg-[#17212B] p-2 pb-8 grid gap-2 border-t border-[#000000]">
                    {rows.map(rowIdx => (
                        <div key={rowIdx} className="flex gap-2 min-h-[42px]">
                            {(buttonsByRow[rowIdx] || []).map(btn => (
                                <button key={btn.id} className="flex-1 bg-[#2B5278] shadow-sm rounded text-xs font-medium py-2 px-1 truncate text-white border-b border-[#203e5c] active:border-b-0 active:translate-y-[1px] transition-all">
                                    {btn.label}
                                </button>
                            ))}
                            {(!buttonsByRow[rowIdx] || buttonsByRow[rowIdx].length < 3) && (
                                <button onClick={() => addButton(rowIdx)} className="w-8 flex items-center justify-center bg-[#242F3D] rounded text-[#6C7883] hover:bg-[#2B5278] hover:text-white border border-dashed border-[#6C7883] transition-colors">
                                    <Plus size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Config Panel */}
            <div className="flex-1 bg-[var(--bg-panel)] rounded-xl shadow-lg border border-[var(--border-color)] p-8 overflow-y-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div>
                        <h3 className="font-bold text-2xl text-[var(--text-primary)]">Menu Configuration</h3>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">Customize the persistent keyboard layout</p>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                        {!botId && (
                            <select className="input w-48 text-sm" value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}>
                                {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        )}
                        <button onClick={() => configInputRef.current?.click()} className="btn-secondary px-3" title="Import Config"><Upload size={16} /></button>
                        <button onClick={handleExportConfig} className="btn-secondary px-3" title="Export Config"><Download size={16} /></button>
                        <button onClick={handlePublish} className="btn-primary flex items-center gap-2 px-4">
                            <UploadCloud size={16} /> Push Commands
                        </button>
                    </div>
                </div>

                {/* Templates */}
                <div className="mb-8">
                    <div className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <div className="text-xs uppercase font-bold text-[var(--text-secondary)]">Menu Templates</div>
                                <div className="text-sm text-[var(--text-primary)] font-semibold mt-1">{selectedTemplate?.name}</div>
                                <div className="text-xs text-[var(--text-secondary)] mt-1">{selectedTemplate?.description}</div>
                            </div>
                            <button onClick={applyTemplate} className="btn-primary text-xs px-4 py-2 whitespace-nowrap">Apply Template</button>
                        </div>
                        <div className="mt-4 flex flex-col sm:flex-row gap-3">
                            <select className="input text-sm" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                                {menuTemplates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                            <div className="text-[10px] text-[var(--text-secondary)] flex-1">
                                Uses current scenarios if they exist (buy/sell/status/lang). You can edit button targets after applying.
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mb-8">
                    <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Welcome Message</label>
                    <textarea
                        className="textarea h-24"
                        value={menuConfig.welcomeMessage || ''}
                        onChange={async e => {
                            await saveConfig(menuConfig.buttons, e.target.value);
                        }}
                    />
                </div>

                <div className="space-y-4">
                    <h4 className="text-sm font-bold text-[var(--text-primary)] uppercase border-b border-[var(--border-color)] pb-3 flex items-center gap-2">
                        <Grid size={16} /> Button Actions
                    </h4>
                    {menuConfig.buttons.map((btn, idx) => (
                        <div key={btn.id} className="bg-[var(--bg-input)] p-5 rounded-xl border border-[var(--border-color)] flex flex-col gap-4 group hover:border-gold-500/30 transition-all">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold bg-[var(--bg-panel)] px-2 py-1 rounded text-[var(--text-secondary)] border border-[var(--border-color)]">Row {btn.row + 1}</span>
                                <button onClick={() => deleteButton(btn.id)} className="text-red-500 hover:bg-red-500/10 p-2 rounded transition-colors"><Trash2 size={16} /></button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase mb-1 block">Label</label>
                                    <input className="input text-sm font-bold w-full mb-2" value={btn.label} onChange={e => updateButton(btn.id, { label: e.target.value })} placeholder="Default Label" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input className="input text-xs" value={btn.label_uk || ''} onChange={e => updateButton(btn.id, { label_uk: e.target.value })} placeholder="UK Label" />
                                        <input className="input text-xs" value={btn.label_ru || ''} onChange={e => updateButton(btn.id, { label_ru: e.target.value })} placeholder="RU Label" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase mb-1 block">Action Type</label>
                                    <select className="input text-sm" value={btn.type} onChange={e => updateButton(btn.id, { type: e.target.value as any })}>
                                        <option value="SCENARIO">Start Scenario</option>
                                        <option value="TEXT">Send Text Reply</option>
                                        <option value="LINK">Open URL</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase mb-1 block">Target</label>
                                    {btn.type === 'SCENARIO' ? (
                                        <select className="input text-sm" value={btn.value} onChange={e => updateButton(btn.id, { value: e.target.value })}>
                                            <option value="">Select Scenario...</option>
                                            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    ) : (
                                        <input className="input text-sm" placeholder={btn.type === 'LINK' ? 'https://...' : 'Reply text'} value={btn.value} onChange={e => updateButton(btn.id, { value: e.target.value })} />
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
