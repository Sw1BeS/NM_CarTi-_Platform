
import React, { useState, useEffect } from 'react';
import { RequestStatus, LeadStatus, Language } from '../types';
import { TRANSLATIONS } from '../translations';
import { CheckCircle, ArrowRight, Car, DollarSign, User, Phone, MapPin, Loader, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPublicLead, createPublicRequest } from '../services/publicApi';

export const PublicRequest = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [isTWA, setIsTWA] = useState(false);
    const [lang, setLang] = useState<Language>('EN');
    
    const [data, setData] = useState({
        brand: '',
        model: '',
        yearMin: 2018,
        budgetMax: '',
        name: '',
        phone: '',
        city: 'Kyiv'
    });

    const t = (key: string) => TRANSLATIONS[lang][key] || key;

    // Initialize Telegram Web App
    useEffect(() => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
            setIsTWA(true);
            tg.ready();
            tg.expand();
            
            // Detect Language
            const userLang = (tg.initDataUnsafe?.user?.language_code || 'en').toUpperCase();
            if (userLang === 'UK' || userLang === 'UA') setLang('UK');
            else if (userLang === 'RU') setLang('RU');
            else setLang('EN');
            
            // Auto-fill user data
            if (tg.initDataUnsafe?.user) {
                const u = tg.initDataUnsafe.user;
                setData(prev => ({
                    ...prev,
                    name: `${u.first_name} ${u.last_name || ''}`.trim(),
                }));
            }

            // Handle Main Button Clicks
            const handleMainBtn = () => {
                handleSubmit();
            };
            tg.MainButton.onClick(handleMainBtn);

            return () => {
                tg.MainButton.offClick(handleMainBtn);
                tg.MainButton.hide();
            };
        }
    }, [step, data]); 

    // Update Main Button State
    useEffect(() => {
        const tg = (window as any).Telegram?.WebApp;
        if (!tg) return;

        if (success) {
            tg.MainButton.text = "CLOSE";
            tg.MainButton.show();
            tg.MainButton.onClick(() => tg.close());
            return;
        }

        if (step === 1) {
            tg.MainButton.text = lang === 'UK' ? "ДАЛІ" : lang === 'RU' ? "ДАЛЕЕ" : "NEXT STEP";
            if (data.brand) {
                tg.MainButton.show();
                tg.MainButton.enable();
            } else {
                tg.MainButton.hide();
            }
            tg.MainButton.offClick(handleSubmit); 
            tg.MainButton.onClick(() => setStep(2));
        } else if (step === 2) {
            tg.MainButton.text = lang === 'UK' ? "НАДІСЛАТИ" : lang === 'RU' ? "ОТПРАВИТЬ" : "SUBMIT REQUEST";
            tg.MainButton.show();
            if (data.name && data.phone) {
                tg.MainButton.enable();
            } else {
                tg.MainButton.disable();
            }
            tg.MainButton.offClick(() => setStep(2));
            tg.MainButton.onClick(handleSubmit);
        }
    }, [step, data, success, lang]);

    const handleSubmit = async (e?: any) => {
        if (e) e.preventDefault();
        
        if (step === 1) {
            setStep(2);
            return;
        }

        if (!data.name || !data.phone) return;
        
        setLoading(true);
        const tg = (window as any).Telegram?.WebApp;
        if (tg) tg.MainButton.showProgress(false);
        
        const userTgId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : undefined;
        const username = tg?.initDataUnsafe?.user?.username;

        try {
            // 1. Create Lead
            const lead = await createPublicLead({
                name: data.name,
                phone: data.phone,
                source: userTgId ? 'TELEGRAM' : 'WEB',
                telegramChatId: userTgId,
                telegramUsername: username,
                goal: `${data.brand} ${data.model} (${data.yearMin}+)`,
                status: LeadStatus.NEW,
                language: lang,
                notes: `Budget: ${data.budgetMax || 'N/A'}\nCity: ${data.city}\nVia Mini App`
            } as any);

            // 2. Create Request (if car details present)
            if (data.brand) {
                await createPublicRequest({
                    title: `${data.brand} ${data.model}`,
                    budgetMax: Number(data.budgetMax) || 0,
                    yearMin: Number(data.yearMin),
                    city: data.city,
                    description: `Generated from Telegram Mini App\nLead ID: ${lead.id}`,
                    status: RequestStatus.COLLECTING_VARIANTS,
                    priority: 'HIGH',
                    clientChatId: userTgId,
                    language: lang
                } as any);
            }

            setSuccess(true);
        } catch (err) {
            console.error(err);
        } finally {
            if (tg) tg.MainButton.hideProgress();
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className={`min-h-screen flex items-center justify-center p-6 ${isTWA ? 'bg-tg-bg' : 'bg-gray-50'}`}>
                <div className={`max-w-md w-full p-8 rounded-2xl text-center ${isTWA ? '' : 'bg-white shadow-xl'}`}>
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle size={40} />
                    </div>
                    <h2 className={`text-2xl font-bold mb-2 ${isTWA ? 'text-tg-text' : 'text-gray-900'}`}>{t('pub.success')}</h2>
                    <p className={`mb-8 ${isTWA ? 'text-tg-hint' : 'text-gray-500'}`}>{t('pub.success_msg')}</p>
                    
                    {!isTWA && (
                        <button onClick={() => window.location.reload()} className="text-gold-500 font-bold hover:underline text-sm">
                            Submit another request
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const containerClass = isTWA 
        ? "min-h-screen p-4" 
        : "min-h-screen bg-[var(--bg-app)] flex flex-col items-center justify-center p-4 md:p-8";

    const cardClass = isTWA 
        ? "" 
        : "panel w-full max-w-lg overflow-hidden border-t border-[rgba(255,255,255,0.1)]";

    const labelClass = isTWA 
        ? "block text-xs font-bold uppercase mb-1 text-[var(--tg-theme-hint-color)]" 
        : "block text-xs font-bold text-[var(--text-secondary)] uppercase mb-1";

    // Use consistent styling
    const inputClass = isTWA 
        ? "w-full border-b border-[var(--tg-theme-hint-color)] bg-transparent p-3 outline-none text-[var(--tg-theme-text-color)] placeholder-[var(--tg-theme-hint-color)] transition-colors focus:border-[var(--tg-theme-button-color)]"
        : "input";

    return (
        <div className={containerClass} style={isTWA ? { backgroundColor: 'var(--tg-theme-bg-color)', color: 'var(--tg-theme-text-color)' } : {}}>
            <div className={isTWA ? "w-full" : "w-full max-w-lg"}>
                {!isTWA && (
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">CarTié<span className="text-gold-500">.</span></h1>
                        <p className="text-[var(--text-secondary)] mt-2 text-sm uppercase tracking-widest">Premium Car Concierge</p>
                    </div>
                )}

                <div className={cardClass}>
                    {!isTWA && (
                        <div className="h-2 bg-[var(--bg-input)] w-full flex">
                            <div className={`h-full bg-gold-500 transition-all duration-500 ${step === 1 ? 'w-1/2' : 'w-full'}`}></div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className={isTWA ? "space-y-6" : "p-8"}>
                        {step === 1 && (
                            <div className="space-y-6 animate-slide-up">
                                <div className="text-center mb-6">
                                    <h3 className={`text-xl font-bold ${isTWA ? 'text-[var(--tg-theme-text-color)]' : 'text-[var(--text-primary)]'}`}>{t('pub.title')}</h3>
                                    <p className={`text-sm ${isTWA ? 'text-[var(--tg-theme-hint-color)]' : 'text-[var(--text-secondary)]'}`}>{t('pub.subtitle')}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>{t('pub.make')}</label>
                                        <input required className={inputClass} placeholder="BMW" value={data.brand} onChange={e => setData({...data, brand: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>{t('pub.model')}</label>
                                        <input className={inputClass} placeholder="X5" value={data.model} onChange={e => setData({...data, model: e.target.value})} />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>{t('pub.budget')}</label>
                                    <div className="relative">
                                        {!isTWA && <DollarSign className="absolute left-3 top-3.5 text-[var(--text-secondary)]" size={18}/>}
                                        <input type="number" className={`${inputClass} ${!isTWA ? 'pl-10' : ''}`} placeholder="50000" value={data.budgetMax} onChange={e => setData({...data, budgetMax: e.target.value})} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>{t('pub.year')}</label>
                                        <input type="number" className={inputClass} value={data.yearMin} onChange={e => setData({...data, yearMin: +e.target.value})} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>{t('pub.city')}</label>
                                        <input className={inputClass} value={data.city} onChange={e => setData({...data, city: e.target.value})} />
                                    </div>
                                </div>

                                {!isTWA && (
                                    <button type="button" onClick={() => setStep(2)} disabled={!data.brand} className="w-full btn-primary py-3 flex items-center justify-center gap-2">
                                        {t('pub.next')} <ArrowRight size={20}/>
                                    </button>
                                )}
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-6 animate-slide-up">
                                <button type="button" onClick={() => setStep(1)} className={`text-sm mb-2 flex items-center gap-1 ${isTWA ? 'text-[var(--tg-theme-link-color)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                                    <ArrowLeft size={16}/> Back
                                </button>
                                
                                <div className="text-center mb-6">
                                    <h3 className={`text-xl font-bold ${isTWA ? 'text-[var(--tg-theme-text-color)]' : 'text-[var(--text-primary)]'}`}>{t('pub.contact_title')}</h3>
                                    <p className={`text-sm ${isTWA ? 'text-[var(--tg-theme-hint-color)]' : 'text-[var(--text-secondary)]'}`}>{t('pub.contact_sub')}</p>
                                </div>

                                <div>
                                    <label className={labelClass}>{t('pub.name')}</label>
                                    <div className="relative">
                                        {!isTWA && <User className="absolute left-3 top-3.5 text-[var(--text-secondary)]" size={18}/>}
                                        <input required className={`${inputClass} ${!isTWA ? 'pl-10' : ''}`} placeholder="Alex" value={data.name} onChange={e => setData({...data, name: e.target.value})} />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>{t('pub.phone')}</label>
                                    <div className="relative">
                                        {!isTWA && <Phone className="absolute left-3 top-3.5 text-[var(--text-secondary)]" size={18}/>}
                                        <input required className={`${inputClass} ${!isTWA ? 'pl-10' : ''}`} placeholder="+380..." value={data.phone} onChange={e => setData({...data, phone: e.target.value})} />
                                    </div>
                                </div>

                                <div className={`p-4 rounded-xl flex gap-3 items-start ${isTWA ? 'bg-[var(--tg-theme-secondary-bg-color)]' : 'bg-blue-500/10'}`}>
                                    <ShieldCheck className={`${isTWA ? 'text-[var(--tg-theme-hint-color)]' : 'text-blue-500'} shrink-0`} size={20} />
                                    <p className={`text-xs leading-relaxed ${isTWA ? 'text-[var(--tg-theme-hint-color)]' : 'text-blue-500'}`}>
                                        {t('pub.privacy')}
                                    </p>
                                </div>

                                {!isTWA && (
                                    <button type="submit" disabled={loading || !data.name || !data.phone} className="w-full btn-primary py-3 flex items-center justify-center gap-2">
                                        {loading ? <Loader className="animate-spin" size={20}/> : <CheckCircle size={20}/>}
                                        {t('pub.submit')}
                                    </button>
                                )}
                            </div>
                        )}
                    </form>
                </div>
                
                {!isTWA && (
                    <div className="text-center mt-8 text-[var(--text-secondary)] text-xs opacity-50">
                        &copy; 2024 CarTié Automotive. All rights reserved.
                    </div>
                )}
            </div>
        </div>
    );
};
