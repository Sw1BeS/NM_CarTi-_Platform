
import React, { useState, useEffect, useRef } from 'react';
import { Data } from '../services/data';
import { BotEngine } from '../services/botEngine';
import { TelegramMessage, ChatMacro, Lead, Scenario } from '../types';
import { Send, Inbox, RefreshCw, Zap, Trash2, Bot as BotIcon, X, Smile, MessageCircle, Smartphone, Megaphone, Users, User, ArrowRight, Image as ImageIcon, StopCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const InboxPage = () => {
    const [msgs, setMsgs] = useState<TelegramMessage[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Load Data
    useEffect(() => {
        const load = async () => setMsgs([...await Data.getMessages()]);
        load();
        const unsub = Data.subscribe('UPDATE_MESSAGES', load);
        const target = searchParams.get('chatId');
        if (target) setActiveChatId(target);
        return unsub;
    }, [searchParams]);

    // Scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [msgs, activeChatId]);

    const handleReply = async () => {
        if (!activeChatId || !replyText) return;
        await BotEngine.sendUnifiedMessage('TG', activeChatId, replyText);
        setReplyText('');
    };

    const activeMessages = activeChatId 
        ? msgs.filter(m => m.chatId === activeChatId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        : [];

    // Distinct Chats
    const chats = Array.from(new Set(msgs.map(m => m.chatId))).map(cid => {
        const last = msgs.filter(m => m.chatId === cid).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        return { chatId: cid, lastMsg: last };
    });

    return (
        <div className="h-[calc(100vh-100px)] flex gap-6">
            {/* Sidebar List */}
            <div className="w-80 panel flex flex-col overflow-hidden shrink-0">
                <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur">
                    <h2 className="font-bold text-[var(--text-primary)]">Messages</h2>
                    <p className="text-xs text-[var(--text-secondary)]">{chats.length} active conversations</p>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {chats.map(c => (
                        <div 
                            key={c.chatId} 
                            onClick={() => setActiveChatId(c.chatId)} 
                            className={`p-4 border-b border-[var(--border-color)] cursor-pointer hover:bg-[var(--bg-input)] transition-colors ${activeChatId === c.chatId ? 'bg-gold-500/10 border-l-4 border-l-gold-500' : 'border-l-4 border-l-transparent'}`}
                        >
                            <div className="flex justify-between mb-1">
                                <span className="font-bold text-sm text-[var(--text-primary)] truncate max-w-[150px]">{c.lastMsg.from}</span>
                                <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">{new Date(c.lastMsg.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] truncate">{c.lastMsg.text}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 panel flex flex-col overflow-hidden relative">
                {activeChatId ? (
                    <>
                        {/* Header */}
                        <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur flex justify-between items-center z-10">
                            <div className="font-bold text-[var(--text-primary)]">
                                Chat #{activeChatId}
                            </div>
                            <button onClick={async () => { await Data.clearSession(activeChatId); window.location.reload(); }} className="btn-ghost text-xs text-red-500 hover:bg-red-500/10"><Trash2 size={16}/> Clear</button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[var(--bg-input)]">
                            {activeMessages.map(m => {
                                const isOut = m.direction === 'OUTGOING';
                                return (
                                    <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-3 rounded-2xl shadow-sm text-sm relative group ${
                                            isOut 
                                                ? 'bg-gold-500 text-charcoal-950 rounded-tr-none' 
                                                : 'bg-[var(--bg-panel)] text-[var(--text-primary)] rounded-tl-none border border-[var(--border-color)]'
                                        }`}>
                                            {m.text}
                                            <div className={`text-[9px] mt-1 text-right opacity-60 ${isOut ? 'text-charcoal-800' : 'text-[var(--text-secondary)]'}`}>
                                                {new Date(m.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef}/>
                        </div>

                        {/* Input */}
                        <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur flex gap-3">
                            <input 
                                className="input" 
                                placeholder="Type message..." 
                                value={replyText} 
                                onChange={e => setReplyText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleReply()}
                            />
                            <button onClick={handleReply} className="btn-primary w-12 h-12 rounded-full !p-0 flex items-center justify-center shrink-0">
                                <Send size={20}/>
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
                        <Inbox size={64} className="mb-4 opacity-20"/>
                        <p>Select a conversation</p>
                    </div>
                )}
            </div>
        </div>
    );
};
