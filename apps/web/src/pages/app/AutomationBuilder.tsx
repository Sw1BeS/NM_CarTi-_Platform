
import React, { useCallback } from 'react';
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';

const initialNodes = [
    { id: '1', position: { x: 250, y: 5 }, data: { label: 'Start: New Lead' }, type: 'input' },
    { id: '2', position: { x: 100, y: 100 }, data: { label: 'Filter: Budget > 10k' } },
    { id: '3', position: { x: 400, y: 100 }, data: { label: 'Action: Notify Manager' }, type: 'output' },
];

const initialEdges = [{ id: 'e1-2', source: '1', target: '2' }];

export const AutomationBuilder: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    const onConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

    return (
        <div className="w-full h-[calc(100vh-64px)]">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
            >
                <Controls />
                <MiniMap />
                <Background gap={12} size={1} />
            </ReactFlow>
        </div>
    );
};
