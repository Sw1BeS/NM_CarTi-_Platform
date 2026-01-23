import React, { useState, useEffect, useRef } from 'react';
import { Data } from '../../services/data';
import { BotEngine } from '../../services/botEngine';
import { RequestsService } from '../../services/requestsService';
import { TelegramMessage, ChatMacro, User, B2BRequest, RequestStatus } from '../../types';
import { Send, Inbox, Trash2, X, Zap, UserCheck, StickyNote, Filter, Paperclip, Car, Smile, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSearchParams } from 'react-router-dom';
import { useLang } from '../../contexts/LanguageContext';
import { CarPicker } from '../../components/CarPicker';

const DEFAULT_MACROS: ChatMacro[] = [
    { id: 'm1', shortcut: '/hi', text: 'Привіт! Чим можу допомогти? 👋', category: 'greeting' },
    { id: 'm2', shortcut: '/wait', text: 'Уточнюю інформацію, дайте секунду... ⏳', category: 'status' },
    { id: 'm3', shortcut: '/thanks', text: 'Дякую! Зв\'яжемося найближчим часом 🙏', category: 'closing' },
    { id: 'm4', shortcut: '/check', text: 'Перевірили наявність, зараз підготуємо варіанти 📋', category: 'status' },
    { id: 'm5', shortcut: '/price', text: 'Актуальну ціну уточню у постачальника та повернусь протягом години 💰', category: 'info' }
];

const COMMON_EMOJIS = ['👍', '👎', '❤️', '🔥', '✅', '❌', '🚗', '💰', '🤝', '👋', '🤔', '😎'];

interface ChatInfo {
    chatId: string;
    lastMsg: TelegramMessage;
    assignedTo?: string;
    internalNote?: string;
    requestId?: string;
    unreadCount: number;
}

export const InboxPage = () => {
    const [msgs, setMsgs] = useState<TelegramMessage[]>([]);
    const [chats, setChats] = useState<ChatInfo[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'MY' | 'UNASSIGNED'>('ALL');
    const [managers, setManagers] = useState<User[]>([]);
    const [showMacros, setShowMacros] = useState(false);
    const [showEmojis, setShowEmojis] = useState(false);
    const [internalNote, setInternalNote] = useState('');
    const [showNotePanel, setShowNotePanel] = useState(false);
    const [requestByChat, setRequestByChat] = useState<Record<string, B2BRequest>>({});
    const [timeline, setTimeline] = useState<any[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [bots, setBots] = useState<any[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string | undefined>(undefined);
    const [showCarPicker, setShowCarPicker] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { user } = useAuth();
    const { showToast } = useToast();
    const { t } = useLang();
    const [searchParams] = useSearchParams();

    // ... [Load Logic Unchanged] ...
    useEffect(() => {
        const load = async () => {
            const [messages, requestRes, botList] = await Promise.all([
                Data.getMessages({ botId: selectedBotId }),
                RequestsService.getRequests({ status: 'ALL', limit: 200 }),
                Data.getBots()
            ]);
            setBots(botList || []);
            let currentBotId = selectedBotId;
            if (!currentBotId && botList && botList.length > 0) {
                // If we don't have a selection, default to the first active bot
                const active = botList.find((b: any) => b.isEnabled !== false); // Handle isEnabled or active
                currentBotId = active ? active.id : botList[0].id;
                setSelectedBotId(currentBotId);
            }

            let finalMessages = messages || [];
            if (!messages || (currentBotId && messages.length === 0)) {
                finalMessages = await Data.getMessages({ botId: currentBotId });
            }
            setMsgs(finalMessages);

            const chatMap = new Map<string, ChatInfo>();
            const reqMap: Record<string, B2BRequest> = {};

            requestRes.items.forEach(req => {
                if (!req.clientChatId) return;
                const existing = reqMap[req.clientChatId];
                if (!existing || new Date(req.createdAt) > new Date(existing.createdAt)) {
                    reqMap[req.clientChatId] = req;
                }
            });

            setRequestByChat(reqMap);

            finalMessages.forEach(m => {
                const linkedReq = reqMap[m.chatId];
                if (!chatMap.has(m.chatId)) {
                    chatMap.set(m.chatId, {
                        chatId: m.chatId,
                        lastMsg: m,
                        assignedTo: linkedReq?.assigneeId,
                        internalNote: linkedReq?.internalNote,
                        requestId: linkedReq?.id,
                        unreadCount: 0
                    });
                } else {
                    const existing = chatMap.get(m.chatId)!;
                    if (new Date(m.date) > new Date(existing.lastMsg.date)) {
                        existing.lastMsg = m;
                    }
                }
            });

            const sortedChats = Array.from(chatMap.values()).sort((a, b) =>
                new Date(b.lastMsg.date).getTime() - new Date(a.lastMsg.date).getTime()
            );
            setChats(sortedChats);
        };

        load();
        const unsub = Data.subscribe('UPDATE_MESSAGES', load);
        const target = searchParams.get('chatId');
        if (target) setActiveChatId(target);
        return unsub;
    }, [searchParams, selectedBotId]);

    useEffect(() => {
        Data.getUsers().then(users => {
            setManagers(users.filter(u => u.role === 'MANAGER' || u.role === 'ADMIN'));
        });
    }, []);

    useEffect(() => {
        if (activeChatId) {
            setInternalNote(requestByChat[activeChatId]?.internalNote || '');
            const req = requestByChat[activeChatId];
            if (req) {
                setTimelineLoading(true);
                Data.getMessageLogs({ requestId: req.id, chatId: activeChatId, limit: 50 }).then(setTimeline).finally(() => setTimelineLoading(false));
            } else {
                setTimeline([]);
            }
        }
    }, [activeChatId, requestByChat]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [msgs, activeChatId]);

    const handleReply = async () => {
        if (!activeChatId || !replyText.trim()) return;
        if (!selectedBotId) return showToast(t('inbox.select_bot'), 'error');
        try {
            await BotEngine.sendUnifiedMessage('TG', activeChatId, replyText, undefined, selectedBotId);
            setReplyText('');
            // Trigger refresh
            Data._notify('UPDATE_MESSAGES');
        } catch (e: any) {
            showToast(e.message || t('inbox.send_failed'), 'error');
        }
    };

    const handleCarSelect = async (car: any) => {
        if (!activeChatId || !selectedBotId) return;
        try {
            await BotEngine.sendCar(activeChatId, car, selectedBotId);
            showToast('Card sent');
            setShowCarPicker(false);
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const insertEmoji = (emoji: string) => {
        setReplyText(prev => prev + emoji);
        setShowEmojis(false);
    };

    const assignChat = async (chatId: string, userId: string) => { /* ... [Unchanged] ... */
        let req = requestByChat[chatId];
        if (!req) {
            try {
                const chatInfo = chats.find(c => c.chatId === chatId);
                const newReq = await RequestsService.createRequest({
                    clientChatId: chatId,
                    title: chatInfo ? `Request from ${chatInfo.lastMsg.from}` : 'New Request',
                    status: RequestStatus.DRAFT,
                    platform: 'TG',
                    budgetMin: 0, budgetMax: 0, yearMin: 0, yearMax: 0, city: '', description: '',
                    createdAt: new Date().toISOString()
                });
                req = newReq;
                setRequestByChat(prev => ({ ...prev, [chatId]: newReq }));
                if (chatInfo) setChats(prev => prev.map(c => c.chatId === chatId ? { ...c, requestId: newReq.id } : c));
            } catch (e) { console.error(e); return; }
        }
        await RequestsService.updateRequest(req.id, { assigneeId: userId || null });
        setChats(prev => prev.map(c => c.chatId === chatId ? { ...c, assignedTo: userId } : c));
        setRequestByChat(prev => ({ ...prev, [chatId]: { ...prev[chatId], assigneeId: userId || undefined } }));
        showToast(t('inbox.assigned'), 'success');
    };

    const saveNote = async () => { /* ... [Unchanged] ... */
        if (!activeChatId) return;
        const req = requestByChat[activeChatId];
        if (!req) return showToast(t('inbox.no_request'), 'error');
        await RequestsService.updateRequest(req.id, { internalNote });
        setRequestByChat({ ...requestByChat, [activeChatId]: { ...req, internalNote } });
        showToast(t('inbox.note_saved'), 'success');
        setShowNotePanel(false);
    };

    const activeMessages = activeChatId
        ? msgs.filter(m => m.chatId === activeChatId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        : [];
    const filteredChats = chats.filter(c => {
        if (filter === 'MY') return c.assignedTo === user?.id;
        if (filter === 'UNASSIGNED') return !c.assignedTo;
        return true;
    });
    const activeChat = chats.find(c => c.chatId === activeChatId);
    const activeRequest = activeChatId ? requestByChat[activeChatId] : undefined;

    return (
        <div className="h-[calc(100vh-100px)] flex gap-6">
            {/* Sidebar List */}
            <div className="w-80 panel flex flex-col overflow-hidden shrink-0">
                {/* ... [Sidebar Header Unchanged] ... */}
                <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur space-y-3">
                    <div className="flex justify-between items-center">
                        <h2 className="font-bold text-[var(--text-primary)]">Inbox</h2>
                        <div className="flex gap-1">
                            <button onClick={() => setFilter('ALL')} className={`px-2 py-1 text-[10px] rounded ${filter === 'ALL' ? 'bg-gold-500 text-black' : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>All</button>
                            <button onClick={() => setFilter('MY')} className={`px-2 py-1 text-[10px] rounded ${filter === 'MY' ? 'bg-gold-500 text-black' : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>My</button>
                            <button onClick={() => setFilter('UNASSIGNED')} className={`px-2 py-1 text-[10px] rounded ${filter === 'UNASSIGNED' ? 'bg-gold-500 text-black' : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>Unassigned</button>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-secondary)] font-bold">Bot</label>
                        <select className="input mt-1 text-sm" value={selectedBotId} onChange={e => setSelectedBotId(e.target.value || undefined)}>
                            {bots.map(b => <option key={b.id} value={b.id}>{b.name || b.username || b.id}</option>)}
                        </select>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">{filteredChats.length} conversations</p>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filteredChats.map(c => (
                        <div key={c.chatId} onClick={() => setActiveChatId(c.chatId)} className={`p-4 border-b border-[var(--border-color)] cursor-pointer hover:bg-[var(--bg-input)] transition-colors ${activeChatId === c.chatId ? 'bg-gold-500/10 border-l-4 border-l-gold-500' : 'border-l-4 border-l-transparent'}`}>
                            <div className="flex justify-between mb-1">
                                <span className="font-bold text-sm text-[var(--text-primary)] truncate max-w-[150px]">{c.lastMsg.from}</span>
                                <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">{new Date(c.lastMsg.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] truncate mb-2">{c.lastMsg.text}</div>
                            {c.assignedTo && <div className="flex items-center gap-1 text-[9px] text-blue-500"><UserCheck size={10} /> {managers.find(m => m.id === c.assignedTo)?.name || 'Assigned'}</div>}
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
                            <div className="flex items-center gap-3">
                                <div>
                                    <div className="font-bold text-[var(--text-primary)]">{activeChat?.lastMsg.from || 'Chat'}</div>
                                    <div className="text-[10px] text-[var(--text-secondary)]">ID: {activeChatId}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <select className="input text-xs px-2 py-1" value={activeChat?.assignedTo || ''} onChange={e => assignChat(activeChatId, e.target.value)}>
                                    <option value="">Unassigned</option>
                                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <button onClick={() => setShowNotePanel(!showNotePanel)} className={`btn-secondary px-3 py-1.5 text-xs ${internalNote ? 'text-gold-500' : ''}`}><StickyNote size={14} /></button>
                                <button onClick={async () => { await Data.clearSession(activeChatId); window.location.reload(); }} className="btn-ghost text-xs text-red-500 hover:bg-red-500/10 px-3 py-1.5"><Trash2 size={14} /></button>
                            </div>
                        </div>

                        {/* Note Panel */}
                        {showNotePanel && (
                            <div className="bg-yellow-500/10 border-b border-yellow-500/30 p-3">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="text-xs font-bold text-yellow-600 flex items-center gap-1"><StickyNote size={12} /> Internal Note</div>
                                    <button onClick={() => setShowNotePanel(false)}><X size={14} className="text-[var(--text-secondary)]" /></button>
                                </div>
                                <textarea className="textarea text-xs h-20 w-full" placeholder="Add private notes..." value={internalNote} onChange={e => setInternalNote(e.target.value)} />
                                <button onClick={saveNote} className="btn-primary text-xs px-3 py-1 mt-2">Save Note</button>
                            </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[var(--bg-input)]">
                            {activeMessages.map(m => {
                                const isOut = m.direction === 'OUTGOING';
                                return (
                                    <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-3 rounded-2xl shadow-sm text-sm relative group ${isOut ? 'bg-gold-500 text-charcoal-950 rounded-tr-none' : 'bg-[var(--bg-panel)] text-[var(--text-primary)] rounded-tl-none border border-[var(--border-color)]'}`}>
                                            {m.text}
                                            <div className={`text-[9px] mt-1 text-right opacity-60 ${isOut ? 'text-charcoal-800' : 'text-[var(--text-secondary)]'}`}>{new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="border-t border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur">
                            {/* Toolbar */}
                            {showEmojis && (
                                <div className="p-2 border-b border-[var(--border-color)] bg-[var(--bg-input)] flex gap-2 overflow-x-auto">
                                    {COMMON_EMOJIS.map(e => <button key={e} onClick={() => insertEmoji(e)} className="text-xl hover:bg-[var(--bg-panel)] p-1 rounded transition-colors">{e}</button>)}
                                </div>
                            )}

                            {showMacros && (
                                <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-input)] grid grid-cols-2 gap-2">
                                    {DEFAULT_MACROS.map(macro => (
                                        <button key={macro.id} onClick={() => { setReplyText(macro.text); setShowMacros(false); }} className="text-left p-2 rounded bg-[var(--bg-panel)] hover:bg-[var(--bg-app)] border border-[var(--border-color)] transition-colors">
                                            <div className="text-[10px] font-mono text-gold-500 mb-1">{macro.shortcut}</div>
                                            <div className="text-xs text-[var(--text-primary)] line-clamp-2">{macro.text}</div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="p-4 flex gap-3 items-end">
                                <div className="flex flex-col gap-2">
                                    <button onClick={() => setShowCarPicker(true)} className="btn-secondary w-10 h-10 rounded-full !p-0 flex items-center justify-center shrink-0 text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20" title="Attach Car">
                                        <Car size={18} />
                                    </button>
                                    <button onClick={() => setShowEmojis(!showEmojis)} className={`btn-secondary w-10 h-10 rounded-full !p-0 flex items-center justify-center shrink-0 ${showEmojis ? 'bg-amber-500 text-black' : 'text-amber-500 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20'}`} title="Emoji">
                                        <Smile size={18} />
                                    </button>
                                </div>

                                <textarea
                                    className="input min-h-[50px] max-h-[120px] py-3"
                                    placeholder="Type message..."
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                                />

                                <div className="flex flex-col gap-2">
                                    <button onClick={() => setShowMacros(!showMacros)} className={`btn-secondary w-10 h-10 rounded-full !p-0 flex items-center justify-center shrink-0 ${showMacros ? 'bg-gold-500 text-black' : ''}`} title="Macros">
                                        <Zap size={18} />
                                    </button>
                                    <button onClick={handleReply} disabled={!replyText.trim()} className="btn-primary w-10 h-10 rounded-full !p-0 flex items-center justify-center shrink-0 shadow-lg shadow-gold-500/20">
                                        <Send size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
                        <Inbox size={64} className="mb-4 opacity-20" />
                        <p>Select a conversation</p>
                    </div>
                )}
            </div>

            {showCarPicker && <CarPicker onSelect={handleCarSelect} onClose={() => setShowCarPicker(false)} />}
        </div>
    );
};
