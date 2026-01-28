
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { MessageSquare, LayoutGrid, Type, MousePointer2, Menu, Zap, Search, Filter, GitMerge, Smartphone, Megaphone, Send, UserCheck, Box, Database, ArrowRight, Clock, CornerDownRight } from 'lucide-react';

// Shared Style Helper
const getNodeStyle = (type: string) => {
    switch (type) {
        case 'START': return { border: 'border-gray-600', icon: Box, label: 'Start', color: 'text-gray-100', glow: 'shadow-gray-500/20' };
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
        case 'DELAY': return { border: 'border-slate-500', icon: Clock, label: 'Delay', color: 'text-slate-300', glow: 'shadow-slate-500/20' };
        case 'JUMP': return { border: 'border-zinc-500', icon: CornerDownRight, label: 'Jump', color: 'text-zinc-300', glow: 'shadow-zinc-500/20' };
        default: return { border: 'border-gray-500', icon: Box, label: type, color: 'text-gray-400', glow: '' };
    }
};

const GenericNode = ({ data, type, selected }: any) => {
    const s = getNodeStyle(type);
    const Icon = s.icon;
    const content = data.content || {};
    const summaries: string[] = [];
    if (type === 'CONDITION') {
        summaries.push(`${content.conditionVariable || 'var'} ${content.conditionOperator || 'EQUALS'} ${content.conditionValue ?? ''}`);
    }
    if (type === 'DELAY') {
        summaries.push(`${content.conditionValue || '1000'} ms`);
    }
    if (type === 'SEARCH_CARS' || type === 'SEARCH_FALLBACK') {
        summaries.push([content.brand, content.model, content.budget, content.year].filter(Boolean).join(' / ') || 'uses vars brand/model/budget/year');
    }
    if (type === 'CHANNEL_POST' || type === 'REQUEST_BROADCAST' || type === 'OFFER_COLLECT') {
        const target = content.destinationId || content.destinationVar || 'destination';
        const req = content.requestIdVar || 'requestId';
        summaries.push(`dest: ${target} • req: ${req}`);
    }
    if (!content.text && ['MESSAGE', 'QUESTION_TEXT', 'QUESTION_CHOICE', 'MENU_REPLY'].includes(type)) {
        summaries.push('No message set');
    }

    return (
        <div className={`w-[280px] bg-[#18181B] rounded-xl shadow-lg transition-all group border ${selected ? 'border-gold-500 shadow-gold-500/30 ring-2 ring-gold-500/40' : 'border-[#27272A] hover:border-gray-500'} relative`}>
            {/* Input Handle */}
            <Handle type="target" position={Position.Top} className="!bg-[#71717A] !w-3 !h-3" />

            {/* Header */}
            <div className={`h-10 px-4 rounded-t-xl flex items-center gap-3 select-none border-b border-[#27272A] bg-[#27272A]/50`}>
                <div className={`p-1 rounded ${s.color} bg-white/5`}>
                    <Icon size={14} />
                </div>
                <span className={`text-xs font-bold uppercase tracking-wider flex-1 ${s.color}`}>{s.label}</span>
                <span className="text-[9px] text-[#52525B] font-mono">{data.id?.slice(-4)}</span>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
                {content.text && <div className="text-sm text-[#E4E4E7] font-medium leading-relaxed line-clamp-3">{content.text}</div>}
                {!content.text && summaries.length > 0 && (
                    <div className="text-xs text-[#a1a1aa] font-mono leading-relaxed">
                        {summaries[0]}
                    </div>
                )}

                {content.variableName && (
                    <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-500/20 px-2 py-1.5 rounded text-[10px] text-amber-400 font-mono">
                        <Database size={12} /> {content.variableName}
                    </div>
                )}

                {content.actionType && (
                    <div className="text-xs font-bold font-mono bg-pink-900/20 text-pink-400 p-2 rounded text-center border border-pink-500/20">
                        {content.actionType}
                    </div>
                )}

                {/* Standard Output Handle (Default) */}
                {type !== 'CONDITION' && !content.choices && (
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2">
                        <Handle type="source" position={Position.Bottom} className="!bg-[#71717A] !w-3 !h-3" />
                    </div>
                )}
            </div>

            {/* Dynamic Outputs for Choices/Logic */}
            {content.choices && (
                <div className="space-y-1.5 px-4 pb-4">
                    {content.choices.map((c: any, i: number) => (
                        <div key={i} className="text-xs bg-[#27272A] border border-[#3F3F46] px-3 py-2 rounded flex justify-between items-center relative">
                            <span className="font-bold text-white">{c.label}</span>
                            <ArrowRight size={12} className="text-[#71717A]" />
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`choice-${i}`}
                                className="!bg-[#f59e0b] !w-2.5 !h-2.5 top-1/2 -right-1.5"
                            />
                        </div>
                    ))}
                </div>
            )}

            {type === 'CONDITION' && (
                <div className="px-4 pb-4 flex justify-between">
                    <div className="relative">
                        <div className="text-[10px] font-bold text-green-500 mb-1">TRUE</div>
                        <Handle type="source" position={Position.Bottom} id="true" className="!bg-green-500 !w-3 !h-3 !left-4" />
                    </div>
                    <div className="relative">
                        <div className="text-[10px] font-bold text-red-500 mb-1">FALSE</div>
                        <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-500 !w-3 !h-3 !left-4" />
                    </div>
                </div>
            )}
        </div>
    );
};

export const CustomNodes = {
    START: memo((props: any) => <GenericNode {...props} type="START" />),
    MESSAGE: memo((props: any) => <GenericNode {...props} type="MESSAGE" />),
    QUESTION_TEXT: memo((props: any) => <GenericNode {...props} type="QUESTION_TEXT" />),
    QUESTION_CHOICE: memo((props: any) => <GenericNode {...props} type="QUESTION_CHOICE" />),
    MENU_REPLY: memo((props: any) => <GenericNode {...props} type="MENU_REPLY" />),
    ACTION: memo((props: any) => <GenericNode {...props} type="ACTION" />),
    SEARCH_CARS: memo((props: any) => <GenericNode {...props} type="SEARCH_CARS" />),
    SEARCH_FALLBACK: memo((props: any) => <GenericNode {...props} type="SEARCH_FALLBACK" />),
    CONDITION: memo((props: any) => <GenericNode {...props} type="CONDITION" />),
    REQUEST_CONTACT: memo((props: any) => <GenericNode {...props} type="REQUEST_CONTACT" />),
    GALLERY: memo((props: any) => <GenericNode {...props} type="GALLERY" />),
    CHANNEL_POST: memo((props: any) => <GenericNode {...props} type="CHANNEL_POST" />),
    REQUEST_BROADCAST: memo((props: any) => <GenericNode {...props} type="REQUEST_BROADCAST" />),
    OFFER_COLLECT: memo((props: any) => <GenericNode {...props} type="OFFER_COLLECT" />),
    DELAY: memo((props: any) => <GenericNode {...props} type="DELAY" />),
    JUMP: memo((props: any) => <GenericNode {...props} type="JUMP" />),
};
