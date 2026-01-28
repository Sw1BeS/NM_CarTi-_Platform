
import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Background,
    Controls,
    MiniMap,
    ReactFlowProvider,
    Node,
    Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import { CustomNodes } from './CustomNodes';
import { Scenario } from '../../../types';
import { Save, Play, Plus, Trash2, X, Settings } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { Data } from '../../../services/data';
import { PropertiesPanel } from '../components/AutomationSuite'; // We'll refactor AutomationSuite to export this or move it

const NODE_WIDTH = 280;

// --- ADAPTERS ---

const normalizeToReactFlow = (scenario: Scenario): { nodes: Node[], edges: Edge[] } => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const rawNodes = (Array.isArray(scenario.nodes) ? scenario.nodes : []) as any[];

    rawNodes.forEach((n) => {
        // Create Node
        nodes.push({
            id: n.id,
            type: n.type,
            position: n.position || { x: 0, y: 0 },
            data: { ...n, label: n.type }, // Pass full node data
        });

        // Create Edges
        const sourceId = n.id;
        const sx = (n.position?.x || 0) + NODE_WIDTH; // Approximate source handle pos (visual only)

        // 1. Standard Next Node
        if (n.nextNodeId) {
            edges.push({
                id: `e-${sourceId}-${n.nextNodeId}`,
                source: sourceId,
                target: n.nextNodeId,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#52525B' }
            });
        }

        // 2. Conditional Edges
        if (n.type === 'CONDITION') {
            if (n.content?.trueNodeId) {
                edges.push({
                    id: `e-${sourceId}-true-${n.content.trueNodeId}`,
                    source: sourceId,
                    sourceHandle: 'true',
                    target: n.content.trueNodeId,
                    type: 'smoothstep',
                    label: 'True',
                    style: { stroke: '#22c55e' }
                });
            }
            if (n.content?.falseNodeId) {
                edges.push({
                    id: `e-${sourceId}-false-${n.content.falseNodeId}`,
                    source: sourceId,
                    sourceHandle: 'false',
                    target: n.content.falseNodeId,
                    type: 'smoothstep',
                    label: 'False',
                    style: { stroke: '#ef4444' }
                });
            }
        }

        // 3. Choice Edges
        if (n.content?.choices) {
            n.content.choices.forEach((c: any, idx: number) => {
                if (c.nextNodeId) {
                    edges.push({
                        id: `e-${sourceId}-choice${idx}-${c.nextNodeId}`,
                        source: sourceId,
                        sourceHandle: `choice-${idx}`,
                        target: c.nextNodeId,
                        type: 'smoothstep',
                        style: { stroke: '#f59e0b' }
                    });
                }
            });
        }
    });

    return { nodes, edges };
};

const serializeFromReactFlow = (nodes: Node[], edges: Edge[], originalScenario: Scenario): Scenario => {
    const serializedNodes = nodes.map(node => {
        const content = { ...node.data.content };

        // Reconstruct relations from Edges
        const outEdges = edges.filter(e => e.source === node.id);

        let nextNodeId = '';
        if (node.type !== 'CONDITION' && !content.choices) {
            const standardEdge = outEdges.find(e => !e.sourceHandle);
            if (standardEdge) nextNodeId = standardEdge.target;
        }

        if (node.type === 'CONDITION') {
            const trueEdge = outEdges.find(e => e.sourceHandle === 'true');
            if (trueEdge) content.trueNodeId = trueEdge.target;
            const falseEdge = outEdges.find(e => e.sourceHandle === 'false');
            if (falseEdge) content.falseNodeId = falseEdge.target;
        }

        if (content.choices) {
            content.choices = content.choices.map((c: any, idx: number) => {
                const choiceEdge = outEdges.find(e => e.sourceHandle === `choice-${idx}`);
                return { ...c, nextNodeId: choiceEdge ? choiceEdge.target : '' };
            });
        }

        return {
            id: node.id,
            type: node.type as any,
            content,
            position: node.position,
            nextNodeId
        };
    });

    return {
        ...originalScenario,
        nodes: serializedNodes,
        updatedAt: new Date().toISOString()
    };
};

// --- EDITOR COMPONENT ---

export const ScenarioFlowEditor = ({ scenario, onSave, onDelete, onTestRun }: any) => {
    const { nodes: initialNodes, edges: initialEdges } = normalizeToReactFlow(scenario);
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [scenarioName, setScenarioName] = useState<string>(scenario.name || '');
    const [scenarioCommand, setScenarioCommand] = useState<string>(scenario.triggerCommand || '');
    const [scenarioActive, setScenarioActive] = useState<boolean>(!!scenario.isActive);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const reactFlowInstance = useRef<any>(null);
    const { showToast } = useToast();

    // Sync if scenario prop changes externally
    useEffect(() => {
        const { nodes: n, edges: e } = normalizeToReactFlow(scenario);
        setNodes(n);
        setEdges(e);
        setScenarioName(scenario.name || '');
        setScenarioCommand(scenario.triggerCommand || '');
        setScenarioActive(!!scenario.isActive);
        // We don't depend on 'nodes'/'edges' here to avoid loops, only 'scenario.id' ideally
    }, [scenario.id, setNodes, setEdges]);

    const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

    const handleNodeClick = (_: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id);
    };

    const handlePaneClick = () => {
        setSelectedNodeId(null);
    };

    const handleSave = () => {
        const updated = serializeFromReactFlow(nodes, edges, {
            ...scenario,
            name: scenarioName,
            triggerCommand: scenarioCommand,
            isActive: scenarioActive
        });
        onSave(updated);
    };

    // Update Node Data from Properties Panel
    const updateNodeData = (id: string, updates: any) => {
        setNodes(nds => nds.map(n => {
            if (n.id === id) {
                // If content choices changed, we might need to update handles or edges, 
                // but usually React Flow handles dynamic handles if the node re-renders.
                return { ...n, data: { ...n.data, ...updates } };
            }
            return n;
        }));
    };

    const setNodeLink = (nodeId: string, link: { kind: 'next' | 'true' | 'false' | 'choice'; targetId?: string; choiceIndex?: number }) => {
        setEdges(prev => {
            const filtered = prev.filter(e => {
                if (e.source !== nodeId) return true;
                if (link.kind === 'next') return !!e.sourceHandle;
                if (link.kind === 'true') return e.sourceHandle !== 'true';
                if (link.kind === 'false') return e.sourceHandle !== 'false';
                if (link.kind === 'choice') return e.sourceHandle !== `choice-${link.choiceIndex}`;
                return true;
            });

            if (!link.targetId) {
                return filtered;
            }

            const edge = {
                id:
                    link.kind === 'next'
                        ? `e-${nodeId}-${link.targetId}`
                        : link.kind === 'choice'
                            ? `e-${nodeId}-choice${link.choiceIndex}-${link.targetId}`
                            : `e-${nodeId}-${link.kind}-${link.targetId}`,
                source: nodeId,
                target: link.targetId,
                type: 'smoothstep' as const,
                ...(link.kind === 'next' ? { animated: true, style: { stroke: '#52525B' } } : {}),
                ...(link.kind === 'true' ? { label: 'True', style: { stroke: '#22c55e' }, sourceHandle: 'true' } : {}),
                ...(link.kind === 'false' ? { label: 'False', style: { stroke: '#ef4444' }, sourceHandle: 'false' } : {}),
                ...(link.kind === 'choice' ? { style: { stroke: '#f59e0b' }, sourceHandle: `choice-${link.choiceIndex}` } : {})
            };

            return [...filtered, edge];
        });

        setNodes(prev => prev.map(n => {
            if (n.id !== nodeId) return n;
            const data = { ...(n.data || {}) };
            if (link.kind === 'next') {
                return { ...n, data: { ...data, nextNodeId: link.targetId || '' } };
            }
            if (link.kind === 'true') {
                return { ...n, data: { ...data, content: { ...(data.content || {}), trueNodeId: link.targetId || '' } } };
            }
            if (link.kind === 'false') {
                return { ...n, data: { ...data, content: { ...(data.content || {}), falseNodeId: link.targetId || '' } } };
            }
            if (link.kind === 'choice') {
                const choices = Array.isArray(data.content?.choices) ? [...data.content.choices] : [];
                if (typeof link.choiceIndex === 'number' && choices[link.choiceIndex]) {
                    choices[link.choiceIndex] = { ...choices[link.choiceIndex], nextNodeId: link.targetId || '' };
                }
                return { ...n, data: { ...data, content: { ...(data.content || {}), choices } } };
            }
            return n;
        }));
    };

    const deleteNode = (id: string) => {
        setNodes(nds => nds.filter(n => n.id !== id));
        setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
        setSelectedNodeId(null);
    };

    // Drag and Drop Logic
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');
            if (typeof type === 'undefined' || !type) return;

            const bounds = reactFlowWrapper.current?.getBoundingClientRect();
            const instance = reactFlowInstance.current;
            if (!bounds || !instance) {
                showToast('Canvas not ready', 'error');
                return;
            }

            const position = instance.project({
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top
            });

            const newNode: Node = {
                id: `node_${Date.now()}`,
                type,
                position,
                data: { id: `node_${Date.now()}`, type, content: { text: '' } },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [setNodes]
    );

    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    return (
        <div className="h-full flex flex-col relative">
            {/* Header */}
            <div className="h-16 bg-[var(--bg-panel)] border-b border-[var(--border-color)] flex justify-between items-center px-6 shadow-sm z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <input
                        className="font-bold text-lg text-[var(--text-primary)] bg-transparent border-b-2 border-transparent focus:border-gold-500 w-64 outline-none px-1 py-1"
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                        placeholder="Scenario name"
                    />
                    <div className="flex items-center gap-1 text-[var(--text-secondary)] text-sm">
                        <span className="text-xs">/</span>
                        <input
                            className="text-sm bg-transparent border-b-2 border-transparent focus:border-gold-500 w-40 outline-none px-1 py-1 font-mono"
                            value={scenarioCommand}
                            onChange={(e) => setScenarioCommand(e.target.value.replace(/\s+/g, ''))}
                            placeholder="trigger_command"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <input
                            type="checkbox"
                            checked={scenarioActive}
                            onChange={(e) => setScenarioActive(e.target.checked)}
                        />
                        Active
                    </label>
                </div>
                <div className="flex gap-3">
                    <button onClick={onTestRun} className="btn-secondary text-xs flex items-center gap-2"><Play size={14} /> Test</button>
                    <button onClick={handleSave} className="btn-primary py-2 px-6 text-xs flex items-center gap-2 shadow-gold"><Save size={14} /> Save</button>
                    <button onClick={onDelete} className="text-red-500 hover:bg-red-500/10 p-2 rounded"><Trash2 size={16} /></button>
                </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 flex overflow-hidden">
                <ReactFlowProvider>
                    <div className="flex-1 h-full" ref={reactFlowWrapper}>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onNodeClick={handleNodeClick}
                            onPaneClick={handlePaneClick}
                            nodeTypes={CustomNodes}
                            onDragOver={onDragOver}
                            onDrop={onDrop}
                            onInit={(inst) => { reactFlowInstance.current = inst; }}
                            fitView
                            className="bg-[#050505]"
                            connectionLineStyle={{ stroke: '#cbd5e1' }}
                        >
                            <Background color="#333" gap={20} />
                            <Controls />
                            <MiniMap style={{ background: '#18181b', border: '1px solid #27272a' }} nodeColor="#3f3f46" />
                            <Panel position="top-left" className="bg-[var(--bg-panel)] p-2 rounded-xl border border-[var(--border-color)] shadow-xl">
                                <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-2 px-1">Add Nodes</div>
                                <div className="grid grid-cols-2 gap-2 w-48">
                                    {['MESSAGE', 'QUESTION_TEXT', 'QUESTION_CHOICE', 'CONDITION', 'ACTION', 'GALLERY'].map(type => (
                                        <div
                                            key={type}
                                            draggable
                                            onDragStart={(event) => event.dataTransfer.setData('application/reactflow', type)}
                                            className="text-xs bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] p-2 rounded cursor-grab border border-[var(--border-color)] text-[var(--text-primary)] text-center font-medium"
                                        >
                                            {type.replace('_', ' ')}
                                        </div>
                                    ))}
                                </div>
                            </Panel>
                        </ReactFlow>
                    </div>
                </ReactFlowProvider>

                {/* Properties Panel */}
                <div className={`w-80 bg-[var(--bg-panel)] border-l border-[var(--border-color)] shadow-2xl z-20 transition-transform duration-300 flex flex-col ${selectedNode ? 'translate-x-0' : 'translate-x-full absolute right-0 h-full'}`}>
                    {selectedNode && (
                        // We repurpose the existing PropertiesPanel but we need to adapt the props
                        // The existing panel expects 'node' object with 'content'
                        // Our React Flow node stores 'content' in data
                        <PropertiesPanel
                            node={{ ...selectedNode.data, id: selectedNode.id, type: selectedNode.type }} // Adapter for old prop shape
                            allNodes={nodes.map(n => ({ ...n.data, id: n.id, type: n.type }))} // Adapter
                            onChange={(updates: any) => updateNodeData(selectedNode.id, updates)} // Update handler
                            onDelete={() => deleteNode(selectedNode.id)}
                            onClose={() => setSelectedNodeId(null)}
                            onLinkChange={(link: any) => setNodeLink(selectedNode.id, link)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
