
import React, { useState, useEffect } from 'react';
import { Data } from '../services/data';
import { Bot, MiniAppConfig, CarListing, RequestStatus, LeadStatus } from '../types';
import { 
    Search, LayoutGrid, User, Plus, Filter, ArrowRight, DollarSign, 
    MessageSquare, Zap, List as ListIcon, Star, Phone, Home, 
    ChevronRight, MapPin, Calendar, CheckCircle, AlertTriangle
} from 'lucide-react';

export const MiniApp = () => {
    const [activeBot, setActiveBot] = useState<Bot | null>(null);
    const [config, setConfig] = useState<MiniAppConfig | null>(null);
    const [view, setView] = useState<'HOME' | 'INVENTORY' | 'REQUEST' | 'PROFILE'>('HOME');
    const [tgUser, setTgUser] = useState<any>(null);
    const [isPreview, setIsPreview] = useState(false);
    
    // Inventory State
    const [cars, setCars] = useState<CarListing[]>([]);
    const [search, setSearch] = useState('');

    // Request Form State
    const [reqStep, setReqStep] = useState(1);
    const [reqData, setReqData] = useState({ brand: '', budget: '', year: '' });

    useEffect(() => {
        const load = async () => {
            // 1. Initialize Telegram Web App
            const tg = (window as any).Telegram?.WebApp;
            
            if (tg && tg.initData) {
                tg.ready();
                tg.expand();
                tg.enableClosingConfirmation();
                setTgUser(tg.initDataUnsafe?.user);
                setIsPreview(false);
            } else {
                // Mock environment for browser preview
                setIsPreview(true);
                setTgUser({ first_name: 'Guest', username: 'guest_user' });
            }

            // 2. Load Bot Configuration (Simulating connection to specific bot)
            const bots = await Data.getBots();
            const bot = bots.find(b => b.active) || bots[0];
            if (bot) {
                setActiveBot(bot);
                setConfig(bot.miniAppConfig || null);
            }

            // 3. Load Data
            const inv = await Data.getInventory();
            setCars(inv.filter(c => c.status === 'AVAILABLE'));
        };
        load();
    }, []);

    if (!config) return <div className="h-screen flex items-center justify-center text-white bg-black">Loading App...</div>;

    const primaryColor = config.primaryColor || '#D4AF37';

    const handleAction = (act: any) => {
        const tg = (window as any).Telegram?.WebApp;
        if (act.actionType === 'VIEW') {
            if (act.value === 'INVENTORY') setView('INVENTORY');
            if (act.value === 'REQUEST') setView('REQUEST');
        } else if (act.actionType === 'LINK') {
            if (tg && tg.openLink) {
                tg.openLink(act.value);
            } else {
                window.open(act.value, '_blank');
            }
        } else if (act.actionType === 'SCENARIO') {
            if (tg?.initData) {
                tg.sendData(JSON.stringify({ type: 'RUN_SCENARIO', scenarioId: act.value }));
                tg.close();
            } else {
                alert(`[PREVIEW] Trigger Scenario: ${act.value}\n(In real app, this closes Mini App and sends data to bot)`);
            }
        }
    };

    const renderHome = () => (
        <div className="animate-fade-in pb-24">
            {/* Header */}
            <div className="pt-8 pb-8 px-6 rounded-b-[40px] shadow-lg relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${primaryColor}30 0%, #000000 100%)` }}>
                <div className="relative z-10">
                    <h1 className="text-2xl font-bold text-white mb-1">{config.title}</h1>
                    <p className="text-white/70 text-sm">{config.welcomeText}</p>
                    
                    {tgUser && (
                        <div className="mt-6 flex items-center gap-3 bg-white/10 p-2.5 rounded-xl backdrop-blur-md border border-white/5 shadow-inner">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-sm shadow-md">
                                {tgUser.first_name?.[0]}
                            </div>
                            <div className="text-xs">
                                <p className="text-white font-bold text-sm">Hello, {tgUser.first_name}</p>
                                <p className="text-white/50">CarTié Member</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="px-4 -mt-6 relative z-20">
                <div className="bg-[#1c1c1e] rounded-2xl p-4 shadow-2xl border border-white/5">
                    <div className={`grid gap-3 ${config.layout === 'GRID' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {config.actions.map(act => (
                            <button 
                                key={act.id}
                                onClick={() => handleAction(act)}
                                className="bg-[#2c2c2e] hover:bg-[#3a3a3c] transition-colors p-4 rounded-xl flex flex-col items-center justify-center gap-2 text-center group active:scale-95 duration-100 border border-transparent hover:border-white/5"
                            >
                                <div className="w-12 h-12 rounded-full bg-black/30 flex items-center justify-center shadow-inner" style={{ color: primaryColor }}>
                                    <AppIcon name={act.icon} />
                                </div>
                                <span className="text-sm font-medium text-white">{act.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Recent Inventory */}
            <div className="px-4 mt-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white text-lg">New Arrivals</h3>
                    <button onClick={() => setView('INVENTORY')} className="text-xs font-bold" style={{ color: primaryColor }}>View All</button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
                    {cars.slice(0, 5).map(car => (
                        <div key={car.canonicalId} className="min-w-[220px] bg-[#1c1c1e] rounded-xl overflow-hidden border border-white/5 shadow-lg">
                            <div className="h-32 bg-gray-800 relative">
                                <img src={car.thumbnail} className="w-full h-full object-cover opacity-90" />
                                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-white">
                                    {car.year}
                                </div>
                            </div>
                            <div className="p-3">
                                <h4 className="text-sm font-bold text-white truncate">{car.title}</h4>
                                <p className="text-xs text-white/50 mt-1 mb-2">{car.specs?.engine} • {car.mileage/1000}k km</p>
                                <div className="font-bold text-sm" style={{ color: primaryColor }}>
                                    {car.price.amount.toLocaleString()} $
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderInventory = () => (
        <div className="animate-fade-in pb-24 h-full flex flex-col bg-black">
            <div className="p-4 sticky top-0 bg-[#000000]/90 backdrop-blur-md z-20 border-b border-white/10">
                <h2 className="text-xl font-bold text-white mb-4">Inventory</h2>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18}/>
                    <input 
                        className="w-full bg-[#1c1c1e] text-white pl-10 pr-4 py-3 rounded-xl outline-none placeholder-gray-600 border border-white/5 focus:border-yellow-500/50 transition-colors"
                        placeholder="Search cars..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {cars.filter(c => c.title.toLowerCase().includes(search.toLowerCase())).map(car => (
                    <div key={car.canonicalId} className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-white/5 flex flex-col shadow-lg">
                        <div className="h-48 bg-gray-800 relative">
                            <img src={car.thumbnail} className="w-full h-full object-cover" />
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12">
                                <h3 className="text-lg font-bold text-white">{car.title}</h3>
                            </div>
                        </div>
                        <div className="p-4">
                            <div className="flex justify-between items-center mb-4">
                                <div className="text-xl font-bold" style={{ color: primaryColor }}>{car.price.amount.toLocaleString()} $</div>
                                <div className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded">{car.year}</div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs text-white/70 mb-4">
                                <div className="bg-black/30 p-2 rounded text-center border border-white/5">{car.specs?.engine || 'N/A'}</div>
                                <div className="bg-black/30 p-2 rounded text-center border border-white/5">{car.mileage.toLocaleString()} km</div>
                                <div className="bg-black/30 p-2 rounded text-center border border-white/5">{car.specs?.fuel || 'N/A'}</div>
                            </div>
                            <button className="w-full py-3 rounded-xl font-bold text-black flex items-center justify-center gap-2 active:scale-95 transition-transform" style={{ backgroundColor: primaryColor }}>
                                <MessageSquare size={18}/> I'm Interested
                            </button>
                        </div>
                    </div>
                ))}
                {cars.length === 0 && <div className="text-center text-white/50 mt-10">No cars found.</div>}
            </div>
        </div>
    );

    const handleNextStep = async () => {
        if (reqStep === 1) {
            setReqStep(2);
        } else {
            // Submit via Telegram WebApp if available
            const tg = (window as any).Telegram?.WebApp;
            
            if (tg && tg.initData) {
                const payload = {
                    type: 'LEAD',
                    name: tgUser?.first_name || 'User',
                    phone: reqData.brand ? 'Shared via WebApp' : '', // Fallback
                    request: {
                        brand: reqData.brand,
                        budget: Number(reqData.budget),
                        year: Number(reqData.year)
                    },
                    lang: tg.initDataUnsafe?.user?.language_code?.toUpperCase() || 'EN'
                };
                tg.sendData(JSON.stringify(payload));
                tg.close();
            } else {
                // Fallback for browser (Dev mode)
                alert("[PREVIEW MODE] Data that would be sent to bot:\n" + JSON.stringify(reqData, null, 2));
                setReqStep(3);
            }
        }
    };

    const renderRequest = () => (
        <div className="animate-fade-in pb-24 p-6 min-h-screen flex flex-col justify-center bg-black">
            {reqStep === 3 ? (
                <div className="text-center animate-slide-up">
                    <div className="w-24 h-24 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                        <CheckCircle size={48}/>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Request Sent!</h2>
                    <p className="text-white/50 mb-8">We have received your request. A manager will check the market and contact you shortly.</p>
                    <button onClick={() => { setReqStep(1); setView('HOME'); }} className="btn-primary w-full py-4 rounded-xl font-bold text-lg" style={{ backgroundColor: primaryColor, color: '#000' }}>
                        Back to Home
                    </button>
                </div>
            ) : (
                <>
                    <h2 className="text-3xl font-bold text-white mb-2">Find Your Car</h2>
                    <p className="text-white/50 mb-8">Tell us what you are looking for.</p>
                    
                    <div className="space-y-6">
                        {reqStep === 1 && (
                            <div className="space-y-5 animate-slide-up">
                                <div>
                                    <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Brand & Model</label>
                                    <input className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10 focus:border-yellow-500 transition-colors" placeholder="e.g. BMW X5" value={reqData.brand} onChange={e => setReqData({...reqData, brand: e.target.value})} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Min Year</label>
                                        <input type="number" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="2018" value={reqData.year} onChange={e => setReqData({...reqData, year: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Max Budget</label>
                                        <input type="number" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="50000" value={reqData.budget} onChange={e => setReqData({...reqData, budget: e.target.value})} />
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {reqStep === 2 && (
                            <div className="space-y-4 animate-slide-up">
                                <div className="bg-[#1c1c1e] p-6 rounded-xl border border-white/10 text-white/80 text-sm space-y-2">
                                    <p className="font-bold text-white mb-4 text-lg border-b border-white/10 pb-2">Summary</p>
                                    <div className="flex justify-between"><span>Vehicle:</span> <span className="font-bold text-white">{reqData.brand}</span></div>
                                    <div className="flex justify-between"><span>Year:</span> <span className="font-bold text-white">{reqData.year}+</span></div>
                                    <div className="flex justify-between"><span>Budget:</span> <span className="font-bold text-white" style={{color: primaryColor}}>${reqData.budget}</span></div>
                                </div>
                                <p className="text-xs text-white/50 text-center px-4">
                                    By submitting, you agree to be contacted by our concierge team via this chat.
                                </p>
                            </div>
                        )}

                        <div className="pt-4">
                            <button 
                                onClick={handleNextStep}
                                disabled={reqStep === 1 && !reqData.brand}
                                className="w-full py-4 rounded-xl font-bold text-black flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100 shadow-lg"
                                style={{ backgroundColor: primaryColor }}
                            >
                                {reqStep === 1 ? 'Continue' : 'Submit Request'} <ArrowRight size={18}/>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    const AppIcon = ({ name }: { name: string }) => {
        const props = { size: 24 };
        switch(name) {
            case 'Search': return <Search {...props}/>;
            case 'Zap': return <Zap {...props}/>;
            case 'DollarSign': return <DollarSign {...props}/>;
            case 'MessageCircle': return <MessageSquare {...props}/>;
            case 'Grid': return <LayoutGrid {...props}/>;
            case 'List': return <ListIcon {...props}/>;
            case 'Phone': return <Phone {...props}/>;
            default: return <Star {...props}/>;
        }
    };

    return (
        <div className="min-h-screen bg-black font-sans text-white max-w-md mx-auto relative shadow-2xl overflow-hidden border-x border-[#1c1c1e]">
            {/* Preview Banner */}
            {isPreview && (
                <div className="bg-orange-500/20 text-orange-400 text-[10px] uppercase font-bold text-center py-1 border-b border-orange-500/30 flex items-center justify-center gap-2">
                    <AlertTriangle size={10}/> Preview Mode (No Telegram Bridge)
                </div>
            )}

            {view === 'HOME' && renderHome()}
            {view === 'INVENTORY' && renderInventory()}
            {view === 'REQUEST' && renderRequest()}
            {view === 'PROFILE' && <div className="p-8 text-center text-white/50 pt-20 flex flex-col items-center"><User size={48} className="mb-4 opacity-50"/>Profile Coming Soon</div>}

            {/* Bottom Navigation */}
            <div className="h-20 bg-[#1c1c1e]/90 backdrop-blur-md border-t border-white/5 fixed bottom-0 w-full max-w-md flex items-center justify-around z-50 pb-4 shadow-lg">
                <button onClick={() => setView('HOME')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'HOME' ? 'text-white' : 'text-white/40'}`}>
                    <Home size={22} className={view === 'HOME' ? 'fill-current' : ''} style={view === 'HOME' ? {color: primaryColor} : {}}/>
                    <span className="text-[10px] font-medium">Home</span>
                </button>
                <button onClick={() => setView('INVENTORY')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'INVENTORY' ? 'text-white' : 'text-white/40'}`}>
                    <LayoutGrid size={22} className={view === 'INVENTORY' ? 'fill-current' : ''} style={view === 'INVENTORY' ? {color: primaryColor} : {}}/>
                    <span className="text-[10px] font-medium">Stock</span>
                </button>
                <button onClick={() => setView('REQUEST')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'REQUEST' ? 'text-white' : 'text-white/40'}`}>
                    <Search size={22} className="stroke-[3px]" style={view === 'REQUEST' ? {color: primaryColor} : {}}/>
                    <span className="text-[10px] font-medium">Find</span>
                </button>
                <button onClick={() => setView('PROFILE')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'PROFILE' ? 'text-white' : 'text-white/40'}`}>
                    <User size={22} className={view === 'PROFILE' ? 'fill-current' : ''} style={view === 'PROFILE' ? {color: primaryColor} : {}}/>
                    <span className="text-[10px] font-medium">Profile</span>
                </button>
            </div>
        </div>
    );
};
