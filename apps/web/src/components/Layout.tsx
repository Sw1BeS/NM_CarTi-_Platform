
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Search, Users,
  Send, LogOut, Menu, Settings as SettingsIcon, X, Plus, Radio, MessageCircle, Bell, Car, Sparkles, Briefcase, Database
} from 'lucide-react';
import { User, NavItemConfig } from '../types';
import { useLang } from '../contexts/LanguageContext';
import { CommandPalette } from './CommandPalette';
import { Data } from '../services/data';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
}

const ICON_MAP: Record<string, any> = {
  'LayoutDashboard': LayoutDashboard,
  'FileText': FileText,
  'Search': Search,
  'Users': Users,
  'Send': Send,
  'MessageCircle': MessageCircle,
  'Settings': SettingsIcon,
  'Car': Car,
  'Briefcase': Briefcase,
  'Database': Database
};

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'OWNER', 'DEALER'];

const DEFAULT_NAV: NavItemConfig[] = [
  { id: 'nav_dash', labelKey: 'nav.dashboard', path: '/', iconName: 'LayoutDashboard', roles: ALL_ROLES, order: 0, visible: true },
  { id: 'nav_inbox', labelKey: 'nav.inbox', path: '/inbox', iconName: 'MessageCircle', roles: ALL_ROLES, order: 1, visible: true },
  { id: 'nav_req', labelKey: 'nav.requests', path: '/requests', iconName: 'FileText', roles: ALL_ROLES, order: 2, visible: true },
  { id: 'nav_inv', labelKey: 'nav.inventory', path: '/inventory', iconName: 'Car', roles: ALL_ROLES, order: 3, visible: true },
  { id: 'nav_tele', labelKey: 'nav.telegram', path: '/telegram', iconName: 'Send', roles: ALL_ROLES, order: 4, visible: true },
  { id: 'nav_scen', labelKey: 'nav.scenarios', path: '/scenarios', iconName: 'Database', roles: ALL_ROLES, order: 5, visible: true },
  { id: 'nav_sets', labelKey: 'nav.settings', path: '/settings', iconName: 'Settings', roles: ALL_ROLES, order: 99, visible: true }
];

export const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLang();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [navItems, setNavItems] = useState<NavItemConfig[]>([]);
  const [features, setFeatures] = useState({});

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const load = async () => {
      setNotifications(await Data.getNotifications());
      const settings = await Data.getSettings();
      const backendNav = settings.navigation || [];
      setNavItems(backendNav.length > 0 ? backendNav.sort((a: any, b: any) => a.order - b.order) : DEFAULT_NAV);
      setFeatures(settings.features || {});
    };

    load();
    const unsub1 = Data.subscribe('UPDATE_NOTIFICATIONS', async () => setNotifications(await Data.getNotifications()));
    const unsub2 = Data.subscribe('UPDATE_SETTINGS', async () => {
      const settings = await Data.getSettings();
      const backendNav = settings.navigation || [];
      setNavItems(backendNav.length > 0 ? backendNav.sort((a: any, b: any) => a.order - b.order) : DEFAULT_NAV);
      setFeatures(settings.features || {});
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCmdOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!user) return <>{children}</>;

  const isActive = (path: string) => location.pathname === path;

  const visibleNavItems = navItems.filter(item => {
    // During deployment setup, we ensure all features are available to all roles
    if (!item.visible) return false;
    // Allow all authenticated users to see items if roles include their role or ALL_ROLES used
    return true;
  });

  // Safe name extraction
  const displayName = user.name || user.username || user.email || 'User';

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-app)]">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-72 bg-[#09090B] text-[#9CA3AF] flex flex-col shrink-0 transition-transform duration-300 border-r border-[#1F2937]
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-7 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-white font-sans">
              CarTié<span className="text-gold-500">.</span>
            </h1>
            <p className="text-xs text-[#6B7280] mt-1 uppercase tracking-widest font-medium">{user.role}</p>
          </div>
          <button className="lg:hidden text-white" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
        </div>

        <div className="px-5 mb-6">
          <button onClick={() => setIsCmdOpen(true)} className="w-full bg-[#1F2937] hover:bg-[#374151] text-[#D1D5DB] text-sm py-3 px-4 rounded-xl flex justify-between items-center transition-colors border border-transparent">
            <span className="flex items-center gap-3"><Search size={16} /> Search...</span>
            <span className="bg-[#111827] px-2 py-0.5 rounded text-[10px] font-mono text-[#9CA3AF]">⌘K</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto space-y-1.5 px-4 custom-scrollbar">
          {visibleNavItems.map(item => {
            const Icon = ICON_MAP[item.iconName] || LayoutDashboard;
            const active = isActive(item.path);
            return (
              <button
                key={item.id}
                onClick={() => { navigate(item.path); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium transition-all rounded-xl relative overflow-hidden group ${active
                  ? 'text-white bg-[#1F2937]'
                  : 'text-[#9CA3AF] hover:text-white hover:bg-[#111827]'
                  }`}
              >
                {active && <div className="absolute left-0 top-3 bottom-3 w-1 bg-gold-500 rounded-r-full shadow-[0_0_10px_rgba(212,175,55,0.5)]"></div>}
                <Icon size={20} className={active ? 'text-gold-500' : 'text-[#6B7280] group-hover:text-white transition-colors'} />
                {t(item.labelKey)}
              </button>
            );
          })}
        </nav>

        <div className="p-5 border-t border-[#1F2937] space-y-3">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] px-2 opacity-60">
            <Sparkles size={12} className="text-gold-500" />
            <span>Quiet Luxury v5.0</span>
          </div>
          <button onClick={onLogout} className="flex items-center gap-3 text-[#9CA3AF] hover:text-white text-sm w-full px-3 py-3 rounded-xl hover:bg-[#1F2937] transition-colors font-medium">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-20 panel border-b-0 rounded-none border-b border-[var(--border-color)] flex items-center justify-between px-8 sticky top-0 z-30 transition-colors">
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-2 text-[var(--text-secondary)]" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-medium text-[var(--text-primary)] tracking-tight">
                {location.pathname === '/' ? t('nav.dashboard') : location.pathname.substring(1).charAt(0).toUpperCase() + location.pathname.slice(2)}
              </h2>
              <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-600 rounded-full border border-green-500/20 text-xs font-bold uppercase tracking-wider">
                <Radio size={12} className="text-green-500 animate-pulse" /> Live
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex gap-3">
              <button onClick={() => navigate('/requests')} className="btn-secondary text-sm py-2 px-4 h-10">
                <Plus size={16} className="text-gold-500" /> Request
              </button>
              <button onClick={() => navigate('/telegram')} className="btn-secondary text-sm py-2 px-4 h-10">
                <Send size={16} className="text-gold-500" /> Broadcast
              </button>
            </div>

            <div className="h-8 w-px bg-[var(--border-color)] mx-1"></div>

            <div className="relative">
              <button onClick={() => setShowNotif(!showNotif)} className="btn-ghost btn-icon relative p-2">
                <Bell size={22} />
                {unreadCount > 0 && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-gold-500 rounded-full ring-2 ring-[var(--bg-panel)]"></span>}
              </button>

              {showNotif && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotif(false)}></div>
                  <div className="absolute right-0 top-14 w-96 panel z-50 flex flex-col max-h-[500px] overflow-hidden animate-slide-up shadow-2xl">
                    <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-input)]">
                      <h4 className="font-bold text-sm uppercase tracking-wider text-[var(--text-secondary)]">Notifications</h4>
                      <button onClick={async () => {
                        const notifs = await Data.getNotifications();
                        const updated = notifs.map(n => ({ ...n, read: true }));
                        updated.forEach(n => Data.saveNotification(n));
                      }} className="text-xs text-gold-500 font-bold hover:underline">Mark read</button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {notifications.length === 0 && <div className="p-8 text-center text-[var(--text-secondary)] text-sm">No new alerts</div>}
                      {notifications.map(n => (
                        <div key={n.id} onClick={async () => {
                          if (n.link) navigate(n.link);
                          await Data.saveNotification({ ...n, read: true });
                          setShowNotif(false);
                        }} className={`p-5 border-b border-[var(--border-color)] hover:bg-[var(--bg-input)] cursor-pointer flex gap-4 ${n.read ? 'opacity-50' : ''}`}>
                          <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.type === 'ERROR' ? 'bg-red-500' : 'bg-gold-500'}`}></div>
                          <div className="flex-1">
                            <div className="font-bold text-sm text-[var(--text-primary)]">{n.title}</div>
                            <div className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">{n.message}</div>
                            <div className="text-xs text-[var(--text-secondary)] mt-2 opacity-60 tabular-nums">{new Date(n.createdAt).toLocaleTimeString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 pl-3 border-l border-[var(--border-color)] ml-2">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-[var(--text-primary)] leading-tight">{displayName}</p>
                <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mt-0.5">{user.role}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[var(--bg-input)] border border-[var(--border-color)] flex items-center justify-center text-sm font-bold text-[var(--text-secondary)]">
                {displayName.substring(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 transition-colors">
          <div className="max-w-7xl mx-auto w-full animate-fade-in pb-12">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette isOpen={isCmdOpen} onClose={() => setIsCmdOpen(false)} />
    </div>
  );
};
