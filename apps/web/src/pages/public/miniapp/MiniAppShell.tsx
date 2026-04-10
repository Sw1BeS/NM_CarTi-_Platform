import React from 'react';
import { ChevronLeft } from 'lucide-react';

type NavItem = {
  id: string;
  value: string;
  label: string;
  icon: React.ReactNode;
};

type MiniAppShellProps = {
  configWarning?: string | null;
  showBackArrow: boolean;
  onBack: () => void;
  children: React.ReactNode;
  showBottomNav: boolean;
  navItems: NavItem[];
  activeView: string;
  onNavigate: (value: string) => void;
};

export const MiniAppShell = ({
  configWarning,
  showBackArrow,
  onBack,
  children,
  showBottomNav,
  navItems,
  activeView,
  onNavigate
}: MiniAppShellProps) => {
  return (
    <div className="telegram-miniapp-shell relative mx-auto flex h-[var(--tg-viewport-height)] min-h-[var(--tg-viewport-height)] w-full max-w-md flex-col overflow-hidden border-x border-[#1c1c1e] bg-black font-sans text-white shadow-2xl">
      {configWarning && (
        <div className="bg-yellow-500/15 text-yellow-300 text-[10px] uppercase font-bold text-center py-1 border-b border-yellow-500/30">
          {configWarning}
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        {showBackArrow && (
          <button
            onClick={onBack}
            className="absolute z-40 flex items-center gap-1 rounded-full bg-black/60 px-3 py-2 text-xs font-bold text-white/90 backdrop-blur border border-white/10"
            style={{
              left: 'calc(var(--tg-content-safe-area-left) + 1rem)',
              top: 'calc(var(--tg-content-safe-area-top) + 1rem)'
            }}
          >
            <ChevronLeft size={16} />
            Назад
          </button>
        )}
        {children}
      </div>

      {showBottomNav && (
        <div
          className="relative z-40 bg-[#000000]/90 backdrop-blur-md border-t border-white/10 pt-2"
          style={{
            paddingLeft: 'calc(var(--tg-content-safe-area-left) + 1.5rem)',
            paddingRight: 'calc(var(--tg-content-safe-area-right) + 1.5rem)',
            paddingBottom: 'calc(var(--tg-content-safe-area-bottom) + 1.5rem)'
          }}
        >
          <div className="flex justify-between items-center max-w-sm mx-auto">
            {navItems.map(item => {
              const isActive = activeView === item.value;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.value)}
                  className={`flex flex-col items-center gap-1 transition-all duration-200 ${isActive ? 'text-white scale-105' : 'text-white/40 hover:text-white/60'}`}
                >
                  <div className={`p-1.5 rounded-xl ${isActive ? 'bg-white/10' : ''}`}>
                    {item.icon}
                  </div>
                  <span className={`text-[10px] font-medium ${isActive ? 'text-white' : 'text-white/40'}`}>
                    {item.label}
                  </span>
                  {isActive && <div className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: '#fbbf24' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
