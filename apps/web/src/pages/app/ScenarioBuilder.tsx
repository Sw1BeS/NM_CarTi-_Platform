
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Data } from '../../services/data';
import { Scenario, ScenarioNode, NodeType, Bot, BotMenuButtonConfig } from '../../types';
import { Plus, Save, Trash2, ArrowRight, MessageSquare, HelpCircle, Search, UserCheck, X, GitMerge, MousePointer2, Move, LayoutGrid, Smartphone, Filter, Play, Send, Menu, Smartphone as PhoneIcon, Link as LinkIcon, Type, Zap, Globe, UploadCloud, Loader, Grid, Box, Crosshair, ChevronDown, Check, FolderOpen, DollarSign, Key, Settings, Download, Upload, Megaphone } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { TelegramAPI } from '../../services/telegram';
import { ApiClient } from '../../services/apiClient';

const NODE_WIDTH = 280;

const normalizeScenario = (s: Scenario): Scenario => {
    const safeNodes = (Array.isArray(s.nodes) && s.nodes.length > 0 ? s.nodes : [{
        id: 'node_start',
        type: 'START',
        content: { text: '' },
        nextNodeId: '',
        position: { x: 200, y: 300 }
    }]).map((n: any, idx: number) => {
        const base = (n && typeof n === 'object') ? n : {};
        return {
            ...base,
            id: (base as any).id || `node_${idx}_${Date.now()}`,
            content: (base as any).content || {},
            position: (base as any).position || { x: 200 + idx * 40, y: 300 + idx * 40 }
        };
    });
    const entryNodeId = s.entryNodeId && safeNodes.find(n => n.id === s.entryNodeId) ? s.entryNodeId : safeNodes[0].id;
    return { ...s, nodes: safeNodes, entryNodeId };
};

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

export const ScenarioBuilder = () => {
    const [view, setView] = useState<'FLOWS' | 'MENU'>('FLOWS');
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadScenarios = async () => {
        const list = await Data.getScenarios();
        setScenarios(list.map(normalizeScenario));
    };

    useEffect(() => {
        loadScenarios();
        const unsub = Data.subscribe('UPDATE_SCENARIOS', loadScenarios);
        return unsub;
    }, []);

    const createScenario = async () => {
        const newScen: Scenario = {
            id: `scn_${Date.now()}`,
            name: 'New Flow',
            triggerCommand: `flow_${Math.floor(Math.random() * 1000)}`,
            keywords: [],
            isActive: false,
            entryNodeId: 'node_start',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            nodes: [{ id: 'node_start', type: 'START', content: { text: '' }, nextNodeId: '', position: { x: 200, y: 300 } }]
        };
        await Data.saveScenario(newScen);
        setSelectedId(newScen.id);
        setView('FLOWS');
    };

    const importTemplate = async (template: Scenario) => {
        const newScen = {
            ...template,
            id: `scn_tpl_${Date.now()}`,
            name: `${template.name} (Copy)`,
            triggerCommand: `${template.triggerCommand}_${Math.floor(Math.random() * 100)}`,
            isActive: false
        };
        await Data.saveScenario(newScen);
        setSelectedId(newScen.id);
        showToast("Template Imported!");
    };

    // --- IMPORT / EXPORT LOGIC ---
    const handleExportAll = () => {
        const dataStr = JSON.stringify(scenarios, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cartie_scenarios_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("Scenarios Exported");
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                const importedList = Array.isArray(json) ? json : [json];

                let count = 0;
                for (const s of importedList) {
                    if (s.nodes && s.triggerCommand) {
                        // Safety: Generate new ID to avoid collisions
                        const safeScenario = {
                            ...s,
                            id: `scn_imp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            name: `${s.name} (Imported)`,
                            isActive: false // Default to inactive for safety
                        };
                        await Data.saveScenario(safeScenario);
                        count++;
                    }
                }

                loadScenarios();
                showToast(`Successfully imported ${count} scenarios`);
            } catch (err) {
                console.error(err);
                showToast("Invalid file format", "error");
            }
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    const handleSave = async (scn: Scenario) => {
        await Data.saveScenario(scn);
        showToast("Flow Saved Successfully");
    };

    const handleDeleteScenario = async (id: string) => {
        if (confirm("Delete this scenario permanently?")) {
            await Data.deleteScenario(id);
            if (selectedId === id) setSelectedId(null);
            showToast("Scenario Deleted");
        }
    };

    const handleTestRun = async (scn: Scenario) => {
        await Data.saveScenario(scn);
        await Data.clearSession('sim_user_1');
        setSimulatorOpen(true);
    };

    const selectedScen = scenarios.find(s => s.id === selectedId);
    const [simulatorOpen, setSimulatorOpen] = useState(false);
    const [templateModalOpen, setTemplateModalOpen] = useState(false);
    const [templates, setTemplates] = useState<Scenario[]>([]);

    useEffect(() => {
        Data.getTemplates().then(list => setTemplates((list || []).map(normalizeScenario)));
    }, []);

    return (
        <div className="h-full flex gap-0 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl">
            {/* Hidden File Input */}
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json" className="hidden" />

            {/* Sidebar Navigation */}
            <div className="w-72 bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0 z-10">
                <div className="p-3 border-b border-[var(--border-color)] flex gap-2">
                    <button
                        onClick={() => setView('FLOWS')}
                        className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${view === 'FLOWS' ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'}`}
                    >
                        <GitMerge size={16} /> Flows
                    </button>
                    <button
                        onClick={() => setView('MENU')}
                        className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${view === 'MENU' ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'}`}
                    >
                        <Menu size={16} /> Menu
                    </button>
                </div>

                {view === 'FLOWS' ? (
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-input)]">
                            <h3 className="font-bold text-[var(--text-secondary)] text-xs uppercase tracking-wide">Scenarios</h3>
                            <div className="flex gap-1">
                                <button onClick={handleImportClick} className="bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-gold-500 hover:text-gold-500 text-[var(--text-secondary)] p-1.5 rounded transition-all" title="Import JSON"><Upload size={14} /></button>
                                <button onClick={handleExportAll} className="bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-gold-500 hover:text-gold-500 text-[var(--text-secondary)] p-1.5 rounded transition-all" title="Export JSON"><Download size={14} /></button>
                                <div className="w-px h-6 bg-[var(--border-color)] mx-1"></div>
                                <button onClick={() => setTemplateModalOpen(true)} className="bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-gold-500 hover:text-gold-500 text-[var(--text-secondary)] p-1.5 rounded transition-all" title="Library"><FolderOpen size={14} /></button>
                                <button onClick={createScenario} className="bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-gold-500 hover:text-gold-500 text-[var(--text-secondary)] p-1.5 rounded transition-all" title="New"><Plus size={14} /></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {scenarios.map(s => (
                                <div key={s.id} onClick={() => setSelectedId(s.id)} className={`p-4 border-b border-[var(--border-color)] cursor-pointer transition-all hover:bg-[var(--bg-input)] border-l-4 ${selectedId === s.id ? 'bg-[var(--bg-input)] border-l-gold-500' : 'border-l-transparent'} flex justify-between group`}>
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-bold text-sm truncate ${selectedId === s.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{s.name}</div>
                                        <div className="flex justify-between items-center mt-2">
                                            <code className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-app)] border border-[var(--border-color)] px-1.5 py-0.5 rounded font-mono">/{s.triggerCommand}</code>
                                            <span className={`w-2 h-2 rounded-full shadow-[0_0_8px] ${s.isActive ? 'bg-green-500 shadow-green-500/50' : 'bg-[#3F3F46] shadow-transparent'}`}></span>
                                        </div>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteScenario(s.id); }} className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-500/10 p-2 rounded transition-all self-center ml-2">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="p-8 text-center text-[var(--text-secondary)] text-sm leading-relaxed flex flex-col items-center justify-center h-full opacity-60">
                        <Smartphone size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="font-medium">Persistent Menu Config</p>
                        <p className="mt-2 text-xs">Configure the main keyboard menu that appears at the bottom of the Telegram chat.</p>
                    </div>
                )}
            </div>

            {/* Main Area */}
            <div className="flex-1 bg-[#050505] relative flex flex-col min-w-0">
                {view === 'FLOWS' ? (
                    selectedScen ? (
                        <ScenarioEditor
                            key={selectedScen.id}
                            scenario={selectedScen}
                            onSave={handleSave}
                            onDelete={() => handleDeleteScenario(selectedScen.id)}
                            onTestRun={() => handleTestRun(selectedScen)}
                        />
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] bg-[var(--bg-app)]">
                            <GitMerge size={64} className="mb-6 opacity-20" />
                            <p className="text-lg font-medium">Select a flow or create new</p>
                            <button onClick={() => setTemplateModalOpen(true)} className="mt-6 text-sm text-gold-500 hover:text-gold-400 font-bold border border-gold-500/30 px-6 py-2 rounded-xl hover:bg-gold-500/10 transition-colors">Open Template Library</button>
                        </div>
                    )
                ) : (
                    <MenuDesigner scenarios={scenarios} />
                )}
            </div>

            {/* MODALS */}
            {simulatorOpen && selectedScen && (
                <SimulatorModal
                    onClose={() => setSimulatorOpen(false)}
                    startCommand={selectedScen.triggerCommand}
                />
            )}

            {templateModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="panel w-full max-w-3xl animate-slide-up overflow-hidden border border-[var(--border-color)] shadow-2xl">
                        <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-panel)]">
                            <h3 className="font-bold text-xl text-[var(--text-primary)]">Scenario Library</h3>
                            <button onClick={() => setTemplateModalOpen(false)}><X size={24} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" /></button>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto bg-[var(--bg-app)]">
                            {templates.map(tpl => (
                                <div key={tpl.id} className="border border-[var(--border-color)] bg-[var(--bg-panel)] rounded-xl p-5 hover:border-gold-500/50 hover:shadow-[0_0_15px_rgba(212,175,55,0.1)] transition-all cursor-pointer group" onClick={() => { importTemplate(tpl); setTemplateModalOpen(false); }}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="p-3 bg-[var(--bg-input)] rounded-lg shadow-inner group-hover:scale-110 transition-transform">
                                            {tpl.triggerCommand === 'buy' ? <Search size={24} className="text-blue-500" /> :
                                                tpl.triggerCommand === 'sell' ? <DollarSign size={24} className="text-green-500" /> :
                                                    <HelpCircle size={24} className="text-amber-500" />}
                                        </div>
                                        <ArrowRight size={20} className="opacity-0 group-hover:opacity-100 text-gold-500 transition-opacity" />
                                    </div>
                                    <h4 className="font-bold text-[var(--text-primary)] mb-1 text-lg">{tpl.name}</h4>
                                    <p className="text-sm text-[var(--text-secondary)]">{tpl.nodes.length} steps • Pre-configured logic</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ... [ScenarioEditor, NodeCard, PropertiesPanel, NodeSelector, ToolBtn, DatabaseIcon unchanged]
const ScenarioEditor = ({ scenario, onSave, onDelete, onTestRun }: any) => {
    // Keep existing logic, handled by parent's async handlers
    const { showToast } = useToast();
    const [scen, setScen] = useState<Scenario>(normalizeScenario(scenario));
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const [draggingNode, setDraggingNode] = useState<{ id: string, startX: number, startY: number } | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const lastMousePos = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const safe = normalizeScenario(scenario);
        setScen(safe);
        const entry = safe.nodes.find((n: any) => n.id === safe.entryNodeId);
        if (entry && entry.position) {
            setTransform({ x: -entry.position.x + 300, y: -entry.position.y + 300, scale: 1 });
        }
        setActiveNodeId(null);
    }, [scenario.id]);

    const addNode = (type: NodeType) => {
        const centerX = (-transform.x + 400) / transform.scale;
        const centerY = (-transform.y + 300) / transform.scale;
        const newNode: ScenarioNode = {
            id: `node_${Date.now()}`,
            type,
            content: { text: '' },
            nextNodeId: '',
            position: { x: centerX, y: centerY }
        };
        const updatedNodes = [...scen.nodes];
        if (activeNodeId) {
            const prev = updatedNodes.find(n => n.id === activeNodeId);
            if (prev && !prev.nextNodeId && type !== 'START' && !prev.content.choices) {
                prev.nextNodeId = newNode.id;
            }
        }
        setScen({ ...scen, nodes: [...updatedNodes, newNode] });
        setActiveNodeId(newNode.id);
    };

    const updateNode = (id: string, updates: Partial<ScenarioNode>) => {
        setScen(prev => ({
            ...prev,
            nodes: prev.nodes.map(n => n.id === id ? { ...n, ...updates } : n)
        }));
    };

    const deleteNode = (id: string) => {
        if (id === scen.entryNodeId) return showToast("Cannot delete Start node", "error");
        setScen({ ...scen, nodes: scen.nodes.filter(n => n.id !== id) });
        if (activeNodeId === id) setActiveNodeId(null);
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            const scaleAmount = -e.deltaY * 0.001;
            setTransform(prev => ({ ...prev, scale: Math.min(Math.max(0.2, prev.scale + scaleAmount), 2) }));
        } else {
            setTransform(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).classList.contains('canvas-bg')) {
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanning) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        } else if (draggingNode) {
            const dx = (e.clientX - draggingNode.startX) / transform.scale;
            const dy = (e.clientY - draggingNode.startY) / transform.scale;
            setScen(prev => ({
                ...prev,
                nodes: prev.nodes.map(n => n.id === draggingNode.id ? { ...n, position: { x: (n.position?.x || 0) + dx, y: (n.position?.y || 0) + dy } } : n)
            }));
            setDraggingNode({ id: draggingNode.id, startX: e.clientX, startY: e.clientY });
        }
    }, [isPanning, draggingNode, transform.scale]);

    const handleMouseUp = () => { setIsPanning(false); setDraggingNode(null); };

    const renderConnections = () => {
        const nodes = Array.isArray(scen.nodes) ? scen.nodes : [];
        return nodes.flatMap(source => {
            const sourceContent = source.content || {};
            const links = [];
            const sx = (source.position?.x || 0) + NODE_WIDTH - 20;
            const sy = (source.position?.y || 0) + 40;
            if (source.nextNodeId) {
                const target = scen.nodes.find(n => n.id === source.nextNodeId);
                if (target) links.push({ sx, sy, tx: target.position?.x || 0, ty: (target.position?.y || 0) + 20, color: '#52525B' });
            }
            if (source.type === 'CONDITION') {
                const trueNode = scen.nodes.find(n => n.id === sourceContent.trueNodeId);
                if (trueNode) links.push({ sx, sy: sy + 40, tx: trueNode.position?.x || 0, ty: (trueNode.position?.y || 0) + 20, color: '#22c55e' });
                const falseNode = scen.nodes.find(n => n.id === sourceContent.falseNodeId);
                if (falseNode) links.push({ sx, sy: sy + 70, tx: falseNode.position?.x || 0, ty: (falseNode.position?.y || 0) + 20, color: '#ef4444' });
            }
            if (sourceContent.choices) {
                sourceContent.choices.forEach((c: any, idx: number) => {
                    if (c.nextNodeId) {
                        const target = scen.nodes.find(n => n.id === c.nextNodeId);
                        if (target) {
                            const btnY = sy + 60 + (idx * 32);
                            links.push({ sx, sy: btnY, tx: target.position?.x || 0, ty: (target.position?.y || 0) + 20, color: '#f59e0b' });
                        }
                    }
                });
            }
            return links;
        }).map((link, i) => {
            const dist = Math.abs(link.tx - link.sx);
            const cp1x = link.sx + dist * 0.5;
            const cp2x = link.tx - dist * 0.5;
            return <path key={i} d={`M ${link.sx} ${link.sy} C ${cp1x} ${link.sy}, ${cp2x} ${link.ty}, ${link.tx} ${link.ty}`} stroke={link.color} strokeWidth="2" fill="none" className="drop-shadow-md" />;
        });
    };

    return (
        <div className="h-full flex flex-col relative" onMouseUp={handleMouseUp} onMouseMove={handleMouseMove}>
            {/* Canvas Header */}
            <div className="h-16 bg-[var(--bg-panel)] border-b border-[var(--border-color)] flex justify-between items-center px-6 shadow-sm z-20 shrink-0">
                <div className="flex gap-4 items-center">
                    <input className="font-bold text-lg text-[var(--text-primary)] bg-transparent border-b-2 border-transparent focus:border-gold-500 w-64 outline-none px-1 py-1 transition-colors" value={scen.name} onChange={e => setScen({ ...scen, name: e.target.value })} placeholder="Scenario Name" />

                    <div className="flex items-center gap-3 border-l border-[var(--border-color)] pl-4 ml-2 h-8">
                        <div className="flex items-center gap-1 font-mono text-xs text-[var(--text-secondary)] bg-[var(--bg-input)] px-2 py-1 rounded border border-[var(--border-color)]">
                            <span className="text-gold-500">/</span>
                            <input className="bg-transparent outline-none w-20 text-[var(--text-primary)]" value={scen.triggerCommand} onChange={e => setScen({ ...scen, triggerCommand: e.target.value })} placeholder="cmd" />
                        </div>

                        <div className="flex items-center gap-1 font-mono text-xs text-[var(--text-secondary)] bg-blue-900/10 px-2 py-1 rounded border border-blue-500/20">
                            <Key size={10} className="text-blue-500" />
                            <input
                                className="bg-transparent outline-none w-32 text-blue-400 placeholder-blue-500/30"
                                value={scen.keywords?.join(', ') || ''}
                                onChange={e => setScen({ ...scen, keywords: e.target.value.split(',').map(s => s.trim()) })}
                                placeholder="Keywords"
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer ml-4 select-none">
                        <input type="checkbox" className="hidden" checked={scen.isActive} onChange={e => setScen({ ...scen, isActive: e.target.checked })} />
                        <div className={`w-9 h-5 rounded-full relative transition-colors ${scen.isActive ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-[#3F3F46]'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${scen.isActive ? 'left-5' : 'left-1'}`}></div>
                        </div>
                        <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Active</span>
                    </label>
                </div>
                <div className="flex gap-3">
                    <button onClick={onTestRun} className="bg-[#27272A] border border-[#3F3F46] text-[var(--text-primary)] hover:text-white hover:border-gold-500 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-colors"><Play size={14} className="fill-current" /> Test</button>
                    <button onClick={() => onSave(scen)} className="btn-primary py-2 px-6 text-xs flex items-center gap-2 shadow-gold"><Save size={14} /> Save</button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
                {/* CANVAS AREA */}
                <div ref={canvasRef} className="flex-1 bg-[#050505] relative overflow-hidden canvas-bg cursor-grab active:cursor-grabbing" onMouseDown={handleMouseDown} onWheel={handleWheel}>
                    <div className="origin-top-left transition-transform duration-75 ease-linear pointer-events-none" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
                        {/* Dot Pattern - Improved Contrast */}
                        <div className="absolute top-[-5000px] left-[-5000px] w-[10000px] h-[10000px] pointer-events-none opacity-10" style={{ backgroundImage: 'radial-gradient(#A1A1AA 1.5px, transparent 1.5px)', backgroundSize: '32px 32px' }} />
                        <svg className="absolute top-0 left-0 w-[10000px] h-[10000px] overflow-visible z-0 pointer-events-none filter drop-shadow-lg">{renderConnections()}</svg>
                        <div className="pointer-events-auto">
                            {(Array.isArray(scen.nodes) ? scen.nodes : []).map((node: any) => (
                                <NodeCard key={node.id} node={node} isActive={activeNodeId === node.id} onMouseDown={(e) => { e.stopPropagation(); setDraggingNode({ id: node.id, startX: e.clientX, startY: e.clientY }); setActiveNodeId(node.id); }} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="absolute top-6 left-6 z-20 flex flex-col gap-4 pointer-events-none">
                    <div className="bg-[var(--bg-panel)] shadow-2xl border border-[var(--border-color)] rounded-xl p-1.5 flex flex-col gap-1 backdrop-blur-md pointer-events-auto w-14 items-center transition-all hover:w-auto hover:items-start hover:p-3 group/toolbar">

                        <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 hidden group-hover/toolbar:block px-1 w-full border-b border-[var(--border-color)] pb-1">Content</div>
                        <div className="flex flex-col gap-1 group-hover/toolbar:grid group-hover/toolbar:grid-cols-2">
                            <ToolBtn label="Message" onClick={() => addNode('MESSAGE')} icon={MessageSquare} color="text-blue-400 bg-blue-900/20 border-blue-500/30" />
                            <ToolBtn label="Gallery" onClick={() => addNode('GALLERY')} icon={LayoutGrid} color="text-cyan-400 bg-cyan-900/20 border-cyan-500/30" />
                        </div>

                        <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 mt-2 hidden group-hover/toolbar:block px-1 w-full border-b border-[var(--border-color)] pb-1">Input</div>
                        <div className="flex flex-col gap-1 group-hover/toolbar:grid group-hover/toolbar:grid-cols-2">
                            <ToolBtn label="Question" onClick={() => addNode('QUESTION_TEXT')} icon={HelpCircle} color="text-amber-400 bg-amber-900/20 border-amber-500/30" />
                            <ToolBtn label="Choices" onClick={() => addNode('QUESTION_CHOICE')} icon={MousePointer2} color="text-orange-400 bg-orange-900/20 border-orange-500/30" />
                            <ToolBtn label="Offer Collect" onClick={() => addNode('OFFER_COLLECT')} icon={UserCheck} color="text-rose-400 bg-rose-900/20 border-rose-500/30" />
                            <ToolBtn label="Search" onClick={() => addNode('SEARCH_CARS')} icon={Search} color="text-purple-400 bg-purple-900/20 border-purple-500/30" />
                        </div>

                        <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 mt-2 hidden group-hover/toolbar:block px-1 w-full border-b border-[var(--border-color)] pb-1">Logic</div>
                        <div className="flex flex-col gap-1 group-hover/toolbar:grid group-hover/toolbar:grid-cols-2">
                            <ToolBtn label="Condition" onClick={() => addNode('CONDITION')} icon={GitMerge} color="text-emerald-400 bg-emerald-900/20 border-emerald-500/30" />
                            <ToolBtn label="Action" onClick={() => addNode('ACTION')} icon={Zap} color="text-pink-400 bg-pink-900/20 border-pink-500/30" />
                            <ToolBtn label="Fallback" onClick={() => addNode('SEARCH_FALLBACK')} icon={Filter} color="text-violet-400 bg-violet-900/20 border-violet-500/30" />
                        </div>

                        <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 mt-2 hidden group-hover/toolbar:block px-1 w-full border-b border-[var(--border-color)] pb-1">Channel</div>
                        <div className="flex flex-col gap-1 group-hover/toolbar:grid group-hover/toolbar:grid-cols-2">
                            <ToolBtn label="Channel Post" onClick={() => addNode('CHANNEL_POST')} icon={Megaphone} color="text-sky-400 bg-sky-900/20 border-sky-500/30" />
                            <ToolBtn label="Broadcast" onClick={() => addNode('REQUEST_BROADCAST')} icon={Send} color="text-indigo-400 bg-indigo-900/20 border-indigo-500/30" />
                        </div>
                    </div>
                </div>

                {/* Properties Panel */}
                <div className={`w-80 bg-[var(--bg-panel)] border-l border-[var(--border-color)] shadow-2xl z-20 transition-transform duration-300 flex flex-col ${scen.nodes.find(n => n.id === activeNodeId) ? 'translate-x-0' : 'translate-x-full absolute right-0 h-full'}`}>
                    {scen.nodes.find(n => n.id === activeNodeId) && <PropertiesPanel node={scen.nodes.find(n => n.id === activeNodeId)} allNodes={scen.nodes} onChange={(updates: any) => updateNode(activeNodeId!, updates)} onDelete={() => deleteNode(activeNodeId!)} onClose={() => setActiveNodeId(null)} />}
                </div>
            </div>
        </div>
    );
};

const NodeCard: React.FC<{ node: ScenarioNode, isActive: boolean, onMouseDown: (e: React.MouseEvent) => void }> = ({ node, isActive, onMouseDown }) => {
    const content = node.content || {};
    const safeId = node.id || 'node';
    const getStyle = () => {
        switch (node.type) {
            case 'START': return { border: 'border-gray-600', icon: Play, label: 'Start', color: 'text-gray-100', glow: 'shadow-gray-500/20' };
            case 'MESSAGE': return { border: 'border-blue-500', icon: MessageSquare, label: 'Message', color: 'text-blue-400', glow: 'shadow-blue-500/20' };
            case 'QUESTION_TEXT': return { border: 'border-amber-500', icon: Type, label: 'Text Input', color: 'text-amber-400', glow: 'shadow-amber-500/20' };
            case 'QUESTION_CHOICE': return { border: 'border-orange-500', icon: MousePointer2, label: 'Choices', color: 'text-orange-400', glow: 'shadow-orange-500/20' };
            case 'MENU_REPLY': return { border: 'border-orange-500', icon: Menu, label: 'Menu Reply', color: 'text-orange-400', glow: 'shadow-orange-500/20' };
            case 'ACTION': return { border: 'border-pink-500', icon: Zap, label: 'System Action', color: 'text-pink-400', glow: 'shadow-pink-500/20' };
            case 'SEARCH_CARS': return { border: 'border-purple-500', icon: Search, label: 'Car Search', color: 'text-purple-400', glow: 'shadow-purple-500/20' };
            case 'SEARCH_FALLBACK': return { border: 'border-violet-500', icon: Filter, label: 'Fallback Search', color: 'text-violet-400', glow: 'shadow-violet-500/20' };
            case 'CONDITION': return { border: 'border-emerald-500', icon: GitMerge, label: 'Logic', color: 'text-emerald-400', glow: 'shadow-emerald-500/20' };
            case 'REQUEST_CONTACT': return { border: 'border-green-500', icon: Smartphone, label: 'Get Contact', color: 'text-green-400', glow: 'shadow-green-500/20' };
            case 'GALLERY': return { border: 'border-cyan-500', icon: LayoutGrid, label: 'Gallery', color: 'text-cyan-400', glow: 'shadow-cyan-500/20' };
            case 'CHANNEL_POST': return { border: 'border-sky-500', icon: Megaphone, label: 'Channel Post', color: 'text-sky-400', glow: 'shadow-sky-500/20' };
            case 'REQUEST_BROADCAST': return { border: 'border-indigo-500', icon: Send, label: 'Request Broadcast', color: 'text-indigo-400', glow: 'shadow-indigo-500/20' };
            case 'OFFER_COLLECT': return { border: 'border-rose-500', icon: UserCheck, label: 'Offer Collect', color: 'text-rose-400', glow: 'shadow-rose-500/20' };
            default: return { border: 'border-gray-500', icon: Box, label: node.type, color: 'text-gray-400', glow: '' };
        }
    };
    const s = getStyle();
    const Icon = s.icon;

    return (
        <div
            onMouseDown={onMouseDown}
            className={`absolute w-[280px] bg-[#18181B] rounded-xl shadow-lg transition-all group z-10 hover:z-20 
            ${isActive ? `ring-2 ring-white ring-opacity-50 ${s.glow} shadow-2xl scale-105` : `border border-[#27272A] hover:border-gray-500`}`}
            style={{ left: node.position?.x, top: node.position?.y }}
        >
            <div className={`h-10 px-4 rounded-t-xl flex items-center gap-3 select-none border-b border-[#27272A] bg-[#27272A]/50`}>
                <div className={`p-1 rounded ${s.color} bg-white/5`}>
                    <Icon size={14} />
                </div>
                <span className={`text-xs font-bold uppercase tracking-wider flex-1 ${s.color}`}>{s.label}</span>
                <span className="text-[9px] text-[#52525B] font-mono">{safeId.slice(-4)}</span>
            </div>

            <div className="p-4 space-y-3">
                {content.text && <div className="text-sm text-[#E4E4E7] font-medium leading-relaxed line-clamp-3">{content.text}</div>}

                {content.variableName && (
                    <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-500/20 px-2 py-1.5 rounded text-[10px] text-amber-400 font-mono">
                        <DatabaseIcon size={12} /> {content.variableName}
                    </div>
                )}

                {content.actionType && (
                    <div className="text-xs font-bold font-mono bg-pink-900/20 text-pink-400 p-2 rounded text-center border border-pink-500/20">
                        {content.actionType}
                    </div>
                )}

                {content.choices && (
                    <div className="space-y-1.5">
                        {content.choices.map((c, i) => (
                            <div key={i} className="text-xs bg-[#27272A] border border-[#3F3F46] px-3 py-2 rounded flex justify-between items-center">
                                <span className="font-bold text-white">{c.label}</span>
                                <ArrowRight size={12} className="text-[#71717A]" />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {node.nextNodeId && node.type !== 'CONDITION' && !(content as any).choices && (
                <div className="h-3 bg-[#27272A] rounded-b-xl border-t border-[#3F3F46] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-[#71717A] rounded-full"></div>
                </div>
            )}
        </div>
    );
};

const PropertiesPanel = ({ node, allNodes, onChange, onDelete, onClose }: any) => {
    const content = node.content || {};
    return (
        <div className="flex flex-col h-full bg-[var(--bg-panel)]">
            <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-center">
                <h3 className="font-bold text-[var(--text-primary)] text-sm uppercase tracking-wider">Properties</h3>
                <div className="flex gap-2">
                    {node.type !== 'START' && <button onClick={onDelete} className="text-red-500 hover:bg-red-500/10 p-2 rounded transition-colors"><Trash2 size={16} /></button>}
                    <button onClick={onClose}><X size={18} className="text-[var(--text-secondary)] hover:text-white" /></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                {(node.type === 'MESSAGE' || node.type.includes('QUESTION') || node.type === 'REQUEST_CONTACT' || node.type === 'MENU_REPLY' || node.type === 'GALLERY' || node.type === 'CHANNEL_POST' || node.type === 'REQUEST_BROADCAST' || node.type === 'OFFER_COLLECT') && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Message Text</label>
                            <textarea
                                className="textarea min-h-[120px] font-medium"
                                placeholder="What the bot says..."
                                value={content.text || ''}
                                onChange={e => onChange({ content: { ...content, text: e.target.value } })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-1 block">UK (Alt)</label>
                                <input className="input text-xs" placeholder="Ukrainian Text" value={content.text_uk || ''} onChange={e => onChange({ content: { ...content, text_uk: e.target.value } })} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-1 block">RU (Alt)</label>
                                <input className="input text-xs" placeholder="Russian Text" value={content.text_ru || ''} onChange={e => onChange({ content: { ...content, text_ru: e.target.value } })} />
                            </div>
                        </div>
                    </div>
                )}

                {(node.type === 'CHANNEL_POST' || node.type === 'REQUEST_BROADCAST' || node.type === 'OFFER_COLLECT') && (
                    <div className="space-y-4 bg-slate-900/20 p-4 rounded-xl border border-slate-500/20">
                        <div>
                            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Destination ID</label>
                            <input
                                className="input text-xs font-mono"
                                placeholder="Channel/chat ID"
                                value={content.destinationId || ''}
                                onChange={e => onChange({ content: { ...content, destinationId: e.target.value } })}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Destination Variable</label>
                            <input
                                className="input text-xs font-mono"
                                placeholder="e.g. destinationId"
                                value={content.destinationVar || ''}
                                onChange={e => onChange({ content: { ...content, destinationVar: e.target.value } })}
                            />
                        </div>

                        {(node.type === 'REQUEST_BROADCAST' || node.type === 'OFFER_COLLECT') && (
                            <>
                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Request ID Variable</label>
                                    <input
                                        className="input text-xs font-mono"
                                        placeholder="requestId"
                                        value={content.requestIdVar || ''}
                                        onChange={e => onChange({ content: { ...content, requestIdVar: e.target.value } })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Button Text</label>
                                    <input
                                        className="input text-xs"
                                        placeholder="Подати пропозицію"
                                        value={content.buttonText || ''}
                                        onChange={e => onChange({ content: { ...content, buttonText: e.target.value } })}
                                    />
                                </div>
                            </>
                        )}

                        {node.type === 'OFFER_COLLECT' && (
                            <div>
                                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Dealer Chat Variable</label>
                                <input
                                    className="input text-xs font-mono"
                                    placeholder="dealerChatId"
                                value={content.dealerChatVar || ''}
                                onChange={e => onChange({ content: { ...content, dealerChatVar: e.target.value } })}
                            />
                        </div>
                    )}

                        {node.type === 'CHANNEL_POST' && (
                            <>
                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Image URL</label>
                                    <input
                                        className="input text-xs font-mono"
                                        placeholder="https://..."
                                        value={content.imageUrl || ''}
                                        onChange={e => onChange({ content: { ...content, imageUrl: e.target.value } })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Image Variable</label>
                                    <input
                                        className="input text-xs font-mono"
                                        placeholder="imageUrl"
                                        value={content.imageVar || ''}
                                        onChange={e => onChange({ content: { ...content, imageVar: e.target.value } })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Scheduled At</label>
                                        <input
                                            className="input text-xs font-mono"
                                            placeholder="2025-01-20T10:00"
                                            value={content.scheduledAt || ''}
                                            onChange={e => onChange({ content: { ...content, scheduledAt: e.target.value } })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 block">Schedule Var</label>
                                        <input
                                            className="input text-xs font-mono"
                                            placeholder="scheduledAt"
                                            value={content.scheduledAtVar || ''}
                                            onChange={e => onChange({ content: { ...content, scheduledAtVar: e.target.value } })}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {(node.type === 'QUESTION_TEXT' || node.type === 'QUESTION_CHOICE') && (
                    <div className="bg-amber-900/10 p-3 rounded-xl border border-amber-500/20">
                        <label className="text-[10px] font-bold text-amber-500 uppercase flex items-center gap-1 mb-2"><DatabaseIcon size={12} /> Save Input As</label>
                        <input className="input font-mono text-xs border-amber-500/30 focus:border-amber-500" placeholder="e.g. user_phone" value={content.variableName || ''} onChange={e => onChange({ content: { ...content, variableName: e.target.value } })} />
                    </div>
                )}

                {(node.type === 'QUESTION_CHOICE' || node.type === 'MENU_REPLY') && (
                    <div>
                        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-3 block">Options</label>
                        <div className="space-y-4">
                            {(content.choices || []).map((c: any, i: number) => (
                                <div key={i} className="bg-[var(--bg-input)] p-3 rounded-xl border border-[var(--border-color)] space-y-3 relative">
                                    <button onClick={() => {
                                        const newChoices = content.choices.filter((_: any, idx: number) => idx !== i);
                                        onChange({ content: { ...content, choices: newChoices } });
                                    }} className="absolute top-2 right-2 text-red-500 hover:bg-red-500/10 p-1.5 rounded"><X size={12} /></button>

                                    <div>
                                        <label className="text-[9px] text-[var(--text-muted)] uppercase mb-1 block">Button Label</label>
                                        <input className="input text-xs font-bold w-full mb-2" placeholder="Label (Default)" value={c.label} onChange={e => {
                                            const newChoices = [...content.choices];
                                            newChoices[i] = { ...c, label: e.target.value, value: e.target.value };
                                            onChange({ content: { ...content, choices: newChoices } });
                                        }} />
                                        <div className="grid grid-cols-2 gap-2">
                                            <input className="input text-xs" placeholder="UK Label" value={c.label_uk || ''} onChange={e => {
                                                const newChoices = [...content.choices];
                                                newChoices[i] = { ...c, label_uk: e.target.value };
                                                onChange({ content: { ...content, choices: newChoices } });
                                            }} />
                                            <input className="input text-xs" placeholder="RU Label" value={c.label_ru || ''} onChange={e => {
                                                const newChoices = [...content.choices];
                                                newChoices[i] = { ...c, label_ru: e.target.value };
                                                onChange({ content: { ...content, choices: newChoices } });
                                            }} />
                                        </div>
                                    </div>

                                    {node.type === 'QUESTION_CHOICE' && (
                                        <NodeSelector value={c.nextNodeId} nodes={allNodes} currentNodeId={node.id} onChange={(val: any) => {
                                            const newChoices = [...content.choices];
                                            newChoices[i] = { ...c, nextNodeId: val };
                                            onChange({ content: { ...content, choices: newChoices } });
                                        }} label="Target Node" />
                                    )}
                                </div>
                            ))}
                            <button onClick={() => onChange({ content: { ...content, choices: [...(content.choices || []), { label: 'Option', value: 'Option', nextNodeId: '' }] } })} className="w-full border border-dashed border-[var(--text-secondary)] py-3 text-xs text-[var(--text-secondary)] rounded-xl hover:bg-[var(--bg-input)] hover:text-white transition-colors">+ Add Button</button>
                        </div>
                    </div>
                )}

                {node.type === 'CONDITION' && (
                    <div className="space-y-4">
                        <div className="bg-emerald-900/10 p-4 rounded-xl border border-emerald-500/20 space-y-3">
                            <div>
                                <label className="block text-[10px] font-bold text-emerald-500 mb-1">Variable</label>
                                <input className="input text-xs font-mono border-emerald-500/30" placeholder="found_count" value={content.conditionVariable || ''} onChange={e => onChange({ content: { ...content, conditionVariable: e.target.value } })} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-bold text-emerald-500 mb-1">Operator</label>
                                    <select className="input text-xs border-emerald-500/30" value={content.conditionOperator || 'GT'} onChange={e => onChange({ content: { ...content, conditionOperator: e.target.value } })}>
                                        <option value="GT">&gt; Greater</option>
                                        <option value="EQUALS">== Equals</option>
                                        <option value="HAS_VALUE">Has Value</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-emerald-500 mb-1">Value</label>
                                    <input className="input text-xs border-emerald-500/30" placeholder="0" value={content.conditionValue || ''} onChange={e => onChange({ content: { ...content, conditionValue: e.target.value } })} />
                                </div>
                            </div>
                        </div>
                        <NodeSelector value={content.trueNodeId} nodes={allNodes} currentNodeId={node.id} onChange={(val: any) => onChange({ content: { ...content, trueNodeId: val } })} label="If TRUE:" />
                        <NodeSelector value={content.falseNodeId} nodes={allNodes} currentNodeId={node.id} onChange={(val: any) => onChange({ content: { ...content, falseNodeId: val } })} label="If FALSE:" />
                    </div>
                )}

                {node.type === 'ACTION' && (
                    <div>
                        <label className="block text-[10px] font-bold text-pink-500 uppercase mb-2">System Action</label>
                        <select className="input text-sm border-pink-500/30 focus:border-pink-500" value={content.actionType || ''} onChange={e => onChange({ content: { ...content, actionType: e.target.value } })}>
                            <option value="">Select Action...</option>
                            <option value="NORMALIZE_REQUEST">Normalize Input (Cars)</option>
                            <option value="CREATE_LEAD">Create CRM Lead</option>
                            <option value="CREATE_REQUEST">Create B2B Request</option>
                            <option value="NOTIFY_ADMIN">Notify Admin Channel</option>
                            <option value="SET_LANG">Set User Language</option>
                        </select>
                    </div>
                )}

                {!content.choices && node.type !== 'CONDITION' && node.type !== 'START' && (
                    <div className="pt-6 border-t border-[var(--border-color)]">
                        <NodeSelector value={node.nextNodeId} nodes={allNodes} currentNodeId={node.id} onChange={(val: any) => onChange({ nextNodeId: val })} label="Next Step (Default)" />
                    </div>
                )}
                {node.type === 'START' && (
                    <NodeSelector value={node.nextNodeId} nodes={allNodes} currentNodeId={node.id} onChange={(val: any) => onChange({ nextNodeId: val })} label="Start Flow With:" />
                )}
            </div>
        </div>
    );
};

const NodeSelector = ({ value, nodes, currentNodeId, onChange, label }: any) => {
    const safeNodes = Array.isArray(nodes) ? nodes.map((n: any) => ({ ...n, content: n.content || {} })) : [];
    return (
        <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1.5">{label}</label>
            <div className="relative">
                <select className="input text-xs appearance-none" value={value || ''} onChange={e => onChange(e.target.value)}>
                    <option value="">(End of Flow)</option>
                    {safeNodes.filter((n: any) => n.id !== currentNodeId).map((n: any) => (
                        <option key={n.id} value={n.id}>[{n.type}] {n.content.text ? n.content.text.substring(0, 15) + '...' : n.id.slice(-4)}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" size={14} />
            </div>
        </div>
    );
};

const ToolBtn = ({ label, onClick, color, icon: Icon }: any) => (
    <button onClick={onClick} className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-lg hover:scale-105 transition-transform relative group ${color} hover:brightness-110`}>
        <Icon size={18} className="fill-current" />
        <span className="absolute left-full ml-3 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 font-bold border border-gray-800 group-hover/toolbar:hidden">{label}</span>
        <span className="hidden group-hover/toolbar:block absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] font-bold whitespace-nowrap opacity-60 pointer-events-none scale-75 leading-none">{label}</span>
    </button>
);

const DatabaseIcon = ({ size }: any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
);

const MenuDesigner = ({ scenarios }: { scenarios: Scenario[] }) => {
    const [bots, setBots] = useState<Bot[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string>('');
    const { showToast } = useToast();
    const configInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const load = async () => {
            const list = await Data.getBots();
            setBots(list);
            if (list.length > 0) setSelectedBotId(list[0].id);
        };
        load();
    }, []);

    const bot = bots.find(b => b.id === selectedBotId);

    if (!bot) return <div className="p-10 text-center text-gray-400">No active bots found.</div>;
    const menuConfig = normalizeMenuConfig(bot.menuConfig);

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
        <div className="h-full flex gap-8 bg-[var(--bg-app)] p-8 overflow-hidden">
            <input type="file" ref={configInputRef} onChange={handleImportConfig} accept=".json" className="hidden" />

            {/* Visual Preview (Dark Mode Telegram) */}
            <div className="w-[350px] bg-[#0E1621] rounded-[40px] border-[8px] border-[#18181B] shadow-2xl flex flex-col overflow-hidden shrink-0 h-[700px] relative">
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#18181B] rounded-b-xl z-20"></div>

                {/* Screen Content */}
                <div className="bg-[url('https://telegram.org/file/464001088/1/bSWkX5Y-Q7Y/7680076a5933615174')] bg-cover flex-1 p-4 flex flex-col items-center justify-center text-white text-sm">
                    <div className="bg-[#182533] p-3 rounded-lg shadow-sm mt-4 text-xs w-full max-w-[80%] ml-auto text-left opacity-90">
                        {menuConfig.welcomeMessage || "Welcome!"}
                        <div className="text-[9px] text-gray-400 text-right mt-1">10:00 AM</div>
                    </div>
                </div>

                {/* Keyboard Area */}
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
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="font-bold text-2xl text-[var(--text-primary)]">Menu Configuration</h3>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">Customize the persistent keyboard layout</p>
                    </div>
                    <div className="flex gap-3">
                        <select className="input w-48 text-sm" value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}>
                            {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <button onClick={() => configInputRef.current?.click()} className="btn-secondary px-3" title="Import Config"><Upload size={16} /></button>
                        <button onClick={handleExportConfig} className="btn-secondary px-3" title="Export Config"><Download size={16} /></button>
                        <button onClick={handlePublish} className="btn-primary flex items-center gap-2 px-4">
                            <UploadCloud size={16} /> Push Commands
                        </button>
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
                    {menuConfig.buttons.length === 0 && (
                        <div className="text-center text-[var(--text-muted)] py-10 text-sm border-2 border-dashed border-[var(--border-color)] rounded-xl">
                            No buttons configured. Click + on the phone preview to add.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const SimulatorModal = ({ onClose, startCommand }: { onClose: () => void, startCommand: string }) => {
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const simChatId = 'sim_user_1';
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        ApiClient.post('qa/simulate/message', { chatId: simChatId, text: `/${startCommand}` }).catch(() => {});
        const interval = setInterval(async () => {
            const all = await Data.getMessages();
            setMessages(all.filter(m => m.chatId === simChatId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        }, 500);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const sendMessage = async (text: string = input) => {
        if (!text.trim()) return;
        await ApiClient.post('qa/simulate/message', { chatId: simChatId, text }).catch(() => {});
        setInput('');
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-[#0E1621] w-full max-w-md h-[600px] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up border border-[#18181B]">
                <div className="bg-[#17212B] p-4 text-white flex justify-between items-center shrink-0 border-b border-black">
                    <div className="font-bold flex items-center gap-2"><Smartphone size={18} /> Simulator</div>
                    <button onClick={onClose}><X size={20} /></button>
                </div>
                <div className="flex-1 bg-[#0E1621] p-4 overflow-y-auto space-y-3 custom-scrollbar">
                    {messages.map(m => (
                        <div key={m.id} className={`flex flex-col ${m.direction === 'OUTGOING' ? 'items-start' : 'items-end'}`}>
                            <div className={`max-w-[85%] p-3 rounded-xl text-sm shadow-sm ${m.direction === 'OUTGOING' ? 'bg-[#182533] text-white rounded-tl-none' : 'bg-[#2B5278] text-white rounded-tr-none'}`}>
                                {m.text}
                            </div>
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
                <div className="p-3 bg-[#17212B] border-t border-black flex gap-2 shrink-0">
                    <input className="flex-1 bg-[#242F3D] border-none rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-1 focus:ring-[#2B5278]" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Type..." />
                    <button onClick={() => sendMessage()} className="bg-[#2B5278] text-white p-2 rounded-lg hover:bg-[#203e5c]"><Send size={18} /></button>
                </div>
            </div>
        </div>
    );
};
