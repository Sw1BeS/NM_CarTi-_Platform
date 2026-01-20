
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getPublicProposal, trackPublicProposalView, sendPublicProposalFeedback } from '../../services/publicApi';
import { Proposal, Variant, Language } from '../../types';
import { TRANSLATIONS } from '../../translations';
import { CheckCircle, X, ChevronRight, Share2, ThumbsUp, ThumbsDown, MessageCircle, MapPin, Calendar, Gauge, Phone } from 'lucide-react';

export const ClientProposal = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [variants, setVariants] = useState<Variant[]>([]);
    const [loading, setLoading] = useState(true);
    const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({});
    const [lang, setLang] = useState<Language>('EN');

    const t = (key: string) => TRANSLATIONS[lang][key] || key;

    useEffect(() => {
        // Detect language from URL param ?lang=UK
        const l = searchParams.get('lang')?.toUpperCase();
        if (l === 'UK' || l === 'UA') setLang('UK');
        else if (l === 'RU') setLang('RU');
        else setLang('EN');

        if (!id) return;
        
        const load = async () => {
            const res = await getPublicProposal(id);
            if (res?.proposal) {
                setProposal(res.proposal);
                setVariants(res.variants || []);
                await trackPublicProposalView(res.proposal.id);
            } else {
                setProposal(null);
                setVariants(res?.variants || []);
            }
            setLoading(false);
        };
        load();
    }, [id, searchParams]);

    const handleFeedback = async (variantId: string, type: 'LIKE' | 'DISLIKE' | 'INTERESTED') => {
        if (!proposal) return;
        
        const newFeedback = { ...(proposal.clientFeedback || {}), [variantId]: type };
        await sendPublicProposalFeedback(proposal.id, variantId, type);
        
        setFeedbackSent({ ...feedbackSent, [variantId]: type });
        setProposal({ ...proposal, clientFeedback: newFeedback });

        if (type === 'INTERESTED') {
            // No alert in production feel, just UI change
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div></div>;

    if (!proposal) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Proposal not found or expired.</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans">
            <div className="bg-white p-6 sticky top-0 z-10 shadow-sm border-b">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-bold text-gray-900">{t('prop.title')}</h1>
                    <div className="bg-black text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs">C</div>
                </div>
                <p className="text-sm text-gray-500 mt-1">{t('prop.subtitle')}</p>
            </div>

            <div className="p-4 max-w-md mx-auto space-y-6">
                {variants.map((v, i) => (
                    <div key={v.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 relative">
                        <div className="relative h-56 bg-gray-200">
                            <img src={v.thumbnail} className="w-full h-full object-cover" alt={v.title} />
                            <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur px-3 py-1 rounded-lg font-bold text-sm">
                                {v.price.amount.toLocaleString()} {v.price.currency}
                            </div>
                        </div>
                        
                        <div className="p-5">
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{v.title}</h3>
                            <div className="flex gap-4 text-sm text-gray-500 mb-4">
                                <span className="flex items-center gap-1"><Calendar size={14}/> {v.year}</span>
                                <span className="flex items-center gap-1"><Gauge size={14}/> {(v.mileage/1000).toFixed(0)}k km</span>
                                <span className="flex items-center gap-1"><MapPin size={14}/> {v.location}</span>
                            </div>
                            
                            <div className="bg-gray-50 p-3 rounded-xl text-xs text-gray-600 leading-relaxed mb-4">
                                {v.specs?.engine} • {v.specs?.transmission} • {v.specs?.fuel}
                                {v.managerNotes && <div className="mt-2 pt-2 border-t border-gray-200 text-gray-500 italic">"{v.managerNotes}"</div>}
                            </div>

                            <div className="flex gap-2">
                                {feedbackSent[v.id] === 'INTERESTED' ? (
                                    <div className="w-full bg-green-50 text-green-700 py-3 rounded-xl font-bold text-center flex items-center justify-center gap-2">
                                        <CheckCircle size={18}/> {t('prop.sent')}
                                    </div>
                                ) : (
                                    <>
                                        <button onClick={() => handleFeedback(v.id, 'DISLIKE')} className={`p-3 rounded-xl border ${feedbackSent[v.id] === 'DISLIKE' ? 'bg-red-50 border-red-200 text-red-500' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                                            <ThumbsDown size={20}/>
                                        </button>
                                        <button onClick={() => handleFeedback(v.id, 'LIKE')} className={`p-3 rounded-xl border ${feedbackSent[v.id] === 'LIKE' ? 'bg-blue-50 border-blue-200 text-blue-500' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                                            <ThumbsUp size={20}/>
                                        </button>
                                        <button onClick={() => handleFeedback(v.id, 'INTERESTED')} className="flex-1 bg-black text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
                                            {t('prop.interested')} <ChevronRight size={16}/>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-6 text-center">
                <p className="text-xs text-gray-400 mb-4">Have questions?</p>
                <div className="flex justify-center gap-3">
                    <button className="bg-green-100 text-green-700 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2">
                        <MessageCircle size={14}/> WhatsApp
                    </button>
                    <button className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2">
                        <Phone size={14}/> Call Agent
                    </button>
                </div>
                <div className="mt-8 text-xs text-gray-300">
                    &copy; 2024 Cartie Automotive Concierge
                </div>
            </div>
        </div>
    );
};
