
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, Send, Settings, ArrowRight, X } from 'lucide-react';
import { Data } from '../services/data';
import { useAuth } from '../contexts/AuthContext';
import { canAccessRoute } from '../config/permissions';

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const { user } = useAuth();
    const role = user?.role as any;

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults([]);
        }
    }, [isOpen]);

    useEffect(() => {
        const fetchResults = async () => {
            if (!query) {
                const baseNav = [
                    { type: 'NAV', label: 'Go to Dashboard', icon: <Search size={14}/>, path: '/' },
                    { type: 'NAV', label: 'Go to Requests', icon: <FileText size={14}/>, path: '/requests' },
                    { type: 'NAV', label: 'Go to Leads', icon: <Users size={14}/>, path: '/leads' },
                    { type: 'NAV', label: 'Go to Telegram Hub', icon: <Send size={14}/>, path: '/telegram' },
                    { type: 'NAV', label: 'Go to Settings', icon: <Settings size={14}/>, path: '/settings' },
                    { type: 'ACTION', label: 'New Request', icon: <FileText size={14}/>, path: '/requests?create=1' },
                    { type: 'ACTION', label: 'New Lead', icon: <Users size={14}/>, path: '/leads?create=1' },
                ].filter(item => canAccessRoute(role || 'VIEWER', item.path));
                setResults(baseNav);
                return;
            }

            const lowerQ = query.toLowerCase();
            const found = [];

            // Search Requests
            const requests = await Data.getRequests();
            requests.forEach(r => {
                if (r.title.toLowerCase().includes(lowerQ) || r.publicId.toLowerCase().includes(lowerQ)) {
                    found.push({ type: 'REQ', label: `${r.publicId} - ${r.title}`, icon: <FileText size={14}/>, path: `/requests?id=${r.id}` });
                }
            });

            // Search Leads
            const leads = await Data.getLeads();
            leads.forEach(l => {
                if (l.name.toLowerCase().includes(lowerQ)) {
                    found.push({ type: 'LEAD', label: `Lead: ${l.name}`, icon: <Users size={14}/>, path: '/leads' });
                }
            });

            setResults(found.slice(0, 5));
        };

        fetchResults();
    }, [query, isOpen]);

    if (!isOpen) return null;

    const handleSelect = (item: any) => {
        navigate(item.path);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-start justify-center pt-24" onClick={onClose}>
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-gray-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center border-b p-3">
                    <Search className="text-gray-400 ml-2" size={20}/>
                    <input 
                        className="flex-1 p-2 outline-none text-gray-900 placeholder-gray-400 bg-white" 
                        placeholder="Type a command or search..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoFocus
                    />
                    <button onClick={onClose}><X size={18} className="text-gray-400"/></button>
                </div>
                <div className="p-2 max-h-[300px] overflow-y-auto">
                    {results.length === 0 && <div className="text-gray-400 text-sm p-4 text-center">No results found.</div>}
                    {results.map((item, idx) => (
                        <button 
                            key={idx} 
                            onClick={() => handleSelect(item)}
                            className="w-full text-left flex items-center justify-between p-3 hover:bg-brand-50 rounded-lg group transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="text-gray-400 group-hover:text-brand-600">{item.icon}</div>
                                <span className="text-sm font-medium text-gray-700 group-hover:text-brand-700">{item.label}</span>
                            </div>
                            <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 text-brand-400"/>
                        </button>
                    ))}
                </div>
                <div className="bg-gray-50 p-2 text-[10px] text-gray-400 text-right border-t">
                    Use arrows to navigate, Enter to select, Esc to close
                </div>
            </div>
        </div>
    );
};
