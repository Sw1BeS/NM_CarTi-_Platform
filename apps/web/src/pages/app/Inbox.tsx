
import React, { useState, useEffect, useRef } from 'react';
import { Data } from '../../services/data';
import { BotEngine } from '../../services/botEngine';
import { RequestsService } from '../../services/requestsService';
import { TelegramMessage, ChatMacro, User, B2BRequest, RequestStatus } from '../../types';
import { Send, Inbox, Trash2, X, Zap, UserCheck, StickyNote, Filter } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSearchParams } from 'react-router-dom';
import { useLang } from '../../contexts/LanguageContext';

// Default macros (можна винести в БД пізніше)
const DEFAULT_MACROS: ChatMacro[] = [
    { id: 'm1', shortcut: '/hi', text: 'Привіт! Чим можу допомогти? 👋', category: 'greeting' },
    { id: 'm2', shortcut: '/wait', text: 'Уточнюю інформацію, дайте секунду... ⏳', category: 'status' },
    { id: 'm3', shortcut: '/thanks', text: 'Дякую! Зв\'яжемося найближчим часом 🙏', category: 'closing' },
    { id: 'm4', shortcut: '/check', text: 'Перевірили наявність, зараз підготуємо варіанти 📋', category: 'status' },
    { id: 'm5', shortcut: '/price', text: 'Актуальну ціну уточню у постачальника та повернусь протягом години 💰', category: 'info' }
];

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
    const [internalNote, setInternalNote] = useState('');
    const [showNotePanel, setShowNotePanel] = useState(false);
    const [requestByChat, setRequestByChat] = useState<Record<string, B2BRequest>>({});
    const [timeline, setTimeline] = useState<any[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [bots, setBots] = useState<any[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string | undefined>(undefined);
    const statusOptions = [
        RequestStatus.DRAFT,
        RequestStatus.PUBLISHED,
        RequestStatus.COLLECTING_VARIANTS,
        RequestStatus.SHORTLIST,
        RequestStatus.CONTACT_SHARED,
        RequestStatus.WON,
        RequestStatus.LOST
    ];

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { user } = useAuth();
    const { showToast } = useToast();
    const { t } = useLang();
    const [searchParams] = useSearchParams();

    // Load messages and managers
    useEffect(() => {
        const load = async () => {
            const [messages, requestRes, botList] = await Promise.all([
                Data.getMessages({ botId: selectedBotId }),
                RequestsService.getRequests({ status: 'ALL', limit: 200 }),
                Data.getBots()
            ]);
            setBots(botList);
            if (!selectedBotId && botList.length > 0) {
                const active = botList.find((b: any) => b.active);
                setSelectedBotId(active ? active.id : botList[0].id);
            }
            setMsgs(messages);

            // Build chat list with metadata
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

            messages.forEach(m => {
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

            setChats(Array.from(chatMap.values()).sort((a, b) =>
                new Date(b.lastMsg.date).getTime() - new Date(a.lastMsg.date).getTime()
            ));
        };

        load();
        const unsub = Data.subscribe('UPDATE_MESSAGES', load);

        const target = searchParams.get('chatId');
        if (target) setActiveChatId(target);

        return unsub;
    }, [searchParams, selectedBotId]);

    // Load managers for assignment
    useEffect(() => {
        Data.getUsers().then(users => {
            setManagers(users.filter(u => u.role === 'MANAGER' || u.role === 'ADMIN'));
        });
    }, []);

    // Load note when chat changes
    useEffect(() => {
        if (activeChatId) {
            setInternalNote(requestByChat[activeChatId]?.internalNote || '');
            // Load timeline from MessageLog
            const req = requestByChat[activeChatId];
            if (req) {
                setTimelineLoading(true);
                Data.getMessageLogs({ requestId: req.id, chatId: activeChatId, limit: 50 }).then(setTimeline).finally(() => setTimelineLoading(false));
            } else {
                setTimeline([]);
            }
        }
    }, [activeChatId, requestByChat]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [msgs, activeChatId]);

    const handleReply = async () => {
        if (!activeChatId || !replyText.trim()) return;
        if (!selectedBotId) {
            showToast(t('inbox.select_bot'), 'error');
            return;
        }
        try {
            await BotEngine.sendUnifiedMessage('TG', activeChatId, replyText, undefined, selectedBotId);
            setReplyText('');
            const updatedMessages = await Data.getMessages({ botId: selectedBotId });
            setMsgs(updatedMessages);
            Data._notify('UPDATE_MESSAGES');
        } catch (e: any) {
            showToast(e.message || t('inbox.send_failed'), 'error');
        }
    };

    const assignChat = async (chatId: string, userId: string) => {
        const req = requestByChat[chatId];
        if (!req) {
            showToast(t('inbox.no_request'), 'error');
            return;
        }
        await RequestsService.updateRequest(req.id, { assigneeId: userId || null });
        const updated = chats.map(c => c.chatId === chatId ? { ...c, assignedTo: userId } : c);
        setChats(updated);
        setRequestByChat({ ...requestByChat, [chatId]: { ...req, assigneeId: userId || undefined } });
        showToast(t('inbox.assigned'), 'success');
        Data.getMessageLogs({ requestId: req.id, chatId, limit: 50 }).then(setTimeline);
    };

    const saveNote = async () => {
        if (!activeChatId) return;
        const req = requestByChat[activeChatId];
        if (!req) {
            showToast(t('inbox.no_request'), 'error');
            return;
        }
        await RequestsService.updateRequest(req.id, { internalNote });
        setRequestByChat({ ...requestByChat, [activeChatId]: { ...req, internalNote } });
        showToast(t('inbox.note_saved'), 'success');
        setShowNotePanel(false);
        Data.getMessageLogs({ requestId: req.id, chatId: activeChatId, limit: 50 }).then(setTimeline);
    };

    const insertMacro = (text: string) => {
        setReplyText(text);
        setShowMacros(false);
    };

    const activeMessages = activeChatId
        ? msgs.filter(m => m.chatId === activeChatId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        : [];

    const activeChat = chats.find(c => c.chatId === activeChatId);

    // Filter chats by assignment
    const filteredChats = chats.filter(c => {
        if (filter === 'MY') return c.assignedTo === user?.id;
        if (filter === 'UNASSIGNED') return !c.assignedTo;
        return true;
    });

    const activeRequest = activeChatId ? requestByChat[activeChatId] : undefined;

    return (
        <div className="h-[calc(100vh-100px)] flex gap-6">
            {/* Sidebar List */}
            <div className="w-80 panel flex flex-col overflow-hidden shrink-0">
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
                        <div
                            key={c.chatId}
                            onClick={() => setActiveChatId(c.chatId)}
                            className={`p-4 border-b border-[var(--border-color)] cursor-pointer hover:bg-[var(--bg-input)] transition-colors ${activeChatId === c.chatId ? 'bg-gold-500/10 border-l-4 border-l-gold-500' : 'border-l-4 border-l-transparent'}`}
                        >
                            <div className="flex justify-between mb-1">
                                <span className="font-bold text-sm text-[var(--text-primary)] truncate max-w-[150px]">{c.lastMsg.from}</span>
                                <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">{new Date(c.lastMsg.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] truncate mb-2">{c.lastMsg.text}</div>
                            {c.assignedTo && (
                                <div className="flex items-center gap-1 text-[9px] text-blue-500">
                                    <UserCheck size={10} />
                                    {managers.find(m => m.id === c.assignedTo)?.name || 'Assigned'}
                                </div>
                            )}
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
                                    <div className="font-bold text-[var(--text-primary)]">
                                        {activeChat?.lastMsg.from || 'Chat'}
                                    </div>
                                    <div className="text-[10px] text-[var(--text-secondary)]">ID: {activeChatId}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Assignment */}
                                <select
                                    className="input text-xs px-2 py-1"
                                    value={activeChat?.assignedTo || ''}
                                    onChange={e => assignChat(activeChatId, e.target.value)}
                                >
                                    <option value="">Unassigned</option>
                                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                {/* Request Status */}
                                {activeRequest?.status && (
                                    <select
                                        className="input text-xs px-2 py-1"
                                        value={activeRequest.status}
                                        onChange={async e => {
                                            const newStatus = e.target.value as RequestStatus;
                                            await RequestsService.updateRequest(activeRequest.id, { status: newStatus });
                                            setRequestByChat({ ...requestByChat, [activeChatId]: { ...activeRequest, status: newStatus } });
                                            showToast('Status updated', 'success');
                                            Data.getMessageLogs({ requestId: activeRequest.id, chatId: activeChatId, limit: 50 }).then(setTimeline);
                                        }}
                                    >
                                        {statusOptions.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                                    </select>
                                )}

                                {/* Note Button */}
                                <button
                                    onClick={() => setShowNotePanel(!showNotePanel)}
                                    className={`btn-secondary px-3 py-1.5 text-xs ${internalNote ? 'text-gold-500' : ''}`}
                                >
                                    <StickyNote size={14} />
                                </button>

                                <button onClick={async () => { await Data.clearSession(activeChatId); window.location.reload(); }} className="btn-ghost text-xs text-red-500 hover:bg-red-500/10 px-3 py-1.5">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Note Panel */}
                        {showNotePanel && (
                            <div className="bg-yellow-500/10 border-b border-yellow-500/30 p-3">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="text-xs font-bold text-yellow-600 flex items-center gap-1">
                                        <StickyNote size={12} /> Internal Note (not visible to client)
                                    </div>
                                    <button onClick={() => setShowNotePanel(false)}><X size={14} className="text-[var(--text-secondary)]" /></button>
                                </div>
                                <textarea
                                    className="textarea text-xs h-20 w-full"
                                    placeholder="Add private notes about this conversation..."
                                    value={internalNote}
                                    onChange={e => setInternalNote(e.target.value)}
                                />
                                <button onClick={saveNote} className="btn-primary text-xs px-3 py-1 mt-2">Save Note</button>
                            </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[var(--bg-input)]">
                            {activeMessages.map(m => {
                                const isOut = m.direction === 'OUTGOING';
                                return (
                                    <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-3 rounded-2xl shadow-sm text-sm relative group ${isOut
                                            ? 'bg-gold-500 text-charcoal-950 rounded-tr-none'
                                            : 'bg-[var(--bg-panel)] text-[var(--text-primary)] rounded-tl-none border border-[var(--border-color)]'
                                            }`}>
                                            {m.text}
                                            <div className={`text-[9px] mt-1 text-right opacity-60 ${isOut ? 'text-charcoal-800' : 'text-[var(--text-secondary)]'}`}>
                                                {new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                            {timelineLoading && <div className="text-xs text-[var(--text-secondary)]">Loading timeline...</div>}
                            {timeline.length > 0 && (
                                <div className="mt-6 border-t border-[var(--border-color)] pt-4">
                                    <div className="text-xs font-bold text-[var(--text-secondary)] mb-2">Timeline</div>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {timeline.map(item => (
                                            <div key={item.id} className="text-xs text-[var(--text-secondary)]">
                                                <span className="font-mono text-[var(--text-primary)]">{new Date(item.createdAt).toLocaleString()}</span>
                                                {' — '}
                                                <span className="text-[var(--text-primary)]">{item.text || item.payload?.type || 'Log'}</span>
                                                {item.variantStatus && <span className="ml-2 text-[10px] text-[var(--text-muted)]">[{item.variantStatus}]</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input */}
                        <div className="border-t border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur">
                            {/* Macros Panel */}
                            {showMacros && (
                                <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-input)]">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-[var(--text-secondary)]">Quick Replies</span>
                                        <button onClick={() => setShowMacros(false)}><X size={14} className="text-[var(--text-secondary)]" /></button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {DEFAULT_MACROS.map(macro => (
                                            <button
                                                key={macro.id}
                                                onClick={() => insertMacro(macro.text)}
                                                className="text-left p-2 rounded bg-[var(--bg-panel)] hover:bg-[var(--bg-app)] border border-[var(--border-color)] transition-colors"
                                            >
                                                <div className="text-[10px] font-mono text-gold-500 mb-1">{macro.shortcut}</div>
                                                <div className="text-xs text-[var(--text-primary)] line-clamp-2">{macro.text}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="p-4 flex gap-3">
                                <button
                                    onClick={() => setShowMacros(!showMacros)}
                                    className={`btn-secondary w-10 h-10 rounded-full !p-0 flex items-center justify-center shrink-0 ${showMacros ? 'bg-gold-500 text-black' : ''}`}
                                    title="Quick replies"
                                >
                                    <Zap size={18} />
                                </button>
                                <input
                                    className="input"
                                    placeholder="Type message or use / for macros..."
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleReply();
                                        }
                                    }}
                                />
                                <button onClick={handleReply} disabled={!replyText.trim()} className="btn-primary w-12 h-12 rounded-full !p-0 flex items-center justify-center shrink-0">
                                    <Send size={20} />
                                </button>
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
        </div>
    );
};
